/**
 * Seed Balochistan: Province -> District -> Area -> Basic Unit.
 *
 * Goes through the REST API rather than writing to Mongo directly, because
 * createArea/createBasicUnit also run CabinetSlot.seedFor() and record org
 * activity. A direct insert produces units with no cabinet slots, which
 * looks fine in the collection and breaks everything downstream.
 *
 * Idempotent: existing rows are matched by name within their parent and
 * reused, so re-running after a failure resumes instead of duplicating.
 *
 *   node seed-data/seed-balochistan.js --dry-run
 *   node seed-data/seed-balochistan.js
 *
 * Env: API (default http://127.0.0.1:5000/api), IDENTIFIER, PASSWORD
 */
const fs = require('fs');
const path = require('path');

const API = process.env.API || 'http://127.0.0.1:5000/api';
const IDENTIFIER = process.env.IDENTIFIER || 'super';
const PASSWORD = process.env.PASSWORD || '123456';
const DRY = process.argv.includes('--dry-run');

const data = JSON.parse(fs.readFileSync(path.join(__dirname, 'balochistan.json'), 'utf8'));

let token = '';
const H = () => ({ authorization: `Bearer ${token}`, 'content-type': 'application/json' });

async function req(method, url, body) {
  const r = await fetch(API + url, {
    method, headers: H(), body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  let json; try { json = JSON.parse(text); } catch { json = { raw: text }; }
  if (!r.ok) {
    const msg = json?.error?.message || json?.message || text.slice(0, 200);
    throw new Error(`${method} ${url} -> ${r.status}: ${msg}`);
  }
  return json.data;
}

const stats = { district: [0, 0], area: [0, 0], unit: [0, 0] }; // [created, reused]

/** Find a child by exact name under its parent, or create it. */
async function ensure(kind, listPath, createPath, parentKey, parentId, name) {
  // In a dry run the parent was never written, so it has a synthetic id and
  // nothing can exist beneath it — asking the API would just 400.
  if (String(parentId).startsWith('dry-')) {
    stats[kind][0]++;
    return { _id: `dry-${kind}-${name}`, name };
  }
  const existing = await req('GET', `${listPath}?${parentKey}=${parentId}`);
  const hit = (existing || []).find(
    (x) => String(x.name).trim().toLowerCase() === name.trim().toLowerCase(),
  );
  if (hit) { stats[kind][1]++; return hit; }
  if (DRY) { stats[kind][0]++; return { _id: `dry-${kind}-${name}`, name }; }
  const made = await req('POST', createPath, { name, [parentKey]: parentId });
  stats[kind][0]++;
  return made;
}

(async () => {
  console.log(`API ${API}${DRY ? '   [DRY RUN — nothing will be written]' : ''}`);

  const login = await (await fetch(`${API}/auth/login`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ identifier: IDENTIFIER, password: PASSWORD }),
  })).json();
  if (!login?.data?.token) throw new Error('login failed: ' + JSON.stringify(login).slice(0, 200));
  token = login.data.token;

  const provinces = await req('GET', '/org/provinces');
  const province = provinces.find((p) => /baloch/i.test(p.name));
  if (!province) throw new Error('Balochistan province not found — create it first.');
  console.log(`province: ${province.name} (${province.code})\n`);

  const districts = Object.keys(data.tree);
  for (let i = 0; i < districts.length; i++) {
    const dName = districts[i];
    const d = await ensure('district', '/org/districts', '/org/districts', 'provinceId', province._id, dName);

    let nA = 0, nU = 0;
    for (const aName of Object.keys(data.tree[dName])) {
      const a = await ensure('area', '/org/areas', '/org/areas', 'districtId', d._id, aName);
      nA++;
      for (const uName of data.tree[dName][aName]) {
        await ensure('unit', '/org/basic-units', '/org/basic-units', 'areaId', a._id, uName);
        nU++;
      }
    }
    console.log(
      `  [${String(i + 1).padStart(2)}/${districts.length}] ${dName.padEnd(18)} ${String(nA).padStart(2)} areas, ${String(nU).padStart(3)} units`,
    );
  }

  console.log('\n            created  reused');
  for (const k of ['district', 'area', 'unit']) {
    console.log(`  ${k.padEnd(9)} ${String(stats[k][0]).padStart(7)} ${String(stats[k][1]).padStart(7)}`);
  }
  if (DRY) console.log('\nDry run — no writes performed.');
})().catch((e) => { console.error('\nFAILED:', e.message); process.exit(1); });
