/**
 * Calendar-date helpers working on ISO strings ("YYYY-MM-DD").
 * Plain dates avoid timezone drift; ISO strings also compare correctly with < and >.
 */
export type ISODate = string;

const pad = (n: number, w = 2) => String(n).padStart(w, "0");

export function makeDate(y: number, m: number, d: number): ISODate {
  return `${pad(y, 4)}-${pad(m)}-${pad(d)}`;
}

export function parts(d: ISODate): [number, number, number] {
  const [y, m, dd] = d.slice(0, 10).split("-").map(Number);
  return [y, m, dd];
}

/** Normalises Date objects / timestamps / strings to an ISO calendar date. */
export function toISODate(v: unknown): ISODate {
  if (v instanceof Date) return makeDate(v.getUTCFullYear(), v.getUTCMonth() + 1, v.getUTCDate());
  return String(v).slice(0, 10);
}

function toUTC(d: ISODate): number {
  const [y, m, dd] = parts(d);
  return Date.UTC(y, m - 1, dd);
}

function fromUTC(ms: number): ISODate {
  const dt = new Date(ms);
  return makeDate(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}

export function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export function addDays(d: ISODate, n: number): ISODate {
  return fromUTC(toUTC(d) + n * 86400000);
}

/** dateutil.relativedelta(months=n): clamps the day to the end of the target month. */
export function addMonths(d: ISODate, n: number): ISODate {
  const [y, m, dd] = parts(d);
  const idx = y * 12 + (m - 1) + n;
  const ny = Math.floor(idx / 12);
  const nm = (idx % 12) + 1;
  return makeDate(ny, nm, Math.min(dd, daysInMonth(ny, nm)));
}

/** (a - b) in days, like Python's (a - b).days. */
export function diffDays(a: ISODate, b: ISODate): number {
  return Math.round((toUTC(a) - toUTC(b)) / 86400000);
}

/** Python weekday(): Monday = 0 ... Sunday = 6. */
export function weekday(d: ISODate): number {
  return (new Date(toUTC(d)).getUTCDay() + 6) % 7;
}

export function firstOfMonth(d: ISODate): ISODate {
  const [y, m] = parts(d);
  return makeDate(y, m, 1);
}

export function lastOfMonth(d: ISODate): ISODate {
  const [y, m] = parts(d);
  return makeDate(y, m, daysInMonth(y, m));
}

export const minDate = (a: ISODate, b: ISODate) => (a < b ? a : b);
export const maxDate = (a: ISODate, b: ISODate) => (a > b ? a : b);

/** Full years between birth and a point in time (Python tuple-comparison idiom). */
export function ageAt(birth: ISODate, at: ISODate): number {
  const [by, bm, bd] = parts(birth);
  const [ay, am, ad] = parts(at);
  return ay - by - (am < bm || (am === bm && ad < bd) ? 1 : 0);
}

export const WARSAW_TZ = "Europe/Warsaw";

/** Today's business date in Warsaw. */
export function todayPL(now: Date = new Date()): ISODate {
  const f = new Intl.DateTimeFormat("en-CA", { timeZone: WARSAW_TZ, year: "numeric", month: "2-digit", day: "2-digit" });
  return f.format(now);
}

/** Formats a timestamp in Warsaw time as "YYYY-MM-DD HH:MM:SS", or "b/d" when missing. */
export function formatTimePL(v: unknown): string {
  if (v === null || v === undefined) return "b/d";
  let dt: Date;
  if (v instanceof Date) dt = v;
  else {
    const s = String(v).trim();
    if (!s || ["none", "nat", "nan", "b/d", "null"].includes(s.toLowerCase())) return "b/d";
    // Timestamps without zone are treated as UTC, like the original.
    const hasZone = /([zZ]|[+-]\d{2}(:?\d{2})?)$/.test(s);
    dt = new Date(hasZone ? s : s.replace(" ", "T") + "Z");
    if (isNaN(dt.getTime())) return s;
  }
  if (isNaN(dt.getTime())) return "b/d";
  const f = new Intl.DateTimeFormat("en-GB", {
    timeZone: WARSAW_TZ, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  });
  const p = Object.fromEntries(f.formatToParts(dt).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}:${p.second}`;
}
