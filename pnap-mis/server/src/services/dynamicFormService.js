const { ApiError } = require('../utils/response');

// dynamicFormService — validate, coerce, and strip dynamicData
// payloads against a resolved field set. The "resolved field set" is
// either the live `EventTypeConfig.fields` (after population) or a
// frozen `EventConfigSnapshot.resolvedFields`; both share the same
// shape so this service is agnostic to which one is passed in.
//
// Three public functions, mirroring the §7 plan:
//   validate(payload, fields)      → throws on invalid; returns clean obj
//   coerce(payload, fields)        → string→Number/Date/Bool, trims
//   stripUnknown(payload, fields)  → drops keys not in field set
//
// Errors are bundled into a single ApiError with `details.errors[]`
// so the frontend can mark each offending field.

const objectIdRe = /^[a-f\d]{24}$/i;

function isMissing(v) {
  return v === undefined || v === null || v === '';
}

// Coerce a single value to the target field type. Returns either
// { ok: true, value } or { ok: false, message }. Used by both
// validate() (which records errors) and coerce() (which returns the
// new value).
function coerceOne(field, raw) {
  if (isMissing(raw)) {
    if (field.required) return { ok: false, message: 'is required' };
    return { ok: true, value: undefined };
  }
  switch (field.type) {
    case 'TEXT':
    case 'TEXTAREA': {
      const s = String(raw).trim();
      const v = field.validation || {};
      if (typeof v.minLength === 'number' && s.length < v.minLength) {
        return { ok: false, message: `must be at least ${v.minLength} characters` };
      }
      if (typeof v.maxLength === 'number' && s.length > v.maxLength) {
        return { ok: false, message: `must be at most ${v.maxLength} characters` };
      }
      if (v.regex) {
        try {
          if (!new RegExp(v.regex).test(s)) {
            return { ok: false, message: 'does not match the required format' };
          }
        } catch { /* malformed regex on the field def — ignore */ }
      }
      return { ok: true, value: s };
    }

    case 'INT':
    case 'NUMBER':
    case 'CURRENCY': {
      const n = Number(raw);
      if (!Number.isFinite(n)) return { ok: false, message: 'must be a number' };
      if (field.type === 'INT' && !Number.isInteger(n)) {
        return { ok: false, message: 'must be a whole number' };
      }
      const v = field.validation || {};
      if (typeof v.min === 'number' && n < v.min) {
        return { ok: false, message: `must be ≥ ${v.min}` };
      }
      if (typeof v.max === 'number' && n > v.max) {
        return { ok: false, message: `must be ≤ ${v.max}` };
      }
      return { ok: true, value: n };
    }

    case 'DATE': {
      const d = raw instanceof Date ? raw : new Date(raw);
      if (Number.isNaN(d.getTime())) return { ok: false, message: 'must be a valid date' };
      return { ok: true, value: d };
    }

    case 'BOOL': {
      if (typeof raw === 'boolean') return { ok: true, value: raw };
      if (raw === 'true' || raw === 1 || raw === '1') return { ok: true, value: true };
      if (raw === 'false' || raw === 0 || raw === '0') return { ok: true, value: false };
      return { ok: false, message: 'must be true or false' };
    }

    case 'SELECT': {
      const v = field.validation || {};
      const allowed = new Set((v.options || []).map((o) => o.value));
      const s = String(raw);
      if (allowed.size > 0 && !allowed.has(s)) {
        return { ok: false, message: 'is not one of the allowed options' };
      }
      return { ok: true, value: s };
    }

    case 'MULTISELECT': {
      if (!Array.isArray(raw)) return { ok: false, message: 'must be a list' };
      const v = field.validation || {};
      const allowed = new Set((v.options || []).map((o) => o.value));
      const out = [];
      for (const item of raw) {
        const s = String(item);
        if (allowed.size > 0 && !allowed.has(s)) {
          return { ok: false, message: `value "${s}" is not one of the allowed options` };
        }
        out.push(s);
      }
      return { ok: true, value: out };
    }

    case 'MEMBER_REF': {
      const s = String(raw);
      if (!objectIdRe.test(s)) {
        return { ok: false, message: 'must be a valid member reference' };
      }
      return { ok: true, value: s };
    }

    default:
      return { ok: false, message: `unknown field type "${field.type}"` };
  }
}

// stripUnknown — remove any keys not present in the field set. This
// is the line of defence against schema drift: dynamicData ONLY ever
// contains keys the snapshot knows about.
function stripUnknown(payload, fields) {
  if (!payload || typeof payload !== 'object') return {};
  const known = new Set((fields || []).map((f) => f.key));
  const out = {};
  for (const k of Object.keys(payload)) {
    if (known.has(k)) out[k] = payload[k];
  }
  return out;
}

// coerce — best-effort type coercion without throwing. Unknown keys
// are stripped; invalid values are dropped silently. Only used in
// non-strict paths; create/finalize go through validate().
function coerce(payload, fields) {
  const stripped = stripUnknown(payload, fields);
  const out = {};
  for (const f of fields || []) {
    if (!(f.key in stripped)) continue;
    const r = coerceOne(f, stripped[f.key]);
    if (r.ok && r.value !== undefined) out[f.key] = r.value;
  }
  return out;
}

// validate — strict version. Throws ApiError(400, 'FIELD_VALIDATION')
// with a per-field error array if anything fails; otherwise returns
// the clean, coerced, unknown-stripped payload.
function validate(payload, fields) {
  const stripped = stripUnknown(payload, fields);
  const errors = [];
  const out = {};
  for (const f of fields || []) {
    const raw = stripped[f.key];
    const r = coerceOne(f, raw);
    if (!r.ok) {
      errors.push({ key: f.key, label: f.label || f.key, message: r.message });
      continue;
    }
    if (r.value !== undefined) out[f.key] = r.value;
  }
  if (errors.length > 0) {
    throw new ApiError(400, 'FIELD_VALIDATION', 'One or more dynamic fields are invalid', { errors });
  }
  return out;
}

module.exports = { validate, coerce, stripUnknown };
