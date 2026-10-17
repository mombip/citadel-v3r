/**
 * Celestia — payment-discipline rating (0–1000 points, AAA … DDD).
 *
 * Pillars: voting due compliance VDC (65%), current balance (20%), KDI (10%), payment rhythm (5%).
 * Ported 1:1 from the original Python engine; numeric rounding follows Python semantics.
 */
import { type ISODate, addDays, diffDays, minDate, toISODate } from "./dates";
import { celestiaScaleColor, GREY } from "./colors";
import { computeCharges, getTier, monthlyRate } from "./calculations";
import { fmt, pyRound } from "./num";

export interface RatingLevel {
  kod: string;
  nazwa: string;
  min_score: number;
  max_score: number;
  kolor_dark: string;
  kolor_light: string;
  opis: string;
}

export const CELESTIA_LEVELS: RatingLevel[] = [
  { kod: "AAA", nazwa: "Prime Apex", min_score: 950, max_score: 1000, kolor_dark: "#23994d", kolor_light: "#158840",
    opis: "Wzorcowa dyscyplina finansowa. Stała nadpłata lub regularne wpłaty z wyprzedzeniem przed każdym terminem głosowania. Zero zaległości." },
  { kod: "AA", nazwa: "High Grade", min_score: 880, max_score: 949, kolor_dark: "#42d075", kolor_light: "#159d48",
    opis: "Bardzo wysoka wiarygodność. Składki uregulowane przed terminami głosowań. Sporadyczne, minimalne poślizgi bieżące." },
  { kod: "A", nazwa: "Upper Medium", min_score: 800, max_score: 879, kolor_dark: "#b6f1cc", kolor_light: "#1a5941",
    opis: "Solidny płatnik. Regularnie posiada uprawnienia do głosu na zebraniach. Zazwyczaj reguluje zaległość w okienku przed samym głosowaniem." },
  { kod: "BBB", nazwa: "Good Standing", min_score: 700, max_score: 799, kolor_dark: "#fce58a", kolor_light: "#74591f",
    opis: "Dobra wiarygodność. Spłaca zaległości przed głosowaniami, rzadziej w samym dniu zebrania. Wskaźniki w normie statutowej." },
  { kod: "BB", nazwa: "Moderate", min_score: 600, max_score: 699, kolor_dark: "#f9ae15", kolor_light: "#c77106",
    opis: "Umiarkowana regularność. W niektórych głosowaniach korzysta z marginesu karencji (zadłużenie do 6 msc). Spłaty zrywami." },
  { kod: "B", nazwa: "Vulnerable", min_score: 500, max_score: 599, kolor_dark: "#f97316", kolor_light: "#c2410c",
    opis: "Wrażliwa dyscyplina. Częste balansowanie na granicy utraty prawa głosu. Wpłaty dopiero po wezwaniach lub z poślizgiem." },
  { kod: "CCC", nazwa: "Substantial Risk", min_score: 380, max_score: 499, kolor_dark: "#f15037", kolor_light: "#bb2517",
    opis: "Podwyższone ryzyko. Wejścia w dni głosowań z zadłużeniem przekraczającym karencję (utrata prawa głosu). Długie okresy bierności." },
  { kod: "CC", nazwa: "Extremely Speculative", min_score: 260, max_score: 379, kolor_dark: "#ed4671", kolor_light: "#bb193e",
    opis: "Krytyczna niespłacalność. Chroniczne ignorowanie terminów zebrań i głosowań. Rzadkie i cząstkowe spłaty." },
  { kod: "C", nazwa: "Near Default", min_score: 150, max_score: 259, kolor_dark: "#b15bb8", kolor_light: "#882a86",
    opis: "Zadłużenie roczne (ok. 8–12 msc długu, ~60–100 zł). Świeża lub utrwalona utrata praw głosu na zebraniach." },
  { kod: "D", nazwa: "Insolvency Grade 1", min_score: 90, max_score: 149, kolor_dark: "#527ae9", kolor_light: "#3246c7",
    opis: "Głęboka niewypłacalność (ok. 12–18 msc długu, ~100–160 zł). Brak wpłat na zebrania od ponad roku." },
  { kod: "DD", nazwa: "Insolvency Grade 2", min_score: 40, max_score: 89, kolor_dark: "#6172f6", kolor_light: "#3e3ed4",
    opis: "Wieloletnia niewypłacalność (ok. 18–26 msc długu, ~160–250 zł). Utrwalony, dwuletni brak wpłat i kontaktu." },
  { kod: "DDD", nazwa: "Terminal Default", min_score: 0, max_score: 39, kolor_dark: "#925ef6", kolor_light: "#6a2ad0",
    opis: "Całkowity default (> 28–36 msc długu, > 350–450 zł). Członek całkowicie nieaktywny, zero wpłat w historii." },
];

