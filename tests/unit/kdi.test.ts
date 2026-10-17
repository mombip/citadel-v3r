// Port of the original tests/test_kdi.py plus helpers that the UI relies on.
import { describe, expect, it } from "vitest";
import { dynamicKdiThreshold, formatKdiValue, computeCharges, simulateCalculator, filterInterval } from "../../shared/calculations";
import { fmt, pyRound } from "../../shared/num";
import { kdiColor, eligibleColor } from "../../shared/colors";
import { addMonths, formatTimePL } from "../../shared/dates";

describe("dynamic KDI threshold", () => {
  it("no data", () => expect(dynamicKdiThreshold([])).toEqual([null, "Brak danych"]));
  it("full grace", () =>
    expect(dynamicKdiThreshold([{ z_i_gr: 3000, stawka_biezaca_gr: 1000 }, { z_i_gr: 6000, stawka_biezaca_gr: 1000 }])).toEqual([null, "pełna karencja"]));
  it("7 months", () => expect(dynamicKdiThreshold([{ z_i_gr: 7000, stawka_biezaca_gr: 1000 }])).toEqual([7.0, "≤ 7.00"]));
  it("36 months benchmark", () => expect(dynamicKdiThreshold([{ z_i_gr: 36000, stawka_biezaca_gr: 1000 }])).toEqual([1.2, "≤ 1.20"]));
  it("5 years", () => expect(dynamicKdiThreshold([{ z_i_gr: 60000, stawka_biezaca_gr: 1000 }])).toEqual([1.11, "≤ 1.11"]));
  it("aggregation", () =>
    expect(dynamicKdiThreshold([{ z_i_gr: 7000, stawka_biezaca_gr: 1000 }, { z_i_gr: 60000, stawka_biezaca_gr: 1000 }])).toEqual([1.22, "≤ 1.22"]));
});

describe("formatKdiValue", () => {
  it("formats variants", () => {
    const h = formatKdiValue("1.15", 1.25, "≤ 1.25");
    expect(h).toContain("1.15");
    expect(h).toContain("(próg: ≤ 1.25)");
    expect(h).toContain("font-size: 0.92rem");
    const k = formatKdiValue("Brak danych", null, "pełna karencja");
    expect(k).toContain("(próg: pełna karencja)");
    expect(k).toContain("#4ade80");
    expect(formatKdiValue("Brak danych", null, "")).toBe("Brak danych");
  });
});

describe("python compatibility helpers", () => {
  it("round half to even", () => {
    expect(pyRound(2.5)).toBe(2);
    expect(pyRound(3.5)).toBe(4);
    expect(pyRound(-2.5)).toBe(-2);
    expect(pyRound(0.125, 2)).toBe(0.12);
    expect(pyRound(1.005, 2)).toBe(1); // binary 1.00499…
  });
  it("formats like f-strings", () => {
    expect(fmt(1234567.891, 2, { thousands: true })).toBe("1,234,567.89");
    expect(fmt(-0.001, 2)).toBe("-0.00");
    expect(fmt(5, 2, { sign: true })).toBe("+5.00");
    expect(fmt(-1234.5, 2, { thousands: true })).toBe("-1,234.50");
  });
  it("relativedelta month clamp", () => {
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2026-12-01", 1)).toBe("2027-01-01");
  });
  it("warsaw time", () => {
    expect(formatTimePL("2026-10-17T10:00:00Z")).toBe("2026-10-17 12:00:00");
    expect(formatTimePL(null)).toBe("b/d");
  });
  it("colors", () => {
    expect(kdiColor("Brak danych")).toBe("#64748b");
    expect(kdiColor(1.0)).toBe("#ffffff");
    expect(kdiColor(0.05)).toBe("#16823c");
    expect(eligibleColor(100)).toBe("#16823c");
  });
});

describe("charges", () => {
  it("only complete months after the cutoff", () => {
    expect(computeCharges("2020-01-01", "1990-01-01", "AUTO", "2026-10-17")).toEqual([0, 0]);
    expect(computeCharges("2020-01-01", "1990-01-01", "AUTO", "2026-10-31")).toEqual([1500, 1]);
  });
  it("calculator handles old resolution and joining exemption", () => {
    const r = simulateCalculator("2023-09-12", "2005-10-10", "AUTO", "2025-03-31", "2023-09-12");
    // Oct 2023 – Dec 2024 old resolution (15 months), Jan–Mar 2025 B tier.
    expect(r.months).toBe(18);
    expect(r.tierHistory["B"]).toBe(3);
  });
  it("interval filter keeps first/last and month ends", () => {
    const recs = ["2026-01-30", "2026-01-31", "2026-02-01", "2026-02-02"].map((date) => ({ date }));
    expect(filterInterval(recs, "M1").map((r) => r.date)).toEqual(["2026-01-30", "2026-01-31", "2026-02-02"]);
  });
});
