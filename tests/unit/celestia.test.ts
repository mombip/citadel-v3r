// Port of the original tests/test_celestia.py
import { describe, expect, it } from "vitest";
import { CELESTIA_LEVELS, celestiaColor, computeMemberRating, ratingFor, type DueDate } from "../../shared/celestia";

const P = (date: string, gr: number) => ({ date, gr });

describe("celestia scale", () => {
  it("has 12 levels in order", () => {
    expect(CELESTIA_LEVELS.map((p) => p.kod)).toEqual(["AAA", "AA", "A", "BBB", "BB", "B", "CCC", "CC", "C", "D", "DD", "DDD"]);
  });

  it("maps score thresholds", () => {
    const cases: [number, string][] = [
      [1000, "AAA"], [950, "AAA"], [949, "AA"], [880, "AA"], [879, "A"], [800, "A"], [799, "BBB"], [700, "BBB"],
      [699, "BB"], [600, "BB"], [599, "B"], [500, "B"], [499, "CCC"], [380, "CCC"], [379, "CC"], [260, "CC"],
      [259, "C"], [150, "C"], [149, "D"], [90, "D"], [89, "DD"], [40, "DD"], [39, "DDD"], [0, "DDD"],
    ];
    for (const [s, k] of cases) expect(ratingFor(s).kod).toBe(k);
  });

  it("colors", () => {
    expect(celestiaColor(1000)).toBe("#16823c");
    expect(celestiaColor(0)).toBe("#a855f7");
    expect(celestiaColor("1000 pkt")).toBe("#16823c");
    expect(celestiaColor("AAA")).toBe("#23994d");
    expect(celestiaColor("DDD", true)).toBe("#6a2ad0");
  });
});

