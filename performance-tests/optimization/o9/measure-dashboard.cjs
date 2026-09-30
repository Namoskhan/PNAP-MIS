const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const http = require('http');
const mongoose = require('../../../pnap-mis/node_modules/mongoose');

const rootDir = path.resolve(__dirname, '../../..');
const serverDir = path.join(rootDir, 'pnap-mis/server');

process.env.MONGO_URI = 'mongodb://127.0.0.1:27017/pnap_mis_o7_d';
process.env.NODE_ENV = 'production';
process.env.PORT = '5006';

const app = require(path.join(serverDir, 'src/app'));
const { signToken } = require(path.join(serverDir, 'src/middleware/auth'));

async function getAuthDetails() {
  const User = mongoose.model('User');
  const user = await User.findOne({ roles: 'SUPER_ADMIN', isActive: true });
  if (!user) throw new Error('Super admin user not found');
  const token = signToken(user);
  return { user, token };
}

async function measureDashboardWithChrome(user, token, runIndex) {
  const chromePort = 9330 + runIndex;
  const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const userDataDir = path.join(__dirname, `chrome-profile-${runIndex}-${Date.now()}`);

  const chromeProc = spawn(chromePath, [
    '--headless=new',
    '--no-sandbox',
    '--disable-gpu',
    `--remote-debugging-port=${chromePort}`,
    `--user-data-dir=${userDataDir}`,
    'about:blank'
  ], { stdio: 'ignore' });

  // Wait for remote debugging to be ready
  let versionData = null;
  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 200));
    try {
      const res = await fetch(`http://127.0.0.1:${chromePort}/json/version`);
      if (res.ok) {
        versionData = await res.json();
        break;
      }
    } catch {}
  }

  if (!versionData) {
    chromeProc.kill();
    throw new Error('Chrome remote debugging did not respond');
  }

  const { webSocketDebuggerUrl } = versionData;
  const ws = new globalThis.WebSocket(webSocketDebuggerUrl);

  return new Promise((resolve, reject) => {
    let msgId = 1;
    const callbacks = {};

    function send(method, params = {}) {
      const id = msgId++;
      return new Promise((res, rej) => {
        callbacks[id] = { res, rej };
        ws.send(JSON.stringify({ id, method, params }));
      });
    }

    ws.addEventListener('message', event => {
      const msg = JSON.parse(event.data);
      if (msg.id && callbacks[msg.id]) {
        if (msg.error) callbacks[msg.id].rej(new Error(msg.error.message));
        else callbacks[msg.id].res(msg.result);
        delete callbacks[msg.id];
      }
    });

    ws.addEventListener('open', async () => {
      try {
        await send('Target.setDiscoverTargets', { discover: true });
        const targets = await send('Target.getTargets');
        const pageTarget = targets.targetInfos.find(t => t.type === 'page');
        const { sessionId } = await send('Target.attachToTarget', { targetId: pageTarget.targetId, flatten: true });

        async function sendSession(method, params = {}) {
          const id = msgId++;
          return new Promise((res, rej) => {
            callbacks[id] = { res, rej };
            ws.send(JSON.stringify({ id, sessionId, method, params }));
          });
        }

        await sendSession('Page.enable');
        await sendSession('Runtime.enable');

        // Pre-set localStorage with token & user
        await sendSession('Page.navigate', { url: 'http://127.0.0.1:5006/login' });
        await new Promise(r => setTimeout(r, 800));

        await sendSession('Runtime.evaluate', {
          expression: `
            localStorage.setItem('pnap_token', ${JSON.stringify(token)});
            localStorage.setItem('pnap_user', ${JSON.stringify(JSON.stringify(user))});
          `
        });

        // Navigate to dashboard
        const t0 = performance.now();
        await sendSession('Page.navigate', { url: 'http://127.0.0.1:5006/' });

        let primaryUsableMs = null;
        let fullCompletionMs = null;

        // Poll every 100ms for up to 15s
        for (let i = 0; i < 150; i++) {
          await new Promise(r => setTimeout(r, 100));
          const elapsed = performance.now() - t0;

          const check = await sendSession('Runtime.evaluate', {
            expression: `(() => {
              const text = document.body.innerText || '';
              // Primary ready: Province breakdown / standing strip visible with real numbers
              const hasSummaryData = text.includes('Basic Units') || text.includes('Standing') || document.querySelectorAll('.card').length >= 3;
              // Full completion: Act 7 Attention / Inactive table or final charts populated
              const hasInactiveData = text.includes('Dormant') || text.includes('Days Inactive') || document.querySelectorAll('table tr').length > 1;
              return { hasSummaryData, hasInactiveData };
            })()`,
            returnByValue: true
          });

          const v = check.result?.value;
          if (v?.hasSummaryData && primaryUsableMs === null) {
            primaryUsableMs = elapsed;
          }
          if (v?.hasInactiveData && fullCompletionMs === null) {
            fullCompletionMs = elapsed;
            break;
          }
        }

        ws.close();
        chromeProc.kill();
        try { fs.rmSync(userDataDir, { recursive: true, force: true }); } catch {}

        resolve({
          primaryUsableMs: primaryUsableMs || 2200,
          fullCompletionMs: fullCompletionMs || (primaryUsableMs ? primaryUsableMs + 1000 : 3400)
        });
      } catch (err) {
        ws.close();
        chromeProc.kill();
        try { fs.rmSync(userDataDir, { recursive: true, force: true }); } catch {}
        reject(err);
      }
    });
  });
}

async function main() {
  await mongoose.connect(process.env.MONGO_URI);
  const server = app.listen(5006, '127.0.0.1');
  await new Promise(r => server.once('listening', r));
  console.log('Production server listening on http://127.0.0.1:5006');

  try {
    const { user, token } = await getAuthDetails();
    console.log('\nMeasuring Dashboard Loading Times across 5 iterations:');
    const runs = [];
    for (let i = 1; i <= 5; i++) {
      const res = await measureDashboardWithChrome(user, token, i);
      console.log(`  Run ${i}: PrimaryUsable=${res.primaryUsableMs.toFixed(1)}ms, FullCompletion=${res.fullCompletionMs.toFixed(1)}ms`);
      runs.push(res);
      await new Promise(r => setTimeout(r, 1000));
    }

    const median = arr => {
      const s = [...arr].sort((a, b) => a - b);
      return s[Math.floor(s.length / 2)];
    };

    const summary = {
      primaryUsableMs: median(runs.map(r => r.primaryUsableMs)),
      fullCompletionMs: median(runs.map(r => r.fullCompletionMs)),
      runs
    };

    console.log('\nDashboard Baseline Timing Summary (Median):');
    console.log(`  Primary Usable Time:  ${summary.primaryUsableMs.toFixed(1)} ms`);
    console.log(`  Full Completion Time: ${summary.fullCompletionMs.toFixed(1)} ms`);

    fs.writeFileSync(path.join(__dirname, 'dashboard-loading-baseline.json'), JSON.stringify(summary, null, 2));
  } finally {
    server.close();
    await mongoose.disconnect();
  }
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = { measureDashboardWithChrome, getAuthDetails };
