const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { hash, normalize } = require('./harness.cjs');
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
class CDP {
  constructor(url) {
    this.next = 0; this.pending = new Map(); this.listeners = [];
    this.ws = new WebSocket(url);
    this.ready = new Promise((resolve, reject) => { this.ws.onopen = resolve; this.ws.onerror = reject; });
    this.ws.onmessage = ({ data }) => {
      const message = JSON.parse(data);
      if (message.id) { const p = this.pending.get(message.id); this.pending.delete(message.id); if (message.error) p.reject(new Error(message.error.message)); else p.resolve(message.result); }
      else for (const fn of this.listeners) fn(message.method, message.params);
    };
  }
  async send(method, params = {}) {
    await this.ready;
    return new Promise((resolve, reject) => {
      const id = ++this.next;
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Chrome DevTools timed out: ${method}`));
      }, 15000);
      this.pending.set(id, {
        resolve: (value) => { clearTimeout(timer); resolve(value); },
        reject: (error) => { clearTimeout(timer); reject(error); },
      });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
  close() { this.ws.close(); }
}
async function launch(profile) {
  const executable = process.env.O2_CHROMIUM_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
  fs.mkdirSync(profile, { recursive: true });
  const portFile = path.join(profile, 'DevToolsActivePort');
  if (fs.existsSync(portFile)) { try { fs.unlinkSync(portFile); } catch {} }
  const child = spawn(executable, ['--headless=new', '--disable-gpu', '--disable-extensions', '--disable-background-mode', '--no-first-run', '--no-default-browser-check', '--disable-background-networking', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
  let stderr = '', spawnError;
  child.on('error', (e) => { spawnError = e; });
  child.stderr.on('data', (b) => { stderr += b.toString(); });
  let port;
  for (let i = 0; i < 100; i++) {
    if (spawnError) throw spawnError;
    const file = path.join(profile, 'DevToolsActivePort');
    if (fs.existsSync(file)) {
      try {
        port = fs.readFileSync(file, 'utf8').split('\n')[0];
        if (port) break;
      } catch (error) {
        if (error.code !== 'EBUSY' && error.code !== 'EACCES') throw error;
      }
    }
    if (child.exitCode !== null) throw new Error(`Chrome exited: ${stderr.slice(-800)}`);
    await delay(100);
  }
  if (!port) { child.kill(); throw new Error(`Chrome CDP unavailable: ${stderr.slice(-800)}`); }
  const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  const cdp = new CDP(targets.find((t) => t.type === 'page').webSocketDebuggerUrl);
  await cdp.send('Network.enable'); await cdp.send('Page.enable'); await cdp.send('Runtime.enable');
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  return { child, cdp, close: () => { cdp.close(); child.kill(); } };
}
async function capture(browser, harness, user, token, role = null, url = '/') {
  const { cdp } = browser;
  await cdp.send('Page.navigate', { url: 'about:blank' });
  await delay(100);
  const setup = await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: `if(location.origin===${JSON.stringify(harness.base)}){localStorage.clear();localStorage.setItem('pnap_token',${JSON.stringify(token)});localStorage.setItem('pnap_user',${JSON.stringify(JSON.stringify(user))});${role ? `localStorage.setItem('pnap_active_role',${JSON.stringify(role)});` : ''}}` });
  const requests = new Map(), errors = [], tasks = [];
  let lastEvent = Date.now();
  const listener = (method, p) => {
    if (method === 'Runtime.exceptionThrown') errors.push(p.exceptionDetails.text + ': ' + (p.exceptionDetails.exception?.description || ''));
    if (method === 'Runtime.consoleAPICalled' && p.type === 'error') errors.push(p.args.map((a) => a.value || a.description).join(' '));
    if (method === 'Network.requestWillBeSent' && p.request.url.startsWith(harness.base + '/api/')) {
      requests.set(p.requestId, { id: p.requestId, method: p.request.method, url: p.request.url.slice(harness.base.length), start: p.timestamp,
        initiator: p.initiator.type, stack: p.initiator.stack?.callFrames?.slice(0, 5).map((f) => ({ function: f.functionName, url: f.url.replace(harness.base, ''), line: f.lineNumber })) });
      lastEvent = Date.now();
    }
    const r = requests.get(p.requestId); if (!r) return;
    if (method === 'Network.responseReceived') { r.status = p.response.status; r.mimeType = p.response.mimeType; }
    if (method === 'Network.loadingFailed') { r.error = p.errorText; r.end = p.timestamp; lastEvent = Date.now(); }
    if (method === 'Network.loadingFinished') {
      r.end = p.timestamp; r.transferBytes = p.encodedDataLength; lastEvent = Date.now();
      tasks.push(cdp.send('Network.getResponseBody', { requestId: p.requestId }).then((data) => {
        const text = data.base64Encoded ? Buffer.from(data.body, 'base64').toString('utf8') : data.body;
        r.responseBytes = Buffer.byteLength(text); r.responseHash = hash(normalize(JSON.parse(text)));
      }).catch((e) => { r.bodyReadError = e.message; }));
    }
  };
  harness.resetLog(); harness.analytics.invalidateCache();
  cdp.listeners.push(listener);
  await cdp.send('Page.navigate', { url: harness.base + url });
  const deadline = Date.now() + 25000;
  while (Date.now() < deadline) {
    await delay(100);
    if (requests.size && Date.now() - lastEvent > 1000 && [...requests.values()].every((r) => r.end)) break;
  }
  cdp.listeners = cdp.listeners.filter((fn) => fn !== listener);
  await Promise.all(tasks);
  const dom = await cdp.send('Runtime.evaluate', { expression: `JSON.stringify({url:location.pathname,headings:[...document.querySelectorAll('h2,h3,.chart-card-title')].map(e=>e.textContent),stats:[...document.querySelectorAll('.cc-stat,.smart-kpi')].map(e=>e.textContent),nav:[...document.querySelectorAll('nav a')].map(e=>({text:e.textContent,href:e.getAttribute('href')})),selects:[...document.querySelectorAll('select')].map(e=>({label:e.getAttribute('aria-label'),disabled:e.disabled,options:[...e.options].map(o=>({value:o.value,text:o.text}))})),charts:document.querySelectorAll('svg').length,alerts:[...document.querySelectorAll('.alert.error')].map(e=>e.textContent),notification:document.querySelector('.notification-bell')?.textContent||null})`, returnByValue: true });
  await cdp.send('Page.removeScriptToEvaluateOnNewDocument', { identifier: setup.identifier });
  const rows = [...requests.values()];
  const unique = new Set(rows.map((r) => r.method + ' ' + r.url));
  return { requests: rows, requestCount: rows.length, uniqueEndpoints: unique.size, duplicateRequests: rows.length - unique.size,
    responseBytes: rows.reduce((a, r) => a + (r.responseBytes || 0), 0), transferBytes: rows.reduce((a, r) => a + (r.transferBytes || 0), 0),
    largestResponse: rows.reduce((a, r) => (r.responseBytes || 0) > (a.responseBytes || 0) ? r : a, {}),
    completionMs: (Math.max(...rows.map((r) => r.end || r.start)) - Math.min(...rows.map((r) => r.start))) * 1000,
    errors, apiErrors: rows.filter((r) => r.status >= 400 || r.error), dom: JSON.parse(dom.result.value), dbRequests: harness.getLog() };
}
module.exports = { launch, capture };
