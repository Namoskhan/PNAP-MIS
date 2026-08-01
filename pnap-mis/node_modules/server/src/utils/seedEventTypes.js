const EventTypeConfig = require('../models/EventTypeConfig');

// seedEventTypes — idempotent seeder for the built-in meeting and
// activity types. Each row matches the BEHAVIOUR currently hard-coded
// in the legacy controllers:
//   • Meetings: at least 1 photo required to finalize (all types)
//   • Activities: PROTEST/JALSA/CAMPAIGN need ≥2 photos to complete;
//     others have no photo gate.
//
// Idempotent: only inserts missing rows; never overwrites admin
// edits to label / description / sortOrder. The `code`, `entity`,
// and `isSystem: true` flags are kept canonical on every boot so the
// built-ins can't be tampered with.

const BUILTIN_MEETING_TYPES = [
  { code: 'GBM', label: 'General Body Meeting',  sortOrder: 10, description: 'Full membership meeting at any unit.' },
  { code: 'EXC', label: 'Executive Meeting',     sortOrder: 20, description: 'Cabinet / executive committee meeting.' },
  { code: 'PRT', label: 'Protest Meeting',       sortOrder: 30, description: 'Planning / debrief meeting tied to a protest activity.' },
  { code: 'JLS', label: 'Jalsa Meeting',         sortOrder: 40, description: 'Planning / debrief meeting tied to a jalsa.' },
  { code: 'CMP', label: 'Campaign Meeting',      sortOrder: 50, description: 'Planning / debrief meeting tied to a campaign.' },
  { code: 'SEM', label: 'Seminar Meeting',       sortOrder: 60, description: 'Planning / debrief meeting tied to a seminar.' },
  { code: 'STC', label: 'Study Circle Meeting',  sortOrder: 70, description: 'Internal study-circle session (SRS §10).' },
  { code: 'OTH', label: 'Other Meeting',         sortOrder: 99, description: 'Catch-all for ad-hoc meetings.' },
];

const BUILTIN_ACTIVITY_TYPES = [
  // Photo-heavy: SRS ACT-002 requires ≥2 EXIF/GPS-verified photos to
  // complete. Captured here so the future controller can read the
  // policy off the config instead of the hardcoded list.
  { code: 'PROTEST',           label: 'Protest',           sortOrder: 10, photoMin: 2, description: 'Public protest event.' },
  { code: 'JALSA',             label: 'Jalsa',             sortOrder: 20, photoMin: 2, description: 'Public rally / gathering.' },
  { code: 'CAMPAIGN',          label: 'Campaign',          sortOrder: 30, photoMin: 2, description: 'Door-to-door / outreach campaign.' },
  // Light-touch: photos welcomed but not required.
  { code: 'SEMINAR',           label: 'Seminar',           sortOrder: 40, photoMin: 0, description: 'Educational seminar / workshop.' },
  { code: 'STUDY_CIRCLE',      label: 'Study Circle',      sortOrder: 50, photoMin: 0, description: 'Recurring study group session.' },
  { code: 'TASK',              label: 'Task',              sortOrder: 60, photoMin: 0, description: 'Internal organisational task.' },
  { code: 'COMMUNITY_SERVICE', label: 'Community Service', sortOrder: 70, photoMin: 0, description: 'Volunteer / public service work.' },
];

async function _upsertOne({ entity, code, label, description, sortOrder, photoMin, finalizeRequiresPhotos }) {
  const existing = await EventTypeConfig.findOne({ entity, code });
  const photoPolicy = {
    required: photoMin > 0,
    minCount: photoMin,
    requireGps: true,
    requireExif: true,
  };
  if (!existing) {
    await EventTypeConfig.create({
      entity,
      code,
      label,
      description,
      isSystem: true,
      isActive: true,
      sortOrder,
      appliesTo: { executive: true, committee: true },
      photoPolicy,
      workflow: { extraStates: [], finalizeRequiresPhotos: !!finalizeRequiresPhotos },
      fields: [],
      configVersion: 1,
    });
    return 'inserted';
  }
  // Re-pin authoritative flags on every boot — the row may have been
  // tampered with via a direct DB edit.
  let dirty = false;
  if (!existing.isSystem) { existing.isSystem = true; dirty = true; }
  if (existing.entity !== entity) { existing.entity = entity; dirty = true; }
  if (existing.code !== code) { existing.code = code; dirty = true; }
  if (dirty) await existing.save();
  return dirty ? 'reconciled' : 'unchanged';
}

async function seedEventTypes() {
  const stats = { meetingsInserted: 0, activitiesInserted: 0, reconciled: 0 };

  for (const t of BUILTIN_MEETING_TYPES) {
    const r = await _upsertOne({
      entity: 'MEETING',
      code: t.code,
      label: t.label,
      description: t.description,
      sortOrder: t.sortOrder,
      // All meeting finalizations currently require ≥1 photo —
      // matches the existing meetingController.finalize gate.
      photoMin: 1,
      finalizeRequiresPhotos: true,
    });
    if (r === 'inserted') stats.meetingsInserted++;
    if (r === 'reconciled') stats.reconciled++;
  }

  for (const t of BUILTIN_ACTIVITY_TYPES) {
    const r = await _upsertOne({
      entity: 'ACTIVITY',
      code: t.code,
      label: t.label,
      description: t.description,
      sortOrder: t.sortOrder,
      photoMin: t.photoMin,
      // finalizeRequiresPhotos doesn't apply to activities (they use
      // the COMPLETED state, not FINALIZED). Leave at default false.
      finalizeRequiresPhotos: false,
    });
    if (r === 'inserted') stats.activitiesInserted++;
    if (r === 'reconciled') stats.reconciled++;
  }

  return stats;
}

module.exports = {
  seedEventTypes,
  BUILTIN_MEETING_TYPES,
  BUILTIN_ACTIVITY_TYPES,
};
