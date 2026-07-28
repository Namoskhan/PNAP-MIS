const Counter = require('../models/Counter');
const Province = require('../models/Province');
const District = require('../models/District');

// Districts that pre-existed under the old admin-curated flow have a
// short uppercase `code` (e.g. KHE, LHR). Districts auto-created by
// the public registration flow don't — for those we generate a 3-letter
// abbreviation from the name so member IDs read like
// PNAP-KP-KHW-2026-000001 instead of PNAP-KP-undefined-2026-000001.
function abbrFromName(name) {
  const letters = String(name || '').replace(/[^a-zA-Z]/g, '');
  if (!letters) return 'XXX';
  return letters.slice(0, 3).toUpperCase().padEnd(3, 'X');
}

async function generateMemberId(member) {
  const [province, district] = await Promise.all([
    Province.findById(member.provinceId).lean(),
    District.findById(member.districtId).lean(),
  ]);
  if (!province || !district) {
    throw new Error('Province/District not found while generating member ID');
  }
  const provinceCode = province.code || abbrFromName(province.name);
  const districtCode = district.code || abbrFromName(district.name);

  const year = new Date().getFullYear();
  const key = `member:${provinceCode}:${districtCode}:${year}`;
  const seq = await Counter.next(key);
  const padded = String(seq).padStart(6, '0');
  return `PNAP-${provinceCode}-${districtCode}-${year}-${padded}`;
}

module.exports = { generateMemberId };
