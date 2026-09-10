// Restore surviving historical evidence only. Does not connect to MongoDB or run benchmarks.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const source = 'C:/Users/HP/.codex/sessions/2026/09/09/rollout-2026-09-09T10-02-19-01a0848b-a3d2-7590-957d-27ff4cabd449.jsonl';
const entries = fs.readFileSync(source, 'utf8').split(/\r?\n/).filter(Boolean).map(JSON.parse);
const out = path.resolve(__dirname, '../optimization/o1/recovered');
fs.mkdirSync(out, { recursive: true });
function save(name, content) { fs.writeFileSync(path.join(out, name), content, { flag: 'wx' }); }
for (const entry of entries) {
  const p = entry.payload;
  if (entry.type !== 'response_item' || p.type !== 'custom_tool_call') continue;
  for (const match of p.input.matchAll(/tools\.apply_patch\(("(?:[^"\\]|\\.)*")\)/g)) {
    const patch = JSON.parse(match[1]);
    for (const file of patch.split('*** Add File: ').slice(1)) {
      const [name, ...lines] = file.split('\n');
      const base = path.basename(name);
      if (!['run-o1.cjs', 'index-proposals.md'].includes(base)) continue;
      const content = [];
      for (const line of lines) { if (line.startsWith('*** ')) break; if (line.startsWith('+')) content.push(line.slice(1)); }
      save(base === 'run-o1.cjs' ? 'historical-runner.cjs.txt' : 'historical-index-proposals.md', content.join('\n') + '\n');
    }
  }
}
let summary;
for (const entry of entries) {
  const p = entry.payload;
  if (entry.type !== 'response_item' || p.type !== 'custom_tool_call_output' || p.call_id !== 'call_yDwpAwKZV1p4hS8v88KJrde2') continue;
  for (const block of p.output) {
    try { const value = JSON.parse(block.text); if (value.output?.includes('members-list p50')) summary = value.output; } catch {}
  }
}
if (!summary) throw new Error('Historical summary not found');
save('historical-measurement-output.txt', summary);
const bytes = fs.readFileSync(path.resolve(__dirname, '../optimization/o1/before-run.log'));
const log = bytes.toString(bytes[0] === 255 ? 'utf16le' : 'utf8').replace(/^\uFEFF/, '');
let lastUrl;
const urls = {};
for (const line of log.split(/\r?\n/)) {
  const get = line.match(/GET (\/api\/[^\s\x1b]+)/);
  if (get) lastUrl = get[1];
  const bench = line.match(/^BENCH (\S+) /);
  if (bench) urls[bench[1]] = lastUrl;
}
const results = [...summary.matchAll(/^(\S+) p50 ([\d.]+) p95 ([\d.]+)/gm)]
  .map((m) => ({ name: m[1], url: urls[m[1]], p50: Number(m[2]), p95: Number(m[3]) }));
if (results.length !== 16 || results.some((r) => !r.url)) throw new Error('Incomplete historical operation recovery');
save('historical-baseline-summary.json', JSON.stringify({
  label: 'Recovered summary of existing O1 LOCAL RECONSTRUCTED PRE-OPTIMIZATION BASELINE; no new baseline run',
  sourceSession: path.basename(source), sourceLogSha256: crypto.createHash('sha256').update(bytes).digest('hex'),
  recoveredAt: new Date().toISOString(), iterations: 20, warmups: 2, vus: 1,
  percentile: 'Linear interpolation at (n-1)*p', results,
  limitations: ['P50/P95 were printed to two decimal places.', 'Original raw sample arrays, full 135 explain documents, 23 functional hashes and full 40-collection index/stat inventory are not intact.', 'Historical source output includes selected, sometimes truncated explain summaries; it is not the missing raw explain file.'],
}, null, 2));
console.log(JSON.stringify({ restoredFiles: fs.readdirSync(out), operations: results.length, newBenchmarkRun: false }));
