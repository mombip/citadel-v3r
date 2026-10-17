import { test, expect } from "@playwright/test";
import { login, USERS } from "./helpers";

test.describe("logowanie i sesja", () => {
  test("ekran logowania wygląda jak w oryginale i odrzuca złe hasło", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator(".login-header-card h2")).toHaveText("CITADEL FOR NG");
    await expect(page.getByText("System Ewidencji Składek i Finansów")).toBeVisible();
    await expect(page.getByRole("button", { name: /Motyw: 💜 Fiolet/ })).toBeVisible();
    await page.getByLabel("Login").fill("admin2");
    await page.locator("#haslo").fill("zle-haslo");
    await page.getByRole("button", { name: "Zaloguj do systemu" }).click();
    await expect(page.getByRole("alert")).toContainText("Nieprawidłowy login lub hasło.");
  });

  test("przełącznik motywów cyklicznie zmienia Fiolet → Ciemny → Jasny", async ({ page }) => {
    await page.goto("/");
    const btn = page.getByRole("button", { name: /Motyw:/ });
    await expect(page.locator("html")).toHaveAttribute("data-theme", "fiolet");
    await btn.click();
    await expect(btn).toHaveText(/Ciemny/);
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark_mono");
    await btn.click();
    await expect(btn).toHaveText(/Jasny/);
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light_mono");
    await btn.click();
    await expect(btn).toHaveText(/Fiolet/);
  });

  test("domyślny admin musi zmienić hasło startowe", async ({ page }) => {
    await page.goto("/");
    await page.getByLabel("Login").fill("admin");
    await page.locator("#haslo").fill("Centauri2026!");
    await page.getByRole("button", { name: "Zaloguj do systemu" }).click();
    await expect(page.getByText("Twoje konto wymaga zmiany hasła")).toBeVisible();
    await page.locator("#np1").fill("short");
    await page.locator("#np2").fill("short");
    await page.getByRole("button", { name: "Zapisz nowe hasło i przejdź do systemu" }).click();
    await expect(page.getByRole("alert")).toContainText("co najmniej 8 znaków");
    await page.locator("#np1").fill("NoweHaslo123!");
    await page.locator("#np2").fill("NoweHaslo123!");
    await page.getByRole("button", { name: "Zapisz nowe hasło i przejdź do systemu" }).click();
    await expect(page.getByTestId("header")).toContainText("Super Administrator");
    await page.getByTestId("btn-logout").click();
    await expect(page.getByLabel("Login")).toBeVisible();
    await page.getByLabel("Login").fill("admin");
    await page.locator("#haslo").fill("NoweHaslo123!");
    await page.getByRole("button", { name: "Zaloguj do systemu" }).click();
    await expect(page.getByTestId("header")).toContainText("Super Administrator");
  });

  test("wylogowanie wraca do ekranu logowania", async ({ page }) => {
    await login(page, USERS.admin);
    await page.getByTestId("btn-logout").click();
    await expect(page.getByRole("button", { name: "Zaloguj do systemu" })).toBeVisible();
  });
});
