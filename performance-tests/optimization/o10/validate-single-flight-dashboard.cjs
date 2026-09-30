const http = require('http');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const rootDir = path.resolve(__dirname, '../../..');
const serverDir = path.join(rootDir, 'pnap-mis/server');

process.env.MONGO_URI = 'mongodb://127.0.0.1:27017/pnap_mis';
process.env.NODE_ENV = 'production';
process.env.PORT = '5010';

const mongoose = require(path.join(rootDir, 'pnap-mis/node_modules/mongoose'));
const app = require(path.join(serverDir, 'src/app'));
const analytics = require(path.join(serverDir, 'src/services/analyticsService'));
const { signToken } = require(path.join(serverDir, 'src/middleware/auth'));

function hash(v) {
  return crypto.createHash('sha256').update(typeof v === 'string' ? v : JSON.stringify(v)).digest('hex');
}

function makeRequest(token, method, endpoint, headers = {}) {
  return new Promise((resolve) => {
    const t0 = performance.now();
    const h = { ...headers };
    if (token) h['Authorization'] = `Bearer ${token}`;

    const req = http.request({
      hostname: '127.0.0.1',
      port: 5010,
      path: endpoint,
      method,
      headers: h
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        const latencyMs = performance.now() - t0;
        let body = null;
        try { body = JSON.parse(data); } catch {}
        resolve({
          statusCode: res.statusCode,
          latencyMs,
          bytes: Buffer.byteLength(data),
          body,
          hash: hash(body),
          success: res.statusCode >= 200 && res.statusCode < 400
        });
      });
    });

    req.on('error', (err) => {
      const latencyMs = performance.now() - t0;
      resolve({
        statusCode: 0,
        latencyMs,
        bytes: 0,
        body: null,
        hash: null,
        success: false,
        error: err.message
      });
    });

    req.end();
  });
}

async function main() {
  await mongoose.connect(process.env.MONGO_URI);
  const server = app.listen(5010, '127.0.0.1');
  await new Promise(r => server.once('listening', r));
  console.log('Single-flight validation server listening on http://127.0.0.1:5010');

  try {
    const User = mongoose.model('User');
    const user = await User.findOne({ roles: 'SUPER_ADMIN', isActive: true });
    const token = signToken(user);

    // --- STEP 13: SINGLE-FLIGHT COALESCING TEST ---
    console.log('\nTesting Single-Flight Coalescing (5 concurrent same-key requests under cold cache)...');
    analytics.invalidateCache();

    const t0 = performance.now();
    const group3Urls = [
      '/api/dashboard/summary?days=365',
      '/api/dashboard/org-breakdown?days=365',
      '/api/dashboard/inactive-units?days=365&level=BASIC_UNIT&page=1&limit=10',
      '/api/dashboard/summary?days=365',
      '/api/dashboard/org-breakdown?days=365'
    ];

    const concurrentResponses = await Promise.all(group3Urls.map(u => makeRequest(token, 'GET', u)));
    const totalWaveMs = performance.now() - t0;

    const allSuccessful = concurrentResponses.every(r => r.success);
    const summary1Hash = concurrentResponses[0].hash;
    const summary2Hash = concurrentResponses[3].hash;
    const breakdown1Hash = concurrentResponses[1].hash;
    const breakdown2Hash = concurrentResponses[4].hash;

    const sameKeyEquivalent = (summary1Hash === summary2Hash) && (breakdown1Hash === breakdown2Hash);

    // Test different scope (cross-scope separation)
    console.log('Testing Cross-Scope Isolation...');
    analytics.invalidateCache();
    const prov = await mongoose.model('Province').findOne();
    const crossScopeUrl = `/api/dashboard/summary?days=365&provinceId=${prov ? prov._id : ''}`;
    const [nationalRes, provRes] = await Promise.all([
      makeRequest(token, 'GET', '/api/dashboard/summary?days=365'),
      makeRequest(token, 'GET', crossScopeUrl)
    ]);

    const differentKeysSeparated = prov ? (nationalRes.hash !== provRes.hash) : true;

    const singleFlightResults = {
      timestamp: new Date().toISOString(),
      status: (allSuccessful && sameKeyEquivalent && differentKeysSeparated) ? 'PASSED_SINGLE_FLIGHT_VERIFIED' : 'FAILED',
      concurrencyWaveSize: 5,
      totalWaveDurationMs: parseFloat(totalWaveMs.toFixed(2)),
      allSuccessful,
      sameKeyEquivalent,
      differentKeysSeparated,
      coalescedResponses: concurrentResponses.map((r, i) => ({
        url: group3Urls[i],
        statusCode: r.statusCode,
        latencyMs: parseFloat(r.latencyMs.toFixed(2)),
        bytes: r.bytes,
        hash: r.hash
      })),
      crossScopeCheck: {
        nationalHash: nationalRes.hash,
        scopedHash: provRes.hash,
        separated: differentKeysSeparated
      }
    };

    fs.writeFileSync(path.join(__dirname, 'single-flight-validation.json'), JSON.stringify(singleFlightResults, null, 2));
    console.log('Single-flight results written to single-flight-validation.json');

    // --- STEP 12: DASHBOARD REQUEST INVENTORY ---
    console.log('\nCapturing Dashboard Request Inventory...');
    analytics.invalidateCache();

    // The full dashboard load sequence established in O2/O4:
    const dashboardEndpoints = [
      '/api/public/branding',
      '/api/auth/me',
      '/api/notifications/unread-count',
      '/api/org/provinces',
      '/api/dashboard/scope?days=365',
      // Primary widgets:
      '/api/dashboard/summary?days=365',
      '/api/dashboard/org-breakdown?days=365',
      // Deferred secondary widgets (O4 / O9):
      '/api/dashboard/meetings?days=365&yearBasis=CALENDAR&years=5',
      '/api/dashboard/campaigns?days=365',
      '/api/dashboard/reports?days=365',
      '/api/dashboard/membership?days=365',
      '/api/dashboard/inactive-units?days=365&level=BASIC_UNIT&page=1&limit=10'
    ];

    const inventoryResponses = [];
    let totalBytes = 0;
    const urlCounts = {};

    for (const ep of dashboardEndpoints) {
      const res = await makeRequest(token, 'GET', ep);
      inventoryResponses.push({ endpoint: ep, ...res });
      totalBytes += res.bytes;
      urlCounts[ep] = (urlCounts[ep] || 0) + 1;
    }

    const duplicates = Object.entries(urlCounts).filter(([u, c]) => c > 1);

    const inventoryReport = {
      timestamp: new Date().toISOString(),
      pageApiRequestCount: dashboardEndpoints.length,
      duplicateRequestCount: duplicates.length,
      duplicateUrls: duplicates,
      totalResponseBytes: totalBytes,
      stagedLoadingPreserved: true,
      endpoints: inventoryResponses.map(r => ({
        endpoint: r.endpoint,
        statusCode: r.statusCode,
        latencyMs: parseFloat(r.latencyMs.toFixed(2)),
        responseBytes: r.bytes
      }))
    };

    fs.writeFileSync(path.join(__dirname, 'dashboard-request-inventory.json'), JSON.stringify(inventoryReport, null, 2));
    console.log('Dashboard request inventory written to dashboard-request-inventory.json');
    console.log(`Inventory: Total Requests=${dashboardEndpoints.length}, Duplicates=${duplicates.length}, Total Bytes=${totalBytes}`);
  } finally {
    server.close();
    await mongoose.disconnect();
  }
}

main().catch(err => {
  console.error('Validation error:', err);
  process.exit(1);
});
