/**
 * Compares type-to-search results of the member dropdown (Profile tab) between the original Streamlit app and the
 * new app, for a list of queries. Prints the top results of both side by side.
 * Usage: npx tsx scripts/compare-search.ts http://localhost:8601 http://localhost:8700 Mati Ania kow
 */
import { chromium, type Page } from "@playwright/test";

const [refBase, newBase, ...argQueries] = process.argv.slice(2);
const queries = argQueries.length ? argQueries : ["Mati", "kow", "lodz", "ann", "zz"];
const ADMIN = { login: process.env.PARITY_ADMIN_LOGIN || "admin2", password: process.env.PARITY_ADMIN_PASSWORD || "Admin1234!" };
const TOP = 8;

async function open(base: string, isRef: boolean) {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  await page.goto(base);
  await page.getByLabel("Login").fill(ADMIN.login);
  await page.locator('input[type="password"]').fill(ADMIN.password);
  await page.getByRole("button", { name: "Zaloguj do systemu" }).click();
  await page.waitForTimeout(isRef ? 4000 : 1500);
  await page.getByRole("tab", { name: /Profile & Wykresy/ }).first().click();
  await page.waitForTimeout(isRef ? 2500 : 800);
  return { browser, page };
}

async function search(page: Page, isRef: boolean, q: string): Promise<string[]> {
  if (isRef) {
    // Streamlit selectbox (BaseWeb): click it, type, read the listbox options.
    const box = page.getByLabel("Wybierz członka do analizy wskaźników");
    await box.click();
    await page.keyboard.type(q);
    await page.waitForTimeout(600);
    const opts = await page.locator('[role="listbox"] [role="option"]').allTextContents();
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);
    return opts.map((t) => t.trim()).filter(Boolean);
  }
  const input = page.locator("input[name=profil-czlonek]");
  await input.click();
  await input.fill(q);
  await page.waitForTimeout(200);
  const opts = await page.locator('[id="profil-czlonek-list"] [role="option"]').allTextContents();
  await input.press("Escape");
  return opts.map((t) => t.trim());
}

const ref = await open(refBase, true);
const neu = await open(newBase, false);
let identicalTop1 = 0;
for (const q of queries) {
  const a = await search(ref.page, true, q);
  const b = await search(neu.page, false, q);
  const name = (s: string) => s.split(" (")[0];
  // The original's list is virtualized: only rendered rows are in the DOM, so compare those positions in order.
  // An empty result is shown as a single "No results" row in the original.
  const real = a.filter((x) => x !== "No results");
  const k = Math.min(real.length, b.length);
  const sameOrder = real.length === 0 ? b.length === 0 : real.slice(0, k).every((x, i) => x === b[i]);
  if (sameOrder) identicalTop1++;
  console.log(`\n"${q}": original rendered ${real.length}, new ${b.length}; first ${k} identical and in the same order: ${sameOrder}`);
  for (let i = 0; i < Math.min(TOP, Math.max(a.length, b.length)); i++) {
    console.log(`  ${String(i + 1).padStart(2)}. ${(name(a[i] ?? "—")).padEnd(28)} | ${name(b[i] ?? "—")}`);
  }
}
console.log(`\nIdentical ranked results for ${identicalTop1} of ${queries.length} queries.`);
await ref.browser.close();
await neu.browser.close();
