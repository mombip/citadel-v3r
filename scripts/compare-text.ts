/**
 * Walks the ORIGINAL (Streamlit) and the NEW app through the same screens and compares the visible text,
 * including data-grid cells. Prints, per screen, the text present in only one of the apps.
 *
 * Usage: npx tsx scripts/compare-text.ts http://localhost:8601 http://localhost:8700 [out.json]
 */
import { chromium, type Page } from "@playwright/test";
import { writeFileSync } from "node:fs";

const [refBase, newBase, outFile] = [process.argv[2] || "http://localhost:8601", process.argv[3] || "http://localhost:8700", process.argv[4] || "tests/e2e/results/text-compare.json"];

const NOISE = new Set(["Deploy", "", "▾", "keyboard_arrow_down", "keyboard_double_arrow_right", "keyboard_double_arrow_left", "None"]);
const norm = (s: string) =>
  s.replace(/\s+/g, " ").replace(/ /g, " ").trim()
    .replace(/(\d{4})\/(\d{2})\/(\d{2})/g, "$1-$2-$3")            // Streamlit date widget 2026/10/17
    .replace(/(\d{2})\.(\d{2})\.(\d{4})/g, "$3-$2-$1")            // native date input 17.10.2026
    .replace(/(\d+),(\d{2})\b/g, "$1.$2")                         // Polish decimal comma in number widgets
    .replace(/→|➔/g, "→");

const EXTRACT = `(isRef) => {
  const root = isRef ? document.querySelector('[data-testid="stAppViewContainer"]') : document.querySelector('.app');
  const out = [];
  if (!root) return out;
  const walk = (n) => {
    if (n.nodeType === Node.TEXT_NODE) { const t = (n.textContent || '').trim(); if (t) out.push(t); return; }
    const el = n;
    if (['SCRIPT', 'STYLE', 'svg', 'SVG', 'CANVAS'].includes(el.tagName)) return;
    if (el.tagName === 'INPUT') { const v = el.value; if (v) out.push(v); return; }
    if (el.tagName === 'SELECT') { if (el.selectedOptions[0]) out.push(el.selectedOptions[0].text); return; }
    for (const c of Array.from(el.childNodes)) walk(c);
  };
  walk(root);
  for (const cell of Array.from(root.querySelectorAll('[data-testid="stDataFrame"] table td, [data-testid="stDataFrame"] table th'))) {
    const t = (cell.textContent || '').trim();
    if (t) out.push(t);
  }
  return out;
}`;

async function texts(page: Page, isRef: boolean): Promise<Set<string>> {
  await page.waitForTimeout(isRef ? 1800 : 600);
  if (isRef) await page.locator('[data-testid="stStatusWidget"]').waitFor({ state: "hidden", timeout: 30_000 }).catch(() => {});
  // Passed as a string so the TypeScript bundler cannot inject helpers (__name) into page context.
  const raw: string[] = await page.evaluate(`(${EXTRACT})(${isRef})`);
  const set = new Set<string>();
  for (const t of raw) {
    const n = norm(t);
    if (!NOISE.has(n)) set.add(n);
  }
  return set;
}

