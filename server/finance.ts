/**
 * Database-backed financial aggregation: per-unit totals, member snapshots, Celestia ratings,
 * and the daily balance/KDI series for member profiles.
 */
import type { Queryable } from "./db";
import {
  CUTOFF_DATE, computeCharges, computeMemberFinance, dynamicKdiThreshold, kdiOf, monthlyRate,
  type MemberFinance, type MemberRow,
} from "../shared/calculations";
import { computeMemberRating, type AmountOnDate, type CelestiaPillars, type QuarterlyAudit, type VotingAudit } from "../shared/celestia";
import { type ISODate, addDays, firstOfMonth, lastOfMonth, maxDate, minDate } from "../shared/dates";
import { fmt } from "../shared/num";

export interface UnitTotals {
  members: MemberFinance[];
  wplatyKasaGr: number;
  kasaGr: number;
  wydatkiGr: number;
  korektyKasyGr: number;
  totalZGr: number;
  totalSGr: number;
}

const EMPTY = (): UnitTotals => ({ members: [], wplatyKasaGr: 0, kasaGr: 0, wydatkiGr: 0, korektyKasyGr: 0, totalZGr: 0, totalSGr: 0 });

/** Port of `_przelicz_finanse_wielu_kol`: totals for many units in a handful of queries. */
export async function computeUnits(db: Queryable, koloIds: number[], at: ISODate): Promise<Map<number, UnitTotals>> {
  const out = new Map<number, UnitTotals>();
  if (!koloIds.length) return out;
  for (const id of koloIds) out.set(id, EMPTY());
  const active = (await db.query<{ id: number }>("SELECT id FROM aktywne_kola WHERE id = ANY($1)", [koloIds])).map((r) => r.id);
  if (!active.length) return out;

  const sumBy = async (sql: string, params: unknown[]) => {
    const m = new Map<number, number>();
    for (const r of await db.query<{ k: number; s: number }>(sql, params)) m.set(r.k, Number(r.s));
    return m;
  };
  const wplatyKola = await sumBy("SELECT kolo_id AS k, SUM(kwota_gr) AS s FROM wplaty WHERE kolo_id = ANY($1) AND data_wplaty <= $2 GROUP BY kolo_id", [active, at]);
  const wydatkiKola = await sumBy("SELECT kolo_id AS k, SUM(kwota_gr) AS s FROM wydatki WHERE kolo_id = ANY($1) AND data_wydatku <= $2 GROUP BY kolo_id", [active, at]);
  const korektyKasy = await sumBy("SELECT kolo_id AS k, SUM(delta_gr) AS s FROM korekty_kasy WHERE kolo_id = ANY($1) AND data_korekty <= $2 GROUP BY kolo_id", [active, at]);

  const members = await db.query<MemberRow>(
    "SELECT id, kolo_id, imie_nazwisko, data_urodzenia, data_przystapienia, saldo_startowe_gr, reczny_parametr FROM czlonkowie WHERE kolo_id = ANY($1) ORDER BY id",
    [active],
  );
  const memberIds = members.map((m) => m.id);
  const wplatyCzl = memberIds.length ? await sumBy("SELECT czlonek_id AS k, SUM(kwota_gr) AS s FROM wplaty WHERE czlonek_id = ANY($1) AND data_wplaty <= $2 GROUP BY czlonek_id", [memberIds, at]) : new Map();
  const korektyCzl = memberIds.length ? await sumBy("SELECT czlonek_id AS k, SUM(delta_gr) AS s FROM korekty WHERE czlonek_id = ANY($1) AND data_korekty <= $2 GROUP BY czlonek_id", [memberIds, at]) : new Map();
  const reczne = new Map<number, [number, number]>();
  if (memberIds.length) {
    for (const r of await db.query<{ k: number; s: number; c: number }>(
      "SELECT czlonek_id AS k, SUM(kwota_gr) AS s, COUNT(id) AS c FROM naliczenia_reczne WHERE czlonek_id = ANY($1) AND data_naliczenia <= $2 GROUP BY czlonek_id",
      [memberIds, at],
    )) reczne.set(r.k, [Number(r.s), Number(r.c)]);
  }

  for (const kid of active) {
    const w = wplatyKola.get(kid) ?? 0;
    const wyd = wydatkiKola.get(kid) ?? 0;
    const kor = korektyKasy.get(kid) ?? 0;
    const unit: UnitTotals = { members: [], wplatyKasaGr: w, kasaGr: w - wyd + kor, wydatkiGr: wyd, korektyKasyGr: kor, totalZGr: 0, totalSGr: 0 };
    for (const m of members.filter((x) => x.kolo_id === kid)) {
      const [recGr, recCnt] = reczne.get(m.id) ?? [0, 0];
      const fin = computeMemberFinance(m, at, {
        wplatyGr: wplatyCzl.get(m.id) ?? 0,
        reczneGr: recGr,
        reczneCount: recCnt,
        korektyGr: korektyCzl.get(m.id) ?? 0,
      });
      unit.members.push(fin);
      unit.totalZGr += fin.z_i_gr;
      unit.totalSGr += fin.s_i_gr;
    }
    out.set(kid, unit);
  }
  return out;
}

