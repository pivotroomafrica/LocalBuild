/**
 * Normalizes a phone number to E.164-ish form (+<countrycode><number>).
 * Tuned for Ethiopian numbers (the current market) while staying usable
 * for other countries, so equivalent inputs collapse to one identity
 * instead of creating near-duplicate records:
 *
 *   0912345678    -> +251912345678
 *   251912345678  -> +251912345678
 *   +251912345678 -> +251912345678
 */
export function normalizePhone(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  const digitsOnly = trimmed.replace(/[\s\-()]/g, "");

  if (digitsOnly.startsWith("+")) {
    const digits = digitsOnly.slice(1);
    if (!/^\d{8,15}$/.test(digits)) return null;
    return `+${digits}`;
  }

  if (digitsOnly.startsWith("00")) {
    const digits = digitsOnly.slice(2);
    if (!/^\d{8,15}$/.test(digits)) return null;
    return `+${digits}`;
  }

  // Ethiopian local format: 0 + 9 digits (e.g. 0912345678).
  if (/^0\d{9}$/.test(digitsOnly)) {
    return `+251${digitsOnly.slice(1)}`;
  }

  // Ethiopian number already missing the leading '+' (251912345678).
  if (/^251\d{9}$/.test(digitsOnly)) {
    return `+${digitsOnly}`;
  }

  // Generic international number without a leading '+'.
  if (/^\d{8,15}$/.test(digitsOnly)) {
    return `+${digitsOnly}`;
  }

  return null;
}
