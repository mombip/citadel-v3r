import { pyFloat } from "./num";

type RGB = [number, number, number];
const hex = ([r, g, b]: RGB) =>
  "#" + [r, g, b].map((c) => c.toString(16).padStart(2, "0")).join("");
const lerp = (a: RGB, b: RGB, t: number): RGB =>
  [0, 1, 2].map((i) => Math.trunc(a[i] + t * (b[i] - a[i]))) as RGB;

export const GREY = "#64748b";

/** Canonical KDI gradient (ascending KDI = worse). */
export const KDI_STOPS: [number, RGB][] = [
  [0.1, [22, 130, 60]],
  [0.5, [74, 222, 128]],
  [1.0, [255, 255, 255]],
  [1.2, [250, 204, 21]],
  [2.0, [249, 115, 22]],
  [3.0, [239, 68, 68]],
  [5.0, [236, 72, 153]],
  [10.0, [59, 130, 246]],
  [20.0, [168, 85, 247]],
];

export function kdiColor(value: unknown): string {
  const val = pyFloat(value);
  if (val === null) return GREY;
  if (val <= KDI_STOPS[0][0]) return hex(KDI_STOPS[0][1]);
  if (val >= KDI_STOPS[KDI_STOPS.length - 1][0]) return hex(KDI_STOPS[KDI_STOPS.length - 1][1]);
  for (let i = 0; i < KDI_STOPS.length - 1; i++) {
    const [v1, c1] = KDI_STOPS[i];
    const [v2, c2] = KDI_STOPS[i + 1];
    if (v1 <= val && val <= v2) return hex(lerp(c1, c2, (val - v1) / (v2 - v1)));
  }
  return "#ffffff";
}

/** Gradient for the share of members entitled to vote (100% = best). */
export const ELIGIBLE_STOPS: [number, RGB][] = [
  [100, [22, 130, 60]],
  [90, [74, 222, 128]],
  [80, [255, 255, 255]],
  [70, [250, 204, 21]],
  [55, [249, 115, 22]],
  [40, [239, 68, 68]],
  [25, [236, 72, 153]],
  [10, [59, 130, 246]],
  [0, [168, 85, 247]],
];

export function eligibleColor(percent: unknown): string {
  const val = pyFloat(percent);
  if (val === null) return GREY;
  const s = ELIGIBLE_STOPS;
  if (val >= s[0][0]) return hex(s[0][1]);
  if (val <= s[s.length - 1][0]) return hex(s[s.length - 1][1]);
  for (let i = 0; i < s.length - 1; i++) {
    const [v1, c1] = s[i];
    const [v2, c2] = s[i + 1];
    if (v2 <= val && val <= v1) return hex(lerp(c1, c2, (v1 - val) / (v1 - v2)));
  }
  return "#ffffff";
}

/** Celestia uses the KDI palette mapped onto 0–1000 points (descending). */
const CELESTIA_DARK: [number, RGB][] = [
  [1000, [22, 130, 60]],
  [900, [74, 222, 128]],
  [800, [255, 255, 255]],
  [700, [250, 204, 21]],
  [550, [249, 115, 22]],
  [400, [239, 68, 68]],
  [250, [236, 72, 153]],
  [100, [59, 130, 246]],
  [0, [168, 85, 247]],
];
const CELESTIA_LIGHT: [number, RGB][] = [
  [1000, [21, 128, 61]],
  [900, [22, 163, 74]],
  [800, [30, 41, 59]],
  [700, [202, 138, 4]],
  [550, [194, 65, 12]],
  [400, [185, 28, 28]],
  [250, [190, 24, 93]],
  [100, [29, 78, 216]],
  [0, [126, 34, 206]],
];

export function celestiaScaleColor(value: number, isLight = false): string {
  const stops = isLight ? CELESTIA_LIGHT : CELESTIA_DARK;
  const val = Math.max(0, Math.min(1000, value));
  if (val >= stops[0][0]) return hex(stops[0][1]);
  if (val <= stops[stops.length - 1][0]) return hex(stops[stops.length - 1][1]);
  for (let i = 0; i < stops.length - 1; i++) {
    const [v1, c1] = stops[i];
    const [v2, c2] = stops[i + 1];
    if (v2 <= val && val <= v1) return hex(lerp(c2, c1, (val - v2) / (v1 - v2)));
  }
  return isLight ? "#000000" : "#ffffff";
}
