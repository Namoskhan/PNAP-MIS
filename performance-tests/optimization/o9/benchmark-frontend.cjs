const { spawn, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const zlib = require('zlib');
const http = require('http');
const mongoose = require('../../../pnap-mis/node_modules/mongoose');

const rootDir = path.resolve(__dirname, '../../..');
const webDir = path.join(rootDir, 'pnap-mis/web');
const distDir = path.join(webDir, 'dist');
const serverDir = path.join(rootDir, 'pnap-mis/server');

const PORT = 5005;
const BASE_URL = `http://127.0.0.1:${PORT}`;

// Compute dist assets inventory
function getDistInventory() {
  function scan(dir, base = '') {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    let files = [];
    for (const e of entries) {
      const full = path.join(dir, e.name);
      const rel = path.join(base, e.name).replace(/\\/g, '/');
      if (e.isDirectory()) {
        files = files.concat(scan(full, rel));
      } else {
        const content = fs.readFileSync(full);
        const gzip = zlib.gzipSync(content);
        files.push({
          path: rel,
          bytes: content.length,
          gzipBytes: gzip.length,
        });
      }
    }
    return files;
  }

  const files = scan(distDir);
  const jsFiles = files.filter(f => f.path.endsWith('.js'));
  const cssFiles = files.filter(f => f.path.endsWith('.css'));

  // Initial JS is what index.html references directly
  const indexHtml = fs.readFileSync(path.join(distDir, 'index.html'), 'utf8');
  const initialScriptMatches = [...indexHtml.matchAll(/src=["'](.*?)["']/g)].map(m => m[1]);
  const initialJsFiles = jsFiles.filter(f => initialScriptMatches.some(m => m.endsWith(path.basename(f.path))));

  return {
    distFiles: files,
    totalJsBytes: jsFiles.reduce((a, b) => a + b.bytes, 0),
    totalJsGzipBytes: jsFiles.reduce((a, b) => a + b.gzipBytes, 0),
    initialJsBytes: (initialJsFiles.length > 0 ? initialJsFiles : jsFiles).reduce((a, b) => a + b.bytes, 0),
    initialJsGzipBytes: (initialJsFiles.length > 0 ? initialJsFiles : jsFiles).reduce((a, b) => a + b.gzipBytes, 0),
    largestJsChunkBytes: jsFiles.length > 0 ? Math.max(...jsFiles.map(f => f.bytes)) : 0,
    largestJsChunkGzipBytes: jsFiles.length > 0 ? Math.max(...jsFiles.map(f => f.gzipBytes)) : 0,
    totalCssBytes: cssFiles.reduce((a, b) => a + b.bytes, 0),
    totalCssGzipBytes: cssFiles.reduce((a, b) => a + b.gzipBytes, 0),
    chunkCount: jsFiles.length,
    initialChunkCount: initialJsFiles.length || jsFiles.length
  };
}

// Run Lighthouse CLI once, return parsed performance audits
async function runLighthouseOnce(url, runIndex) {
  const outputPath = path.join(__dirname, `lh-run-${runIndex}.json`);
  if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);

  return new Promise((resolve, reject) => {
    const lh = spawn('npx.cmd', [
      '-y', 'lighthouse', url,
      '--chrome-flags="--headless --no-sandbox --disable-gpu"',
      '--output=json',
      `--output-path=${outputPath}`,
      '--only-categories=performance',
      '--throttling.rttMs=40',
      '--throttling.throughputKbps=10240',
      '--throttling.cpuSlowdownMultiplier=1'
    ], { stdio: 'pipe', shell: true });

    lh.on('close', () => {
      // ChromeLauncher might fail temp cleanup on Windows, check if output was written
      if (fs.existsSync(outputPath)) {
        try {
          const raw = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
          const audits = raw.audits;
          const result = {
            performanceScore: Math.round((raw.categories?.performance?.score || 0) * 100),
            fcpMs: audits['first-contentful-paint']?.numericValue || 0,
            lcpMs: audits['largest-contentful-paint']?.numericValue || 0,
            tbtMs: audits['total-blocking-time']?.numericValue || 0,
            cls: audits['cumulative-layout-shift']?.numericValue || 0,
            speedIndexMs: audits['speed-index']?.numericValue || 0,
            mainThreadWorkMs: audits['mainthread-work-breakdown']?.numericValue || 0,
            bootupTimeMs: audits['bootup-time']?.numericValue || 0,
          };
          resolve(result);
        } catch (e) {
          reject(e);
        }
      } else {
        reject(new Error('Lighthouse output file not found: ' + outputPath));
      }
    });
  });
}

const median = arr => {
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

// Measure 5 Lighthouse runs
async function runLighthouse5(url) {
  const runs = [];
  for (let i = 1; i <= 5; i++) {
    console.log(`  Running Lighthouse iteration ${i}/5 on ${url}...`);
    const res = await runLighthouseOnce(url, i);
    runs.push(res);
    console.log(`    Run ${i}: Score=${res.performanceScore}, FCP=${res.fcpMs.toFixed(1)}ms, LCP=${res.lcpMs.toFixed(1)}ms, TBT=${res.tbtMs.toFixed(1)}ms, CLS=${res.cls.toFixed(4)}`);
  }

  const medianResult = {
    performanceScore: median(runs.map(r => r.performanceScore)),
    fcpMs: median(runs.map(r => r.fcpMs)),
    lcpMs: median(runs.map(r => r.lcpMs)),
    tbtMs: median(runs.map(r => r.tbtMs)),
    cls: Number(median(runs.map(r => r.cls)).toFixed(4)),
    speedIndexMs: median(runs.map(r => r.speedIndexMs)),
    mainThreadWorkMs: median(runs.map(r => r.mainThreadWorkMs)),
    bootupTimeMs: median(runs.map(r => r.bootupTimeMs)),
    runs
  };

  return medianResult;
}

// Full audit suite for a state
async function auditState(label) {
  console.log(`\n======================================================`);
  console.log(`Starting Frontend Performance Audit: ${label}`);
  console.log(`======================================================`);

  // 1. Inventory dist assets
  const inventory = getDistInventory();
  console.log('\nDist Assets Inventory:');
  console.log(`  Initial JS: ${(inventory.initialJsBytes / 1024).toFixed(2)} KB (Gzip: ${(inventory.initialJsGzipBytes / 1024).toFixed(2)} KB)`);
  console.log(`  Total JS:   ${(inventory.totalJsBytes / 1024).toFixed(2)} KB (Gzip: ${(inventory.totalJsGzipBytes / 1024).toFixed(2)} KB)`);
  console.log(`  Largest JS: ${(inventory.largestJsChunkBytes / 1024).toFixed(2)} KB`);
  console.log(`  Total CSS:  ${(inventory.totalCssBytes / 1024).toFixed(2)} KB (Gzip: ${(inventory.totalCssGzipBytes / 1024).toFixed(2)} KB)`);
  console.log(`  JS Chunks:  ${inventory.chunkCount} total (${inventory.initialChunkCount} initial)`);

  // 2. Start server
  process.env.MONGO_URI = 'mongodb://127.0.0.1:27017/pnap_mis_o7_d';
  process.env.NODE_ENV = 'production';
  process.env.PORT = String(PORT);

  await mongoose.connect(process.env.MONGO_URI);
  const app = require(path.join(serverDir, 'src/app'));
  const server = app.listen(PORT, '127.0.0.1');
  await new Promise(r => server.once('listening', r));
  console.log(`\nProduction server running at ${BASE_URL}`);

  try {
    // 3. Test HTTP request count and transfer for /login
    const requests = [];
    // We test loading the initial index.html and its referenced assets
    const htmlRes = await fetch(`${BASE_URL}/login`);
    const html = await htmlRes.text();
    const assetMatches = [...html.matchAll(/(?:src|href)=["'](\/assets\/.*?)["']/g)].map(m => m[1]);
    
    let initialTransferredBytes = Buffer.byteLength(html);
    let jsRequestCount = 0;
    let cssRequestCount = 0;

    for (const assetUrl of assetMatches) {
      const aRes = await fetch(`${BASE_URL}${assetUrl}`);
      const buf = await aRes.arrayBuffer();
      initialTransferredBytes += buf.byteLength;
      if (assetUrl.endsWith('.js')) jsRequestCount++;
      if (assetUrl.endsWith('.css')) cssRequestCount++;
    }

    console.log(`\nRoute Loading (/login):`);
    console.log(`  Initial HTTP requests: ${1 + assetMatches.length} (1 HTML, ${jsRequestCount} JS, ${cssRequestCount} CSS)`);
    console.log(`  Initial Transferred: ${(initialTransferredBytes / 1024).toFixed(2)} KB`);

    // 4. Run 5 Lighthouse iterations on /login
    console.log('\nRunning 5 Lighthouse iterations on /login:');
    const lhLogin = await runLighthouse5(`${BASE_URL}/login`);

    const finalReport = {
      label,
      timestamp: new Date().toISOString(),
      bundle: {
        initialJsBytes: inventory.initialJsBytes,
        initialJsKb: Number((inventory.initialJsBytes / 1024).toFixed(2)),
        initialJsGzipBytes: inventory.initialJsGzipBytes,
        initialJsGzipKb: Number((inventory.initialJsGzipBytes / 1024).toFixed(2)),
        totalJsBytes: inventory.totalJsBytes,
        totalJsKb: Number((inventory.totalJsBytes / 1024).toFixed(2)),
        totalJsGzipBytes: inventory.totalJsGzipBytes,
        totalJsGzipKb: Number((inventory.totalJsGzipBytes / 1024).toFixed(2)),
        largestJsChunkBytes: inventory.largestJsChunkBytes,
        largestJsChunkKb: Number((inventory.largestJsChunkBytes / 1024).toFixed(2)),
        totalCssBytes: inventory.totalCssBytes,
        totalCssKb: Number((inventory.totalCssBytes / 1024).toFixed(2)),
        totalCssGzipBytes: inventory.totalCssGzipBytes,
        totalCssGzipKb: Number((inventory.totalCssGzipBytes / 1024).toFixed(2)),
        chunkCount: inventory.chunkCount,
        initialChunkCount: inventory.initialChunkCount
      },
      requests: {
        totalInitialRequests: 1 + assetMatches.length,
        jsRequests: jsRequestCount,
        cssRequests: cssRequestCount,
        initialTransferredBytes
      },
      lighthouseLogin: lhLogin
    };

    return finalReport;
  } finally {
    server.close();
    await mongoose.disconnect();
  }
}

module.exports = { auditState };

if (require.main === module) {
  auditState('Baseline O8 Retained State').then(report => {
    fs.writeFileSync(path.join(__dirname, 'baseline-lighthouse.json'), JSON.stringify(report, null, 2));
    console.log('\nBaseline audit written to baseline-lighthouse.json');
  }).catch(e => {
    console.error(e);
    process.exit(1);
  });
}
