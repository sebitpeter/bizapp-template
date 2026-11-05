/** Number of decimals a currency uses (UGX/RWF/XOF... = 0, USD/KES = 2). */
export function currencyDecimals(code: string): number {
  try {
    return new Intl.NumberFormat("en", { style: "currency", currency: code }).resolvedOptions().maximumFractionDigits ?? 2;
  } catch {
    return 2;
  }
}

export function roundFor(code: string, value: number): number {
  const f = 10 ** currencyDecimals(code);
  return Math.round(value * f) / f;
}

export function formatMoney(value: number, code: string, locale = "en"): string {
  try {
    return new Intl.NumberFormat(locale, { style: "currency", currency: code }).format(value);
  } catch {
    return `${code} ${value}`;
  }
}