async function run(base: string, isRef: boolean) {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  const screens: Record<string, Set<string>> = {};
  // Streamlit keeps every (sub)tab in the DOM; the new app renders only the active one, so click through all sub-tabs there.
  const grab = async (name: string) => {
    const set = await texts(page, isRef);
    if (!isRef) {
      for (let i = 0; i < 12; i++) {
        const subs = page.locator('[role="tablist"]:not([data-testid="kolo-tabs"]) [role="tab"]');
        if (i >= (await subs.count())) break;
        await subs.nth(i).click();
        for (const t of await texts(page, isRef)) set.add(t);
      }
    }
    screens[name] = set;
  };

  await page.goto(base);
  await grab("00-login");
  await page.getByLabel("Login").fill("admin2");
  await page.locator(isRef ? 'input[type="password"]' : "#haslo").fill("Admin1234!");
  await page.getByRole("button", { name: "Zaloguj do systemu" }).click();
  await page.waitForTimeout(isRef ? 4000 : 1500);
  if (!isRef) {
    await page.locator("select[name=region]").selectOption({ label: "Mazowsze" });
    await page.locator("select[name=kolo]").selectOption({ label: "Koło Radom" });
    await page.waitForTimeout(800);
  }
  await grab("01-zbiorcza");
  const tabs: [RegExp, string][] = [
    [/Profile & Wykresy/, "02-profile"], [/Celestia & Głosowania/, "03-celestia"], [/Wpłaty Członków/, "04-wplaty"],
    [/Ręczne Naliczenia/, "05-reczne"], [/Kasa Koła & Wydatki/, "06-kasa"], [/Korekta Salda Osoby/, "07-korekty"],
    [/Zarządzaj Członkami/, "08-czlonkowie"], [/Kalkulator/, "09-kalkulator"], [/Wpłaty do zaakceptowania/, "10-akceptacje"],
    [/Zarządzaj Strukturą/, "11-struktura"], [/Logi Audytowe/, "12-audyt"], [/Panel Centauri/, "13-centauri"],
  ];
  for (const [re, name] of tabs) {
    await page.getByRole("tab", { name: re }).first().click();
    await grab(name);
  }
  await page.getByRole("tab", { name: /Celestia & Głosowania/ }).first().click();
  await page.getByRole("tab", { name: /Rejestr Dni Głosowań/ }).first().click();
  await grab("03b-celestia-rejestr");
  await page.getByText("📊 Statystyki Regionu", { exact: true }).click();
  await grab("20-region");
  await page.getByText("🇵🇱 Statystyki Kraju", { exact: true }).click();
  await grab("21-kraj");
  await page.getByRole("button", { name: "Wyloguj" }).click();
  await page.waitForTimeout(1500);
  await page.getByLabel("Login").fill("kolo_waw");
  await page.locator(isRef ? 'input[type="password"]' : "#haslo").fill("Kolo1234!");
  await page.getByRole("button", { name: "Zaloguj do systemu" }).click();
  await page.waitForTimeout(isRef ? 4000 : 1500);
  await grab("40-skarbnik-kola");
  for (const [re] of tabs.slice(0, 8)) {
    const tab = page.getByRole("tab", { name: re }).first();
    if (await tab.count()) { await tab.click(); for (const t of await texts(page, isRef)) screens["40-skarbnik-kola"].add(t); }
    if (!isRef) {
      for (let i = 0; i < 12; i++) {
        const subs = page.locator('[role="tablist"]:not([data-testid="kolo-tabs"]) [role="tab"]');
        if (i >= (await subs.count())) break;
        await subs.nth(i).click();
        for (const t of await texts(page, isRef)) screens["40-skarbnik-kola"].add(t);
      }
    }
  }
  await browser.close();
  return screens;
}

const ref = await run(refBase, true);
const neu = await run(newBase, false);
const report: Record<string, { onlyReference: string[]; onlyNew: string[]; common: number }> = {};
let totalRefOnly = 0;
for (const name of Object.keys(ref)) {
  const a = ref[name];
  const b = neu[name] ?? new Set<string>();
  const onlyReference = [...a].filter((t) => !b.has(t));
  const onlyNew = [...b].filter((t) => !a.has(t));
  report[name] = { onlyReference, onlyNew, common: [...a].filter((t) => b.has(t)).length };
  totalRefOnly += onlyReference.length;
  console.log(`\n=== ${name}: common ${report[name].common}, only in original ${onlyReference.length}, only in new ${onlyNew.length}`);
  if (onlyReference.length) console.log("  ORIGINAL ONLY: " + onlyReference.map((t) => JSON.stringify(t)).join(" | "));
  if (onlyNew.length) console.log("  NEW ONLY:      " + onlyNew.map((t) => JSON.stringify(t)).join(" | "));
}
const dump = (x: Record<string, Set<string>>) => Object.fromEntries(Object.entries(x).map(([k, v]) => [k, [...v]]));
writeFileSync(outFile, JSON.stringify({ report, reference: dump(ref), current: dump(neu) }, null, 2));
// Streamlit keeps every tab in the DOM, so per-screen counts overstate differences; compare whole sessions instead.
const union = (src: Record<string, Set<string>>, keys: string[]) => new Set(keys.flatMap((k) => [...(src[k] ?? [])]));
const sessions: Record<string, string[]> = {
  admin: Object.keys(ref).filter((k) => !k.startsWith("4") && k !== "00-login"),
  "unit treasurer": Object.keys(ref).filter((k) => k.startsWith("4")),
};
console.log(`\nPer-screen sum (inflated by Streamlit's hidden tabs): ${totalRefOnly}`);
for (const [name, keys] of Object.entries(sessions)) {
  const a = union(ref, keys);
  const b = union(neu, keys);
  const onlyRef = [...a].filter((t) => !b.has(t) && !t.startsWith("{"));
  console.log(`\n### ${name} session: ${[...a].filter((t) => b.has(t)).length} texts in both apps, ${onlyRef.length} only in the original`);
  if (onlyRef.length) console.log("  " + onlyRef.map((t) => JSON.stringify(t)).join(" | "));
}
