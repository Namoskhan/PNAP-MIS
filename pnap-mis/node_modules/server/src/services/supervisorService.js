const RoleAssignment = require('../models/RoleAssignment');
const Area = require('../models/Area');
const District = require('../models/District');
const Province = require('../models/Province');
const { ensureCentralSingleton } = require('../utils/centralUnit');

// SRS §12 — an upper level sends a supervisor to observe the meetings
// of the levels below it. So the eligible supervisors for a meeting
// are the office-holders of its ANCESTOR units: strictly above the
// unit that met, never the unit itself and never a sibling.
//
// "Office-holder" is not a role-code list. It is whoever holds an
// active APPROVED RoleAssignment at one of those units — which is the
// same record the cabinet UI is built from, and which keeps working
// when Super Admin mints a custom role code (roleCode is deliberately
// not enum-locked on the model).

const LEVEL_RANK = { BASIC_UNIT: 0, AREA: 1, DISTRICT: 2, PROVINCE: 3, CENTRAL: 4 };

// The ancestor units of a meeting, as {unitLevel, unitId} refs.
// Everything below Central comes straight off the meeting's own
// denormalized chain (written at create by resolveUnitChain), so this
// costs one query — the Central singleton lookup. A CENTRAL meeting
// has no ancestors and returns [].
async function ancestorUnitsOf(meeting) {
  const rank = LEVEL_RANK[meeting.unitLevel];
  if (rank === undefined || meeting.unitLevel === 'CENTRAL') return [];

  const refs = [];
  if (meeting.areaId && rank < LEVEL_RANK.AREA) {
    refs.push({ unitLevel: 'AREA', unitId: meeting.areaId });
  }
  if (meeting.districtId && rank < LEVEL_RANK.DISTRICT) {
    refs.push({ unitLevel: 'DISTRICT', unitId: meeting.districtId });
  }
  if (meeting.provinceId && rank < LEVEL_RANK.PROVINCE) {
    refs.push({ unitLevel: 'PROVINCE', unitId: meeting.provinceId });
  }
  const central = await ensureCentralSingleton();
  if (central) refs.push({ unitLevel: 'CENTRAL', unitId: central._id });
  return refs;
}

// Human labels for the ancestor units, so the picker can say
// "Gulberg Area" rather than an ObjectId. One query per tier, and
// only for the tiers actually present.
async function unitNamesFor(refs) {
  const byLevel = Object.fromEntries(refs.map((r) => [r.unitLevel, r.unitId]));
  const [area, district, province, central] = await Promise.all([
    byLevel.AREA ? Area.findById(byLevel.AREA).select('name').lean() : null,
    byLevel.DISTRICT ? District.findById(byLevel.DISTRICT).select('name').lean() : null,
    byLevel.PROVINCE ? Province.findById(byLevel.PROVINCE).select('name').lean() : null,
    byLevel.CENTRAL ? ensureCentralSingleton() : null,
  ]);
  const names = new Map();
  if (area) names.set(String(area._id), area.name);
  if (district) names.set(String(district._id), district.name);
  if (province) names.set(String(province._id), province.name);
  if (central) names.set(String(central._id), central.name || 'PKNAP Central');
  return names;
}

// Every active office-holder eligible to supervise this meeting, one
// row per member (a member holding two roles in the same cabinet
// appears once, with both role codes).
async function listCandidates(meeting) {
  const refs = await ancestorUnitsOf(meeting);
  if (refs.length === 0) return [];

  const [assignments, names] = await Promise.all([
    RoleAssignment.find({
      $or: refs.map((r) => ({ unitLevel: r.unitLevel, unitId: r.unitId })),
      state: 'APPROVED',
      endedAt: { $exists: false },
    }).populate('memberId', 'fullName memberId cnic').lean(),
    unitNamesFor(refs),
  ]);

  // Roles ship as {code, customName} rather than a rendered string:
  // the client resolves codes through the live role catalogue, and a
  // legacy free-text OTHER assignment keeps its own wording.
  const byMember = new Map();
  for (const ra of assignments) {
    if (!ra.memberId?._id) continue;
    const key = String(ra.memberId._id);
    const role = { code: ra.roleCode, customName: ra.customRoleName || '' };
    const existing = byMember.get(key);
    if (existing) {
      if (!existing.roles.some((r) => r.code === role.code && r.customName === role.customName)) {
        existing.roles.push(role);
      }
      continue;
    }
    byMember.set(key, {
      _id: key,
      fullName: ra.memberId.fullName,
      memberCode: ra.memberId.memberId || ra.memberId.cnic || '',
      roles: [role],
      unitLevel: ra.unitLevel,
      unitName: names.get(String(ra.unitId)) || '',
    });
  }

  return [...byMember.values()].sort((a, b) => {
    // Nearest tier first — the Area officer who most likely attended a
    // Basic Unit meeting should not be buried under Central.
    const d = LEVEL_RANK[a.unitLevel] - LEVEL_RANK[b.unitLevel];
    return d !== 0 ? d : a.fullName.localeCompare(b.fullName);
  });
}

// Finalize-time gate. The client's candidate list is a convenience,
// not an authority — re-derive the ancestor set and confirm the
// submitted member genuinely holds office there.
async function isEligible(meeting, memberId) {
  const refs = await ancestorUnitsOf(meeting);
  if (refs.length === 0) return false;
  const hit = await RoleAssignment.findOne({
    memberId,
    $or: refs.map((r) => ({ unitLevel: r.unitLevel, unitId: r.unitId })),
    state: 'APPROVED',
    endedAt: { $exists: false },
  }).select('_id').lean();
  return !!hit;
}

module.exports = { ancestorUnitsOf, listCandidates, isEligible };
