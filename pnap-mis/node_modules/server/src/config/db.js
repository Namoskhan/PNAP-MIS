const mongoose = require('mongoose');
const env = require('./env');

async function connectDB() {
  mongoose.set('strictQuery', true);
  await mongoose.connect(env.MONGO_URI, {
    autoIndex: env.NODE_ENV !== 'production',
  });
  console.log(`[db] connected to ${env.MONGO_URI}`);

  // Reconcile MongoDB's actual indexes with the current schema. This
  // drops legacy indexes that no longer match — most importantly the
  // old non-sparse `email_1` unique index from when User.email was
  // `required: true`, which now causes spurious "Duplicate field
  // value" errors when Area Admins / Members are created without an
  // email. Skip in production (run as a deliberate migration there).
  if (env.NODE_ENV !== 'production') {
    // Reconcile every model's indexes with its current schema. This
    // catches situations where a unique/sparse setting was relaxed in
    // code but the on-disk index is still strict (e.g. the legacy
    // non-sparse `districts.provinceId_1_code_1` that caused
    // spurious "duplicate field value" errors on registration).
    const modelNames = [
      'User', 'Member', 'Province', 'District', 'Area', 'BasicUnit',
      'CabinetSlot', 'RoleAssignment', 'Meeting', 'Activity',
      'Donation', 'Expense', 'FundTransfer', 'PermanentMembership',
      'UnitProposal', 'Counter', 'Responsibility', 'AuditLog', 'Central',
      'EventTypeConfig', 'FieldDefinition', 'EventConfigSnapshot',
      'UnitTierConfig', 'UnitTierConfigSnapshot',
      'CabinetTemplate', 'UnitPolicy', 'WorkflowConfig',
      'ResponsibilityTemplate', 'PerformanceRuleSet',
      'ReportTemplate',
      'SystemSettings', 'SettingsVersion',
    ];
    const allDropped = [];
    for (const name of modelNames) {
      try {
        const Model = require(`../models/${name}`);
        const dropped = await Model.syncIndexes();
        if (dropped && dropped.length) allDropped.push(`${name}:${dropped.join(',')}`);
      } catch (err) {
        console.warn(`[db] index sync skipped for ${name}: ${err.message}`);
      }
    }
    if (allDropped.length) console.log(`[db] reconciled indexes; dropped: ${allDropped.join(' | ')}`);

    // ── One-time migration: wipe auto-provisioned tier admins ──
    // Per the new SRS-aligned flow, tier admins (PROVINCE_ADMIN /
    // DISTRICT_ADMIN / AREA_ADMIN) are no longer auto-created when a
    // unit is created — they must be created explicitly by the next
    // tier up via POST /api/admin/users. Wipe any users left over
    // from the previous auto-provision logic. Idempotent by pattern:
    // we only delete users whose fullName matches the auto-seeder
    // format ("<X> Province Admin" / "<X> District Admin" / "<X>
    // Area Admin") AND whose role list contains exactly one of those
    // three codes — manually-created admins (real fullName, multiple
    // identifiers) are not affected.
    try {
      const User = require('../models/User');
      const RoleAssignment = require('../models/RoleAssignment');
      const candidates = await User.find({
        fullName: { $regex: /(Province|District|Area) Admin$/i },
        roles: { $size: 1 },
        $or: [
          { roles: 'PROVINCE_ADMIN' },
          { roles: 'DISTRICT_ADMIN' },
          { roles: 'AREA_ADMIN' },
        ],
      }).select('_id fullName username').lean();
      if (candidates.length > 0) {
        const ids = candidates.map((u) => u._id);
        await RoleAssignment.updateMany(
          { proposedBy: { $in: ids }, state: { $in: ['PENDING', 'APPROVED'] } },
          { $set: { state: 'ENDED', endedAt: new Date() } },
        );
        const r = await User.deleteMany({ _id: { $in: ids } });
        console.log(`[db] wiped ${r.deletedCount} auto-provisioned tier admin(s): ${candidates.map((c) => c.username || c.fullName).join(', ')}`);
      }
    } catch (err) {
      console.warn(`[db] auto-admin wipe failed: ${err.message}`);
    }

    // CENTRAL_ADMIN role removed — Super Admin now structures
    // provinces and below directly. Wipe any leftover CENTRAL_ADMIN
    // users (e.g. the legacy `pnap` seeded account).
    try {
      const User = require('../models/User');
      const r = await User.deleteMany({ roles: 'CENTRAL_ADMIN' });
      if (r.deletedCount) console.log(`[db] removed ${r.deletedCount} legacy CENTRAL_ADMIN user(s)`);
    } catch (err) {
      console.warn(`[db] CENTRAL_ADMIN cleanup failed: ${err.message}`);
    }

    // Idempotently ensure the Super Admin (super/123456) — god mode
    // for credential management + audit + password resets.
    try {
      const { ensureSuperAdmin } = require('../utils/superAdmin');
      const r = await ensureSuperAdmin();
      if (r?.created) console.log(`[db] backfilled super admin user "${r.username}"`);
    } catch (err) {
      console.warn(`[db] super admin backfill failed: ${err.message}`);
    }

    // NATIONAL_ADMIN role removed — Super Admin now owns the Central
    // Cabinet, Central Committee, and Qomi Jirga directly.
    // Migration: demote any existing NATIONAL_ADMIN users to plain
    // members (or delete if they have no other purpose).
    try {
      const User = require('../models/User');
      const r = await User.deleteMany({ roles: 'NATIONAL_ADMIN' });
      if (r.deletedCount) console.log(`[db] removed ${r.deletedCount} legacy NATIONAL_ADMIN user(s)`);
    } catch (err) {
      console.warn(`[db] NATIONAL_ADMIN cleanup failed: ${err.message}`);
    }

    // Ensure the Central singleton org unit exists. Its _id is what
    // CabinetSlot / RoleAssignment / PermanentMembership rows use
    // as unitId for the Central body.
    try {
      const { ensureCentralSingleton } = require('../utils/centralUnit');
      await ensureCentralSingleton();
    } catch (err) {
      console.warn(`[db] central singleton backfill failed: ${err.message}`);
    }

    // Seed the Role catalogue — one document per built-in code so the
    // Super Admin's Role Management page can list, edit labels, and
    // toggle active flags on every system role. Idempotent.
    try {
      const { seedRoles } = require('../utils/seedRoles');
      const r = await seedRoles();
      if (r.inserted) console.log(`[db] seeded ${r.inserted}/${r.total} built-in role catalogue entries`);
      if (r.backfilledPerms) console.log(`[db] backfilled default permissions on ${r.backfilledPerms} role(s)`);
    } catch (err) {
      console.warn(`[db] role catalogue seed failed: ${err.message}`);
    }

    // Purge SUPER-reserved permission codes from every other role.
    // Administration is the Super Admin's work by product decision —
    // these codes are inert on other roles, and leaving them stored
    // made role holders classify as "operators" with dead grants.
    try {
      const Role = require('../models/Role');
      const { RESERVED_PERMISSION_CODES } = require('../utils/permissions');
      const r = await Role.updateMany(
        { code: { $ne: 'SUPER_ADMIN' }, permissions: { $in: RESERVED_PERMISSION_CODES } },
        { $pull: { permissions: { $in: RESERVED_PERMISSION_CODES } } }
      );
      if (r.modifiedCount) console.log(`[db] purged super-reserved permissions from ${r.modifiedCount} role(s)`);
    } catch (err) {
      console.warn(`[db] reserved-permission purge failed: ${err.message}`);
    }

    // Prime the in-memory permission cache used by userHasPermission.
    // Loaded after seed so every role's permissions array is present.
    try {
      const { loadRolePermissionCache } = require('../utils/permissions');
      await loadRolePermissionCache();
    } catch (err) {
      console.warn(`[db] permission cache load failed: ${err.message}`);
    }

    // Reconcile CabinetSlot.isMandatory + sortOrder with the current
    // CabinetTemplate catalogue. seedFor() only sets fields on insert,
    // so when an admin (or the boot seeder) promotes a slot from
    // optional to required, the existing per-unit rows stay stale
    // until we update them explicitly.
    //
    // Reads from the CabinetTemplate collection (PR U2). The legacy
    // CabinetSlot.TEMPLATES map is no longer consulted here — admin
    // edits to mandatory/sortOrder land on CabinetTemplate, and this
    // loop carries them through to every existing CabinetSlot row.
    try {
      const CabinetSlot = require('../models/CabinetSlot');
      const CabinetTemplate = require('../models/CabinetTemplate');
      const templates = await CabinetTemplate.find({ isActive: true }).lean();
      let updated = 0;
      for (const t of templates) {
        const r = await CabinetSlot.updateMany(
          {
            unitLevel: t.tierCode,
            roleCode: t.roleCode,
            $or: [
              { isMandatory: { $ne: t.isMandatory } },
              { sortOrder: { $ne: t.sortOrder } },
            ],
          },
          { $set: { isMandatory: !!t.isMandatory, sortOrder: t.sortOrder } }
        );
        updated += r.modifiedCount || 0;
      }
      if (updated) console.log(`[db] reconciled ${updated} cabinet slot(s) to current CabinetTemplate (mandatory/sortOrder)`);
    } catch (err) {
      console.warn(`[db] cabinet slot reconcile failed: ${err.message}`);
    }

    // Backfill body=EXECUTIVE on any pre-existing meetings/activities
    // that lack the field (added when we split Executive vs. Committee
    // bodies). Idempotent — only touches docs missing the field.
    try {
      const Meeting = require('../models/Meeting');
      const Activity = require('../models/Activity');
      const m = await Meeting.updateMany({ body: { $exists: false } }, { $set: { body: 'EXECUTIVE' } });
      const a = await Activity.updateMany({ body: { $exists: false } }, { $set: { body: 'EXECUTIVE' } });
      const total = (m.modifiedCount || 0) + (a.modifiedCount || 0);
      if (total) console.log(`[db] backfilled body=EXECUTIVE on ${m.modifiedCount || 0} meetings + ${a.modifiedCount || 0} activities`);
    } catch (err) {
      console.warn(`[db] body backfill failed: ${err.message}`);
    }

    // ── Hybrid Dynamic Modules — PR 2 migration ─────────────────────
    // Three idempotent steps, in order:
    //   1. seed the built-in EventTypeConfig rows (8 meeting + 7 activity)
    //   2. mirror legacy `type` → `typeCode`, materialise baseline
    //      EventConfigSnapshot rows, link existing records to them
    //   3. preserve every existing finalizedHash to finalizedHashLegacy
    // Steps 2 + 3 do NOT modify finalizedHash; that's PR 4 territory.
    try {
      const { seedEventTypes } = require('../utils/seedEventTypes');
      const r = await seedEventTypes();
      const inserted = (r.meetingsInserted || 0) + (r.activitiesInserted || 0);
      if (inserted) console.log(`[db] seeded ${r.meetingsInserted} meeting + ${r.activitiesInserted} activity built-in event types`);
      if (r.reconciled) console.log(`[db] reconciled isSystem flag on ${r.reconciled} event type(s)`);
    } catch (err) {
      console.warn(`[db] event-type seed failed: ${err.message}`);
    }

    // ── Hybrid Dynamic Unit Management — PR U1 ──────────────────────
    // Seed the 5 built-in tier configs (BASIC_UNIT, AREA, DISTRICT,
    // PROVINCE, CENTRAL). Idempotent — only inserts missing rows;
    // admin edits to labels / capabilities / fields are preserved.
    try {
      const { seedUnitTierConfigs } = require('../utils/seedUnitTierConfigs');
      const r = await seedUnitTierConfigs();
      if (r.inserted) console.log(`[db] seeded ${r.inserted}/${r.total} built-in unit tier configs`);
      if (r.reconciled) console.log(`[db] reconciled isSystem flag on ${r.reconciled} tier config(s)`);
    } catch (err) {
      console.warn(`[db] unit tier-config seed failed: ${err.message}`);
    }

    // ── PR U2 — Cabinet templates ──────────────────────────────────
    // Mirror the legacy CabinetSlot.TEMPLATES map into the editable
    // CabinetTemplate collection. Must run BEFORE the cabinet-slot
    // reconcile below, since that loop now reads from this
    // collection rather than the hardcoded map.
    try {
      const { seedCabinetTemplates } = require('../utils/seedCabinetTemplates');
      const r = await seedCabinetTemplates();
      if (r.inserted) console.log(`[db] seeded ${r.inserted} built-in cabinet template(s)`);
      if (r.reconciled) console.log(`[db] reconciled isSystem flag on ${r.reconciled} cabinet template(s)`);
    } catch (err) {
      console.warn(`[db] cabinet-template seed failed: ${err.message}`);
    }

    // ── PR U3 — Default GLOBAL unit policy ─────────────────────────
    // Seeds a single GLOBAL row that preserves the system's pre-PR-U3
    // hardcoded thresholds (expense second-approver at 10000,
    // transfer direction UP-only). End-user behavior is unchanged
    // until admin tightens specific rules via PATCH.
    try {
      const { seedUnitPolicies } = require('../utils/seedUnitPolicies');
      const r = await seedUnitPolicies();
      if (r.inserted) console.log('[db] seeded default GLOBAL unit policy');
      if (r.reconciled) console.log('[db] reconciled isSystem/isActive flags on GLOBAL unit policy');
    } catch (err) {
      console.warn(`[db] unit-policy seed failed: ${err.message}`);
    }

    // ── PR U4 — Default GLOBAL workflow configs ────────────────────
    // One single-stage workflow per domain (EXPENSE / MEMBER /
    // ROLE / TRANSFER / CABINET). Each mirrors the existing
    // controller's permission gate — deploying changes nothing for
    // end users until admin adds extra stages or thresholds.
    try {
      const { seedWorkflowConfigs } = require('../utils/seedWorkflowConfigs');
      const r = await seedWorkflowConfigs();
      if (r.inserted) console.log(`[db] seeded ${r.inserted}/${r.total} built-in workflow config(s)`);
      if (r.reconciled) console.log(`[db] reconciled isSystem/isActive flags on ${r.reconciled} workflow config(s)`);
    } catch (err) {
      console.warn(`[db] workflow-config seed failed: ${err.message}`);
    }

    // ── PR U6 — Default GLOBAL performance ruleset ─────────────────
    // SRS §10 baseline weights: 40% attendance, 25% responsibility
    // completion, 20% activity participation, 10% study contribution,
    // 5% donation. Live /performance/member/:id/score endpoint
    // resolves against this ruleset. Behavior unchanged until
    // a UI consumes it.
    try {
      const { seedPerformanceRuleSets } = require('../utils/seedPerformanceRuleSets');
      const r = await seedPerformanceRuleSets();
      if (r.inserted) console.log('[db] seeded default GLOBAL performance ruleset');
      if (r.reconciled) console.log('[db] reconciled isSystem/isActive flags on GLOBAL performance ruleset');
    } catch (err) {
      console.warn(`[db] performance-ruleset seed failed: ${err.message}`);
    }

    // ── PR B1 — System Settings singleton ──────────────────────────
    // Insert the SystemSettings 'singleton' document on first boot
    // with PKNAP_DEFAULT identity + theme + typography + dashboard
    // toggles. Once admin edits, the seeder is a no-op forever.
    try {
      const { seedSystemSettings } = require('../utils/seedSystemSettings');
      const r = await seedSystemSettings();
      if (r.inserted) console.log('[db] seeded SystemSettings singleton');
      if (r.reconciled) console.log('[db] re-synced SystemSettings theme to current preset definition');
    } catch (err) {
      console.warn(`[db] system-settings seed failed: ${err.message}`);
    }

    // PR F1 — sweep expired cabinet terms. Idempotent; ends any
    // APPROVED RoleAssignment past its termDays window and clears
    // the matching CabinetSlot. Pre-PR rows with termDays=0 are
    // untouched (most existing assignments).
    try {
      const { enforceCabinetTerms } = require('../utils/enforceCabinetTerms');
      const r = await enforceCabinetTerms();
      if (r.swept) console.log(`[db] auto-ended ${r.swept} expired cabinet term(s)`);
    } catch (err) {
      console.warn(`[db] cabinet-term sweep failed: ${err.message}`);
    }

    // Backfill login usernames for members registered before the
    // field existed. Idempotent — derived from first word of fullName,
    // deduped against the sparse-unique index.
    try {
      const { backfillMemberUsernames } = require('../utils/backfillMemberUsernames');
      const r = await backfillMemberUsernames();
      if (r.backfilled) console.log(`[db] backfilled ${r.backfilled} member username(s)`);
    } catch (err) {
      console.warn(`[db] member-username backfill failed: ${err.message}`);
    }

    try {
      const { backfillEventConfigs } = require('../utils/backfillEventConfigs');
      const r = await backfillEventConfigs();
      const t = (r.meetings.typeCodeFilled || 0) + (r.activities.typeCodeFilled || 0);
      const s = (r.meetings.snapshotIdFilled || 0) + (r.activities.snapshotIdFilled || 0);
      if (t) console.log(`[db] backfilled typeCode on ${r.meetings.typeCodeFilled} meeting(s) + ${r.activities.typeCodeFilled} activity(ies)`);
      if (s) console.log(`[db] backfilled configSnapshotId on ${r.meetings.snapshotIdFilled} meeting(s) + ${r.activities.snapshotIdFilled} activity(ies)`);
      const miss = (r.meetings.missingType || 0) + (r.activities.missingType || 0);
      if (miss) console.warn(`[db] ${miss} record(s) reference an unknown type and were skipped`);
    } catch (err) {
      console.warn(`[db] event-config backfill failed: ${err.message}`);
    }

    try {
      const { captureLegacyHashes } = require('../utils/captureLegacyHashes');
      const r = await captureLegacyHashes();
      if (r.captured) console.log(`[db] captured legacy finalizedHash on ${r.captured} finalized meeting(s)`);
    } catch (err) {
      console.warn(`[db] legacy-hash capture failed: ${err.message}`);
    }

    // PR 4a — recompute finalizedHash on every FINALIZED meeting using
    // the new canonical algorithm. Must run AFTER captureLegacyHashes
    // (which preserves the pre-cutover value into finalizedHashLegacy)
    // and AFTER backfillEventConfigs (which sets configSnapshotId).
    try {
      const { rehashFinalizedMeetings } = require('../utils/rehashFinalizedMeetings');
      const r = await rehashFinalizedMeetings();
      if (r.recomputed) console.log(`[db] recomputed finalizedHash on ${r.recomputed} finalized meeting(s) (${r.alreadyOk} already-current)`);
      if (r.skipped) console.warn(`[db] ${r.skipped} finalized meeting(s) skipped during rehash`);
    } catch (err) {
      console.warn(`[db] rehash finalized meetings failed: ${err.message}`);
    }

    // Backfill Elaqayi Committee formation timestamp for any Area
    // that already has an APPROVED Area-level cabinet role from
    // before the auto-form trigger existed.
    try {
      const Area = require('../models/Area');
      const RoleAssignment = require('../models/RoleAssignment');
      const areas = await Area.find({ 'committee.formedAt': { $exists: false } });
      let formed = 0;
      for (const a of areas) {
        const has = await RoleAssignment.findOne({
          unitLevel: 'AREA', unitId: a._id, state: 'APPROVED', endedAt: { $exists: false },
        }).lean();
        if (has) {
          a.committee = {
            formedAt: has.startedAt || has.decidedAt || new Date(),
            formedBy: has.decidedBy,
            name: `${a.name} Elaqayi Committee`,
          };
          await a.save();
          formed++;
        }
      }
      if (formed) console.log(`[db] backfilled ${formed} Elaqayi Committee formation record(s)`);
    } catch (err) {
      console.warn(`[db] committee backfill failed: ${err.message}`);
    }

    // Backfill Zilla Committee formation timestamps for districts
    // that already have an APPROVED District-level cabinet role.
    try {
      const District = require('../models/District');
      const RoleAssignment = require('../models/RoleAssignment');
      const districts = await District.find({ 'committee.formedAt': { $exists: false } });
      let formed = 0;
      for (const d of districts) {
        const has = await RoleAssignment.findOne({
          unitLevel: 'DISTRICT', unitId: d._id, state: 'APPROVED', endedAt: { $exists: false },
        }).lean();
        if (has) {
          d.committee = {
            formedAt: has.startedAt || has.decidedAt || new Date(),
            formedBy: has.decidedBy,
            name: `${d.name} Zilla Committee`,
          };
          await d.save();
          formed++;
        }
      }
      if (formed) console.log(`[db] backfilled ${formed} Zilla Committee formation record(s)`);
    } catch (err) {
      console.warn(`[db] zilla committee backfill failed: ${err.message}`);
    }

    // Backfill Sobayi Committee formation timestamps for provinces.
    try {
      const Province = require('../models/Province');
      const RoleAssignment = require('../models/RoleAssignment');
      const provinces = await Province.find({ 'committee.formedAt': { $exists: false } });
      let formed = 0;
      for (const p of provinces) {
        const has = await RoleAssignment.findOne({
          unitLevel: 'PROVINCE', unitId: p._id, state: 'APPROVED', endedAt: { $exists: false },
        }).lean();
        if (has) {
          p.committee = {
            formedAt: has.startedAt || has.decidedAt || new Date(),
            formedBy: has.decidedBy,
            name: `${p.name} Sobayi Committee`,
          };
          await p.save();
          formed++;
        }
      }
      if (formed) console.log(`[db] backfilled ${formed} Sobayi Committee formation record(s)`);
    } catch (err) {
      console.warn(`[db] sobayi committee backfill failed: ${err.message}`);
    }
  }
}

module.exports = { connectDB };
