/**
 * Functional differential test: runs the SAME sequence of write operations through the UI of either app.
 * Run it once against the original (Streamlit) and once against the new app, each on its own identical copy of the
 * database, then compare both databases with diff-db.ts. Validation/error messages shown by each app are recorded
 * to a JSON file so they can be compared as well.
 *
 * Usage: npx tsx scripts/ops-diff/scenario.ts <ref|new> <baseUrl> <out.json> [stepName ...]
 */
import { chromium, type Locator, type Page } from "@playwright/test";
import { writeFileSync } from "node:fs";

const [kind, base, outFile, ...only] = process.argv.slice(2);
const isRef = kind === "ref";
const ADMIN = { login: process.env.OPS_ADMIN_LOGIN || "parity_admin", password: process.env.OPS_ADMIN_PASSWORD || "Parity1234!" };
const UNIT = { login: process.env.OPS_UNIT_LOGIN || "parity_kolo", password: process.env.OPS_UNIT_PASSWORD || "Parity1234!" };

const browser = await chromium.launch();
let page: Page = await browser.newPage({ viewport: { width: 1600, height: 1100 } });
const messages: Record<string, string[]> = {};
let currentStep = "";

// ------------------------------------------------------------------ widget adapter (same calls for both apps)
const vis = (l: Locator) => l.and(page.locator(":visible")).first();
async function settle() {
  if (!isRef) return void (await page.waitForTimeout(250));
  await page.waitForTimeout(350);
  await page.locator('[data-testid="stStatusWidget"]').waitFor({ state: "hidden", timeout: 30_000 }).catch(() => {});
  await page.waitForTimeout(450);
}
const field = (label: string) => vis(page.getByLabel(label, { exact: true }));

async function text(label: string, value: string) {
  const f = field(label);
  await f.fill(value);
  if (isRef) await f.press("Tab");
  await settle();
}
async function number(label: string, value: number) {
  const f = field(label);
  await f.fill(String(value));
  if (isRef) await f.press("Tab");
  await settle();
}
async function date(label: string, iso: string) {
  const f = field(label);
  if (isRef) {
    // Streamlit's date input is a react-aria DateField: three spinbutton segments (year / month / day).
    const segs = f.getByRole("spinbutton");
    const [y, m, d] = iso.split("-");
    for (const [i, v] of [[0, y], [1, m], [2, d]] as const) {
      await segs.nth(i).click();
      await page.keyboard.type(v);
    }
    await page.keyboard.press("Tab");
    const shown = await segs.evaluateAll((es) => es.map((e) => e.textContent).join("-"));
    if (shown !== iso) throw new Error(`date ${label}: wanted ${iso}, field shows ${shown}`);
  } else {
    await f.fill(iso);
  }
  await settle();
}
/** Types a search query into a dropdown and picks the first option matching `match`. */
async function select(label: string, query: string, match: string | RegExp = query) {
  const f = field(label);
  await f.click();
  if (isRef) await page.keyboard.type(query);
  else await f.fill(query);
  await page.waitForTimeout(isRef ? 500 : 150);
  const opt = vis(page.getByRole("option").filter({ hasText: match }));
  await opt.click();
  await settle();
}
/** Ensures a checkbox is ticked (the original keeps keyed checkboxes ticked across actions, so never blindly toggle). */
async function check(label: string) {
  if (isRef) {
    const box = vis(page.getByRole("checkbox", { name: label, exact: true }));
    if (!(await box.isChecked())) await vis(page.getByText(label, { exact: true })).click();
  } else await field(label).check();
  await settle();
}
async function radio(option: string) {
  if (isRef) await vis(page.getByText(option, { exact: true })).click();
  else await vis(page.getByRole("radio", { name: option, exact: true })).check();
  await settle();
}
/** Tabs opened since the last main-tab switch. Streamlit may re-create the tab bar after a rerun and fall back to
 *  the first tab (an original quirk); the driver then reopens the same path so both apps continue in the same place. */
