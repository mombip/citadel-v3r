/**
 * Fee engine: statutory monthly fees, member balances, KDI and voting rights.
 * All amounts are integer grosze (1 PLN = 100 gr).
 */
import {
  type ISODate, addMonths, ageAt, daysInMonth, firstOfMonth, lastOfMonth, makeDate, maxDate, parts, todayPL, weekday,
} from "./dates";
import { kdiColor } from "./colors";
import { fmt, pyRound } from "./num";

/** Start of the current settlement period. */
export const CUTOFF_DATE: ISODate = "2026-10-01";
/** Resolution 1/2023 applied until 2024-12-31. */
export const OLD_RESOLUTION_END: ISODate = "2025-01-01";
export const TIER_OPTIONS = ["AUTO", "B", "M", "S"] as const;
const TIER_RATES: Record<string, number> = { B: 600, M: 900, S: 1500 };

export function validateMemberDates(birth: ISODate, joined: ISODate, today: ISODate = todayPL()): [boolean, string] {
  if (birth > today) return [false, "Data urodzenia nie może być z przyszłości!"];
  if (joined > today) return [false, "Data przystąpienia nie może być z przyszłości!"];
  if (joined < birth) return [false, "Data przystąpienia nie może być wcześniejsza niż data urodzenia!"];
  const age = ageAt(birth, joined);
  if (age < 13)
    return [false, `Członek w momencie przystąpienia musi mieć ukończone co najmniej 13 lat (obliczono: ${age} lat)!`];
  return [true, ""];
}

/** Fee tier code and rate on a given day (the "current rate"). */
export function getTier(birth: ISODate, manual: string | null | undefined, at: ISODate): [string, number] {
  if (manual && manual in TIER_RATES) return [manual, TIER_RATES[manual]];
  const age = ageAt(birth, at);
  if (at < OLD_RESOLUTION_END) {
    if (age < 16) return ["STARA_<16", 0];
    if (age < 21) return ["STARA_16-20", 500];
    return ["STARA_21+", 1000];
  }
  if (age < 20) return ["B", 600];
  if (age < 30) return ["M", 900];
  return ["S", 1500];
}

/** Fee for one calendar month (monthCursor = 1st day of that month). */
export function monthlyRate(
  joined: ISODate, birth: ISODate, manual: string | null | undefined, monthCursor: ISODate,
): [string, number] {
  if (monthCursor < OLD_RESOLUTION_END && joined < OLD_RESOLUTION_END) {
    // § 5 ust. 3: the first fee is due for the month after joining.
    const firstPaid = addMonths(firstOfMonth(joined), 1);
    if (monthCursor < firstPaid) return ["ZWOLNIONY_WSTAPIENIE", 0];
    const age = ageAt(birth, monthCursor);
    if (age < 16) return ["STARA_<16", 0];
    if (age < 21) return ["STARA_16-20", 500];
    return ["STARA_21+", 1000];
  }
  if (manual && manual in TIER_RATES) return [manual, TIER_RATES[manual]];
  const age = ageAt(birth, lastOfMonth(monthCursor));
  if (age < 20) return ["B", 600];
  if (age < 30) return ["M", 900];
  return ["S", 1500];
}

/** Statutory charges up to a reference date; only complete months count. */
export function computeCharges(
  joined: ISODate, birth: ISODate, manual: string | null | undefined, at: ISODate, cutoffOverride?: ISODate,
): [number, number] {
  const start = maxDate(joined, cutoffOverride ?? CUTOFF_DATE);
  let sum = 0;
  let months = 0;
  let cursor = firstOfMonth(start);
  while (cursor <= at) {
    if (lastOfMonth(cursor) <= at) {
      const [code, rate] = monthlyRate(joined, birth, manual, cursor);
      if (code !== "ZWOLNIONY_WSTAPIENIE") {
        sum += rate;
        months += 1;
      }
    }
    cursor = addMonths(cursor, 1);
  }
  return [sum, months];
}

export interface CalculatorResult {
  totalGr: number;
  baseGr: number;
  functionalGr: number;
  months: number;
  tierHistory: Record<string, number>;
}

