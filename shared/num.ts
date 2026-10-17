/**
 * Python-compatible rounding and number formatting.
 * The original computes with Python's round() (half-to-even on exact ties)
 * and f-string formatting; matching them keeps every displayed value identical.
 */
export function pyRound(x: number, nd = 0): number {
  const m = 10 ** nd;
  const t = x * m;
  const f = Math.floor(t);
  if (t - f === 0.5 && (f + 0.5) / m === x) {
    return (f % 2 === 0 ? f : f + 1) / m;
  }
  return Number(x.toFixed(nd));
}

/** int(round(x)) */
export const pyRoundInt = (x: number) => pyRound(x, 0);

function group(intPart: string): string {
  return intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/** f"{x:.Nf}" / f"{x:,.Nf}" / f"{x:+.Nf}" */
export function fmt(x: number, decimals = 2, opts: { thousands?: boolean; sign?: boolean } = {}): string {
  const r = pyRound(x, decimals);
  let s = Math.abs(r).toFixed(decimals);
  if (opts.thousands) {
    const [i, d] = s.split(".");
    s = group(i) + (d !== undefined ? "." + d : "");
  }
  const neg = r < 0 || (r === 0 && (Object.is(r, -0) || x < 0));
  if (neg) return "-" + s;
  return (opts.sign ? "+" : "") + s;
}

/** Python str() of a float: integers keep a trailing ".0". */
export function pyFloatStr(x: number): string {
  return Number.isInteger(x) ? x.toFixed(1) : String(x);
}

/** Python float(str) — returns null where Python would raise. */
export function pyFloat(v: unknown): number | null {
  if (v === null || v === undefined || typeof v === "boolean") return null;
  if (typeof v === "number") return isNaN(v) ? null : v;
  const s = String(v).trim();
  if (!s || !/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(s)) return null;
  return Number(s);
}

export const grToPln = (gr: number) => gr / 100;
export const plnToGr = (pln: number) => pyRoundInt(pln * 100);

/** "1,234.56 PLN" style amounts used by bento cards. */
export const plnCard = (gr: number) => `${fmt(gr / 100, 2, { thousands: true })} PLN`;
/** "12.34 zł" */
export const zl = (pln: number) => `${fmt(pln, 2)} zł`;

const plCollator = new Intl.Collator("pl", { sensitivity: "base" });
/** Sorts rows by a name field using Polish collation (independent of the database collation). */
export function sortByName<T>(rows: T[], key: keyof T = "nazwa" as keyof T): T[] {
  return [...rows].sort((a, b) => plCollator.compare(String(a[key] ?? ""), String(b[key] ?? "")));
}
