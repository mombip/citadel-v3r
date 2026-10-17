import { describe, expect, it } from "vitest";
import { fuzzyFilter, fzyHasMatch, fzyScore } from "../../shared/fuzzy";

const members = [
  "Alicja Nowak (Saldo: 153.00 zł)",
  "Mateusz Kowalski (Saldo: 12.00 zł)",
  "Matylda Wiśniewska (Saldo: -6.00 zł)",
  "Łukasz Żółkowski (Saldo: 0.00 zł)",
  "Bartosz Mazur (Saldo: 9.00 zł)",
];

describe("selectbox search identical to Streamlit (fzy)", () => {
  it("matches characters in order, case-insensitive", () => {
    expect(fzyHasMatch("Mati", "Mateusz Kowalski")).toBe(true);
    expect(fzyHasMatch("zxq", "Mateusz Kowalski")).toBe(false);
  });

  it("finds Mateusz for 'Mati'", () => {
    expect(fuzzyFilter(members, "Mati", (m) => m)).toContain("Mateusz Kowalski (Saldo: 12.00 zł)");
  });

  it("does not fold diacritics, like the original", () => {
    expect(fzyHasMatch("lukasz", "Łukasz Żółkowski")).toBe(false);
    expect(fzyHasMatch("łukasz", "Łukasz Żółkowski")).toBe(true);
  });

  it("rewards word starts and consecutive letters (fzy constants)", () => {
    // word starts (after a space) beat letters inside a word
    expect(fuzzyFilter(["Xmxxxk Abc", "Mateusz Kowalski"], "mk", (m) => m)[0]).toBe("Mateusz Kowalski");
    // consecutive letters beat scattered ones
    expect(fzyScore("now", "Alicja Nowak")).toBeGreaterThan(fzyScore("now", "Natalia Ostrowska"));
  });

  it("treats an equal-length match as perfect and keeps original order for ties", () => {
    expect(fzyScore("abc", "ABC")).toBe(Infinity);
    expect(fuzzyFilter(["Anna B", "Anna A"], "anna", (m) => m)).toEqual(["Anna B", "Anna A"]);
  });

  it("returns all options for an empty query", () => {
    expect(fuzzyFilter(members, "", (m) => m)).toEqual(members);
  });
});
