/**
 * Captures reference screenshots of the ORIGINAL Streamlit application for visual comparison.
 * Usage: npx tsx scripts/capture-reference.ts http://localhost:8601 tests/e2e/screenshots/reference
 */
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
const ADMIN = { login: process.env.PARITY_ADMIN_LOGIN || "admin2", password: process.env.PARITY_ADMIN_PASSWORD || "Admin1234!" };
const UNIT = { login: process.env.PARITY_UNIT_LOGIN || "kolo_waw", password: process.env.PARITY_UNIT_PASSWORD || "Kolo1234!" };

const base = process.argv[2] || "http://localhost:8601";
const out = process.argv[3] || "tests/e2e/screenshots/reference";
mkdirSync(out, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const shot = async (name: string, full = true) => {
  await page.waitForTimeout(1500);
  await page.screenshot({ path: join(out, `${name}.png`), fullPage: full });
  console.log("captured", name);
};
const settle = async () => {
  await page.waitForTimeout(800);
  await page.locator('[data-testid="stStatusWidget"]').waitFor({ state: "hidden", timeout: 30_000 }).catch(() => {});
  await page.waitForTimeout(700);
};

await page.goto(base);
await settle();
await shot("00-login");
await page.getByLabel("Login").fill(ADMIN.login);
await page.locator('input[type="password"]').fill(ADMIN.password);
await page.getByRole("button", { name: "Zaloguj do systemu" }).click();
await settle();
await page.waitForTimeout(3000);
// Both apps open the first region by Polish collation (reference DB uses ICU pl-PL), so no override is needed.
await shot("01-kolo-zbiorcza");

const tabs = [
  ["Profile & Wykresy", "02-kolo-profile"],
  ["Celestia & Głosowania", "03-kolo-celestia"],
  ["Wpłaty Członków", "04-kolo-wplaty"],
  ["Ręczne Naliczenia", "05-kolo-reczne"],
  ["Kasa Koła & Wydatki", "06-kolo-kasa"],
  ["Korekta Salda Osoby", "07-kolo-korekty"],
  ["Zarządzaj Członkami", "08-kolo-czlonkowie"],
  ["Kalkulator", "09-kolo-kalkulator"],
  ["Wpłaty do zaakceptowania", "10-kolo-akceptacje"],
  ["Zarządzaj Strukturą", "11-kolo-struktura"],
  ["Logi Audytowe", "12-kolo-audyt"],
  ["Panel Centauri", "13-kolo-centauri"],
];
for (const [label, name] of tabs) {
  const tab = page.getByRole("tab", { name: new RegExp(label.replace(/[&]/g, "\\$&")) }).first();
  await tab.click();
  await settle();
  await shot(name);
}
// Celestia second sub-tab (register of due dates)
await page.getByRole("tab", { name: /Celestia & Głosowania/ }).first().click();
await settle();
await page.getByRole("tab", { name: /Rejestr Dni Głosowań/ }).first().click();
await settle();
await shot("03b-kolo-celestia-rejestr");

await page.getByText("📊 Statystyki Regionu", { exact: true }).click();
await settle();
await shot("20-region");
await page.getByText("🇵🇱 Statystyki Kraju", { exact: true }).click();
await settle();
await shot("21-kraj");
await page.getByRole("tab", { name: /Porównanie KDI Regionów/ }).click();
await settle();
await shot("21b-kraj-wykres");

// Themes
await page.getByRole("button", { name: /Fiolet/ }).click();
await settle();
await shot("30-kraj-dark-mono");
await page.getByText("🏢 Koło", { exact: true }).first().click();
await settle();
await shot("31-kolo-dark-mono");
await page.getByRole("button", { name: /Ciemny/ }).click();
await settle();
await shot("32-kolo-light-mono");
await page.getByRole("tab", { name: /Celestia & Głosowania/ }).first().click();
await settle();
await shot("33-celestia-light-mono");
await page.getByRole("button", { name: /Jasny/ }).click();
await settle();

// Unit treasurer perspective
await page.getByRole("button", { name: "Wyloguj" }).click();
await settle();
await page.getByLabel("Login").fill(UNIT.login);
await page.locator('input[type="password"]').fill(UNIT.password);
await page.getByRole("button", { name: "Zaloguj do systemu" }).click();
await settle();
await page.waitForTimeout(2500);
await shot("40-skarbnik-kola");
await page.getByRole("tab", { name: /Wpłaty Członków/ }).first().click();
await settle();
await shot("41-skarbnik-kola-wplaty");

await browser.close();
