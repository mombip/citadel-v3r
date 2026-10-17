/** Everything scoped to a single unit (koło): overview, members, payments, charges, cash, due dates. */
import { Hono } from "hono";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { type Env, assertUnitAccess, fail, intParam, requirePermission } from "../context";
import { UniqueViolation } from "../db";
import { computeUnit, getDueDates, memberDailySeries, rateUnit } from "../finance";
import { validateMemberDates } from "../../shared/calculations";
import { can } from "../../shared/rbac";
import { todayPL } from "../../shared/dates";

export const koloRoutes = new Hono<Env>();

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Nieprawidłowa data");
const MIN_DATE = "2015-01-01";

async function unitOrFail(c: any, id: number) {
  await assertUnitAccess(c, id);
  const kolo = await c.get("db").one("SELECT id, nazwa, region_id FROM aktywne_kola WHERE id = $1", [id]);
  if (!kolo) fail(404, "Koło nie istnieje lub jest w koszu.");
  return kolo as { id: number; nazwa: string; region_id: number | null };
}

koloRoutes.get("/:id", async (c) => {
  const id = intParam(c, "id");
  const kolo = await unitOrFail(c, id);
  const db = c.get("db");
  const today = todayPL();
  const unit = await computeUnit(db, id, today);
  const members = await rateUnit(db, id, unit.members, today);
  const pendingCount = can(c.get("user").rola, "akceptuje_wplaty")
    ? Number(await db.scalar("SELECT COUNT(*) FROM wplaty_oczekujace WHERE status = 'OCZEKUJE'") ?? 0)
    : 0;
  return c.json({
    kolo, today, members,
    sumy: { wplatyKasaGr: unit.wplatyKasaGr, kasaGr: unit.kasaGr, wydatkiGr: unit.wydatkiGr, korektyKasyGr: unit.korektyKasyGr, totalZGr: unit.totalZGr, totalSGr: unit.totalSGr },
    pendingCount,
  });
});

koloRoutes.get("/:id/members/:mid/profile", async (c) => {
  const id = intParam(c, "id");
  const mid = intParam(c, "mid");
  await unitOrFail(c, id);
  const db = c.get("db");
  const today = todayPL();
  const unit = await computeUnit(db, id, today);
  const member = unit.members.find((m) => m.id === mid);
  if (!member) fail(404, "Członek nie istnieje w tym kole.");
  return c.json(await memberDailySeries(db, member!, today));
});

// ---------------------------------------------------------------- Due dates (Celestia)
koloRoutes.get("/:id/terminy", async (c) => {
  const id = intParam(c, "id");
  await unitOrFail(c, id);
  return c.json(await getDueDates(c.get("db"), id));
});

