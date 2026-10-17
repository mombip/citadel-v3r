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
  await choose(page, "kolo", name);
  await expect(page.locator(".caption").first()).toContainText(`Aktywna jednostka: ${name}`);
}

export async function selectRegion(page: Page, name: string) {
  await choose(page, "region", name);
}

export async function expectToast(page: Page, text: string | RegExp) {
  await expect(page.locator(".toast-stack")).toContainText(text);
}

/**
 * Picks an option in a searchable dropdown (Streamlit-like selectbox). `option` is the exact label or a pattern;
 * `type` optionally types a search query first (fuzzy matching, e.g. "alnow" finds "Alicja Nowak").
 */
export async function choose(page: Page, name: string, option: string | RegExp, opts: { type?: string } = {}) {
  const input = page.locator(`input[name="${name}"]`);
  await input.click();
  if (opts.type !== undefined) await input.fill(opts.type);
  const list = page.locator(`[id="${name}-list"]`);
  const target = typeof option === "string"
    ? list.getByRole("option", { name: option, exact: true })
    : list.getByRole("option", { name: option }).first();
  await target.click();
  await expect(list).toBeHidden();
}

/** Labels of all options in a searchable dropdown (opens and closes it). */
export async function optionsOf(page: Page, name: string): Promise<string[]> {
  const input = page.locator(`input[name="${name}"]`);
  await input.click();
  const texts = await page.locator(`[id="${name}-list"] [role="option"]`).allTextContents();
  await input.press("Escape");
  return texts.map((t) => t.trim());
}
