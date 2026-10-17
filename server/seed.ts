/**
 * Deterministic demo data set used for development, Playwright tests and side-by-side
 * comparison with the original application. Idempotent: skips when units already exist.
 */
import type { Db } from "./db";
import { generateSalt, hashPassword } from "./auth";

export const DEMO_USERS = [
  { login: "admin2", haslo: "Admin1234!", imie: "Anna Administrator", rola: "ADMIN" },
  { login: "krajowy", haslo: "Krajowy1234!", imie: "Krzysztof Krajowy", rola: "SKARBNIK_KRAJOWY" },
  { login: "region_maz", haslo: "Region1234!", imie: "Renata Regionalna", rola: "SKARBNIK_REGIONU", region: "Mazowsze" },
  { login: "kolo_waw", haslo: "Kolo1234!", imie: "Karol Kołowy", rola: "SKARBNIK_KOLA", kolo: "Koło Warszawa" },
];

export async function seedDemo(db: Db): Promise<boolean> {
  const existing = Number(await db.scalar("SELECT COUNT(*) FROM kola"));
  if (existing > 0) return false;
  const now = new Date("2026-10-15T09:30:00Z");

  const region = async (nazwa: string) =>
    (await db.one<{ id: number }>("INSERT INTO regiony (kraj_id, nazwa) VALUES (1, $1) RETURNING id", [nazwa]))!.id;
  const kolo = async (nazwa: string, regionId: number | null) =>
    (await db.one<{ id: number }>("INSERT INTO kola (nazwa, region_id, kraj_id) VALUES ($1, $2, 1) RETURNING id", [nazwa, regionId]))!.id;
  const member = async (koloId: number, nazwa: string, ur: string, wst: string, start: number, param = "AUTO") =>
    (await db.one<{ id: number }>(
      "INSERT INTO czlonkowie (kolo_id, imie_nazwisko, data_urodzenia, data_przystapienia, saldo_startowe_gr, reczny_parametr) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id",
      [koloId, nazwa, ur, wst, start, param],
    ))!.id;
  const pay = (koloId: number, mid: number, gr: number, d: string, note = "Składka członkowska") =>
    db.query("INSERT INTO wplaty (kolo_id, czlonek_id, kwota_gr, data_wplaty, notatka, data_wpisu, idempotency_key) VALUES ($1,$2,$3,$4,$5,$6,$7)",
      [koloId, mid, gr, d, note, now, `seed_${koloId}_${mid}_${d}_${gr}`]);

  const maz = await region("Mazowsze");
  const mal = await region("Małopolska");
  const waw = await kolo("Koło Warszawa", maz);
  const rad = await kolo("Koło Radom", maz);
  const kra = await kolo("Koło Kraków", mal);
  const bez = await kolo("Koło Bez Regionu", null);

  // Koło Warszawa — a spread of rating classes
  const m1 = await member(waw, "Alicja Nowak", "1992-03-14", "2023-02-10", 4500);
  const m2 = await member(waw, "Bartosz Kowalski", "2001-07-22", "2024-05-01", 0);
  const m3 = await member(waw, "Celina Wiśniewska", "1975-11-02", "2019-09-15", -9000, "S");
  const m4 = await member(waw, "Dawid Zieliński", "2008-01-30", "2025-03-01", 0);
  const m5 = await member(waw, "Ewa Mazur", "1988-06-05", "2021-01-20", -42000);
  const m6 = await member(waw, "Filip Krawczyk", "1999-12-12", "2026-09-28", 0);

  for (const d of ["2025-12-20", "2026-03-18", "2026-06-10", "2026-09-05"]) await pay(waw, m1, 2700, d);
  for (const d of ["2026-01-15", "2026-07-14"]) await pay(waw, m2, 1800, d);
  await pay(waw, m3, 4500, "2026-03-29");
  await pay(waw, m3, 4500, "2026-09-30");
  await pay(waw, m4, 600, "2026-04-02");
  await pay(waw, m5, 900, "2025-05-10", "Wpłata częściowa");

  await db.query("INSERT INTO naliczenia_reczne (czlonek_id, kwota_gr, data_naliczenia, tytul, data_wpisu) VALUES ($1,$2,$3,$4,$5)",
    [m2, 2000, "2026-05-05", "Składka zjazdowa", now]);
  await db.query("INSERT INTO korekty (czlonek_id, delta_gr, docelowe_saldo_gr, data_korekty, powod, data_wpisu) VALUES ($1,$2,$3,$4,$5,$6)",
    [m3, 1000, -3500, "2026-02-01", "Wyrównanie ze stanem papierowym", now]);
  await db.query("INSERT INTO wydatki (kolo_id, kwota_gr, data_wydatku, kategoria, opis, data_wpisu) VALUES ($1,$2,$3,$4,$5,$6)",
    [waw, 12050, "2026-06-20", "Integracja", "Faktura FV/2026/06/11", now]);
  await db.query("INSERT INTO korekty_kasy (kolo_id, delta_gr, docelowy_stan_gr, data_korekty, powod, data_wpisu) VALUES ($1,$2,$3,$4,$5,$6)",
    [waw, -500, 0, "2026-01-05", "Wyrównanie ze stanem wyciągu bankowego", now]);

  const due = (koloId: number, d: string, nazwa: string, przed: number, po: number, waga: number, typ: string) =>
    db.query(
      `INSERT INTO terminy_glosowan (kolo_id, data_glosowania, data_zbiorki_od, data_wymagalnosci_do, dni_zbiorki_przed, dni_wymagalnosci_po, nazwa, opis, waga, typ_terminu, utworzono_przez)
       VALUES ($1,$2,($2::date - $3::int),($2::date + $4::int),$3,$4,$5,NULL,$6,$7,1)`,
      [koloId, d, przed, po, nazwa, waga, typ],
    );
  await due(waw, "2026-03-30", "Walne Zebranie Członków", 14, 3, 1.5, "GLOSOWANIE");
  await due(waw, "2026-06-15", "Zebranie Koła", 14, 0, 1.0, "GLOSOWANIE");
  await due(waw, "2026-09-30", "Zbiórka składek za III kwartał 2026", 21, 3, 1.0, "KWARTALNY");
  await due(waw, "2026-10-28", "Wybory Władz Koła", 14, 3, 1.5, "GLOSOWANIE");

  // Koło Radom
  const r1 = await member(rad, "Grzegorz Lis", "1980-04-04", "2020-06-01", 0);
  const r2 = await member(rad, "Hanna Dąbrowska", "2005-09-09", "2025-10-10", -1200);
  await pay(rad, r1, 9000, "2026-02-02");
  await pay(rad, r2, 600, "2026-09-12");

  // Koło Kraków
  const k1 = await member(kra, "Igor Pawlak", "1995-02-18", "2022-03-03", 1500);
  await pay(kra, k1, 2700, "2026-07-01");
  await member(kra, "Joanna Michalska", "1970-10-10", "2018-01-01", -60000);

  // Koło bez regionu
  await member(bez, "Kamil Wróbel", "1990-01-01", "2024-01-01", 0);

  // Pending payment declared by the unit treasurer
  const users = new Map<string, number>();
  for (const u of DEMO_USERS) {
    const salt = generateSalt();
    const regionId = u.region ? maz : u.kolo ? maz : null;
    const koloId = u.kolo ? waw : null;
    const id = (await db.one<{ id: number }>(
      `INSERT INTO uzytkownicy (login, haslo_hash, salt, imie_nazwisko, rola, kraj_id, region_id, kolo_id, is_active, wymus_zmiane_hasla, sesja_wersja)
       VALUES ($1,$2,$3,$4,$5,1,$6,$7,TRUE,FALSE,1) RETURNING id`,
      [u.login, hashPassword(u.haslo, salt), salt, u.imie, u.rola, regionId, koloId],
    ))!.id;
    users.set(u.login, id);
  }
  await db.query(
    `INSERT INTO wplaty_oczekujace (kolo_id, czlonek_id, zglosil_uzytkownik_id, kwota_gr, data_wplaty, notatka, oswiadczenie, status, idempotency_key)
     VALUES ($1,$2,$3,2700,'2026-10-12','Składka członkowska','MAM_POTWIERDZENIE','OCZEKUJE','seed_pending_1')`,
    [waw, m2, users.get("kolo_waw")],
  );
  await db.query(
    `INSERT INTO wplaty_oczekujace (kolo_id, czlonek_id, zglosil_uzytkownik_id, kwota_gr, data_wplaty, notatka, oswiadczenie, status, idempotency_key, rozpatrzyl_uzytkownik_id, data_rozpatrzenia, powod_odrzucenia)
     VALUES ($1,$2,$3,900,'2026-09-01','Składka','BRAK_POTWIERDZENIA','ODRZUCONA','seed_pending_2',1,$4,'Brak wpływu na wyciągu')`,
    [waw, m5, users.get("kolo_waw"), now],
  );
  return true;
}