koloRoutes.post("/:id/terminy", async (c) => {
  const id = intParam(c, "id");
  await unitOrFail(c, id);
  const b = z.object({
    data_glosowania: isoDate, nazwa: z.string().trim().min(1, "Wprowadź nazwę wydarzenia!"), opis: z.string().optional(),
    dni_zbiorki_przed: z.number().int().min(1).max(90), dni_wymagalnosci_po: z.number().int().min(0).max(3),
    waga: z.number().min(0.5).max(2), typ_terminu: z.enum(["GLOSOWANIE", "KWARTALNY"]),
    data_zbiorki_od: isoDate, data_wymagalnosci_do: isoDate,
  }).parse(await c.req.json());
  await c.get("db").query(
    `INSERT INTO terminy_glosowan (kolo_id, data_glosowania, data_zbiorki_od, data_wymagalnosci_do, dni_zbiorki_przed, dni_wymagalnosci_po, nazwa, opis, waga, typ_terminu, utworzono_przez)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
    [id, b.data_glosowania, b.data_zbiorki_od, b.data_wymagalnosci_do, b.dni_zbiorki_przed, b.dni_wymagalnosci_po, b.nazwa, b.opis?.trim() || null, b.waga, b.typ_terminu, c.get("user").id],
  );
  return c.json({ ok: true });
});

koloRoutes.delete("/:id/terminy/:tid", async (c) => {
  const id = intParam(c, "id");
  await unitOrFail(c, id);
  await c.get("db").query("DELETE FROM terminy_glosowan WHERE id = $1 AND kolo_id = $2", [intParam(c, "tid"), id]);
  return c.json({ ok: true });
});

// ---------------------------------------------------------------- Payments
koloRoutes.get("/:id/wplaty", async (c) => {
  const id = intParam(c, "id");
  await unitOrFail(c, id);
  requirePermission(c, "bezposrednie_ksiegowanie");
  return c.json(await c.get("db").query(
    `SELECT w.id, w.czlonek_id, w.kwota_gr, w.data_wplaty, w.notatka, c.imie_nazwisko
     FROM wplaty w LEFT JOIN czlonkowie c ON w.czlonek_id = c.id WHERE w.kolo_id = $1 ORDER BY w.id DESC`, [id],
  ));
});

const paymentBody = z.object({
  czlonek_id: z.number().int(), kwota_gr: z.number().int().positive("Kwota musi być dodatnia"),
  data_wplaty: isoDate, notatka: z.string().default(""), idempotency_key: z.string().optional(),
});

/** Direct booking (ADMIN / national treasurer). */
koloRoutes.post("/:id/wplaty", async (c) => {
  const id = intParam(c, "id");
  await unitOrFail(c, id);
  requirePermission(c, "bezposrednie_ksiegowanie");
  const b = paymentBody.extend({ force_duplicate: z.boolean().default(false) }).parse(await c.req.json());
  const db = c.get("db");
  const today = todayPL();
  if (b.data_wplaty < MIN_DATE || b.data_wplaty > today) fail(400, "Data wpływu poza dozwolonym zakresem.");
  const unitOfMember = (await db.scalar<number>("SELECT kolo_id FROM czlonkowie WHERE id = $1", [b.czlonek_id])) ?? id;
  const now = new Date();
  const recent = Number(await db.scalar(
    "SELECT COUNT(*) FROM wplaty WHERE czlonek_id = $1 AND kwota_gr = $2 AND data_wpisu >= $3",
    [b.czlonek_id, b.kwota_gr, new Date(now.getTime() - 60_000)],
  ));
  if (recent > 0 && !b.force_duplicate) {
    return c.json({ error: "⚠️ Identyczna wpłata w ciągu ostatnich 60s. Zaznacz checkbox, aby potwierdzić.", duplicate: true }, 409);
  }
  try {
    await db.query(
      "INSERT INTO wplaty (kolo_id, czlonek_id, kwota_gr, data_wplaty, notatka, data_wpisu, idempotency_key) VALUES ($1,$2,$3,$4,$5,$6,$7)",
      [unitOfMember, b.czlonek_id, b.kwota_gr, b.data_wplaty, b.notatka, now, b.idempotency_key ?? randomUUID()],
    );
  } catch (e) {
    if (e instanceof UniqueViolation) return c.json({ error: "Ta transakcja została już przetworzona w tle.", idempotent: true }, 409);
    throw e;
  }
  return c.json({ ok: true });
});

koloRoutes.put("/:id/wplaty/:wid", async (c) => {
  const id = intParam(c, "id");
  await unitOrFail(c, id);
  requirePermission(c, "bezposrednie_ksiegowanie");
  const b = paymentBody.parse(await c.req.json());
  if (b.data_wplaty < MIN_DATE || b.data_wplaty > todayPL()) fail(400, "Data wpłaty poza dozwolonym zakresem.");
  await c.get("db").query(
    "UPDATE wplaty SET czlonek_id = $1, kwota_gr = $2, data_wplaty = $3, notatka = $4 WHERE id = $5 AND kolo_id = $6",
    [b.czlonek_id, b.kwota_gr, b.data_wplaty, b.notatka, intParam(c, "wid"), id],
  );
  return c.json({ ok: true });
});

koloRoutes.delete("/:id/wplaty/:wid", async (c) => {
  const id = intParam(c, "id");
  await unitOrFail(c, id);
  requirePermission(c, "bezposrednie_ksiegowanie");
  await c.get("db").query("DELETE FROM wplaty WHERE id = $1 AND kolo_id = $2", [intParam(c, "wid"), id]);
  return c.json({ ok: true });
});

/** Declaration into the verification queue (any treasurer; admins use it as a test path). */
koloRoutes.post("/:id/wplaty-oczekujace", async (c) => {
  const id = intParam(c, "id");
  await unitOrFail(c, id);
  const b = paymentBody.extend({ oswiadczenie: z.enum(["MAM_POTWIERDZENIE", "BRAK_POTWIERDZENIA"]) }).parse(await c.req.json());
  const db = c.get("db");
  if (b.data_wplaty < MIN_DATE || b.data_wplaty > todayPL()) fail(400, "Data wpływu poza dozwolonym zakresem.");
  const unitOfMember = (await db.scalar<number>("SELECT kolo_id FROM czlonkowie WHERE id = $1", [b.czlonek_id])) ?? id;
  try {
    await db.query(
      `INSERT INTO wplaty_oczekujace (kolo_id, czlonek_id, zglosil_uzytkownik_id, kwota_gr, data_wplaty, notatka, oswiadczenie, status, idempotency_key)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'OCZEKUJE',$8)`,
      [unitOfMember, b.czlonek_id, c.get("user").id, b.kwota_gr, b.data_wplaty, b.notatka, b.oswiadczenie, b.idempotency_key ?? randomUUID()],
    );
  } catch (e) {
    if (e instanceof UniqueViolation) return c.json({ error: "Ta wpłata została już wysłana.", idempotent: true }, 409);
    throw e;
  }
  return c.json({ ok: true });
});

koloRoutes.get("/:id/wplaty-oczekujace", async (c) => {
  const id = intParam(c, "id");
  await unitOrFail(c, id);
  return c.json(await c.get("db").query(
    `SELECT wo.id, wo.data_wplaty, c.imie_nazwisko AS czlonek, wo.kwota_gr, wo.status, wo.oswiadczenie
     FROM wplaty_oczekujace wo JOIN czlonkowie c ON wo.czlonek_id = c.id WHERE wo.kolo_id = $1 ORDER BY wo.id DESC LIMIT 15`, [id],
  ));
});

// ---------------------------------------------------------------- Manual charges
koloRoutes.get("/:id/naliczenia", async (c) => {
  const id = intParam(c, "id");
  await unitOrFail(c, id);
  requirePermission(c, "reczne_naliczenia");
  return c.json(await c.get("db").query(
    `SELECT nr.id, nr.czlonek_id, nr.kwota_gr, nr.data_naliczenia, nr.tytul, c.imie_nazwisko
     FROM naliczenia_reczne nr JOIN czlonkowie c ON nr.czlonek_id = c.id WHERE c.kolo_id = $1 ORDER BY nr.id DESC`, [id],
  ));
});

koloRoutes.post("/:id/naliczenia", async (c) => {
  const id = intParam(c, "id");
  await unitOrFail(c, id);
  requirePermission(c, "reczne_naliczenia");
  const b = z.object({ czlonek_id: z.number().int(), kwota_gr: z.number().int().positive(), data_naliczenia: isoDate, tytul: z.string().trim().min(1) }).parse(await c.req.json());
  if (b.data_naliczenia < MIN_DATE || b.data_naliczenia > todayPL()) fail(400, "Data naliczenia poza dozwolonym zakresem.");
  await c.get("db").query(
    "INSERT INTO naliczenia_reczne (czlonek_id, kwota_gr, data_naliczenia, tytul, data_wpisu) VALUES ($1,$2,$3,$4,$5)",
    [b.czlonek_id, b.kwota_gr, b.data_naliczenia, b.tytul, new Date()],
  );
  return c.json({ ok: true });
});

koloRoutes.delete("/:id/naliczenia/:nid", async (c) => {
  const id = intParam(c, "id");
  await unitOrFail(c, id);
  requirePermission(c, "reczne_naliczenia");
  await c.get("db").query(
    "DELETE FROM naliczenia_reczne WHERE id = $1 AND czlonek_id IN (SELECT id FROM czlonkowie WHERE kolo_id = $2)", [intParam(c, "nid"), id],
  );
  return c.json({ ok: true });
});

// ---------------------------------------------------------------- Cash: expenses and cash corrections
koloRoutes.get("/:id/kasa", async (c) => {
  const id = intParam(c, "id");
  await unitOrFail(c, id);
  const db = c.get("db");
  const wydatki = await db.query("SELECT id, data_wydatku, kwota_gr, kategoria, opis FROM wydatki WHERE kolo_id = $1 ORDER BY id DESC", [id]);
  const korekty = await db.query("SELECT id, data_korekty, delta_gr, docelowy_stan_gr, powod FROM korekty_kasy WHERE kolo_id = $1 ORDER BY id DESC", [id]);
  return c.json({ wydatki, korekty });
});

koloRoutes.post("/:id/wydatki", async (c) => {
  const id = intParam(c, "id");
  await unitOrFail(c, id);
  const b = z.object({ kwota_gr: z.number().int().positive(), data_wydatku: isoDate, kategoria: z.string(), opis: z.string().default("") }).parse(await c.req.json());
  if (b.data_wydatku < MIN_DATE || b.data_wydatku > todayPL()) fail(400, "Data wydatku poza dozwolonym zakresem.");
  await c.get("db").query(
    "INSERT INTO wydatki (kolo_id, kwota_gr, data_wydatku, kategoria, opis, data_wpisu) VALUES ($1,$2,$3,$4,$5,$6)",
    [id, b.kwota_gr, b.data_wydatku, b.kategoria, b.opis, new Date()],
  );
  return c.json({ ok: true });
});

koloRoutes.post("/:id/korekty-kasy", async (c) => {
  const id = intParam(c, "id");
  await unitOrFail(c, id);
  const b = z.object({ docelowy_stan_gr: z.number().int(), data_korekty: isoDate, powod: z.string().default("") }).parse(await c.req.json());
  if (b.data_korekty < MIN_DATE || b.data_korekty > todayPL()) fail(400, "Data korekty poza dozwolonym zakresem.");
  const db = c.get("db");
  const then = await computeUnit(db, id, b.data_korekty);
  const delta = b.docelowy_stan_gr - then.kasaGr;
  await db.query(
    "INSERT INTO korekty_kasy (kolo_id, delta_gr, docelowy_stan_gr, data_korekty, powod, data_wpisu) VALUES ($1,$2,$3,$4,$5,$6)",
    [id, delta, b.docelowy_stan_gr, b.data_korekty, b.powod, new Date()],
  );
  return c.json({ ok: true, delta_gr: delta });
});

// ---------------------------------------------------------------- Member balance correction
koloRoutes.post("/:id/korekty", async (c) => {
  const id = intParam(c, "id");
  await unitOrFail(c, id);
  requirePermission(c, "korekty_salda");
  const b = z.object({ czlonek_id: z.number().int(), docelowe_saldo_gr: z.number().int(), data_korekty: isoDate, powod: z.string().default("") }).parse(await c.req.json());
  if (b.data_korekty < MIN_DATE || b.data_korekty > todayPL()) fail(400, "Data korekty poza dozwolonym zakresem.");
  const db = c.get("db");
  const then = await computeUnit(db, id, b.data_korekty);
  const saldoThen = then.members.find((m) => m.id === b.czlonek_id)?.saldo_akt_gr ?? 0;
  const delta = b.docelowe_saldo_gr - saldoThen;
  await db.query(
    "INSERT INTO korekty (czlonek_id, delta_gr, docelowe_saldo_gr, data_korekty, powod, data_wpisu) VALUES ($1,$2,$3,$4,$5,$6)",
    [b.czlonek_id, delta, b.docelowe_saldo_gr, b.data_korekty, b.powod, new Date()],
  );
  return c.json({ ok: true, delta_gr: delta });
});

// ---------------------------------------------------------------- Members
const memberBody = z.object({
  imie_nazwisko: z.string().trim().min(1, "Imię i nazwisko jest wymagane."),
  data_urodzenia: isoDate, data_przystapienia: isoDate,
  saldo_startowe_gr: z.number().int(), reczny_parametr: z.enum(["AUTO", "B", "M", "S"]),
});

koloRoutes.post("/:id/czlonkowie", async (c) => {
  const id = intParam(c, "id");
  await unitOrFail(c, id);
  const b = memberBody.parse(await c.req.json());
  const [ok, msg] = validateMemberDates(b.data_urodzenia, b.data_przystapienia);
  if (!ok) return c.json({ error: `⚠️ ${msg}` }, 400);
  await c.get("db").query(
    "INSERT INTO czlonkowie (kolo_id, imie_nazwisko, data_urodzenia, data_przystapienia, saldo_startowe_gr, reczny_parametr) VALUES ($1,$2,$3,$4,$5,$6)",
    [id, b.imie_nazwisko, b.data_urodzenia, b.data_przystapienia, b.saldo_startowe_gr, b.reczny_parametr],
  );
  return c.json({ ok: true });
});

koloRoutes.put("/:id/czlonkowie/:mid", async (c) => {
  const id = intParam(c, "id");
  await unitOrFail(c, id);
  const b = memberBody.parse(await c.req.json());
  const [ok, msg] = validateMemberDates(b.data_urodzenia, b.data_przystapienia);
  if (!ok) return c.json({ error: `⚠️ ${msg}` }, 400);
  await c.get("db").query(
    "UPDATE czlonkowie SET imie_nazwisko = $1, data_urodzenia = $2, data_przystapienia = $3, saldo_startowe_gr = $4, reczny_parametr = $5 WHERE id = $6 AND kolo_id = $7",
    [b.imie_nazwisko, b.data_urodzenia, b.data_przystapienia, b.saldo_startowe_gr, b.reczny_parametr, intParam(c, "mid"), id],
  );
  return c.json({ ok: true });
});

/** Port of `usun_czlonka_bezpiecznie`: payments stay in the unit's cash, annotated with the name. */
koloRoutes.delete("/:id/czlonkowie/:mid", async (c) => {
  const id = intParam(c, "id");
  await unitOrFail(c, id);
  requirePermission(c, "usuwa_czlonka");
  const mid = intParam(c, "mid");
  await c.get("db").tx(async (t) => {
    const row = await t.one<{ imie_nazwisko: string }>("SELECT imie_nazwisko FROM czlonkowie WHERE id = $1 AND kolo_id = $2", [mid, id]);
    if (!row) fail(404, `Członek o ID #${mid} nie istnieje lub został już usunięty.`);
    await t.query(
      "UPDATE wplaty SET czlonek_id = NULL, notatka = COALESCE(notatka, '') || ' [Wpłata usuniętego członka: ' || $1 || ']' WHERE czlonek_id = $2",
      [row!.imie_nazwisko, mid],
    );
    await t.query("DELETE FROM naliczenia_reczne WHERE czlonek_id = $1", [mid]);
    await t.query("DELETE FROM korekty WHERE czlonek_id = $1", [mid]);
    await t.query("DELETE FROM czlonkowie WHERE id = $1", [mid]);
  });
  return c.json({ ok: true });
});

// ---------------------------------------------------------------- Payment register (audit tab)
koloRoutes.get("/:id/rejestr-wplat", async (c) => {
  const id = intParam(c, "id");
  await unitOrFail(c, id);
  requirePermission(c, "widzi_audyt");
  return c.json(await c.get("db").query(
    `SELECT w.id, w.data_wpisu, w.data_wplaty, COALESCE(c.imie_nazwisko, 'Były członek') AS czlonek, w.kwota_gr, w.notatka
     FROM wplaty w LEFT JOIN czlonkowie c ON w.czlonek_id = c.id WHERE w.kolo_id = $1 ORDER BY w.id DESC`, [id],
  ));
});
