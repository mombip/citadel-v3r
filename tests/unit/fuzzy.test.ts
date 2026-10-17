import { describe, expect, it } from "vitest";
import { fold, fuzzyFilter, fuzzyScore } from "../../shared/fuzzy";

const members = [
  "Alicja Nowak (Saldo: 153.00 zł)",
  "Mateusz Kowalski (Saldo: 12.00 zł)",
  "Matylda Wiśniewska (Saldo: -6.00 zł)",
  "Łukasz Żółkowski (Saldo: 0.00 zł)",
  "Bartosz Mazur (Saldo: 9.00 zł)",
];

describe("fuzzy search like Streamlit's selectbox", () => {
  it("folds case and Polish diacritics", () => {
    expect(fold("Łukasz ŻÓŁKOWSKI ąćęńś")).toBe("lukasz zolkowski acens");
  });

  it("finds Mateusz for 'Mati' (characters in order)", () => {
    expect(fuzzyScore("Mati", "Mateusz Kowalski")).not.toBeNull();
    expect(fuzzyFilter(members, "Mati", (m) => m)).toContain("Mateusz Kowalski (Saldo: 12.00 zł)");
  });

  it("rejects options where characters are out of order", () => {
    expect(fuzzyScore("zxq", "Mateusz Kowalski")).toBeNull();
  });

  it("matches without diacritics", () => {
    expect(fuzzyFilter(members, "lukasz zol", (m) => m)[0]).toBe("Łukasz Żółkowski (Saldo: 0.00 zł)");
  });

  it("ranks substring and word-start matches first", () => {
    const r = fuzzyFilter(members, "mat", (m) => m);
    expect(r.slice(0, 2)).toEqual(["Mateusz Kowalski (Saldo: 12.00 zł)", "Matylda Wiśniewska (Saldo: -6.00 zł)"]);
    expect(fuzzyFilter(members, "mazur", (m) => m)[0]).toBe("Bartosz Mazur (Saldo: 9.00 zł)");
  });

  it("returns all options for an empty query, in order", () => {
    expect(fuzzyFilter(members, "  ", (m) => m)).toEqual(members);
  });
});
