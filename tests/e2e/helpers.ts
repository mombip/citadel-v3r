import { expect, type Page } from "@playwright/test";

export const USERS = {
  admin: { login: "admin2", password: "Admin1234!", name: "Anna Administrator" },
  national: { login: "krajowy", password: "Krajowy1234!", name: "Krzysztof Krajowy" },
  region: { login: "region_maz", password: "Region1234!", name: "Renata Regionalna" },
  unit: { login: "kolo_waw", password: "Kolo1234!", name: "Karol Kołowy" },
};

export async function login(page: Page, user: { login: string; password: string; name: string }) {
  await page.goto("/");
  await page.getByLabel("Login").fill(user.login);
  await page.locator("#haslo").fill(user.password);
  await page.getByRole("button", { name: "Zaloguj do systemu" }).click();
  await expect(page.getByTestId("header")).toContainText(user.name);
}

export async function openTab(page: Page, name: string | RegExp) {
  await page.getByTestId("kolo-tabs").getByRole("tab", { name }).click();
}

export async function selectUnit(page: Page, name: string) {
  await page.locator("select[name=kolo]").selectOption({ label: name });
  await expect(page.locator(".caption").first()).toContainText(`Aktywna jednostka: ${name}`);
}

export async function selectRegion(page: Page, name: string) {
  await page.locator("select[name=region]").selectOption({ label: name });
}

export async function expectToast(page: Page, text: string | RegExp) {
  await expect(page.locator(".toast-stack")).toContainText(text);
}

/** Selects the first <option> whose label matches the pattern (Playwright's selectOption only takes exact strings). */
export async function selectMatching(page: Page, selector: string, pattern: RegExp) {
  const select = page.locator(selector);
  await expect(select).toBeVisible();
  const labels = await select.locator("option").allTextContents();
  const idx = labels.findIndex((l) => pattern.test(l));
  if (idx < 0) throw new Error(`No option matching ${pattern} in ${selector}: ${labels.join(" | ")}`);
  await select.selectOption({ index: idx });
}
