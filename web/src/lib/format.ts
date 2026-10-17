import { fmt } from "../../../shared/num";
import { kdiColor as kdiColorBase } from "../../../shared/colors";
import { celestiaScaleColor } from "../../../shared/colors";
import { formatTimePL } from "../../../shared/dates";
import { pyFloat } from "../../../shared/num";

export { fmt, formatTimePL };
export const plnCard = (gr: number) => `${fmt(gr / 100, 2, { thousands: true })} PLN`;
export const zl = (gr: number) => `${fmt(gr / 100, 2)} zł`;
export const zlThousands = (gr: number) => `${fmt(gr / 100, 2, { thousands: true })} zł`;
export const grToNumber = (gr: number) => gr / 100;
export const plnToGr = (pln: number) => Math.round(pln * 100);

/** Light theme darkens the KDI palette so that white/light-green values stay legible (matches the original's inverted tables). */
const LIGHT_KDI_STOPS: [number, [number, number, number]][] = [
  [0.1, [21, 128, 61]],
  [0.5, [22, 163, 74]],
  [1.0, [30, 41, 59]],
  [1.2, [202, 138, 4]],
  [2.0, [194, 65, 12]],
  [3.0, [185, 28, 28]],
  [5.0, [190, 24, 93]],
  [10.0, [29, 78, 216]],
  [20.0, [126, 34, 206]],
];

export function kdiColor(value: unknown, isLight = false): string {
  if (!isLight) return kdiColorBase(value);
  const val = pyFloat(value);
  if (val === null) return "#64748b";
  const s = LIGHT_KDI_STOPS;
  const hex = ([r, g, b]: [number, number, number]) => "#" + [r, g, b].map((c) => c.toString(16).padStart(2, "0")).join("");
  if (val <= s[0][0]) return hex(s[0][1]);
  if (val >= s[s.length - 1][0]) return hex(s[s.length - 1][1]);
  for (let i = 0; i < s.length - 1; i++) {
    const [v1, c1] = s[i];
    const [v2, c2] = s[i + 1];
    if (v1 <= val && val <= v2) {
      const t = (val - v1) / (v2 - v1);
      return hex([0, 1, 2].map((k) => Math.trunc(c1[k] + t * (c2[k] - c1[k]))) as [number, number, number]);
    }
  }
  return "#0f172a";
}

export const eligibleColorTheme = (pct: number | null, isLight: boolean) =>
  pct === null ? "#64748b" : isLight ? celestiaScaleColor(Math.max(0, Math.min(1000, pct * 10)), true) : null;

/** Style for KDI cells: "Brak danych" in italic grey, otherwise coloured bold. */
export function kdiCellStyle(v: string, isLight: boolean): string {
  const c = kdiColor(v, isLight);
  return v === "Brak danych" ? `color: ${c}; font-style: italic;` : `color: ${c}; font-weight: 700;`;
}

export function kdiThresholdStyle(v: string, isLight: boolean): string {
  if (v === "pełna karencja") return `color: ${isLight ? "#16a34a" : "#4ade80"}; font-weight: 700;`;
  if (typeof v === "string" && v.startsWith("≤ ")) return `color: ${kdiColor(v.replace("≤ ", ""), isLight)}; font-weight: 700;`;
  return "color: #94a3b8;";
}

export const voteStyle = (v: string) => (v === "TAK" ? "color: #22c55e; font-weight: 800;" : v === "NIE" ? "color: #f43f5e; font-weight: 800;" : "");

export const glow = (c: string, px = 16) => `color: ${c}; text-shadow: 0 0 ${px}px ${c};`;
