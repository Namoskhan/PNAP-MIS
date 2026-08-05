// A PNAP login identifier is one of three things: an email, a username,
// or a CNIC. Every screen that accepts one (sign in, forgot password,
// resend verification) has to guess which the user is typing and format
// accordingly — so the guess lives here once rather than being copied
// into each form.

/**
 * If the user types digits, format them as a CNIC (5-7-1). If they type
 * anything that isn't a digit (e.g. "@" for email, or letters for a
 * username), leave the value untouched.
 */
export function maybeFormatCnic(input) {
  if (!input) return '';
  // Anything beyond digits, dashes, and whitespace is a non-CNIC
  // identifier — let it through verbatim. Dashes + spaces alone are
  // tolerated because users sometimes paste from a CNIC card with a
  // trailing space.
  if (/[^0-9\s-]/.test(input)) return input;
  // Strip everything except digits, cap at 13 (CNIC length).
  const digits = input.replace(/\D/g, '').slice(0, 13);
  if (digits.length === 0) return '';
  if (digits.length <= 5) return digits;
  if (digits.length <= 12) return `${digits.slice(0, 5)}-${digits.slice(5)}`;
  return `${digits.slice(0, 5)}-${digits.slice(5, 12)}-${digits.slice(12)}`;
}

/** True when the value looks like the start of a CNIC, for the input hint. */
export function looksNumeric(value) {
  return /^\d/.test(value || '');
}

/** True when a paste should be reformatted as a CNIC rather than kept verbatim. */
export function isCnicPaste(text) {
  return Boolean(text) && !/[^0-9\s-]/.test(text);
}
