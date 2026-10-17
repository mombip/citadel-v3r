/**
 * Option search identical to Streamlit's selectbox (FILTER_MODE_FUZZY), which uses the fzy algorithm:
 *  1. keep options whose label contains the query's characters in order (case-insensitive, no diacritic folding),
 *  2. sort by fzy score, descending; ties keep the original order.
 * Ported from Streamlit's frontend bundle so results and their order match the original application.
 */

const SCORE_MIN = -Infinity;
const SCORE_MAX = Infinity;
const SCORE_GAP_LEADING = -0.005;
const SCORE_GAP_TRAILING = -0.005;
const SCORE_GAP_INNER = -0.01;
const SCORE_MATCH_CONSECUTIVE = 1.0;
const SCORE_MATCH_SLASH = 0.9;
const SCORE_MATCH_WORD = 0.8;
const SCORE_MATCH_CAPITAL = 0.7;
const SCORE_MATCH_DOT = 0.6;

const isLower = (c: string) => c.toLowerCase() === c;
const isUpper = (c: string) => c.toUpperCase() === c;

function precomputeBonus(haystack: string): number[] {
  const bonus = new Array<number>(haystack.length);
  let last = "/";
  for (let i = 0; i < haystack.length; i++) {
    const ch = haystack[i];
    if (last === "/") bonus[i] = SCORE_MATCH_SLASH;
    else if (last === "-" || last === "_" || last === " ") bonus[i] = SCORE_MATCH_WORD;
    else if (last === ".") bonus[i] = SCORE_MATCH_DOT;
    else if (isLower(last) && isUpper(ch)) bonus[i] = SCORE_MATCH_CAPITAL;
    else bonus[i] = 0;
    last = ch;
  }
  return bonus;
}

function compute(needle: string, haystack: string, D: number[][], M: number[][]) {
  const n = needle.length;
  const m = haystack.length;
  const lowerNeedle = needle.toLowerCase();
  const lowerHaystack = haystack.toLowerCase();
  const bonus = precomputeBonus(haystack);
  for (let i = 0; i < n; i++) {
    D[i] = new Array(m);
    M[i] = new Array(m);
    let prevScore = SCORE_MIN;
    const gapScore = i === n - 1 ? SCORE_GAP_TRAILING : SCORE_GAP_INNER;
    for (let j = 0; j < m; j++) {
      if (lowerNeedle[i] === lowerHaystack[j]) {
        let score = SCORE_MIN;
        if (!i) score = j * SCORE_GAP_LEADING + bonus[j];
        else if (j) score = Math.max(M[i - 1][j - 1] + bonus[j], D[i - 1][j - 1] + SCORE_MATCH_CONSECUTIVE);
        D[i][j] = score;
        M[i][j] = prevScore = Math.max(score, prevScore + gapScore);
      } else {
        D[i][j] = SCORE_MIN;
        M[i][j] = prevScore = prevScore + gapScore;
      }
    }
  }
}

/** fzy score of `needle` in `haystack` (higher is better). */
export function fzyScore(needle: string, haystack: string): number {
  const n = needle.length;
  const m = haystack.length;
  if (!n || !m) return SCORE_MIN;
  // As in Streamlit's port: a case-insensitive match of equal length counts as a perfect match.
  if (needle === haystack || m === n) return SCORE_MAX;
  if (m > 1024) return SCORE_MIN;
  const D: number[][] = new Array(n);
  const M: number[][] = new Array(n);
  compute(needle, haystack, D, M);
  return M[n - 1][m - 1];
}

/** True when the needle's characters appear in order in the haystack (case-insensitive). */
export function fzyHasMatch(needle: string, haystack: string): boolean {
  const n = needle.toLowerCase();
  const h = haystack.toLowerCase();
  for (let i = 0, j = 0; i < n.length; i += 1) {
    j = h.indexOf(n[i], j) + 1;
    if (j === 0) return false;
  }
  return true;
}

/** Filters and ranks options like Streamlit's selectbox; returns all options unchanged for an empty query. */
export function fuzzyFilter<T>(items: T[], query: string, label: (item: T) => string): T[] {
  if (!query) return items;
  return items
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => fzyHasMatch(query, label(item)))
    .map((r) => ({ ...r, score: fzyScore(query, label(r.item)) }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((r) => r.item);
}