export function simulateCalculator(
  joined: ISODate, birth: ISODate, manual: string, at: ISODate, chargesFrom: ISODate,
  includeCurrentMonth = false, functionalRateGr = 0, functionalMonths = 0,
): CalculatorResult {
  const start = maxDate(joined, chargesFrom);
  let baseGr = 0;
  let months = 0;
  const tierHistory: Record<string, number> = {};
  const [ay, am] = parts(at);
  let cursor = firstOfMonth(start);
  while (cursor <= at) {
    const [cy, cm] = parts(cursor);
    const charge = lastOfMonth(cursor) <= at || (includeCurrentMonth && cy === ay && cm === am);
    if (charge) {
      const [code, rate] = monthlyRate(joined, birth, manual, cursor);
      if (code !== "ZWOLNIONY_WSTAPIENIE") {
        baseGr += rate;
        months += 1;
        tierHistory[code] = (tierHistory[code] ?? 0) + 1;
      }
    }
    cursor = addMonths(cursor, 1);
  }
  const functionalGr = Math.trunc(functionalMonths) * Math.trunc(functionalRateGr);
  return { totalGr: baseGr + functionalGr, baseGr, functionalGr, months, tierHistory };
}

export interface MemberRow {
  id: number;
  kolo_id: number;
  imie_nazwisko: string;
  data_urodzenia: ISODate;
  data_przystapienia: ISODate;
  saldo_startowe_gr: number;
  reczny_parametr: string | null;
}

/** Per-member financial snapshot (field names kept from the original for parity). */
export interface MemberFinance {
  id: number;
  imie_nazwisko: string;
  data_ur: ISODate;
  data_wst: ISODate;
  parametr: string;
  reczny_parametr: string | null;
  stawka_biezaca_gr: number;
  saldo_start_gr: number;
  naliczone_gr: number;
  naliczone_auto_gr: number;
  reczne_gr: number;
  liczba_recznych: number;
  msc: number;
  wplaty_gr: number;
  korekty_gr: number;
  saldo_akt_gr: number;
  saldo_akt_pln: number;
  z_i_gr: number;
  s_i_gr: number;
  kdi_val: number | null;
  kdi_str: string;
  kdi_prog_val: number | null;
  kdi_prog_str: string;
  moze_glosowac: boolean;
  glosowanie_str: "TAK" | "NIE";
}

export interface MemberAggregates {
  wplatyGr: number;
  reczneGr: number;
  reczneCount: number;
  korektyGr: number;
}

export function computeMemberFinance(m: MemberRow, at: ISODate, agg: MemberAggregates): MemberFinance {
  const sStart = Math.trunc(Number(m.saldo_startowe_gr ?? 0));
  const [nalAuto, months] = computeCharges(m.data_przystapienia, m.data_urodzenia, m.reczny_parametr, at);
  const [tier, rate] = getTier(m.data_urodzenia, m.reczny_parametr, at);
  const nalTot = nalAuto + agg.reczneGr;
  const saldo = sStart + agg.wplatyGr + agg.korektyGr - nalTot;
  const s_i = Math.max(0, sStart) + agg.wplatyGr;
  const z_i = Math.max(0, s_i - saldo);
  const kdi = s_i > 0 ? pyRound(z_i / s_i, 2) : null;
  const safeRate = Math.max(rate, 1);
  const minPay = Math.max(0, z_i - 6 * safeRate);
  const progVal = minPay > 0 ? pyRound(z_i / minPay, 2) : null;
  const canVote = saldo >= 0 ? true : Math.abs(saldo) / safeRate <= 6.0;
  return {
    id: m.id,
    imie_nazwisko: m.imie_nazwisko,
    data_ur: m.data_urodzenia,
    data_wst: m.data_przystapienia,
    parametr: tier,
    reczny_parametr: m.reczny_parametr,
    stawka_biezaca_gr: rate,
    saldo_start_gr: sStart,
    naliczone_gr: nalTot,
    naliczone_auto_gr: nalAuto,
    reczne_gr: agg.reczneGr,
    liczba_recznych: agg.reczneCount,
    msc: months,
    wplaty_gr: agg.wplatyGr,
    korekty_gr: agg.korektyGr,
    saldo_akt_gr: saldo,
    saldo_akt_pln: saldo / 100,
    z_i_gr: z_i,
    s_i_gr: s_i,
    kdi_val: kdi,
    kdi_str: kdi !== null ? fmt(kdi, 2) : "Brak danych",
    kdi_prog_val: progVal,
    kdi_prog_str: progVal !== null ? `≤ ${fmt(progVal, 2)}` : "pełna karencja",
    moze_glosowac: canVote,
    glosowanie_str: canVote ? "TAK" : "NIE",
  };
}

