/**
 * Normalises a phone number to E.164 (+256772123456).
 *  "+256 772 123 456" → "+256772123456"
 *  "0772123456" + country "256" → "+256772123456"
 *  "00256772123456" → "+256772123456"
 * Returns null if it can't be a valid international number.
 */
export function normalizePhone(input: string, countryCode = ""): string | null {
  const raw = String(input ?? "").trim();
  if (!raw || raw.length > 30 || !/^[+\d\s().-]+$/.test(raw)) return null;
  let digits = raw.replace(/[^\d]/g, "");
  if (raw.startsWith("+")) {
    // already international
  } else if (digits.startsWith("00")) {
    digits = digits.slice(2);
  } else if (digits.startsWith("0") && countryCode) {
    digits = countryCode + digits.slice(1);
  } else if (countryCode && digits.length <= 10 && !digits.startsWith(countryCode)) {
    digits = countryCode + digits;
  }
  if (!/^[1-9]\d{7,14}$/.test(digits)) return null;
  return `+${digits}`;
}

/** Same person? Compares the last 9 digits so "+256772..." matches "0772...". */
export function samePhone(a: string, b: string): boolean {
  const da = String(a ?? "").replace(/\D/g, "");
  const db = String(b ?? "").replace(/\D/g, "");
  if (da.length < 7 || db.length < 7) return false;
  const n = Math.min(9, da.length, db.length);
  return da.slice(-n) === db.slice(-n);
}

/** For logs: +256772***456 */
export function maskPhone(p: string): string {
  return p.length > 7 ? `${p.slice(0, 7)}***${p.slice(-3)}` : "***";
}
