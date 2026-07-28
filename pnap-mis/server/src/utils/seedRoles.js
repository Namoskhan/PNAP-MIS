const Role = require('../models/Role');
const { DEFAULT_PERMISSIONS } = require('./permissions');

// Canonical seed for the 22 SRS-defined role codes. Idempotent — only
// inserts missing rows; never overwrites Super Admin's edits to label
// / description / sortOrder / isActive on existing rows. The category
// + isSystem flag are kept authoritative on every boot so the lock on
// built-in roles can't be tampered with.
const BUILTIN_ROLES = [
  // Territorial admins
  { code: 'SUPER_ADMIN',       label: 'Super Admin',        category: 'ADMIN', sortOrder: 10, description: 'Global override — bootstrap and break-glass.' },
  { code: 'PROVINCE_ADMIN',    label: 'Province Admin',     category: 'ADMIN', sortOrder: 20 },
  { code: 'DISTRICT_ADMIN',    label: 'District Admin',     category: 'ADMIN', sortOrder: 30 },
  { code: 'AREA_ADMIN',        label: 'Area Admin',         category: 'ADMIN', sortOrder: 40 },

  // Below-province cabinet roles (basic-unit / area / district)
  { code: 'SECRETARY',         label: 'Secretary',                  category: 'BU_AREA_DISTRICT', sortOrder: 110 },
  { code: 'SENIOR_MAWIN',      label: 'Senior Mawin Secretary',     category: 'BU_AREA_DISTRICT', sortOrder: 120, description: 'Operator role — meetings, finance, communication.' },
  { code: 'FINANCE_SECRETARY', label: 'Finance Secretary',          category: 'BU_AREA_DISTRICT', sortOrder: 130 },
  { code: 'PRESS_SECRETARY',   label: 'Press Secretary',            category: 'BU_AREA_DISTRICT', sortOrder: 140 },
  { code: 'CULTURE_SECRETARY', label: 'Culture Secretary',          category: 'BU_AREA_DISTRICT', sortOrder: 150 },
  { code: 'SPORTS_SECRETARY',  label: 'Sports Secretary',           category: 'BU_AREA_DISTRICT', sortOrder: 160 },

  // Province cabinet (SRS §3.3)
  { code: 'PRESIDENT',         label: 'President / Saddar',         category: 'PROVINCE', sortOrder: 210 },
  { code: 'SR_VICE_PRESIDENT', label: 'Senior Vice President',      category: 'PROVINCE', sortOrder: 220, description: 'Province operator role (Senior-Mawin equivalent).' },
  { code: 'VICE_PRESIDENT',    label: 'Vice President',             category: 'PROVINCE', sortOrder: 230 },
  { code: 'GENERAL_SECRETARY', label: 'General Secretary',          category: 'PROVINCE', sortOrder: 240, description: 'Province / Central — runs operations + communication.' },

  // Central cabinet (SRS §3.4)
  { code: 'CHAIRMAN',          label: 'Chairman',                   category: 'CENTRAL', sortOrder: 310 },
  { code: 'CO_CHAIRMAN',       label: 'Co-Chairman',                category: 'CENTRAL', sortOrder: 320 },
  { code: 'SR_VICE_CHAIRMAN',  label: 'Senior Vice Chairman',       category: 'CENTRAL', sortOrder: 330 },
  { code: 'VICE_CHAIRMAN',     label: 'Vice Chairman',              category: 'CENTRAL', sortOrder: 340 },
  { code: 'FIRST_SECRETARY',   label: 'First Secretary',            category: 'CENTRAL', sortOrder: 350, description: 'Central operator role (Senior-Mawin equivalent).' },

  // Catch-all + base
  { code: 'OTHER',  label: 'Other (custom-named)',  category: 'SYSTEM', sortOrder: 900, description: 'Reserved code for custom-named cabinet roles.' },
  { code: 'MEMBER', label: 'Member',                category: 'SYSTEM', sortOrder: 999, description: 'Base portal role — every active member holds this.' },
];

async function seedRoles() {
  let inserted = 0;
  let backfilledPerms = 0;
  for (const r of BUILTIN_ROLES) {
    const defaultPerms = DEFAULT_PERMISSIONS[r.code] || [];
    const existing = await Role.findOne({ code: r.code });
    if (!existing) {
      await Role.create({ ...r, isSystem: true, isActive: true, permissions: defaultPerms });
      inserted++;
    } else {
      let dirty = false;
      if (!existing.isSystem) { existing.isSystem = true; dirty = true; }
      if (existing.category !== r.category) { existing.category = r.category; dirty = true; }
      // Backfill permissions on first migration — only when the field
      // is missing or empty. Once Super Admin has edited the list we
      // never overwrite it; admins can always reset via the UI.
      if (!Array.isArray(existing.permissions) || existing.permissions.length === 0) {
        if (defaultPerms.length > 0) {
          existing.permissions = defaultPerms.slice();
          backfilledPerms++;
          dirty = true;
        }
      } else if (existing.isSystem && defaultPerms.length > 0) {
        // ── Additive merge for built-in roles ──
        // When DEFAULT_PERMISSIONS gains a new entry (e.g.
        // REGISTER_MEMBER added to the catalogue), built-in roles
        // should pick it up automatically on next boot. We ONLY add
        // missing defaults — admin's custom additions are preserved,
        // never stripped. To revoke a default, the admin should also
        // remove it from DEFAULT_PERMISSIONS in source.
        const have = new Set(existing.permissions);
        const before = have.size;
        for (const p of defaultPerms) have.add(p);
        if (have.size > before) {
          existing.permissions = [...have];
          backfilledPerms++;
          dirty = true;
        }
      }
      // SUPER_ADMIN is locked — re-pin label and the full permission
      // catalogue on every boot so the bootstrap identity stays
      // canonical no matter what happens to the DB row.
      if (r.code === 'SUPER_ADMIN') {
        if (existing.label !== r.label) { existing.label = r.label; dirty = true; }
        const all = (defaultPerms || []).slice().sort();
        const cur = (existing.permissions || []).slice().sort();
        if (JSON.stringify(all) !== JSON.stringify(cur)) {
          existing.permissions = defaultPerms.slice();
          dirty = true;
        }
        if (existing.isActive !== true) { existing.isActive = true; dirty = true; }
      }
      if (dirty) await existing.save();
    }
  }
  return { inserted, backfilledPerms, total: BUILTIN_ROLES.length };
}

module.exports = { seedRoles, BUILTIN_ROLES };