/** Group threshold: Σz / Σmax(0, z − 6·S). */
export function dynamicKdiThreshold(members: { z_i_gr?: number; stawka_biezaca_gr?: number }[]): [number | null, string] {
  if (!members.length) return [null, "Brak danych"];
  const totZ = members.reduce((a, d) => a + (d.z_i_gr ?? 0), 0);
  const totMin = members.reduce(
    (a, d) => a + Math.max(0, (d.z_i_gr ?? 0) - 6 * Math.max(d.stawka_biezaca_gr ?? 0, 1)), 0,
  );
  if (totMin <= 0) return [null, "pełna karencja"];
  const val = pyRound(totZ / totMin, 2);
  return [val, `≤ ${fmt(val, 2)}`];
}

/** KDI value with the dynamic threshold as a glowing suffix (HTML, used in bento cards). */
export function formatKdiValue(kdiStr: string, progVal: number | null, progStr = ""): string {
  if (progVal !== null) {
    const c = kdiColor(progVal);
    const label = progStr && progStr.startsWith("≤") ? progStr : `≤ ${fmt(progVal, 2)}`;
    return (
      `${kdiStr} <span style="font-size: 0.92rem; font-weight: 600; color: ${c}; ` +
      `text-shadow: 0 0 10px ${c}; margin-left: 6px; vertical-align: middle;">(próg: ${label})</span>`
    );
  }
  if (progStr === "pełna karencja") {
    const c = "#4ade80";
    return (
      `${kdiStr} <span style="font-size: 0.90rem; font-weight: 600; color: ${c}; ` +
      `text-shadow: 0 0 10px ${c}; margin-left: 6px; vertical-align: middle;">(próg: pełna karencja)</span>`
    );
  }
  return kdiStr;
}

export const kdiOf = (z: number, s: number): number | null => (s > 0 ? pyRound(z / s, 2) : null);

export type IntervalCode = "D1" | "T1" | "M1" | "Q1" | "Q2" | "Y1" | "Cały okres";
export const INTERVALS: IntervalCode[] = ["D1", "T1", "M1", "Q1", "Q2", "Y1", "Cały okres"];

/** Thins daily chart points to week/month/quarter/half-year/year ends (first and last kept). */
export function filterInterval<T extends { date: ISODate }>(records: T[], code: IntervalCode): T[] {
  if (!records.length) return [];
  if (code === "D1") return records;
  const picked: T[] = [];
  const n = records.length;
  records.forEach((r, idx) => {
    const d = r.date;
    if (idx === 0 || idx === n - 1) {
      picked.push(r);
      return;
    }
    const [y, mo, dd] = parts(d);
    const isLast = dd === daysInMonth(y, mo);
    if (code === "T1" && weekday(d) === 6) picked.push(r);
    else if (code === "M1" && isLast) picked.push(r);
    else if (code === "Q1" && isLast && [3, 6, 9, 12].includes(mo)) picked.push(r);
    else if (code === "Q2" && isLast && [6, 12].includes(mo)) picked.push(r);
    else if (code === "Y1" && d === makeDate(y, 12, 31)) picked.push(r);
  });
  const seen = new Set<string>();
  return picked.filter((r) => {
    if (seen.has(r.date)) return false;
    seen.add(r.date);
    return true;
  });
}
