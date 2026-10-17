import { test, expect } from "@playwright/test";
import { login, openTab, selectMatching, selectRegion, selectUnit, USERS } from "./helpers";

test.describe("widoki: koło / region / kraj", () => {
  test("admin widzi pełny nagłówek, kolejkę i wszystkie zakładki koła", async ({ page }) => {
    await login(page, USERS.admin);
    await expect(page.getByTestId("user-pill")).toHaveText("👑 Admin");
    await expect(page.getByText("Kolejka Weryfikacji:")).toBeVisible();
    await expect(page.locator("select[name=kraj]")).toHaveValue("1");
    const tabs = page.getByTestId("kolo-tabs").getByRole("tab");
    await expect(tabs).toHaveText([
      "📊 Tabela Zbiorcza", "📈 Profile & Wykresy", "⭐ Celestia & Głosowania", "💰 Wpłaty Członków", "📝 Ręczne Naliczenia",
      "💳 Kasa Koła & Wydatki", "🛠️ Korekta Salda Osoby", "👤 Zarządzaj Członkami", "🧮 Kalkulator", "📥 Wpłaty do zaakceptowania (1)",
      "🏛️ Zarządzaj Strukturą", "📜 Logi Audytowe", "🏛️ Panel Centauri",
    ]);
  });

  test("tabela zbiorcza Koła Warszawa pokazuje salda, KDI i ratingi Celestia", async ({ page }) => {
    await login(page, USERS.admin);
    await selectRegion(page, "Mazowsze");
    await selectUnit(page, "Koło Warszawa");
    const cards = page.getByTestId("kolo-cards").getByTestId("bento-card");
    await expect(cards.nth(0)).toContainText("123.50 PLN");
    await expect(cards.nth(1)).toContainText("249.00 PLN");
    await expect(cards.nth(2)).toContainText("1.77");
    await expect(cards.nth(2)).toContainText("(próg: ≤ 1.58)");
    await expect(cards.nth(3)).toContainText("5 / 6");
    const table = page.getByTestId("zbiorcza-table");
    const rows = table.locator("tbody tr");
    await expect(rows).toHaveCount(6);
    await expect(rows.nth(0)).toContainText("Alicja Nowak");
    await expect(rows.nth(0)).toContainText("AAA");
    await expect(rows.nth(4)).toContainText("Ewa Mazur");
    await expect(rows.nth(4)).toContainText("-411.00 zł");
    await expect(rows.nth(4)).toContainText("46.67");
    await expect(rows.nth(4)).toContainText("NIE");
    await expect(rows.nth(4).locator("td").last()).toHaveCSS("color", "rgb(244, 63, 94)");
  });

  test("profil członka: baner, wykresy i audyt Celestia", async ({ page }) => {
    await login(page, USERS.admin);
    await selectRegion(page, "Mazowsze");
    await selectUnit(page, "Koło Warszawa");
    await openTab(page, /Profile & Wykresy/);
    await selectMatching(page, "select[name=profil-czlonek]", /Alicja Nowak/);
    await expect(page.getByTestId("profile-banner")).toContainText("AAA");
    await expect(page.getByTestId("plot").locator(".main-svg").first()).toBeVisible();
    await page.getByRole("radio", { name: "M1" }).check();
    await page.getByTestId("profile-chart-tabs").getByRole("tab", { name: /Dynamika/ }).click();
    await expect(page.getByTestId("plot").locator(".main-svg").first()).toBeVisible();
    await expect(page.getByTestId("hist-wplaty").locator("tbody tr")).toHaveCount(4);
    await expect(page.getByTestId("celestia-pillars").getByTestId("bento-card").nth(0)).toContainText("W oparciu o");
    await expect(page.getByTestId("audyt-glosowan").locator("tbody tr").first()).toContainText("Wybory Władz Koła");
    await expect(page.getByTestId("audyt-kwartalny").locator("tbody tr")).toHaveCount(1);
  });

  test("statystyki regionu i kraju", async ({ page }) => {
    await login(page, USERS.admin);
    await page.getByRole("radio", { name: "📊 Statystyki Regionu" }).check();
    await selectRegion(page, "Mazowsze");
    await expect(page.getByRole("heading", { name: /Pulpit Analityczny: Mazowsze/ })).toBeVisible();
    await expect(page.getByTestId("region-table").locator("tbody tr")).toHaveText([/Koło Radom/, /Koło Warszawa/]);
    await page.getByTestId("region-tabs").getByRole("tab", { name: /Porównanie KDI Kół/ }).click();
    await expect(page.getByTestId("plot").locator(".main-svg").first()).toBeVisible();

    await page.getByRole("radio", { name: "🇵🇱 Statystyki Kraju" }).check();
    await expect(page.getByRole("heading", { name: /Statystyki Ogólnokrajowe: Polska/ })).toBeVisible();
    await expect(page.getByText("Wykryto 1 koła bez przypisanego regionu")).toBeVisible();
    const cards = page.getByTestId("kraj-cards").getByTestId("bento-card");
    await expect(cards.nth(0)).toContainText("246.50 PLN");
    await expect(cards.nth(3)).toContainText("9 / 11");
    await expect(page.getByTestId("kraj-table").locator("tbody tr").filter({ hasText: "Mazowsze" })).toContainText("2");
    await expect(page.getByTestId("kraj-table").locator("tbody tr").filter({ hasText: "Małopolska" })).toContainText("14.29");
    await expect(page.getByTestId("kraj-table")).toContainText("Bez regionu (nieprzypisane)");
    await selectRegion(page, "⚠️ Bez regionu (1)");
    await page.getByRole("radio", { name: "🏢 Koło" }).check();
    await expect(page.locator("select[name=kolo] option")).toHaveText(["Koło Bez Regionu"]);
  });

  test("skarbnik koła widzi tylko swoje koło i ograniczone zakładki", async ({ page }) => {
    await login(page, USERS.unit);
    await expect(page.getByText("🔒 Dostęp do własnego Koła")).toBeVisible();
    await expect(page.locator("select[name=kolo]")).toBeDisabled();
    await expect(page.locator("select[name=kolo]")).toContainText("Koło Warszawa");
    await expect(page.getByTestId("kolo-tabs").getByRole("tab")).toHaveCount(7);
    await expect(page.getByText("Kolejka Weryfikacji:")).toHaveCount(0);
    await openTab(page, /Wpłaty Członków/);
    await expect(page.getByRole("heading", { name: /Zadeklaruj Wpłatę Członka/ })).toBeVisible();
    await expect(page.getByTestId("ostatnie-deklaracje").locator("tbody tr")).toHaveCount(2);
  });

  test("skarbnik regionu ma dwa poziomy analityczne i zablokowany region", async ({ page }) => {
    await login(page, USERS.region);
    await expect(page.locator("select[name=region]")).toBeDisabled();
    await expect(page.getByRole("radio")).toHaveCount(2);
    await expect(page.locator("select[name=kolo] option")).toHaveText(["Koło Radom", "Koło Warszawa"]);
    await expect(page.getByTestId("kolo-tabs").getByRole("tab")).toHaveCount(7);
  });

  test("motywy Ciemny i Jasny przebarwiają karty i tabele", async ({ page }) => {
    await login(page, USERS.admin);
    await page.getByTestId("btn-theme").click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark_mono");
    await expect(page.locator("body")).toHaveCSS("background-color", "rgb(20, 20, 22)");
    await page.getByTestId("btn-theme").click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light_mono");
    await expect(page.locator("body")).toHaveCSS("background-color", "rgb(248, 250, 252)");
    await expect(page.locator(".bento-card").first()).toHaveCSS("background-color", "rgb(255, 255, 255)");
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light_mono");
  });
});
