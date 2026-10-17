/**
 * Fuzzy option search like Streamlit's selectbox: the query's characters must appear in order
 * (so "Mati" finds "Mateusz Kowalski"), ignoring case and Polish diacritics. Results are ranked:
 * substring matches first, then matches on word starts and long contiguous runs.
 */

const FOLD: Record<string, string> = { ą: "a", ć: "c", ę: "e", ł: "l", ń: "n", ó: "o", ś: "s", ź: "z", ż: "z" };

/** Lower-case and strip diacritics (Polish letters included; "ł" has no Unicode decomposition). */
export function fold(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[ąćęłńóśźż]/g, (c) => FOLD[c] ?? c);
}

/** Score of `query` against `text`; null when the characters do not appear in order. Higher is better. */
export function fuzzyScore(query: string, text: string): number | null {
  const q = fold(query).replace(/\s+/g, "");
  if (!q) return 0;
  const t = fold(text);
  const plain = fold(query).trim();
  // Exact substring (with spaces as typed) ranks highest; earlier and word-start positions first.
  const at = t.indexOf(plain);
  if (at >= 0) return 10_000 - at + (at === 0 || /\W/.test(t[at - 1]) ? 500 : 0);

  let score = 0;
  let ti = 0;
  let run = 0;
  for (const ch of q) {
    const found = t.indexOf(ch, ti);
    if (found < 0) return null;
    const wordStart = found === 0 || /[^a-z0-9]/.test(t[found - 1]);
    run = found === ti ? run + 1 : 1;
    score += 10 + (wordStart ? 30 : 0) + run * 5 - Math.min(found - ti, 20);
    ti = found + 1;
  }
  return score;
}

/** Filters and ranks options by label; keeps the original order for equal scores. */
export function fuzzyFilter<T>(items: T[], query: string, label: (item: T) => string): T[] {
  if (!query.trim()) return items;
  return items
    .map((item, index) => ({ item, index, score: fuzzyScore(query, label(item)) }))
    .filter((r): r is { item: T; index: number; score: number } => r.score !== null)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((r) => r.item);
}