let tabPath: (string | RegExp)[] = [];
/** Streamlit re-creates key-less dropdowns when their options change (e.g. a new region), which resets the active
 *  region/unit to the first option — an original quirk. Put the admin back on the scenario's region and unit. */
async function restoreContext() {
  const box = (label: string) => page.locator('[data-testid="stSelectbox"]').filter({ hasText: label }).and(page.locator(":visible")).first();
  for (const [label, want] of [["Aktywny Region:", "Region Łodź"], ["Wybierz Koło z regionu", "Koło NG Łódź"]] as const) {
    const b = box(label);
    if (!(await b.count())) continue;
    if ((await b.getAttribute("aria-disabled")) === "true" || (await b.locator("input[disabled]").count())) continue;
    if ((await b.innerText()).includes(want)) continue;
    await b.locator('[role="combobox"], input').first().click();
    await page.keyboard.type(want);
    await page.waitForTimeout(500);
    await vis(page.getByRole("option").filter({ hasText: want })).click();
    await settle();
  }
}
async function restoreTabs() {
  if (!isRef || !tabPath.length) return;
  await restoreContext();
  for (const t of tabPath) {
    const selected = await page.getByRole("tab", { name: t, selected: true }).and(page.locator(":visible")).count();
    if (!selected) {
      await vis(page.getByRole("tab", { name: t })).click();
      await settle();
    }
  }
}
async function button(name: string | RegExp) {
  await vis(page.getByRole("button", { name, exact: typeof name === "string" })).click();
  await settle();
  if (!isRef) await page.waitForTimeout(400);
  await restoreTabs();
}
/** Opens a tab at the given depth of the tab path (0 = unit tabs, 1 = sub-tabs, 2 = sub-sub-tabs). */
async function tab(name: string | RegExp, depth = 1) {
  tabPath = tabPath.slice(0, depth);
  await vis(page.getByRole("tab", { name })).click();
  await settle();
  tabPath.push(name);
}
async function expander(name: string) {
  await vis(page.getByText(name, { exact: true })).click();
  await settle();
}
/** Records the error/warning messages currently shown (success toasts of the original vanish on rerun). */
async function record(tag: string) {
  const sel = isRef ? '[data-testid="stAlert"], [data-testid="stToast"]' : '.alert, .toast-stack .toast';
  const texts = await page.locator(sel).and(page.locator(":visible")).allInnerTexts();
  const wanted = texts.map((t) => t.replace(/\s+/g, " ").trim()).filter((t) => /⚠️|❌|już istnieje|wymagan|Zaznacz|Musisz|Min\.|Potwierdź|nie może|Identyczna|Nie można|co najmniej|Wprowadź|Wypełnij|identyczne|musi mieć|Nieprawidłowy|zablokowane/.test(t));
  (messages[`${currentStep}: ${tag}`] ??= []).push(...wanted);
}
/** Records the calculator's result cards and summary alerts (read-only computation in both apps). */
async function snapshot(tag: string) {
  await page.waitForTimeout(isRef ? 300 : 300);
  const cards = (await page.locator(".bento-card").and(page.locator(":visible")).allInnerTexts()).slice(-4);
  const sel = isRef ? '[data-testid="stAlert"]' : '.alert';
  const alerts = (await page.locator(sel).and(page.locator(":visible")).allInnerTexts()).filter((t) => /Rozbicie|Konto|Zadłużenie|Brak prawa|PRAWO|ZAWIESZ/i.test(t));
  messages[`${currentStep}: ${tag}`] = [...cards, ...alerts].map((t) => t.replace(/\s+/g, " ").trim());
}
/** Records the data of every visible Plotly chart (trace type/name, x and y), normalised for serialisation differences. */
async function plots(tag: string) {
  await page.waitForTimeout(isRef ? 1200 : 600);
  const data = await page.evaluate(`(() => {
    const norm = (v) => {
      if (v == null) return null;
      if (typeof v === "number") return Math.round(v * 1e6) / 1e6;
      if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0, 10);
      return v;
    };
    const arr = (a) => (a == null ? null : Array.from(a, norm));
    return [...document.querySelectorAll(".js-plotly-plot")]
      .filter((gd) => gd.offsetParent !== null && gd.data)
      .map((gd) => gd.data.map((t) => ({ type: t.type || "scatter", name: t.name ?? null, x: arr(t.x), y: arr(t.y) })));
  })()`);
  messages[`${currentStep}: ${tag}`] = [JSON.stringify(data)];
}
async function login(user: { login: string; password: string }) {
  tabPath = [];
  await page.goto(base);
  await settle();
  await page.getByLabel("Login").fill(user.login);
  await page.locator('input[type="password"]').fill(user.password);
  await page.getByRole("button", { name: "Zaloguj do systemu" }).click();
  await page.waitForTimeout(isRef ? 2500 : 800);
  await settle();
}
async function logout() {
  tabPath = [];
  await button("Wyloguj");
  await page.waitForTimeout(isRef ? 1500 : 300);
}
const kolaTab = (name: RegExp) => tab(name, 0);

