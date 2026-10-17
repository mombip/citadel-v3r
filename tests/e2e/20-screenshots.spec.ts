/**
 * Captures a full walkthrough of the application into tests/e2e/screenshots/new for comparison with
 * the reference captures from the original Streamlit app (scripts/capture-reference.ts).
 */
import { test } from "@playwright/test";
import { login, openTab, USERS } from "./helpers";

const shot = (page: any, name: string) => page.screenshot({ path: `tests/e2e/screenshots/new/${name}.png`, fullPage: true });

test("walkthrough screenshots", async ({ page }) => {
  await page.goto("/");
  await shot(page, "00-login");
  await login(page, USERS.admin);
  await shot(page, "01-kolo-zbiorcza");
  for (const [name, file] of [
    ["Profile & Wykresy", "02-kolo-profile"], ["Celestia & Głosowania", "03-kolo-celestia"], ["Wpłaty Członków", "04-kolo-wplaty"],
    ["Ręczne Naliczenia", "05-kolo-reczne"], ["Kasa Koła & Wydatki", "06-kolo-kasa"], ["Korekta Salda Osoby", "07-kolo-korekty"],
    ["Zarządzaj Członkami", "08-kolo-czlonkowie"], ["Kalkulator", "09-kolo-kalkulator"], ["Wpłaty do zaakceptowania", "10-kolo-akceptacje"],
    ["Zarządzaj Strukturą", "11-kolo-struktura"], ["Logi Audytowe", "12-kolo-audyt"], ["Panel Centauri", "13-kolo-centauri"],
  ] as const) {
    await openTab(page, new RegExp(name.replace(/[&()]/g, "\\$&")));
    await page.waitForTimeout(1200);
    await shot(page, file);
  }
  await page.getByRole("radio", { name: "📊 Statystyki Regionu" }).check();
  await page.waitForTimeout(1000);
  await shot(page, "20-region");
  await page.getByRole("radio", { name: "🇵🇱 Statystyki Kraju" }).check();
  await page.waitForTimeout(1000);
  await shot(page, "21-kraj");
  await page.getByTestId("btn-theme").click();
  await shot(page, "30-kraj-dark-mono");
  await page.getByTestId("btn-theme").click();
  await shot(page, "32-kraj-light-mono");
});