describe("celestia engine", () => {
  it("grace period is at most 3 days", () => {
    const m = { data_wst: "2026-01-01", data_ur: "2000-01-01", reczny_parametr: "M", saldo_start_gr: -600, saldo_akt_gr: -600, naliczone_gr: 0, kdi_val: null };
    const t: DueDate[] = [{ id: 1, data_glosowania: "2026-10-10", dni_zbiorki_przed: 14, dni_wymagalnosci_po: 3, waga: 1.0, nazwa: "Zebranie" }];
    const r2 = computeMemberRating(1, m, t, [P("2026-10-12", 600)], [], [], "2026-10-15");
    expect(r2.audyt_glosowan[0].punkty).toBe(50.0);
    const r4 = computeMemberRating(1, m, t, [P("2026-10-14", 600)], [], [], "2026-10-15");
    expect(r4.audyt_glosowan[0].punkty).toBe(40.0);
  });

  it("future join date is clamped to today", () => {
    const m = { data_wst: "2026-10-28", data_ur: "2004-06-27", reczny_parametr: null, saldo_start_gr: -3500, saldo_akt_gr: -2500, naliczone_gr: 0, kdi_val: null };
    const t: DueDate[] = [{ id: 1, data_glosowania: "2026-10-17", dni_zbiorki_przed: 14, dni_wymagalnosci_po: 3, waga: 1.0, nazwa: "Zebranie regionu" }];
    const r = computeMemberRating(66, m, t, [], [], [], "2026-10-14");
    expect(r.filary.liczba_glosowan).toBe(1);
    expect(r.filary.vdc_score).not.toBeNull();
  });

  it("quarterly rhythm gives 1000", () => {
    const m = { data_wst: "2025-10-05", data_ur: "1995-01-01", reczny_parametr: "M", saldo_start_gr: 0, saldo_akt_gr: 0, naliczone_gr: 3600, kdi_val: 1.0 };
    const w = [P("2026-01-05", 900), P("2026-04-05", 900), P("2026-07-05", 900), P("2026-09-20", 900)];
    const r = computeMemberRating(1, m, [], w, [], [], "2026-10-01");
    expect(r.filary.kadencja_dni!).toBeLessThanOrEqual(105);
    expect(r.filary.rytm_score).toBe(1000);
  });

  it("quarterly due date is not a vote and affects rhythm", () => {
    const m = { data_wst: "2025-01-01", data_ur: "1990-01-01", reczny_parametr: "M", saldo_start_gr: 0, saldo_akt_gr: 0, naliczone_gr: 6000, kdi_val: 1.0 };
    const t: DueDate[] = [{ id: 10, data_glosowania: "2026-06-30", dni_zbiorki_przed: 14, dni_wymagalnosci_po: 3, waga: 1.0, nazwa: "Zbiórka Q2 2026", typ_terminu: "KWARTALNY" }];
    const r = computeMemberRating(1, m, t, [P("2026-06-25", 6000)], [], [], "2026-10-01");
    expect(r.filary.liczba_glosowan).toBe(0);
    expect(r.filary.vdc_score).toBeNull();
    expect(r.audyt_glosowan).toHaveLength(0);
    expect(r.filary.liczba_kwartalnych).toBe(1);
    expect(r.audyt_kwartalny[0].nazwa).toBe("Zbiórka Q2 2026");
    expect(r.audyt_kwartalny[0].punkty).toBe(100);
    expect(r.filary.kwartalne_score).toBe(1000);
    expect(r.filary.rytm_score).toBeGreaterThanOrEqual(750);
  });

  it("dynamic punctuality within the collection window", () => {
    const m = { data_wst: "2025-01-01", data_ur: "1995-01-01", reczny_parametr: "M", saldo_start_gr: -600, saldo_akt_gr: 0, naliczone_gr: 0, kdi_val: 1.0 };
    const t: DueDate[] = [{ id: 1, data_glosowania: "2026-10-14", dni_zbiorki_przed: 14, dni_wymagalnosci_po: 0, waga: 1.0, nazwa: "Zebranie testowe" }];
    const at = (d: string) => computeMemberRating(1, m, t, [P(d, 600)], [], [], "2026-10-20").audyt_glosowan[0].punkty;
    expect(at("2026-10-05")).toBe(100.0);
    expect(at("2026-10-14")).toBe(60.0);
    const mid = at("2026-10-11");
    expect(mid).toBeGreaterThanOrEqual(70);
    expect(mid).toBeLessThanOrEqual(85);
  });

  it("iron rule: no AAA without overpayment", () => {
    const base = { data_wst: "2025-01-01", data_ur: "1995-01-01", reczny_parametr: "M", naliczone_gr: 3600, kdi_val: 0.5 };
    const w = [P("2026-01-05", 900), P("2026-04-05", 900), P("2026-07-05", 900), P("2026-09-20", 900)];
    const bez = computeMemberRating(1, { ...base, saldo_start_gr: 0, saldo_akt_gr: 0 }, [], w, [], [], "2026-10-01");
    const z = computeMemberRating(2, { ...base, saldo_start_gr: 5000, saldo_akt_gr: 5000 }, [], w, [], [], "2026-10-01");
    expect(bez.score).toBeLessThanOrEqual(949);
    expect(bez.rating).toBe("AA");
    expect(z.score).toBeGreaterThanOrEqual(950);
    expect(z.rating).toBe("AAA");
  });

  it("balance decay with base 250", () => {
    const mk = (gr: number, kdi: number) => ({ data_wst: "2024-01-01", data_ur: "2008-01-01", reczny_parametr: "B", saldo_start_gr: -gr, saldo_akt_gr: -gr, naliczone_gr: gr, kdi_val: kdi });
    expect(computeMemberRating(1, mk(3600, 2), [], [], [], [], "2026-10-01").filary.saldo_score).toBe(250);
    expect(computeMemberRating(2, mk(10800, 3), [], [], [], [], "2026-10-01").filary.saldo_score).toBe(150);
    expect(computeMemberRating(3, mk(14400, 4), [], [], [], [], "2026-10-01").filary.saldo_score).toBe(100);
  });

  it("no payments gives cadence 50", () => {
    const m = { data_wst: "2026-09-25", data_ur: "2005-01-01", reczny_parametr: "M", saldo_start_gr: 0, saldo_akt_gr: 0, naliczone_gr: 0, kdi_val: null };
    const r = computeMemberRating(1, m, [], [], [], [], "2026-10-01");
    expect(r.filary.rytm_score).toBe(50);
    expect(r.filary.kadencja_dni).toBeNull();
  });
});