export async function computeUnit(db: Queryable, koloId: number, at: ISODate): Promise<UnitTotals> {
  return (await computeUnits(db, [koloId], at)).get(koloId) ?? EMPTY();
}

export interface MemberWithCelestia extends MemberFinance {
  celestia_score: number;
  celestia_rating: string;
  celestia_kolor_dark: string;
  celestia_kolor_light: string;
  celestia_nazwa: string;
  celestia_opis: string;
  celestia_filary: CelestiaPillars;
  celestia_audyt_glosowan: VotingAudit[];
  celestia_audyt_kwartalny: QuarterlyAudit[];
}

export async function getDueDates(db: Queryable, koloId: number) {
  return db.query<any>(
    `SELECT tg.id, tg.kolo_id, tg.data_glosowania, tg.data_zbiorki_od, tg.data_wymagalnosci_do,
            tg.dni_zbiorki_przed, tg.dni_wymagalnosci_po, tg.nazwa, tg.opis, tg.waga, tg.typ_terminu,
            tg.utworzono_o, tg.utworzono_przez, u.imie_nazwisko AS dodal_imie
     FROM terminy_glosowan tg LEFT JOIN uzytkownicy u ON tg.utworzono_przez = u.id
     WHERE tg.kolo_id = $1 ORDER BY tg.data_glosowania DESC, tg.id DESC`,
    [koloId],
  );
}

/** Port of `przelicz_celestia_dla_calego_kola`. */
export async function rateUnit(db: Queryable, koloId: number, members: MemberFinance[], today: ISODate): Promise<MemberWithCelestia[]> {
  if (!members.length) return [];
  const ids = members.map((m) => m.id);
  const dueDates = await getDueDates(db, koloId);
  const group = async (sql: string) => {
    const by = new Map<number, AmountOnDate[]>();
    for (const r of await db.query<{ czlonek_id: number; date: string; gr: number }>(sql, [ids, today])) {
      if (!by.has(r.czlonek_id)) by.set(r.czlonek_id, []);
      by.get(r.czlonek_id)!.push({ date: r.date, gr: Number(r.gr) });
    }
    return by;
  };
  const wplaty = await group("SELECT czlonek_id, data_wplaty AS date, kwota_gr AS gr FROM wplaty WHERE czlonek_id = ANY($1) AND data_wplaty <= $2 ORDER BY data_wplaty");
  const reczne = await group("SELECT czlonek_id, data_naliczenia AS date, kwota_gr AS gr FROM naliczenia_reczne WHERE czlonek_id = ANY($1) AND data_naliczenia <= $2 ORDER BY data_naliczenia");
  const korekty = await group("SELECT czlonek_id, data_korekty AS date, delta_gr AS gr FROM korekty WHERE czlonek_id = ANY($1) AND data_korekty <= $2 ORDER BY data_korekty");

  return members.map((d) => {
    const r = computeMemberRating(d.id, d, dueDates, wplaty.get(d.id) ?? [], reczne.get(d.id) ?? [], korekty.get(d.id) ?? [], today);
    return {
      ...d,
      celestia_score: r.score,
      celestia_rating: r.rating,
      celestia_kolor_dark: r.kolor_dark,
      celestia_kolor_light: r.kolor_light,
      celestia_nazwa: r.nazwa_poziomu,
      celestia_opis: r.opis_poziomu,
      celestia_filary: r.filary,
      celestia_audyt_glosowan: r.audyt_glosowan,
      celestia_audyt_kwartalny: r.audyt_kwartalny,
    };
  });
}