export const PRIME = ["AAA", "AA", "A"];
export const MEDIUM = ["BBB", "BB", "B"];
export const RISK = ["CCC", "CC", "C", "D", "DD", "DDD"];

export function ratingFor(score: number): RatingLevel {
  const s = Math.max(0, Math.min(1000, Math.trunc(score)));
  return CELESTIA_LEVELS.find((p) => p.min_score <= s && s <= p.max_score) ?? CELESTIA_LEVELS[CELESTIA_LEVELS.length - 1];
}

/** Colour for a score (number or "123 pkt") or a rating code. */
export function celestiaColor(v: number | string | null | undefined, isLight = false): string {
  if (v === null || v === undefined) return GREY;
  if (typeof v === "number") return celestiaScaleColor(v, isLight);
  const text = String(v).trim();
  const clean = text.replace(" pkt", "").replace("pkt", "").trim();
  if (clean !== "" && /^[+-]?(\d+\.?\d*|\.\d+)$/.test(clean)) return celestiaScaleColor(Number(clean), isLight);
  const lvl = CELESTIA_LEVELS.find((p) => p.kod === text.toUpperCase());
  return lvl ? (isLight ? lvl.kolor_light : lvl.kolor_dark) : GREY;
}

export interface DueDate {
  id?: number;
  data_glosowania: ISODate | Date;
  data_zbiorki_od?: ISODate | Date | null;
  dni_zbiorki_przed?: number | null;
  dni_wymagalnosci_po?: number | null;
  waga?: number | string | null;
  nazwa?: string;
  typ_terminu?: string | null;
}

export interface CelestiaMemberInput {
  data_wst: ISODate;
  data_ur: ISODate;
  reczny_parametr?: string | null;
  saldo_start_gr?: number;
  saldo_akt_gr?: number;
  naliczone_gr?: number;
  kdi_val?: number | null;
}

export interface AmountOnDate { date: ISODate; gr: number }

export interface VotingAudit {
  data_glosowania: string;
  nazwa: string;
  data_od: string;
  data_do: string;
  okres_zbiorki: string;
  data_wymagalnosci: string;
  saldo_pln: number;
  wplata_w_oknie_pln: number;
  punkty: number;
  status: string;
}

export interface QuarterlyAudit {
  id?: number;
  data: string;
  nazwa: string;
  okres_zbiorki: string;
  data_wymagalnosci: string;
  saldo_pln: number;
  wplata_w_oknie_pln: number;
  punkty: number;
  status: string;
  waga: number;
}

export interface CelestiaPillars {
  vdc_score: number | null;
  kdi_score: number;
  saldo_score: number;
  rytm_score: number;
  liczba_glosowan: number;
  liczba_kwartalnych: number;
  kwartalne_score: number | null;
  kadencja_dni: number | null;
}

export interface CelestiaResult {
  czlonek_id: number;
  score: number;
  rating: string;
  nazwa_poziomu: string;
  kolor_dark: string;
  kolor_light: string;
  opis_poziomu: string;
  filary: CelestiaPillars;
  audyt_glosowan: VotingAudit[];
  audyt_kwartalny: QuarterlyAudit[];
}

const num = (v: unknown, d: number): number => {
  if (v === null || v === undefined || v === "") return d;
  const n = Number(v);
  return isNaN(n) ? d : n;
};

const toMap = (rows: AmountOnDate[] | undefined) => {
  const m = new Map<ISODate, number>();
  for (const r of rows ?? []) m.set(r.date, (m.get(r.date) ?? 0) + Math.trunc(r.gr));
  return m;
};

