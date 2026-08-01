// Input mask helpers for identity fields.

// CNIC — the user types digits only; dashes are inserted for them:
// 4210112345671 → 42101-1234567-1. Non-digits are stripped, capped
// at 13 digits, so pasting a pre-formatted CNIC also works.
export function formatCnic(raw) {
  const d = String(raw || '').replace(/\D/g, '').slice(0, 13);
  if (d.length <= 5) return d;
  if (d.length <= 12) return `${d.slice(0, 5)}-${d.slice(5)}`;
  return `${d.slice(0, 5)}-${d.slice(5, 12)}-${d.slice(12)}`;
}

// True once all 13 digits are present (XXXXX-XXXXXXX-X).
export function isCompleteCnic(v) {
  return /^\d{5}-\d{7}-\d$/.test(String(v || ''));
}
