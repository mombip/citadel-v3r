/**
 * Downloads the "Kopia Zapasowa (.sql)" backup through the UI of either app.
 * Usage: npx tsx scripts/ops-diff/backup.ts <ref|new> <baseUrl> <out.sql>
 */
import { chromium } from "@playwright/test";

const [kind, base, out] = process.argv.slice(2);
const isRef = kind === "ref";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 1100 }, acceptDownloads: true });
const settle = async () => {
  await page.waitForTimeout(isRef ? 400 : 200);
  if (isRef) await page.locator('[data-testid="stStatusWidget"]').waitFor({ state: "hidden", timeout: 60_000 }).catch(() => {});
  await page.waitForTimeout(isRef ? 400 : 100);
};
const vis = (l: ReturnType<typeof page.locator>) => l.and(page.locator(":visible")).first();
for (let attempt = 1; ; attempt++) {
  try { await page.goto(base, { timeout: 45_000 }); break; } catch (e) { if (attempt >= 4) throw e; await page.waitForTimeout(5000 * attempt); }
}
await settle();
await page.getByLabel("Login").fill(process.env.OPS_ADMIN_LOGIN || "parity_admin");
await page.locator('input[type="password"]').fill(process.env.OPS_ADMIN_PASSWORD || "Parity1234!");
await page.getByRole("button", { name: "Zaloguj do systemu" }).click();
await page.waitForTimeout(isRef ? 2500 : 800);
await settle();
await vis(page.getByRole("tab", { name: /Logi Audytowe/ })).click();
await settle();
await vis(page.getByRole("tab", { name: /Kopia Zapasowa/ })).click();
await settle();
await vis(page.getByRole("button", { name: "🚀 Wygeneruj zrzut bazy (.sql)" })).click();
await settle();
const [download] = await Promise.all([
  page.waitForEvent("download"),
  // a button in the original, a download link in the new app
  vis(page.getByText("📥 Pobierz plik bazy (.sql)", { exact: true })).click(),
]);
await download.saveAs(out);
console.log(`${kind}: ${download.suggestedFilename()} -> ${out}`);
await browser.close();
