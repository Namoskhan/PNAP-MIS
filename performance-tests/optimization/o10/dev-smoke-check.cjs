const http = require('http');
const path = require('path');
const fs = require('fs');

const rootDir = path.resolve(__dirname, '../../..');
const serverDir = path.join(rootDir, 'pnap-mis/server');

process.env.MONGO_URI = 'mongodb://127.0.0.1:27017/pnap_mis';
process.env.NODE_ENV = 'production';
process.env.PORT = '5008';

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
      port: 5008,
      path: endpoint,
      method,
      headers
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        const latencyMs = performance.now() - t0;
        resolve({
          endpoint,
          statusCode: res.statusCode,
          latencyMs,
          responseBytes: Buffer.byteLength(data),
          success: res.statusCode >= 200 && res.statusCode < 400
        });
      });
    });

    req.on('error', (err) => {
      const latencyMs = performance.now() - t0;
      resolve({
        endpoint,
        statusCode: 0,
        latencyMs,
        responseBytes: 0,
        success: false,
        error: err.message
      });
    });

    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function main() {
  await mongoose.connect(process.env.MONGO_URI);
  const server = app.listen(5008, '127.0.0.1');
  await new Promise(r => server.once('listening', r));
  console.log('Dev smoke test server listening on http://127.0.0.1:5008');

  try {
    const User = mongoose.model('User');
    const user = await User.findOne({ roles: 'SUPER_ADMIN', isActive: true });
    if (!user) throw new Error('Super admin user not found in pnap_mis');
    const token = signToken(user);

    // Endpoints to check
    const endpoints = [
      { name: 'branding', method: 'GET', path: '/api/public/branding' },
      { name: 'auth_me', method: 'GET', path: '/api/auth/me' },
      { name: 'dashboard_scope', method: 'GET', path: '/api/dashboard/scope?days=365' },
      { name: 'dashboard_summary', method: 'GET', path: '/api/dashboard/summary?days=365' },
      { name: 'dashboard_org_breakdown', method: 'GET', path: '/api/dashboard/org-breakdown?days=365' },
      { name: 'members_list', method: 'GET', path: '/api/members?q=&status=&page=1&limit=20&scope=all' },
      { name: 'meetings_analytics', method: 'GET', path: '/api/dashboard/meetings?days=365&yearBasis=CALENDAR&years=5' },
      { name: 'campaigns_analytics', method: 'GET', path: '/api/dashboard/campaigns?days=365' },
      { name: 'reports_analytics', method: 'GET', path: '/api/dashboard/reports?days=365' },
      { name: 'inactive_units', method: 'GET', path: '/api/dashboard/inactive-units?days=365&level=BASIC_UNIT&page=1&limit=10' },
      { name: 'membership_analytics', method: 'GET', path: '/api/dashboard/membership?days=365' }
    ];

    const results = [];
    for (const ep of endpoints) {
      const res = await makeRequest(token, ep.method, ep.path, ep.body);
      results.push({ name: ep.name, ...res });
      console.log(`  ${ep.name}: status=${res.statusCode}, latency=${res.latencyMs.toFixed(1)}ms, bytes=${res.responseBytes}`);
    }

    const total = results.length;
    const successful = results.filter(r => r.success).length;
    const errorRate = ((total - successful) / total) * 100;

    const summary = {
      timestamp: new Date().toISOString(),
      database: 'pnap_mis',
      totalRequests: total,
      successfulRequests: successful,
      failedRequests: total - successful,
      errorRatePercent: errorRate,
      status: errorRate === 0 ? 'SMOKE_CHECK_PASSED' : 'SMOKE_CHECK_FAILED',
      endpoints: results
    };

    fs.writeFileSync(path.join(__dirname, 'dev-smoke-results.json'), JSON.stringify(summary, null, 2));
    console.log('\nDev smoke results written to dev-smoke-results.json');
  } finally {
    server.close();
    await mongoose.disconnect();
  }
}

main().catch(err => {
  console.error('Dev smoke check error:', err);
  process.exit(1);
});