/** Aggregated KPI block for a group of units (country / region cards). */
export function summarise(units: UnitTotals[]) {
  const all = units.flatMap((u) => u.members);
  const kasa = units.reduce((a, u) => a + u.kasaGr, 0);
  const wplaty = units.reduce((a, u) => a + u.wplatyKasaGr, 0);
  const wydatki = units.reduce((a, u) => a + u.wydatkiGr, 0);
  const z = units.reduce((a, u) => a + u.totalZGr, 0);
  const s = units.reduce((a, u) => a + u.totalSGr, 0);
  const members = all.length;
  const eligible = all.filter((d) => d.moze_glosowac).length;
  const kdi = kdiOf(z, s);
  const [progVal, progStr] = dynamicKdiThreshold(all);
  return {
    kasaGr: kasa, wplatyGr: wplaty, wydatkiGr: wydatki, totalZGr: z, totalSGr: s, members, eligible,
    kdiVal: kdi, kdiStr: kdi !== null ? fmt(kdi, 2) : "Brak danych", progVal, progStr,
    pctEligible: members > 0 ? (eligible / members) * 100 : 0,
  };
}

export interface DailyRecord { date: ISODate; date_str: string; saldo: number; kdi: number | null }

/** Daily balance and KDI series for the profile charts (port of tab_profile.py). */
export async function memberDailySeries(db: Queryable, member: MemberFinance, today: ISODate) {
  const wplaty = await db.query<any>("SELECT id, kwota_gr, data_wplaty, notatka FROM wplaty WHERE czlonek_id = $1 ORDER BY data_wplaty ASC", [member.id]);
  const reczne = await db.query<any>("SELECT id, kwota_gr, data_naliczenia, tytul FROM naliczenia_reczne WHERE czlonek_id = $1 ORDER BY data_naliczenia ASC", [member.id]);
  const korekty = await db.query<any>("SELECT id, delta_gr, docelowe_saldo_gr, data_korekty, powod FROM korekty WHERE czlonek_id = $1 ORDER BY data_korekty ASC", [member.id]);

  const toMap = (rows: any[], dk: string, vk: string) => {
    const m = new Map<string, number>();
    for (const r of rows) m.set(r[dk], (m.get(r[dk]) ?? 0) + Number(r[vk]));
    return m;
  };
  const wm = toMap(wplaty, "data_wplaty", "kwota_gr");
  const rm = toMap(reczne, "data_naliczenia", "kwota_gr");
  const km = toMap(korekty, "data_korekty", "delta_gr");
  const before = (m: Map<string, number>, d: ISODate) => [...m].filter(([k]) => k < d).reduce((a, [, v]) => a + v, 0);

  let start = maxDate(member.data_wst, CUTOFF_DATE);
  if (start > today) start = today;
  let runW = before(wm, start);
  let runR = before(rm, start);
  let runK = before(km, start);
  let [runAuto] = computeCharges(member.data_wst, member.data_ur, member.reczny_parametr, start);

  const daily: DailyRecord[] = [];
  for (let cur = start; cur <= today; cur = addDays(cur, 1)) {
    runW += wm.get(cur) ?? 0;
    runR += rm.get(cur) ?? 0;
    runK += km.get(cur) ?? 0;
    if (cur > start && cur === lastOfMonth(cur)) {
      const [code, rate] = monthlyRate(member.data_wst, member.data_ur, member.reczny_parametr, firstOfMonth(cur));
      if (code !== "ZWOLNIONY_WSTAPIENIE") runAuto += rate;
    }
    const saldoGr = member.saldo_start_gr + runW + runK - (runAuto + runR);
    const s = Math.max(0, member.saldo_start_gr) + runW;
    const z = Math.max(0, s - saldoGr);
    daily.push({ date: cur, date_str: cur, saldo: saldoGr / 100, kdi: kdiOf(z, s) });
  }
  return { wplaty, reczne, korekty, daily };
}

export { minDate };
