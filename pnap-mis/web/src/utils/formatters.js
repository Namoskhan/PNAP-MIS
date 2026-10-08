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

// Phone — user types digits; formatted as 03XX-XXXXXXX:
// 03001234567 -> 0300-1234567. Non-digits are stripped, capped at 11 digits.
// If input starts with 92 (+92), it is converted to 0 for standard entry.
export function formatPhone(raw) {
  let digits = String(raw || '').replace(/\D/g, '');
  if (digits.startsWith('92')) {
    digits = '0' + digits.slice(2);
  } else if (digits.length >= 2 && digits.startsWith('3')) {
    digits = '0' + digits;
  }
  const d = digits.slice(0, 11);
  if (d.length <= 4) return d;
  return `${d.slice(0, 4)}-${d.slice(4)}`;
}

export function isCompletePhone(v) {
  return /^03\d{2}-\d{7}$/.test(String(v || ''));
}
