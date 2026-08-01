import { useMemo } from 'react';
import { getFieldComponent } from './FieldRegistry';

// DynamicForm — render a list of resolved fields against a payload.
// Same renderer powers both create (live config) and view (frozen
// snapshot) — pass `snapshot` from a Meeting/Activity record to
// re-render historical data with its original field definitions.
//
// Props:
//   snapshot   — { resolvedFields: [...] } or a live config doc with
//                a `fields` array (already populated). The component
//                accepts both shapes; pass whichever you have on hand.
//   value      — { [key]: value } object — current dynamicData
//   errors     — { [key]: 'message' } per-field errors from the server
//   onChange   — (next) => void  — called with the FULL updated bag
//                whenever any field changes
//   mode       — 'create' (default) | 'detail' — toggles which
//                visibility flag a field must satisfy to render
//   disabled   — boolean — globally disable inputs (read-only view)

export default function DynamicForm({ snapshot, value = {}, errors = {}, onChange, mode = 'create', disabled = false }) {
  const fields = useMemo(() => {
    // Accept either { resolvedFields: [...] } (snapshot) or { fields: [...] } (live config)
    const raw = snapshot?.resolvedFields || snapshot?.fields || [];
    const visKey = mode === 'detail' ? 'showOnDetail' : 'showOnCreate';
    return raw
      .filter((f) => f && (f.visibility ? f.visibility[visKey] !== false : true))
      .slice()
      .sort((a, b) => (a.sortOrder ?? 100) - (b.sortOrder ?? 100));
  }, [snapshot, mode]);

  if (fields.length === 0) return null;

  function setOne(key, v) {
    const next = { ...value };
    if (v === undefined) delete next[key];
    else next[key] = v;
    onChange?.(next);
  }

  return (
    <div className="form-grid">
      {fields.map((field) => {
        const Component = getFieldComponent(field.type);
        return (
          <Component
            key={field.key}
            field={field}
            value={value[field.key]}
            error={errors[field.key]}
            onChange={(v) => setOne(field.key, v)}
            disabled={disabled}
          />
        );
      })}
    </div>
  );
}
