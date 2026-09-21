const http = require('http');
const path = require('path');
const fs = require('fs');
const { monitorEventLoopDelay } = require('perf_hooks');

const rootDir = path.resolve(__dirname, '../../..');
const serverDir = path.join(rootDir, 'pnap-mis/server');

process.env.MONGO_URI = 'mongodb://127.0.0.1:27017/pnap_mis';
process.env.NODE_ENV = 'production';
process.env.PORT = '5011';

const mongoose = require(path.join(rootDir, 'pnap-mis/node_modules/mongoose'));
const app = require(path.join(serverDir, 'src/app'));
const analytics = require(path.join(serverDir, 'src/services/analyticsService'));
const { signToken } = require(path.join(serverDir, 'src/middleware/auth'));

function makeRequest(token, method, endpoint) {
  return new Promise((resolve) => {
    const t0 = performance.now();
    const headers = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const req = http.request({
      hostname: '127.0.0.1',
      port: 5011,
      path: endpoint,
      method,
      headers
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          latencyMs: performance.now() - t0,
          bytes: Buffer.byteLength(data),
          success: res.statusCode >= 200 && res.statusCode < 400
        });
      });
    });

    req.on('error', (err) => {
      resolve({
        statusCode: 0,
        latencyMs: performance.now() - t0,
        bytes: 0,
        success: false,
        error: err.message
      });
    });

    req.end();
  });
}

function percentile(arr, p) {
  const s = [...arr].sort((a, b) => a - b);
  const idx = (s.length - 1) * p;
  return s[Math.floor(idx)] + (s[Math.ceil(idx)] - s[Math.floor(idx)]) * (idx % 1);
}

async function main() {
  await mongoose.connect(process.env.MONGO_URI);
  const server = app.listen(5011, '127.0.0.1');
  await new Promise(r => server.once('listening', r));
  console.log('Local dashboard benchmark server listening on http://127.0.0.1:5011');

  try {
    const User = mongoose.model('User');
    const user = await User.findOne({ roles: 'SUPER_ADMIN', isActive: true });
    const token = signToken(user);

    const primaryEndpoints = [
      '/api/public/branding',
      '/api/auth/me',
      '/api/notifications/unread-count',
      '/api/org/provinces',
      '/api/dashboard/scope?days=365',
      '/api/dashboard/summary?days=365',
      '/api/dashboard/org-breakdown?days=365'
    ];

    const secondaryEndpoints = [
      '/api/dashboard/meetings?days=365&yearBasis=CALENDAR&years=5',
      '/api/dashboard/campaigns?days=365',
      '/api/dashboard/reports?days=365',
      '/api/dashboard/membership?days=365',
      '/api/dashboard/inactive-units?days=365&level=BASIC_UNIT&page=1&limit=10'
    ];

    console.log('\nRunning 5 Repeated Dashboard Workflows on local pnap_mis...');
    const runs = [];

    for (let i = 1; i <= 5; i++) {
      analytics.invalidateCache();
      const eld = monitorEventLoopDelay({ resolution: 20 });
      eld.enable();
      const cpu0 = process.cpuUsage();
      const t0 = performance.now();

      // Primary stage
      await Promise.all(primaryEndpoints.map(ep => makeRequest(token, 'GET', ep)));
      const primaryUsableMs = performance.now() - t0;

      // Secondary stage
      await Promise.all(secondaryEndpoints.map(ep => makeRequest(token, 'GET', ep)));
      const fullCompletionMs = performance.now() - t0;

      const cpuDelta = process.cpuUsage(cpu0);
      eld.disable();

      const elP95 = eld.percentile(95) / 1e6;
      const cpuPct = ((cpuDelta.user + cpuDelta.system) / 1000) / fullCompletionMs * 100;

      console.log(`  Run ${i}: PrimaryUsable=${primaryUsableMs.toFixed(1)}ms, FullCompletion=${fullCompletionMs.toFixed(1)}ms, EventLoopP95=${elP95.toFixed(2)}ms, CPU=${cpuPct.toFixed(1)}%`);

      runs.push({
        run: i,
        primaryUsableMs,
        fullCompletionMs,
        eventLoopP95Ms: elP95,
        cpuUsagePct: cpuPct
      });

      await new Promise(r => setTimeout(r, 400));
    }

    const primaryLats = runs.map(r => r.primaryUsableMs);
    const fullLats = runs.map(r => r.fullCompletionMs);
    const elLats = runs.map(r => r.eventLoopP95Ms);
    const cpuVals = runs.map(r => r.cpuUsagePct);

    const summary = {
      timestamp: new Date().toISOString(),
      database: 'pnap_mis',
      primaryUsable: {
        p50: parseFloat(percentile(primaryLats, 0.50).toFixed(2)),
        p95: parseFloat(percentile(primaryLats, 0.95).toFixed(2))
      },
      fullCompletion: {
        p50: parseFloat(percentile(fullLats, 0.50).toFixed(2)),
        p95: parseFloat(percentile(fullLats, 0.95).toFixed(2))
      },
      eventLoopP95Ms: parseFloat(percentile(elLats, 0.95).toFixed(2)),
      nodeCpuPercent: parseFloat(percentile(cpuVals, 0.50).toFixed(2)),
      runs
    };

    fs.writeFileSync(path.join(__dirname, 'local-dashboard-results.json'), JSON.stringify(summary, null, 2));
    console.log('\nLocal dashboard results written to local-dashboard-results.json');
    console.log(`Summary: PrimaryUsable P50=${summary.primaryUsable.p50}ms, P95=${summary.primaryUsable.p95}ms`);
    console.log(`         FullCompletion P50=${summary.fullCompletion.p50}ms, P95=${summary.fullCompletion.p95}ms`);
  } finally {
    server.close();
    await mongoose.disconnect();
  }
}

main().catch(err => {
  console.error('Local dashboard error:', err);
  process.exit(1);
});
