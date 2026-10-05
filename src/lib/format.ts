const moneyFmt = new Map<string, Intl.NumberFormat>();

export function money(n: number | null | undefined, currency = "USD", opts: { cents?: boolean } = {}): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  const cents = opts.cents ?? true;
  const key = `${currency}:${cents}`;
  let f = moneyFmt.get(key);
  if (!f) {
    f = new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      minimumFractionDigits: cents ? 2 : 0,
      maximumFractionDigits: cents ? 2 : 0,
    });
    moneyFmt.set(key, f);
  }
  return f.format(n);
}

/** Whole-dollar money for big dashboard numbers. */
export function money0(n: number | null | undefined, currency = "USD") {
  return money(n, currency, { cents: false });
}

export function pct(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  return `${n.toFixed(1)}%`;
}

export function miles(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  return `${n.toFixed(1)} mi`;
}

export function num(n: number | null | undefined, digits = 0): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  return n.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function ratio(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  return `${n.toFixed(2)}x`;
}