// ------------------------------------------------------------------ scenario
const steps: Record<string, () => Promise<void>> = {
  async wplaty() {
    await login(ADMIN);
    await kolaTab(/Wpłaty Członków/);
    await select("Członek", "Paulina", /Paulina Celińska/);
    await number("Kwota wpłaty (PLN)", 12.5);
    await date("Data wpływu", "2026-10-10");
    await text("Tytuł / Notatka", "Diff wpłata A");
    await button("Zaksięguj wpłatę bezpośrednio");
    // the same amount for the same member within 60 s is blocked unless confirmed
    await select("Członek", "Paulina", /Paulina Celińska/);
    await number("Kwota wpłaty (PLN)", 12.5);
    await text("Tytuł / Notatka", "Diff wpłata B");
    await button("Zaksięguj wpłatę bezpośrednio");
    await record("duplicate blocked");
    await check("Potwierdzam celowe dodanie kolejnej identycznej wpłaty (w ciągu 60s)");
    await button("Zaksięguj wpłatę bezpośrednio");
    // queue mode (admin test)
    await radio("📥 Zgłoś do kolejki (Test)");
    await select("Członek", "Natalia", /Natalia Wróblewska/);
    await number("Kwota wpłaty (PLN)", 7);
    await date("Data wpływu", "2026-10-05");
    await text("Tytuł / Notatka", "Diff kolejka test");
    await select("Oświadczenie testowe:", "BRAK", "BRAK_POTWIERDZENIA");
    await button("Wyślij do kolejki weryfikacji");
    // edit A, delete B
    await radio("✏️ Popraw / Usuń wpłatę");
    await select("Wybierz wpłatę:", "Diff wpłata A", /Diff wpłata A/);
    await select("Osoba", "Jakub W", /Jakub Wilczak/);
    await number("Kwota (PLN)", 20);
    await date("Data wpłaty", "2026-10-11");
    await text("Notatka", "Diff wpłata A po edycji");
    await button("Zastosuj operację");
    await radio("✏️ Popraw / Usuń wpłatę");
    await select("Wybierz wpłatę:", "Diff wpłata B", /Diff wpłata B/);
    await check("🔥 Całkowicie usuń tę wpłatę z rejestru");
    await button("Zastosuj operację");
  },

  async naliczenia() {
    await login(ADMIN);
    await kolaTab(/Ręczne Naliczenia/);
    await select("Członek", "Oskar", /Oskar Ciszewski/);
    await number("Kwota naliczenia (PLN)", 30);
    await date("Data naliczenia", "2026-09-01");
    await text("Tytuł obciążenia", "Diff składka zjazdowa");
    await button("Zaksięguj naliczenie");
    await select("Członek", "Oskar", /Oskar Ciszewski/);
    await number("Kwota naliczenia (PLN)", 4.75);
    await date("Data naliczenia", "2026-09-02");
    await text("Tytuł obciążenia", "Diff do usunięcia");
    await button("Zaksięguj naliczenie");
    await radio("📋 Przeglądaj / Usuń naliczenie");
    await select("Wpis do usunięcia:", "Diff do usu", /Diff do usunięcia/);
    await button("🔥 Usuń to naliczenie z konta");
  },

  async korekty() {
    await login(ADMIN);
    await kolaTab(/Korekta Salda Osoby/);
    // the delta is computed against the balance on the correction date (past date → different balance than today)
    await select("Wybierz członka:", "Weronika", /Weronika Kossakowska/);
    await number("Docelowe nowe saldo (PLN)", 90);
    await date("Data korekty", "2026-03-15");
    await text("Powód korekty", "Diff korekta wsteczna");
    await button("Zastosuj korektę członka");
    await select("Wybierz członka:", "Michał Amsolik", /Michał Amsolik/);
    await number("Docelowe nowe saldo (PLN)", -12.34);
    await date("Data korekty", "2026-10-16");
    await text("Powód korekty", "Diff korekta bieżąca");
    await button("Zastosuj korektę członka");
  },

  async kasa() {
    await login(ADMIN);
    await kolaTab(/Kasa Koła & Wydatki/);
    await number("Kwota wydatku (PLN)", 16.2);
    await date("Data poniesienia kosztu", "2026-10-01");
    await select("Kategoria", "Sprzęt", "Sprzęt");
    await text("Opis wydatku / Nr faktury", "Diff FV 1/2026");
    await button("Zaksięguj wydatek");
    await number("Docelowy stan kasy (PLN)", 3000);
    await date("Data wyciągu bankowego", "2026-06-30");
    await text("Powód korekty", "Diff wyciąg czerwiec");
    await button("Zastosuj korektę kasy");
  },

  async czlonkowie() {
    await login(ADMIN);
    await kolaTab(/Zarządzaj Członkami/);
    await text("Imię i Nazwisko", "Zofia Diff");
    await date("Data urodzenia", "2020-01-01");
    await date("Data przystąpienia", "2025-02-01");
    await button("Zapisz profil");
    await record("too young");
    await text("Imię i Nazwisko", "Zofia Diff");
    await date("Data urodzenia", "1998-05-05");
    await date("Data przystąpienia", "2025-02-01");
    await number("Saldo początkowe (PLN)", 12);
    await select("Próg składek", "S", /^S$/);
    await button("Zapisz profil");
    await text("Imię i Nazwisko", "   ");
    await button("Zapisz profil");
    await record("empty name");
    // edit: critical change without and with confirmation
    await radio("✏️ Edytuj profil członka");
    await select("Wybierz członka:", "Zofia Diff", /Zofia Diff/);
    await text("Imię i Nazwisko", "Zofia Diff-Edytowana");
    await number("Saldo początkowe (PLN)", 50);
    await button("Zapisz zmiany w profilu");
    await record("critical without confirmation");
    await check("Potwierdzam wsteczną modyfikację parametrów");
    await button("Zapisz zmiany w profilu");
    // delete a member who has payments: payments stay, re-labelled
    await radio("🗑️ Usuń członka z koła");
    await select("Wybierz członka do usunięcia:", "Jakub W", /Jakub Wilczak/);
    await check("Potwierdzam usunięcie profilu: Jakub Wilczak");
    await button("🔥 Usuń trwale profil");
  },

  async terminy() {
    await login(ADMIN);
    await kolaTab(/Celestia & Głosowania/);
    await tab(/Rejestr Dni Głosowań/);
    await date("Data Głosowania / Zebrania:", "2026-11-05");
    await select("Ranga wydarzenia:", "Kluczowe", /Kluczowe/);
    await number("Długość zbiórki (dni przed):", 10);
    await number("Dopuszczalny poślizg (dni po terminie):", 3);
    await button("➕ Zarejestruj Termin Głosowania");
    await record("missing name");
    await text("Nazwa / Okazja wydarzenia:", "Diff Walne Zebranie");
    await text("Opcjonalny opis / uwagi:", "Diff opis");
    await button("➕ Zarejestruj Termin Głosowania");
    await radio("📆 Zbiórka Kwartalna (wpływa na rytm wpłat, bez praw głosu)");
    await date("Data Wymagalności Kwartalnej:", "2026-12-31");
    await text("Nazwa / Okazja wydarzenia:", "Diff Zbiórka Q4");
    await button("➕ Zarejestruj Zbiórkę Kwartalną");
    await select(isRef ? "Wybierz termin do usunięcia:" : "Wybierz termin do usunięcia:", "Diff Walne", /Diff Walne Zebranie/);
    await button("Usuń wybrany termin");
  },

  async deklaracja() {
    await login(UNIT);
    await kolaTab(/Wpłaty Członków/);
    await select("Wybierz członka", "Michał Podyma", /Michał Podyma/);
    await number("Kwota deklarowanej wpłaty (PLN)", 18);
    await date("Data wpływu na konto", "2026-10-12");
    await text("Tytuł przelewu / Notatka", "Diff deklaracja");
    await radio("⚠️ Nie dysponuję potwierdzeniem Skarbnik krajowy lub administrator musi potwierdzić dane");
    await button("Wyślij wpłatę do zaakceptowania");
    await logout();
  },

  async akceptacje() {
    await login(ADMIN);
    await kolaTab(/Wpłaty do zaakceptowania/);
    // accept the declaration made above, reject the admin's test entry with a custom reason
    const rowOf = (who: string) => isRef
      ? vis(page.locator('[data-testid="stMarkdownContainer"]').filter({ hasText: who }))
      : vis(page.getByTestId("pending-row").filter({ hasText: who }));
    const idOf = async (who: string) => {
      if (isRef) {
        const all = await page.getByRole("button", { name: /Akceptuj wpłatę #/ }).and(page.locator(":visible")).allInnerTexts();
        const texts = await page.locator('[data-testid="stMarkdownContainer"]').and(page.locator(":visible")).allInnerTexts();
        const idx = texts.filter((t) => t.includes("Zgłosił:")).findIndex((t) => t.includes(who));
        return all[idx].match(/#(\d+)/)![1];
      }
      return (await rowOf(who).getByRole("button", { name: /Akceptuj wpłatę/ }).innerText()).match(/#(\d+)/)![1];
    };
    const acc = await idOf("Michał Podyma");
    await button(`✅ Akceptuj wpłatę #${acc}`);
    const rej = await idOf("Natalia Wróblewska");
    if (isRef) {
      const accepts = await page.getByRole("button", { name: /Akceptuj wpłatę #/ }).and(page.locator(":visible")).allInnerTexts();
      const exp = page.locator('[data-testid="stExpander"]').filter({ hasText: "Odrzuć wpłatę" }).and(page.locator(":visible"))
        .nth(accepts.findIndex((t) => t.includes(`#${rej}`)));
      await exp.getByText("❌ Odrzuć wpłatę").click();
      await settle();
      await vis(exp.getByLabel("Powód odrzucenia:")).fill("Diff brak wpływu");
      await vis(exp.getByLabel("Powód odrzucenia:")).press("Tab");
      await settle();
      await vis(exp.getByRole("button", { name: "Potwierdź odrzucenie" })).click();
      await settle();
    } else {
      const row = rowOf("Natalia Wróblewska");
      await row.getByText("❌ Odrzuć wpłatę").click();
      await row.getByLabel("Powód odrzucenia:").fill("Diff brak wpływu");
      await row.getByRole("button", { name: "Potwierdź odrzucenie" }).click();
      await page.waitForTimeout(500);
    }
  },

  async struktura() {
    await login(ADMIN);
    await kolaTab(/Zarządzaj Strukturą/);
    await text("Nazwa nowego regionu:", "Region Łodź");
    await button("➕ Utwórz Region");
    await record("duplicate region");
    await text("Nazwa nowego regionu:", "  Diff Pomorze  ");
    await button("➕ Utwórz Region");
    await select("Wybierz region do zmiany nazwy:", "Diff Pom", /Diff Pomorze/);
    await text("Nowa nazwa regionu:", "Diff Pomorze Gdańskie");
    await button("💾 Zapisz nową nazwę");
    await tab(/🏢 Koła/);
    await text("Nazwa nowego koła:", "Diff Koło Gdańsk");
    await select("Przypisz do regionu:", "Diff Pom", /Diff Pomorze Gdańskie/);
    await button("➕ Utwórz Koło");
    await select("Wybierz koło do edycji:", "Diff Koło", /Diff Koło Gdańsk/);
    await text("Nazwa koła:", "Diff Koło Gdynia");
    await button("💾 Zapisz zmiany w kole");
    await text("Nazwa nowego koła:", "Diff Koło Sopot");
    await select("Przypisz do regionu:", "Bez przypisanego", /Bez przypisanego regionu/);
    await button("➕ Utwórz Koło");
    // single unit to trash and back
    await select("Wybierz koło do przeniesienia do kosza:", "Diff Koło Sopot", /Diff Koło Sopot/);
    await button("🗑️ Przenieś koło do kosza");
    await record("trash without confirmation");
    await check("Potwierdzam przeniesienie do kosza: Diff Koło Sopot");
    await button("🗑️ Przenieś koło do kosza");
    // region with its unit to trash, restore, trash again, delete permanently
    await tab(/🌍 Regiony/);
    await select("Wybierz region do przeniesienia do kosza:", "Diff Pom", /Diff Pomorze Gdańskie/);
    await check("Potwierdzam przeniesienie do kosza regionu: Diff Pomorze Gdańskie");
    await button("🗑️ Przenieś region do kosza");
    await tab(/Kosz i Przywracanie/);
    await button("🟢 Przywróć koło: Diff Koło Gdynia");
    await record("restore unit of trashed region");
    await button("🟢 Przywróć koło: Diff Koło Sopot");
    await tab(/Regiony w Koszu/, 2);
    await button("🟢 Przywróć region: Diff Pomorze Gdańskie");
    await tab(/🌍 Regiony/);
    await select("Wybierz region do przeniesienia do kosza:", "Diff Pom", /Diff Pomorze Gdańskie/);
    await check("Potwierdzam przeniesienie do kosza regionu: Diff Pomorze Gdańskie");
    await button("🗑️ Przenieś region do kosza");
    await tab(/Kosz i Przywracanie/);
    await tab(/Regiony w Koszu/, 2);
    await expander("🔥 Trwałe usunięcie (Diff Pomorze Gdańskie)");
    await button(/🔥 Usuń trwale z bazy #/);
    await record("permanent delete without confirmation");
    await check("Trwale usuń region Diff Pomorze Gdańskie");
    await button(/🔥 Usuń trwale z bazy #/);
  },

  async konta() {
    await login(ADMIN);
    await kolaTab(/Panel Centauri/);
    await tab(/Nowe Konto/);
    await text("Login (np. skarbnik_lodz)", "parity_kolo");
    await text("Imię i Nazwisko użytkownika", "Duplikat");
    await button("➕ Utwórz konto w Citadel");
    await record("duplicate login");
    await text("Login (np. skarbnik_lodz)", "diff_skarbnik");
    await text("Imię i Nazwisko użytkownika", "Diff Skarbnik Kutno");
    await select("Rola w organizacji:", "SKARBNIK_KOLA", "SKARBNIK_KOLA");
    await select("Przypisz Koło:", "Kutno", /^Kutno$/);
    await button("➕ Utwórz konto w Citadel");
    await text("Login (np. skarbnik_lodz)", "diff_region");
    await text("Imię i Nazwisko użytkownika", "Diff Skarbnik Regionu");
    await select("Rola w organizacji:", "SKARBNIK_REGIONU", "SKARBNIK_REGIONU");
    await select("Przypisz Region:", "Mazow", /Region Mazowiecki/);
    await button("➕ Utwórz konto w Citadel");
    await tab(/Rejestr Użytkowników/);
    await select("Wybierz konto:", "diff_skarbnik", /diff_skarbnik \(Aktywny\)/);
    await button("🔴 Zablokuj dostęp");
    // second "Wybierz konto:" dropdown is the role change
    const roleBox = page.getByLabel("Wybierz konto:", { exact: true }).and(page.locator(":visible")).nth(1);
    await roleBox.click();
    if (isRef) await page.keyboard.type("diff_region"); else await roleBox.fill("diff_region");
    await page.waitForTimeout(isRef ? 500 : 150);
    await vis(page.getByRole("option").filter({ hasText: /diff_region/ })).click();
    await settle();
    await select("Nowa rola:", "SKARBNIK_KRAJOWY", "SKARBNIK_KRAJOWY");
    await button("Zastosuj nową rolę");
    await select("Konto do resetu:", "diff_region", /^diff_region$/);
    await text("Nowe hasło:", "abc");
    await button("Ustaw i wymuś zmianę");
    await record("short password");
    await text("Nowe hasło:", "DiffReset1!");
    await button("Ustaw i wymuś zmianę");
    await select("Konto do usunięcia:", "diff_skarbnik", /diff_skarbnik/);
    await expander("⚠️ Potwierdzenie");
    await button("🔥 Skasuj trwale");
    await record("delete without confirmation");
    await check("Usuń diff_skarbnik");
    await button("🔥 Skasuj trwale");
    await logout();
    // the reset account must change its password on first login
    await login({ login: "diff_region", password: "DiffReset1!" });
    await text("Nowe hasło (min. 8 znaków)", "DiffNowe123!");
    await text("Powtórz hasło", "DiffInne123!");
    await button("Zapisz nowe hasło i przejdź do systemu");
    await record("passwords differ");
    await text("Nowe hasło (min. 8 znaków)", "krotkie");
    await text("Powtórz hasło", "krotkie");
    await button("Zapisz nowe hasło i przejdź do systemu");
    await record("password too short");
    await text("Nowe hasło (min. 8 znaków)", "DiffNowe123!");
    await text("Powtórz hasło", "DiffNowe123!");
    await button("Zapisz nowe hasło i przejdź do systemu");
    await page.waitForTimeout(1000);
    const header = isRef ? "Diff Skarbnik Regionu" : "Diff Skarbnik Regionu";
    if (!(await page.getByText(header).first().isVisible())) throw new Error("password change did not log the user in");
  },
  async logowanie() {
    const attempt = async (login: string, password: string, tag: string) => {
      await page.goto(base);
      await settle();
      await page.getByLabel("Login").fill(login);
      await page.locator('input[type="password"]').fill(password);
      await page.getByRole("button", { name: "Zaloguj do systemu" }).click();
      await page.waitForTimeout(isRef ? 2000 : 600);
      await settle();
      await record(tag);
    };
    await attempt("parity_admin", "zle-haslo", "wrong password");
    await attempt("nie_ma_takiego", "cokolwiek", "unknown login");
    // block the account created in "konta", then try it with a wrong and with the right password
    await login(ADMIN);
    await kolaTab(/Panel Centauri/);
    await select("Wybierz konto:", "diff_region", /diff_region \(Aktywny\)/);
    await button("🔴 Zablokuj dostęp");
    await logout();
    await attempt("diff_region", "zle-haslo", "blocked, wrong password");
    await attempt("diff_region", "DiffNowe123!", "blocked, right password");
  },

  async wykresy() {
    await login(ADMIN);
    await kolaTab(/Profile & Wykresy/);
    for (const [query, who] of [["Michał Podyma", /Michał Podyma/], ["Paulina", /Paulina Celińska/], ["Amsolik", /Michał Amsolik/]] as const) {
      await select("Wybierz członka do analizy wskaźników", query, who);
      for (const interval of ["D1", "M1", "Cały okres"]) {
        await radio(interval);
        await tab(/Oś Czasu Salda/, 1);
        await plots(`${query} ${interval} saldo`);
        await tab(/Dynamika Wskaźnika KDI/, 1);
        await plots(`${query} ${interval} kdi`);
      }
    }
    await kolaTab(/Celestia & Głosowania/);
    await plots("celestia distribution");
    await radio("📊 Statystyki Regionu");
    await tab(/Porównanie KDI Kół/, 0);
    await plots("region KDI comparison");
    await radio("🇵🇱 Statystyki Kraju");
    await tab(/Porównanie KDI Regionów/, 0);
    await plots("country KDI comparison");
  },

  async kalkulator() {
    await login(ADMIN);
    await kolaTab(/Kalkulator/);
    await snapshot("defaults");
    await number("Suma dotychczasowych wpłat (PLN)", 300);
    await snapshot("payments 300");
    await radio("🏷️ Ręczny wybór progu (B / M / S)");
    await select("Próg składek:", "S (15", /S \(15\.00/);
    await select("Pełniona funkcja w organizacji:", "Zarządu", /Członek Zarządu Krajowego/);
    await number("Liczba miesięcy pełnienia funkcji:", 3);
    await snapshot("manual S + board function");
    await radio("🎂 Automatycznie z daty urodzenia (Wiek)");
    await date("Data urodzenia", "1990-02-14");
    await date("Data przystąpienia", "2019-05-20");
    await select("Naliczaj składki od:", "2025", /Od początku 2025/);
    await date("Kalkulacja na dzień:", "2026-06-30");
    await check("Uwzględnij bieżący (niepełny) miesiąc w naliczeniu");
    await number("Saldo początkowe (PLN)", -50);
    await number("Suma dotychczasowych wpłat (PLN)", 40);
    await snapshot("adult, from 2025, partial month, debt");
    await select("Naliczaj składki od:", "Własna", /Własna data początkowa/);
    await date("Własna data początkowa naliczania:", "2024-03-01");
    await select("Pełniona funkcja w organizacji:", "Inna", /Inna kwota funkcyjna/);
    await number("Miesięczna stawka funkcyjna (PLN):", 7.5);
    await number("Liczba miesięcy pełnienia funkcji:", 5);
    await snapshot("custom start + custom function");
  },
};

const names = only.length ? only : Object.keys(steps);
for (const name of names) {
  currentStep = name;
  const t0 = Date.now();
  try {
    await steps[name]();
    console.log(`✓ ${name} (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
  } catch (e) {
    const shot = `${outFile.replace(/\.json$/, "")}-${name}-fail.png`;
    await page.screenshot({ path: shot, fullPage: true }).catch(() => {});
    const msg = (e as Error).message;
    const waiting = msg.split("\n").find((l) => l.includes("waiting for")) ?? "";
    console.log(`✗ ${name}: ${msg.split("\n")[0]}\n  ${waiting.trim()}\n  at: ${(e as Error).stack?.split("\n").find((l) => l.includes("scenario.ts"))?.trim()}\n  screenshot: ${shot}`);
    process.exitCode = 1;
    break;
  } finally {
    await page.context().clearCookies();
    await page.close();
    page = await browser.newPage({ viewport: { width: 1600, height: 1100 } });
  }
}
writeFileSync(outFile, JSON.stringify(messages, null, 2));
await browser.close();
