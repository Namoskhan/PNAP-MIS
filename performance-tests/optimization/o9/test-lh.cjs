const { spawn } = require('child_process');
const path = require('path');
const http = require('http');
const mongoose = require('../../../pnap-mis/node_modules/mongoose');

process.env.MONGO_URI = 'mongodb://127.0.0.1:27017/pnap_mis_o7_d';
process.env.NODE_ENV = 'production';
process.env.PORT = '5005';

const app = require('../../../pnap-mis/server/src/app');

async function main() {
  await mongoose.connect(process.env.MONGO_URI);
  const server = app.listen(5005, '127.0.0.1');
  await new Promise(r => server.once('listening', r));
  console.log('Production server listening on http://127.0.0.1:5005');

  try {
    const res = await fetch('http://127.0.0.1:5005/login');
    console.log('/login status:', res.status, 'HTML length:', (await res.text()).length);

    console.log('Testing Lighthouse run on /login...');
    const t0 = performance.now();
    const lh = spawn('npx.cmd', [
      '-y', 'lighthouse', 'http://127.0.0.1:5005/login',
      '--chrome-flags="--headless"',
      '--output=json',
      '--output-path=./performance-tests/optimization/o9/lh-test.json',
      '--only-categories=performance',
      '--throttling.rttMs=40',
      '--throttling.throughputKbps=10240',
      '--throttling.cpuSlowdownMultiplier=1'
    ], { stdio: 'inherit', shell: true });

    await new Promise((resolve, reject) => {
      lh.on('close', code => code === 0 ? resolve() : reject(new Error('Lighthouse exited with code ' + code)));
    });

    console.log('Lighthouse completed in', (performance.now() - t0).toFixed(0), 'ms');
  } finally {
    server.close();
    await mongoose.disconnect();
  }
}

main().catch(console.error);
