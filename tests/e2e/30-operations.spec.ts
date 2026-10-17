import { test, expect } from "@playwright/test";
import { expectToast, login, openTab, choose, optionsOf, selectRegion, selectUnit, USERS } from "./helpers";

test.describe.serial("operacje skarbnika", () => {
  test("rejestracja terminu głosowania z podglądem okna zbiórki i usuwanie", async ({ page }) => {
    await login(page, USERS.admin);
    await selectRegion(page, "Mazowsze");
    await selectUnit(page, "Koło Radom");
    await openTab(page, /Celestia & Głosowania/);
    await page.getByTestId("celestia-tabs").getByRole("tab", { name: /Rejestr Dni Głosowań/ }).click();
    await expect(page.getByText("Koło nie ma jeszcze zarejestrowanych terminów")).toBeVisible();
    await page.locator("#t-data").fill("2026-11-05");
    await page.locator("input[name=dni-przed]").fill("10");
    await page.locator("input[name=dni-po]").fill("3");
    await expect(page.getByText("od 2026-10-26 do 2026-11-05 (11 dni na terminową wpłatę) + poślizg do 2026-11-08 (3 dni)")).toBeVisible();
    await page.getByRole("button", { name: /Zarejestruj Termin Głosowania/ }).click();
    await expect(page.getByRole("alert")).toContainText("Wprowadź nazwę wydarzenia!");
    await page.locator("#t-nazwa").fill("Zebranie sprawozdawcze");
    await page.getByRole("button", { name: /Zarejestruj Termin Głosowania/ }).click();
    await expect(page.getByText("Pomyślnie zarejestrowano termin: 'Zebranie sprawozdawcze' (Głosowanie VDC).")).toBeVisible();
    const row = page.getByTestId("terminy-table").locator("tbody tr").first();
    await expect(row).toContainText("🗳️ Głosowanie");
    await expect(row).toContainText("2026-10-26 → 2026-11-05 (11 dni)");
    await expect(row).toContainText("3 dni (do 2026-11-08)");
    await expect(row).toContainText("Anna Administrator");
    // Upcoming meeting within 30 days now counts in the rating
    await page.getByTestId("celestia-tabs").getByRole("tab", { name: /Tablica Wiarygodności/ }).click();
    await expect(page.getByTestId("ranking-table")).not.toContainText("Brak głosowań");
    await page.getByTestId("celestia-tabs").getByRole("tab", { name: /Rejestr Dni Głosowań/ }).click();
    await page.getByTestId("btn-usun-termin").click();
    await expectToast(page, "Usunięto wybrany termin wymagalności");
    await expect(page.getByText("Koło nie ma jeszcze zarejestrowanych terminów")).toBeVisible();
  });

  test("księgowanie wpłaty, blokada duplikatu, edycja i usunięcie", async ({ page }) => {
    await login(page, USERS.national);
    await selectRegion(page, "Mazowsze");
    await selectUnit(page, "Koło Radom");
    await openTab(page, /Wpłaty Członków/);
    await choose(page, "w-czlonek", /Hanna Dąbrowska/);
    await page.locator("input[name=w-kwota]").fill("12.5");
    await page.locator("#w-notatka").fill("Test e2e");
    await page.getByRole("button", { name: "Zaksięguj wpłatę bezpośrednio" }).click();
    await expectToast(page, "Wpłata zarejestrowana bezpośrednio w księdze.");
    await expect(page.getByTestId("kolo-cards").getByTestId("bento-card").nth(1)).toContainText("108.50 PLN");
    await page.getByRole("button", { name: "Zaksięguj wpłatę bezpośrednio" }).click();
    await expect(page.getByRole("alert")).toContainText("Identyczna wpłata w ciągu ostatnich 60s");
    await page.getByRole("radio", { name: /Popraw \/ Usuń wpłatę/ }).check();
    await choose(page, "w-edit", /Test e2e/);
    await page.locator("input[name=e-kwota]").fill("20");
    await page.getByRole("button", { name: "Zastosuj operację" }).click();
    await expectToast(page, "Wpłata zaktualizowana.");
    await expect(page.getByTestId("kolo-cards").getByTestId("bento-card").nth(1)).toContainText("116.00 PLN");
    await page.getByRole("radio", { name: /Popraw \/ Usuń wpłatę/ }).check();
    await choose(page, "w-edit", /Test e2e/);
    await page.locator("input[name=e-del]").check();
    await page.getByRole("button", { name: "Zastosuj operację" }).click();
    await expectToast(page, "Wpłata usunięta.");
    await expect(page.getByTestId("kolo-cards").getByTestId("bento-card").nth(1)).toContainText("96.00 PLN");
  });

  test("deklaracja wpłaty przez skarbnika koła i akceptacja przez admina", async ({ page }) => {
    await login(page, USERS.unit);
    await openTab(page, /Wpłaty Członków/);
    await choose(page, "d-czlonek", /Dawid Zieliński/);
    await page.locator("input[name=d-kwota]").fill("18");
    await page.locator("#d-not").fill("Deklaracja e2e");
    await page.getByRole("radio", { name: /Nie dysponuję potwierdzeniem/ }).check();
    await page.getByRole("button", { name: "Wyślij wpłatę do zaakceptowania" }).click();
    await expectToast(page, "Wpłata została zgłoszona do kolejki akceptacji!");
    await expect(page.getByTestId("ostatnie-deklaracje").locator("tbody tr").first()).toContainText("BRAK_POTWIERDZENIA");
    await page.getByTestId("btn-logout").click();

    await login(page, USERS.admin);
    await expect(page.getByText("Wpłaty czekające na Twoją akceptację: 2")).toBeVisible();
    await openTab(page, /Wpłaty do zaakceptowania \(2\)/);
    const rows = page.getByTestId("pending-row");
    await expect(rows).toHaveCount(2);
    const mine = rows.filter({ hasText: "Dawid Zieliński" });
    await mine.getByRole("button", { name: /Akceptuj wpłatę/ }).click();
    await expectToast(page, "Zaksięgowano wpłatę.");
    await expect(page.getByTestId("pending-row")).toHaveCount(1);
    await page.getByTestId("pending-row").getByText("❌ Odrzuć wpłatę").click();
    await page.getByTestId("pending-row").getByRole("button", { name: "Potwierdź odrzucenie" }).click();
    await expectToast(page, "Wpłata odrzucona.");
    await expect(page.getByText("Brak oczekujących wpłat. Wszystkie transakcje są rozpatrzone!")).toBeVisible();
    await expect(page.getByText("Kolejka Weryfikacji:")).toHaveCount(0);
  });

  test("ręczne naliczenie, korekta salda, wydatek i korekta kasy", async ({ page }) => {
    await login(page, USERS.admin);
    await selectRegion(page, "Mazowsze");
    await selectUnit(page, "Koło Radom");
    await openTab(page, /Ręczne Naliczenia/);
    await choose(page, "n-czlonek", /Grzegorz Lis/);
    await page.locator("input[name=n-kwota]").fill("30");
    await page.locator("#n-tytul").fill("Składka zjazdowa");
    await page.getByRole("button", { name: "Zaksięguj naliczenie" }).click();
    await expectToast(page, "Zaksięgowano ręczne obciążenie.");
    await expect(page.getByTestId("zbiorcza-table")).toHaveCount(0);
    await openTab(page, /Tabela Zbiorcza/);
    await expect(page.getByTestId("zbiorcza-table").locator("tbody tr").first()).toContainText("30.00 zł (0 msc + 1 ręczne)");
    await expect(page.getByTestId("zbiorcza-table").locator("tbody tr").first()).toContainText("60.00 zł");

    await openTab(page, /Korekta Salda Osoby/);
    await choose(page, "k-czlonek", /Grzegorz Lis/);
    await page.locator("input[name=k-saldo]").fill("90");
    await page.getByRole("button", { name: "Zastosuj korektę członka" }).click();
    await expectToast(page, "Zaktualizowano saldo o deltę: +30.00 zł.");

    await openTab(page, /Kasa Koła & Wydatki/);
    await page.locator("input[name=wyd-kwota]").fill("16");
    await choose(page, "wyd-kat", "Sprzęt");
    await page.locator("#wyd-opis").fill("FV 1/2026");
    await page.getByRole("button", { name: "Zaksięguj wydatek" }).click();
    await expectToast(page, "Wydatek zaksięgowany.");
    await expect(page.getByTestId("kasa-cards").getByTestId("bento-card").nth(1)).toContainText("16.00 PLN");
    await expect(page.getByTestId("kasa-cards").getByTestId("bento-card").nth(2)).toContainText("80.00 PLN");
    await page.locator("input[name=kk-stan]").fill("100");
    await page.getByRole("button", { name: "Zastosuj korektę kasy" }).click();
    await expectToast(page, "Stan kasy zaktualizowany na dzień");
    await expect(page.getByTestId("kasa-cards").getByTestId("bento-card").nth(2)).toContainText("100.00 PLN");
    await expect(page.getByTestId("kasa-cards").getByTestId("bento-card").nth(2)).toContainText("(+20.00 PLN)");
    await expect(page.getByTestId("korekty-kasy-table").locator("tbody tr")).toHaveCount(1);
  });

  test("zarządzanie członkami: walidacja, dodanie, edycja parametrów krytycznych i usunięcie", async ({ page }) => {
    await login(page, USERS.admin);
    await selectRegion(page, "Małopolska");
    await selectUnit(page, "Koło Kraków");
    await openTab(page, /Zarządzaj Członkami/);
    await page.locator("#a-nazwa").fill("Zofia Testowa");
    await page.locator("#a-ur").fill("2020-01-01");
    await page.getByRole("button", { name: "Zapisz profil" }).click();
    await expect(page.getByRole("alert")).toContainText("co najmniej 13 lat");
    await page.locator("#a-ur").fill("1998-05-05");
    await page.locator("input[name=a-start]").fill("12");
    await choose(page, "a-param", "S");
    await page.getByRole("button", { name: "Zapisz profil" }).click();
    await expectToast(page, "Dodano członka: Zofia Testowa");
    await openTab(page, /Tabela Zbiorcza/);
    const row = page.getByTestId("zbiorcza-table").locator("tbody tr").filter({ hasText: "Zofia Testowa" });
    await expect(row).toContainText("Parametr S");
    await expect(row).toContainText("12.00 zł");

    await openTab(page, /Zarządzaj Członkami/);
    await page.getByRole("radio", { name: /Edytuj profil członka/ }).check();
    await choose(page, "e-czlonek", /Zofia Testowa/);
    await page.locator("input[name=e-start]").fill("50");
    await expect(page.getByText("Zmiana parametrów krytycznych przeliczy wstecznie KDI i naliczenia!")).toBeVisible();
    await page.getByRole("button", { name: "Zapisz zmiany w profilu" }).click();
    await expect(page.getByRole("alert").last()).toContainText("Zaznacz checkbox potwierdzający");
    await page.locator("input[name=e-confirm]").check();
    await page.getByRole("button", { name: "Zapisz zmiany w profilu" }).click();
    await expectToast(page, "Zaktualizowano dane członka.");

    await page.getByRole("radio", { name: /Usuń członka z koła/ }).check();
    await choose(page, "d-czlonek", /Zofia Testowa/);
    await page.locator("input[name=d-confirm]").check();
    await page.getByRole("button", { name: "🔥 Usuń trwale profil" }).click();
    await expectToast(page, "Profil usunięty.");
    expect((await optionsOf(page, "d-czlonek")).some((t) => t.includes("Zofia Testowa"))).toBe(false);
  });

  test("kalkulator liczy reaktywnie po stronie przeglądarki", async ({ page }) => {
    await login(page, USERS.admin);
    await openTab(page, /Kalkulator/);
    const result = page.getByTestId("calc-result");
    await expect(result.getByTestId("bento-card").nth(0)).toContainText("-237.00 PLN");
    await expect(result.getByTestId("bento-card").nth(2)).toContainText("NIE (ZAWIESZONY)");
    await expect(result.getByTestId("bento-card").nth(3)).toContainText("36 msc | Próg bieżący: M");
    await expect(page.getByText("Rozbicie naliczeń w okresie symulacji")).toBeVisible();
    await page.locator("input[name=calc-wpl]").fill("300");
    await expect(result.getByTestId("bento-card").nth(0)).toContainText("63.00 PLN");
    await expect(result.getByTestId("bento-card").nth(2)).toContainText("TAK (UPRAWNIONY)");
    await expect(page.getByText("Konto w pełni uregulowane.")).toBeVisible();
    await page.getByRole("radio", { name: /Ręczny wybór progu/ }).check();
    await choose(page, "calc-stawka", /S \(15.00/);
    await expect(result.getByTestId("bento-card").nth(3)).toContainText("Próg bieżący: S");
    await choose(page, "calc-funkcja", /Zarządu Krajowego/);
    await page.locator("input[name=calc-fn-msc]").fill("3");
    await expect(result.getByTestId("bento-card").nth(3)).toContainText("(+60.00 zł funkcyjne)");
  });
});

test.describe.serial("administracja", () => {
  test("struktura: region i koło, kosz, przywracanie i trwałe usuwanie", async ({ page }) => {
    await login(page, USERS.admin);
    await openTab(page, /Zarządzaj Strukturą/);
    await page.locator("#reg-nowy").fill("Mazowsze");
    await page.getByRole("button", { name: "➕ Utwórz Region" }).click();
    await expect(page.getByRole("alert")).toContainText("już istnieje");
    await page.locator("#reg-nowy").fill("Pomorze");
    await page.getByRole("button", { name: "➕ Utwórz Region" }).click();
    await expectToast(page, "Region 'Pomorze' został utworzony.");
    expect(await optionsOf(page, "region")).toContain("Pomorze");

    await page.getByTestId("struktura-tabs").getByRole("tab", { name: /Koła/ }).click();
    await page.locator("#kolo-nowe").fill("Koło Gdańsk");
    await choose(page, "kolo-nowe-reg", "Pomorze");
    await page.getByRole("button", { name: "➕ Utwórz Koło" }).click();
    await expectToast(page, "Koło 'Koło Gdańsk' zostało utworzone.");
    await choose(page, "kolo-ed", /Koło Gdańsk/);
    await page.locator("#kolo-ed-nazwa").fill("Koło Gdynia");
    await page.getByRole("button", { name: "💾 Zapisz zmiany w kole" }).click();
    await expectToast(page, "Zaktualizowano koło 'Koło Gdynia'.");

    await page.getByTestId("struktura-tabs").getByRole("tab", { name: /Regiony/ }).click();
    await choose(page, "reg-del", "Pomorze");
    await expect(page.getByText("Region 'Pomorze' posiada 1 aktywnych kół")).toBeVisible();
    await page.getByTestId("btn-region-kosz").click();
    await expect(page.getByRole("alert").last()).toContainText("Zaznacz checkbox");
    await page.locator("input[name=reg-del-ok]").check();
    await page.getByTestId("btn-region-kosz").click();
    await expectToast(page, "Region 'Pomorze' został przeniesiony do kosza.");

    await page.getByTestId("struktura-tabs").getByRole("tab", { name: /Kosz i Przywracanie/ }).click();
    await expect(page.getByTestId("kosz-kolo")).toContainText("Koło Gdynia");
    await expect(page.getByTestId("kosz-kolo")).toContainText("Region nadrzędny ('Pomorze') znajduje się w koszu");
    await page.getByTestId("kosz-kolo").getByRole("button", { name: /Przywróć koło/ }).click();
    await expect(page.getByRole("alert").first()).toContainText("Nie można przywrócić koła");
    await page.getByTestId("kosz-tabs").getByRole("tab", { name: /Regiony w Koszu/ }).click();
    await page.getByTestId("kosz-region").getByText("🔥 Trwałe usunięcie (Pomorze)").click();
    await page.getByTestId("kosz-region").locator("input[type=checkbox]").check();
    await page.getByTestId("kosz-region").getByRole("button", { name: /Usuń trwale z bazy/ }).click();
    await expectToast(page, "Region 'Pomorze' został trwale usunięty z bazy.");
    await expect(page.getByText("Kosz regionów jest pusty.")).toBeVisible();
    await page.getByTestId("kosz-tabs").getByRole("tab", { name: /Koła w Koszu/ }).click();
    await expect(page.getByText("Kosz kół jest pusty.")).toBeVisible();
  });

  test("panel Centauri: nowe konto, zmiana roli, blokada i wygaszenie sesji", async ({ page, browser }) => {
    await login(page, USERS.admin);
    await openTab(page, /Panel Centauri/);
    await expect(page.getByTestId("users-table").locator("tbody tr")).toHaveCount(5);
    await expect(page.getByTestId("users-table").locator("tbody tr").nth(1)).toContainText("🟢 Online");
    await page.getByTestId("centauri-tabs").getByRole("tab", { name: /Nowe Konto/ }).click();
    await page.locator("#n-login").fill("skarbnik_radom");
    await page.locator("#n-imie").fill("Radosław Radomski");
    await choose(page, "n-rola", "SKARBNIK_KOLA");
    await choose(page, "n-kolo", "Koło Radom");
    await page.getByTestId("btn-utworz-konto").click();
    await expectToast(page, "Utworzono konto: skarbnik_radom!");
    await page.getByTestId("centauri-tabs").getByRole("tab", { name: /Rejestr Użytkowników/ }).click();
    const row = page.getByTestId("users-table").locator("tbody tr").filter({ hasText: "skarbnik_radom" });
    await expect(row).toContainText("Koło: Koło Radom");

    // The new account logs in from a second browser context and must change its password first
    const ctx = await browser.newContext();
    const other = await ctx.newPage();
    await other.goto("/");
    await other.getByLabel("Login").fill("skarbnik_radom");
    await other.locator("#haslo").fill("Citadel2026!");
    await other.getByRole("button", { name: "Zaloguj do systemu" }).click();
    await expect(other.getByText("Twoje konto wymaga zmiany hasła")).toBeVisible();
    await other.locator("#np1").fill("RadomRadom1!");
    await other.locator("#np2").fill("RadomRadom1!");
    await other.getByRole("button", { name: "Zapisz nowe hasło i przejdź do systemu" }).click();
    await expect(other.getByTestId("header")).toContainText("Radosław Radomski");

    // Admin blocks the account → the other session expires on its next request
    await choose(page, "u-blok", /skarbnik_radom/);
    await page.getByRole("button", { name: "🔴 Zablokuj dostęp" }).click();
    await expectToast(page, "Zaktualizowano status konta: skarbnik_radom.");
    await other.getByRole("tab", { name: /Profile & Wykresy/ }).click();
    await expect(other.getByText("Twoja sesja wygasła lub konto zostało zablokowane")).toBeVisible({ timeout: 30_000 });
    await ctx.close();

    await choose(page, "u-rola", /skarbnik_radom/);
    await choose(page, "u-nowa-rola", "SKARBNIK_REGIONU");
    await page.getByRole("button", { name: "Zastosuj nową rolę" }).click();
    await expectToast(page, "Uprawnienia zostały zaktualizowane.");
    await expect(row).toContainText("📊 Region");
  });

  test("logi audytowe i kopia zapasowa", async ({ page }) => {
    await login(page, USERS.admin);
    await openTab(page, /Logi Audytowe/);
    await expect(page.getByTestId("audit-table").locator("tbody tr").first()).toBeVisible();
    await choose(page, "audit-tabela", "uzytkownicy");
    await expect(page.getByTestId("audit-table").locator("tbody tr").first()).toContainText("uzytkownicy");
    await page.getByTestId("audyt-tabs").getByRole("tab", { name: /Rejestr Wpłat/ }).click();
    await expect(page.getByTestId("rejestr-wplat").locator("tbody tr").first()).toBeVisible();
    await page.getByTestId("audyt-tabs").getByRole("tab", { name: /Kopia Zapasowa/ }).click();
    await page.getByTestId("btn-backup").click();
    await expect(page.getByText(/Zrzut gotowy! Rozmiar: [\d.]+ KB/)).toBeVisible();
    const [download] = await Promise.all([page.waitForEvent("download"), page.getByTestId("btn-backup-download").click()]);
    expect(download.suggestedFilename()).toMatch(/^citadel_backup_\d{8}_\d{6}\.sql$/);
  });
});
