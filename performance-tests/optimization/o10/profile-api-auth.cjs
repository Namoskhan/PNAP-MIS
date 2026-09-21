const http = require('http');
const path = require('path');
const fs = require('fs');

const rootDir = path.resolve(__dirname, '../../..');
const serverDir = path.join(rootDir, 'pnap-mis/server');

process.env.MONGO_URI = 'mongodb://127.0.0.1:27017/pnap_mis';
process.env.NODE_ENV = 'production';
process.env.PORT = '5009';

const mongoose = require(path.join(rootDir, 'pnap-mis/node_modules/mongoose'));
const app = require(path.join(serverDir, 'src/app'));
const { signToken } = require(path.join(serverDir, 'src/middleware/auth'));

function makeRequest(token, method, endpoint, body = null) {
  return new Promise((resolve) => {
    const t0 = performance.now();
    const headers = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    if (body) headers['Content-Type'] = 'application/json';

    const req = http.request({
      hostname: '127.0.0.1',
      port: 5009,
      path: endpoint,
      method,
      headers
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        const latencyMs = performance.now() - t0;
        resolve({
          statusCode: res.statusCode,
          latencyMs,
          success: res.statusCode >= 200 && res.statusCode < 400
        });
      });
    });

    req.on('error', (err) => {
      const latencyMs = performance.now() - t0;
      resolve({
        statusCode: 0,
        latencyMs,
        success: false,
        error: err.message
      });
    });

    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

function calcPercentiles(arr) {
  if (!arr.length) return { p50: 0, p90: 0, p95: 0, p99: 0, max: 0, mean: 0 };
  const s = [...arr].sort((a, b) => a - b);
  const p = (pct) => s[Math.min(s.length - 1, Math.floor(s.length * pct))];
  const sum = s.reduce((acc, v) => acc + v, 0);
  return {
    p50: parseFloat(p(0.50).toFixed(2)),
    p90: parseFloat(p(0.90).toFixed(2)),
    p95: parseFloat(p(0.95).toFixed(2)),
    p99: parseFloat(p(0.99).toFixed(2)),
    max: parseFloat(s[s.length - 1].toFixed(2)),
    mean: parseFloat((sum / s.length).toFixed(2))
  };
}

async function main() {
  await mongoose.connect(process.env.MONGO_URI);
  const server = app.listen(5009, '127.0.0.1');
  await new Promise(r => server.once('listening', r));
  console.log('API profiling server listening on http://127.0.0.1:5009');

  try {
    const User = mongoose.model('User');
    const user = await User.findOne({ roles: 'SUPER_ADMIN', isActive: true });
    const token = signToken(user);

    // 1. Auth performance evaluation
    console.log('\nBenchmarking Auth Operations...');
    const authRuns = {
      successfulLogin: [],
      failedLogin: [],
      authMe: [],
      logout: []
    };

    // Failed login (wrong password)
    for (let i = 0; i < 20; i++) {
      const res = await makeRequest(null, 'POST', '/api/auth/login', { identifier: 'admin', password: 'wrongPassword!@#' });
      authRuns.failedLogin.push(res.latencyMs);
    }

    // Token verification / me
    for (let i = 0; i < 30; i++) {
      const res = await makeRequest(token, 'GET', '/api/auth/me');
      authRuns.authMe.push(res.latencyMs);
    }

    // Logout
    for (let i = 0; i < 20; i++) {
      const res = await makeRequest(token, 'POST', '/api/auth/logout');
      authRuns.logout.push(res.latencyMs);
    }

    const authMetrics = {
      failedLogin: calcPercentiles(authRuns.failedLogin),
      authMe: calcPercentiles(authRuns.authMe),
      logout: calcPercentiles(authRuns.logout)
    };

    console.log('Auth Metrics:');
    console.log('  Failed Login (bcrypt hash verify): P50=' + authMetrics.failedLogin.p50 + 'ms, P95=' + authMetrics.failedLogin.p95 + 'ms');
    console.log('  Auth Me / Verification:           P50=' + authMetrics.authMe.p50 + 'ms, P95=' + authMetrics.authMe.p95 + 'ms');
    console.log('  Logout:                           P50=' + authMetrics.logout.p50 + 'ms, P95=' + authMetrics.logout.p95 + 'ms');

    // 2. API profile across key endpoints (200 requests)
    console.log('\nRunning API Profile (200 repeated queries)...');
    const endpointsToProfile = [
      '/api/public/branding',
      '/api/dashboard/scope?days=365',
      '/api/dashboard/summary?days=365',
      '/api/dashboard/org-breakdown?days=365',
      '/api/members?q=&status=&page=1&limit=20&scope=all',
      '/api/dashboard/meetings?days=365&yearBasis=CALENDAR&years=5',
      '/api/dashboard/campaigns?days=365',
      '/api/dashboard/reports?days=365'
    ];

    const perEndpointLatencies = {};
    const allLatencies = [];
    let failedCount = 0;

    const tStart = performance.now();
    for (let round = 0; round < 25; round++) {
      for (const ep of endpointsToProfile) {
        if (!perEndpointLatencies[ep]) perEndpointLatencies[ep] = [];
        const res = await makeRequest(token, 'GET', ep);
        if (res.success) {
          perEndpointLatencies[ep].push(res.latencyMs);
          allLatencies.push(res.latencyMs);
        } else {
          failedCount++;
        }
      }
    }
    const tTotalDurationSec = (performance.now() - tStart) / 1000;

    const totalRequests = allLatencies.length + failedCount;
    const rps = parseFloat((totalRequests / tTotalDurationSec).toFixed(2));
    const errorRate = parseFloat(((failedCount / totalRequests) * 100).toFixed(2));

    const overallProfile = {
      totalRequests,
      successfulRequests: allLatencies.length,
      failedRequests: failedCount,
      errorRatePercent: errorRate,
      durationSeconds: parseFloat(tTotalDurationSec.toFixed(2)),
      rps,
      overallLatencies: calcPercentiles(allLatencies),
      endpoints: {}
    };

    for (const [ep, lats] of Object.entries(perEndpointLatencies)) {
      overallProfile.endpoints[ep] = calcPercentiles(lats);
    }

    const output = {
      timestamp: new Date().toISOString(),
      authMetrics,
      apiProfile: overallProfile
    };

    fs.writeFileSync(path.join(__dirname, 'api-profile-results.json'), JSON.stringify(output, null, 2));
    console.log('\nAPI Profile written to api-profile-results.json');
    console.log(`Overall: Requests=${totalRequests}, RPS=${rps}, ErrorRate=${errorRate}%`);
    console.log(`P50=${overallProfile.overallLatencies.p50}ms, P90=${overallProfile.overallLatencies.p90}ms, P95=${overallProfile.overallLatencies.p95}ms, P99=${overallProfile.overallLatencies.p99}ms, Max=${overallProfile.overallLatencies.max}ms`);
  } finally {
    server.close();
    await mongoose.disconnect();
  }
}

main().catch(err => {
  console.error('API profile error:', err);
  process.exit(1);
});