const sumWhere = (m: Map<ISODate, number>, pred: (d: ISODate) => boolean) => {
  let s = 0;
  for (const [d, kw] of m) if (pred(d)) s += kw;
  return s;
};

interface ScheduledEvent {
  id?: number;
  data: ISODate;
  data_zbiorki_od: ISODate;
  dni_wymagalnosci_po: number;
  nazwa: string;
  waga: number;
  typ_terminu: string;
}

export function computeMemberRating(
  memberId: number,
  member: CelestiaMemberInput,
  dueDates: DueDate[],
  payments: AmountOnDate[],
  manualCharges: AmountOnDate[],
  corrections: AmountOnDate[],
  today: ISODate,
): CelestiaResult {
  const joined = toISODate(member.data_wst);
  // A join date in the future is clamped to today, so upcoming meetings are still evaluated.
  const effJoined = minDate(joined, today);
  const birth = toISODate(member.data_ur);
  const manual = member.reczny_parametr ?? null;
  const saldoStart = Math.trunc(member.saldo_start_gr ?? 0);
  const saldoNow = Math.trunc(member.saldo_akt_gr ?? 0);
  const kdi = member.kdi_val ?? null;
  const currentRate = Math.max(getTier(birth, manual, today)[1], 600);

  const pay = toMap(payments);
  const man = toMap(manualCharges);
  const kor = toMap(corrections);

  const balanceOn = (d: ISODate) =>
    saldoStart + sumWhere(pay, (x) => x <= d) + sumWhere(kor, (x) => x <= d) -
    (computeCharges(effJoined, birth, manual, d)[0] + sumWhere(man, (x) => x <= d));

  // ---------------- Pillar 1: VDC (65%) ----------------
  const votingAudit: VotingAudit[] = [];
  let vdcScore: number | null = null;
  const votes: ScheduledEvent[] = [];
  const quarters: ScheduledEvent[] = [];

  for (const row of dueDates ?? []) {
    const typ = String(row.typ_terminu || "GLOSOWANIE").toUpperCase().trim();
    const dTerm = toISODate(row.data_glosowania);
    const dFrom = row.data_zbiorki_od
      ? toISODate(row.data_zbiorki_od)
      : addDays(dTerm, -Math.trunc(num(row.dni_zbiorki_przed, 14)));
    const after = Math.min(3, Math.max(0, Math.trunc(num(row.dni_wymagalnosci_po, 0))));
    if (dTerm >= effJoined && (dTerm <= today || dFrom <= today || dTerm <= addDays(today, 30))) {
      const ev: ScheduledEvent = {
        id: row.id,
        data: dTerm,
        data_zbiorki_od: dFrom,
        dni_wymagalnosci_po: after,
        nazwa: row.nazwa ?? (typ === "GLOSOWANIE" ? "Głosowanie Koła" : "Zbiórka Kwartalna"),
        waga: num(row.waga, 1.0),
        typ_terminu: typ,
      };
      (typ === "KWARTALNY" ? quarters : votes).push(ev);
    }
  }

  if (votes.length) {
    votes.sort((a, b) => (a.data < b.data ? -1 : a.data > b.data ? 1 : 0));
    let weighted = 0;
    let weights = 0;
    for (const g of votes) {
      const dVote = g.data;
      const winStart = g.data_zbiorki_od;
      const grace = Math.min(3, Math.max(0, Math.trunc(g.dni_wymagalnosci_po)));
      const saldoOnVote = balanceOn(dVote);
      const paidInWindow = sumWhere(pay, (d) => winStart <= d && d <= dVote);
      const paidInGrace = grace > 0 ? sumWhere(pay, (d) => dVote < d && d <= addDays(dVote, grace)) : 0;
      const rateOnVote = Math.max(monthlyRate(effJoined, birth, manual, dVote)[1], 600);
      const windowDays = Math.max(1, diffDays(dVote, winStart));
      const coveredAfterGrace = paidInGrace > 0 && saldoOnVote + paidInGrace >= 0;

      let pts: number;
      let status: string;
      if (saldoOnVote >= 0) {
        if (saldoOnVote - paidInWindow >= 0) {
          pts = 100.0;
          status = "🟢 Stała nadpłata / Pokrycie przed zbiórką — wzorowa terminowość (1000 pkt)";
        } else {
          const inWindow = [...pay.keys()].filter((d) => winStart <= d && d <= dVote).sort();
          const effDate = inWindow.length ? inWindow[inWindow.length - 1] : dVote;
          const progress = Math.min(1.0, Math.max(0.0, Math.max(0, diffDays(effDate, winStart)) / windowDays));
          const daysBefore = diffDays(dVote, effDate);
          if (progress <= 0.5) {
            pts = 100.0;
            status = `🟢 Wpłata w I połowie okna zbiórki (${daysBefore} dni przed zebraniem) — 1000 pkt`;
          } else {
            pts = pyRound(100.0 - ((progress - 0.5) / 0.5) * 40.0, 1);
            const pkt = pyRound(pts * 10);
            status = daysBefore === 0
              ? `🟡 Wpłata w dniu głosowania (ostatni dzień zbiórki) — ${pkt} pkt`
              : `🟢 Wpłata w II połowie okna zbiórki (${daysBefore} dni przed zebraniem) — ${pkt} pkt`;
          }
        }
      } else {
        const m = Math.abs(saldoOnVote) / rateOnVote;
        const ms = fmt(m, 1);
        const upcoming = today <= dVote;
        const lost = (label: string) =>
          upcoming ? `🔴 Brak prawa głosu na zebraniu — ${label}` : `🔴 Utrata prawa głosu — ${label}`;
        if (m > 28.0) {
          if (coveredAfterGrace) {
            pts = 5.0;
            status = `🟡 Spłata ratunkowa skrajnego długu po terminie (${ms} msc) — brak prawa głosu w dniu zebrania`;
          } else {
            pts = 0.0;
            status = lost(`skrajny default (> 28 msc: ${ms} msc)`);
          }
        } else if (m > 18.0) {
          if (coveredAfterGrace) {
            pts = 10.0;
            status = `🟡 Spłata ratunkowa wieloletniego długu po terminie (${ms} msc) — brak prawa głosu w dniu zebrania`;
          } else {
            pts = 3.0;
            status = lost(`wieloletnie zadłużenie (${ms} msc)`);
          }
        } else if (m > 12.0) {
          if (coveredAfterGrace) {
            pts = 18.0;
            status = `🟡 Spłata ratunkowa długu ponadrocznego po terminie (${ms} msc) — brak prawa głosu w dniu zebrania`;
          } else {
            pts = 6.0;
            status = lost(`zadłużenie ponadroczne (${ms} msc)`);
          }
        } else if (m > 8.0) {
          if (coveredAfterGrace) {
            pts = 25.0;
            status = `🟡 Spłata ratunkowa utrwalonego długu po terminie (${ms} msc) — brak prawa głosu w dniu zebrania`;
          } else {
            pts = 12.0;
            status = lost(`utrwalone zadłużenie (${ms} msc)`);
          }
        } else if (m > 6.0) {
          if (coveredAfterGrace) {
            pts = 30.0;
            status = `🟡 Spłata ratunkowa po terminie (${ms} msc) — brak prawa głosu w dniu zebrania`;
          } else {
            pts = 18.0;
            status = lost(`świeże przekroczenie karencji (${ms} msc)`);
          }
        } else if (m > 2.0) {
          if (coveredAfterGrace) {
            pts = 45.0;
            status = `🟡 Pełna spłata zaległości w poślizgu (+${grace} dni) — zachowane prawo głosu (450 pkt)`;
          } else {
            pts = 28.0;
            status = `🟠 Na krawędzi karencji (${ms} msc) — zachowane prawo głosu (280 pkt)`;
          }
        } else if (coveredAfterGrace) {
          pts = 50.0;
          status = `🟢 Drobne zadłużenie spłacone w poślizgu (${grace} dni) — 500 pkt`;
        } else {
          pts = 40.0;
          status = `🟢 Drobne zadłużenie (${ms} msc) — zachowane prawo głosu (400 pkt)`;
        }
      }

      // Time decay: recent meetings weigh the most.
      const w = g.waga * Math.exp(-0.0018 * Math.max(0, diffDays(today, dVote)));
      weighted += pts * w;
      weights += w;

      votingAudit.push({
        data_glosowania: dVote,
        nazwa: g.nazwa,
        data_od: winStart,
        data_do: dVote,
        okres_zbiorki: `${winStart} → ${dVote} (${windowDays} dni)`,
        data_wymagalnosci: dVote,
        saldo_pln: saldoOnVote / 100,
        wplata_w_oknie_pln: paidInWindow / 100,
        punkty: pts,
        status,
      });
    }
    if (weights > 0) vdcScore = pyRound((weighted / weights) * 10);
  }

  // ---------------- Pillar 2: KDI (10%) ----------------
  let kdiScore: number;
  if (kdi === null) {
    kdiScore = Math.trunc(member.naliczone_gr ?? 0) === 0 && saldoNow >= 0 ? 1000 : 50;
  } else if (kdi <= 0.5) kdiScore = 1000;
  else if (kdi <= 1.0) kdiScore = pyRound(1000 - (kdi - 0.5) * 400);
  else if (kdi <= 1.2) kdiScore = pyRound(800 - (kdi - 1.0) * 1000);
  else if (kdi <= 2.0) kdiScore = Math.max(100, pyRound(600 - (kdi - 1.2) * 500));
  else kdiScore = 50;

  // ---------------- Pillar 3: balance (20%) ----------------
  let saldoScore: number;
  if (saldoNow > 0) saldoScore = 1000;
  else if (saldoNow === 0) saldoScore = 900;
  else {
    const m = Math.abs(saldoNow) / Math.max(currentRate, 1);
    if (m <= 1.0) saldoScore = 800;
    else if (m <= 3.0) saldoScore = 550;
    else if (m <= 6.0) saldoScore = 250;
    else saldoScore = Math.max(0, pyRound(250 - (m - 6.0) * (250 / 30.0)));
  }

  // ---------------- Pillar 4: rhythm (5%) ----------------
  const paymentsCount = pay.size;
  const tenure = Math.max(1, diffDays(today, effJoined));
  const quarterlyAudit: QuarterlyAudit[] = [];
  let cadenceScore: number;
  let avgDays: number | null;
  if (paymentsCount === 0) {
    cadenceScore = 50;
    avgDays = null;
  } else {
    avgDays = tenure / paymentsCount;
    if (avgDays <= 105) cadenceScore = 1000;
    else if (avgDays <= 200) cadenceScore = 800;
    else if (avgDays <= 380) cadenceScore = 600;
    else cadenceScore = 350;
    const last = [...pay.keys()].sort().at(-1)!;
    if (diffDays(today, last) <= 105) cadenceScore = Math.min(1000, cadenceScore + 100);
  }

  let quarterlyScore: number | null = null;
  let rhythmScore: number;
  if (quarters.length) {
    quarters.sort((a, b) => (a.data < b.data ? -1 : a.data > b.data ? 1 : 0));
    let wsum = 0;
    let wtot = 0;
    for (const q of quarters) {
      const dQ = q.data;
      const winStart = q.data_zbiorki_od;
      const grace = Math.min(3, Math.max(0, Math.trunc(q.dni_wymagalnosci_po)));
      const saldoOnQ = balanceOn(dQ);
      const paidInWindow = sumWhere(pay, (d) => winStart <= d && d <= dQ);
      const paidInGrace = grace > 0 ? sumWhere(pay, (d) => dQ < d && d <= addDays(dQ, grace)) : 0;
      const rateQ = Math.max(monthlyRate(effJoined, birth, manual, dQ)[1], 600);
      const windowDays = Math.max(1, diffDays(dQ, winStart));
      let pts: number;
      let status: string;
      if (saldoOnQ >= 0) {
        if (saldoOnQ - paidInWindow >= 0) {
          pts = 100.0;
          status = "Stała nadpłata przed zbiórką (brak długu) — 1000 pkt";
        } else {
          const inWindow = [...pay.keys()].filter((d) => winStart <= d && d <= dQ).sort();
          const effDate = inWindow.length ? inWindow[inWindow.length - 1] : dQ;
          const progress = Math.min(1.0, Math.max(0.0, Math.max(0, diffDays(effDate, winStart)) / windowDays));
          const daysBefore = diffDays(dQ, effDate);
          if (progress <= 0.5) {
            pts = 100.0;
            status = `Wpłata w I połowie okna (${daysBefore} dni przed terminem) — 1000 pkt`;
          } else {
            pts = pyRound(100.0 - ((progress - 0.5) / 0.5) * 40.0, 1);
            const pkt = pyRound(pts * 10);
            status = daysBefore === 0
              ? `Wpłata w dniu zbiórki (ostatni dzień) — ${pkt} pkt`
              : `Wpłata w II połowie okna (${daysBefore} dni przed terminem) — ${pkt} pkt`;
          }
        }
      } else if (paidInGrace > 0 && saldoOnQ + paidInGrace >= 0) {
        pts = 50.0;
        status = `Opłacono w poślizgu (+${grace} dni) — 500 pkt`;
      } else if (paidInWindow > 0) {
        pts = 35.0;
        status = "Częściowa wpłata w oknie zbiórki";
      } else {
        const m = Math.abs(saldoOnQ) / Math.max(rateQ, 1);
        if (m <= 1.0) {
          pts = 25.0;
          status = "Niewielkie opóźnienie (≤ 1 msc długu)";
        } else if (m <= 3.0) {
          pts = 15.0;
          status = "Zaległość kwartalna (1–3 msc długu)";
        } else {
          pts = 5.0;
          status = "Brak wpłaty na zbiórkę kwartalną (> 3 msc długu)";
        }
      }
      const age = dQ <= today ? Math.max(0, diffDays(today, dQ)) : 0;
      const w = q.waga * Math.exp(-0.0018 * age);
      wsum += pts * w;
      wtot += w;
      quarterlyAudit.push({
        id: q.id,
        data: dQ,
        nazwa: q.nazwa,
        okres_zbiorki: `${winStart} → ${dQ}`,
        data_wymagalnosci: grace > 0 ? addDays(dQ, grace) : dQ,
        saldo_pln: pyRound(saldoOnQ / 100, 2),
        wplata_w_oknie_pln: pyRound(paidInWindow / 100, 2),
        punkty: pts,
        status,
        waga: q.waga,
      });
    }
    quarterlyScore = wtot > 0 ? pyRound((wsum / wtot) * 10.0) : 1000;
    // 60% discipline in announced quarterly collections + 40% general cadence.
    rhythmScore = pyRound(0.6 * quarterlyScore + 0.4 * cadenceScore);
  } else {
    rhythmScore = cadenceScore;
  }
  rhythmScore = Math.max(0, Math.min(1000, rhythmScore));

  // ---------------- Synthesis ----------------
  let total = vdcScore !== null
    ? pyRound(0.65 * vdcScore + 0.2 * saldoScore + 0.1 * kdiScore + 0.05 * rhythmScore)
    : pyRound(0.55 * saldoScore + 0.3 * kdiScore + 0.15 * rhythmScore);
  total = Math.max(0, Math.min(1000, total));
  // Iron rule: AAA is reserved for members with a real overpayment.
  if (saldoNow <= 0 && total >= 950) total = 949;

  const lvl = ratingFor(total);
  return {
    czlonek_id: memberId,
    score: total,
    rating: lvl.kod,
    nazwa_poziomu: lvl.nazwa,
    kolor_dark: lvl.kolor_dark,
    kolor_light: lvl.kolor_light,
    opis_poziomu: lvl.opis,
    filary: {
      vdc_score: vdcScore,
      kdi_score: kdiScore,
      saldo_score: saldoScore,
      rytm_score: rhythmScore,
      liczba_glosowan: votes.length,
      liczba_kwartalnych: quarters.length,
      kwartalne_score: quarterlyScore,
      kadencja_dni: avgDays !== null ? pyRound(avgDays, 1) : null,
    },
    audyt_glosowan: votingAudit.reverse(),
    audyt_kwartalny: quarterlyAudit.reverse(),
  };
}
