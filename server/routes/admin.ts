/** Cross-unit administration: pending payment queue, structure (regions/units/trash), audit, users. */
import { Hono } from "hono";
import { z } from "zod";
import { type Env, fail, intParam, intQuery, requirePermission } from "../context";
import { UniqueViolation, type Queryable } from "../db";
import { generateSqlDump } from "../backup";
import { generateSalt, hashPassword } from "../auth";
import { ROLES } from "../../shared/rbac";
import { sortByName } from "../../shared/num";

export const adminRoutes = new Hono<Env>();

// ---------------------------------------------------------------- Pending payments
adminRoutes.get("/pending", async (c) => {
  requirePermission(c, "akceptuje_wplaty");
  return c.json(await c.get("db").query(
    `SELECT wo.id, wo.kolo_id, k.nazwa AS kolo_nazwa, wo.czlonek_id, c.imie_nazwisko AS czlonek_nazwa,
            wo.kwota_gr, wo.data_wplaty, wo.notatka, wo.oswiadczenie, wo.data_zgloszenia, u.imie_nazwisko AS zglosil_nazwa
     FROM wplaty_oczekujace wo JOIN kola k ON wo.kolo_id = k.id
     LEFT JOIN czlonkowie c ON wo.czlonek_id = c.id LEFT JOIN uzytkownicy u ON wo.zglosil_uzytkownik_id = u.id
     WHERE wo.status = 'OCZEKUJE' ORDER BY wo.data_zgloszenia ASC`,
  ));
});

adminRoutes.post("/pending/:id/accept", async (c) => {
  requirePermission(c, "akceptuje_wplaty");
  const id = intParam(c, "id");
  const now = new Date();
  await c.get("db").tx(async (t) => {
    const r = await t.one<any>("SELECT * FROM wplaty_oczekujace WHERE id = $1 AND status = 'OCZEKUJE'", [id]);
    if (!r) fail(404, "Wpłata nie oczekuje już na akceptację.");
    await t.query(
      "INSERT INTO wplaty (kolo_id, czlonek_id, kwota_gr, data_wplaty, notatka, data_wpisu, idempotency_key) VALUES ($1,$2,$3,$4,$5,$6,$7)",
      [r.kolo_id, r.czlonek_id, r.kwota_gr, r.data_wplaty, r.notatka, now, `zaakceptowana_oczekujaca_${id}`],
    );
    await t.query("UPDATE wplaty_oczekujace SET status = 'ZAAKCEPTOWANA', rozpatrzyl_uzytkownik_id = $1, data_rozpatrzenia = $2 WHERE id = $3", [c.get("user").id, now, id]);
  });
  return c.json({ ok: true });
});

adminRoutes.post("/pending/:id/reject", async (c) => {
  requirePermission(c, "akceptuje_wplaty");
  const b = z.object({ powod: z.string().default("") }).parse(await c.req.json());
  await c.get("db").query(
    "UPDATE wplaty_oczekujace SET status = 'ODRZUCONA', rozpatrzyl_uzytkownik_id = $1, data_rozpatrzenia = $2, powod_odrzucenia = $3 WHERE id = $4",
    [c.get("user").id, new Date(), b.powod, intParam(c, "id")],
  );
  return c.json({ ok: true });
});

// ---------------------------------------------------------------- Structure
adminRoutes.get("/structure", async (c) => {
  requirePermission(c, "zarzadza_struktura");
  const db = c.get("db");
  const krajId = intQuery(c, "krajId");
  const regiony = sortByName(await db.query<any>("SELECT id, nazwa FROM aktywne_regiony WHERE kraj_id = $1 ORDER BY nazwa ASC", [krajId]));
  const kola = sortByName(await db.query<any>(
    `SELECT k.id, k.nazwa, k.region_id, r.nazwa AS region_nazwa, (SELECT COUNT(*) FROM czlonkowie c WHERE c.kolo_id = k.id) AS liczba_czlonkow
     FROM aktywne_kola k LEFT JOIN aktywne_regiony r ON k.region_id = r.id WHERE k.kraj_id = $1 ORDER BY k.nazwa ASC`, [krajId],
  ));
  const regionyLiczbaKol = await db.query("SELECT region_id, COUNT(*) AS n FROM aktywne_kola WHERE kraj_id = $1 AND region_id IS NOT NULL GROUP BY region_id", [krajId]);
  const kolaKosz = await db.query(
    `SELECT k.id, k.nazwa, k.deleted_at, k.deleted_by_region_id, r.nazwa AS region_nazwa, r.is_deleted AS region_w_koszu
     FROM kola k LEFT JOIN regiony r ON k.region_id = r.id WHERE k.is_deleted = TRUE AND k.kraj_id = $1 ORDER BY k.deleted_at DESC NULLS LAST`, [krajId],
  );
  const regionyKosz = await db.query(
    `SELECT id, nazwa, deleted_at, (SELECT COUNT(*) FROM kola k WHERE k.region_id = regiony.id) AS powiazane_kola
     FROM regiony WHERE is_deleted = TRUE AND kraj_id = $1 ORDER BY deleted_at DESC NULLS LAST`, [krajId],
  );
  return c.json({ regiony, kola, regionyLiczbaKol, kolaKosz, regionyKosz });
});

const name = z.object({ nazwa: z.string().trim().min(1) });

adminRoutes.post("/regiony", async (c) => {
  requirePermission(c, "zarzadza_struktura");
  const b = name.extend({ kraj_id: z.number().int() }).parse(await c.req.json());
  try {
    await c.get("db").query("INSERT INTO regiony (kraj_id, nazwa) VALUES ($1, $2)", [b.kraj_id, b.nazwa]);
  } catch (e) {
    if (e instanceof UniqueViolation) return c.json({ error: `Region o nazwie '${b.nazwa}' już istnieje w tym kraju.` }, 409);
    throw e;
  }
  return c.json({ ok: true });
});

adminRoutes.put("/regiony/:id", async (c) => {
  requirePermission(c, "zarzadza_struktura");
  const b = name.parse(await c.req.json());
  try {
    await c.get("db").query("UPDATE regiony SET nazwa = $1 WHERE id = $2", [b.nazwa, intParam(c, "id")]);
  } catch (e) {
    if (e instanceof UniqueViolation) return c.json({ error: "Region o takiej nazwie już istnieje." }, 409);
    throw e;
  }
  return c.json({ ok: true });
});

adminRoutes.post("/regiony/:id/trash", async (c) => {
  requirePermission(c, "zarzadza_struktura");
  const id = intParam(c, "id");
  const now = new Date();
  await c.get("db").tx(async (t) => {
    await t.query("UPDATE regiony SET is_deleted = TRUE, deleted_at = $1 WHERE id = $2", [now, id]);
    await t.query("UPDATE kola SET is_deleted = TRUE, deleted_at = $1, deleted_by_region_id = $2 WHERE region_id = $2 AND is_deleted = FALSE", [now, id]);
  });
  return c.json({ ok: true });
});

adminRoutes.post("/regiony/:id/restore", async (c) => {
  requirePermission(c, "zarzadza_struktura");
  const id = intParam(c, "id");
  await c.get("db").tx(async (t) => {
    await t.query("UPDATE kola SET is_deleted = FALSE, deleted_at = NULL, deleted_by_region_id = NULL WHERE region_id = $1 AND is_deleted = TRUE AND deleted_by_region_id = $1", [id]);
    await t.query("UPDATE regiony SET is_deleted = FALSE, deleted_at = NULL WHERE id = $1", [id]);
  });
  return c.json({ ok: true });
});

async function purgeUnit(t: Queryable, koloId: number) {
  await t.query("DELETE FROM wplaty WHERE kolo_id = $1 OR czlonek_id IN (SELECT id FROM czlonkowie WHERE kolo_id = $1)", [koloId]);
  await t.query("DELETE FROM wplaty_oczekujace WHERE kolo_id = $1", [koloId]);
  await t.query("DELETE FROM naliczenia_reczne WHERE czlonek_id IN (SELECT id FROM czlonkowie WHERE kolo_id = $1)", [koloId]);
  await t.query("DELETE FROM korekty WHERE czlonek_id IN (SELECT id FROM czlonkowie WHERE kolo_id = $1)", [koloId]);
  await t.query("DELETE FROM czlonkowie WHERE kolo_id = $1", [koloId]);
  await t.query("DELETE FROM wydatki WHERE kolo_id = $1", [koloId]);
  await t.query("DELETE FROM korekty_kasy WHERE kolo_id = $1", [koloId]);
  await t.query("DELETE FROM kola WHERE id = $1", [koloId]);
}

adminRoutes.delete("/regiony/:id", async (c) => {
  requirePermission(c, "zarzadza_koszem");
  const id = intParam(c, "id");
  await c.get("db").tx(async (t) => {
    const r = await t.one<{ is_deleted: boolean }>("SELECT is_deleted FROM regiony WHERE id = $1", [id]);
    if (!r || !r.is_deleted) fail(409, "Nie można trwale usunąć aktywnego regionu! Przenieś go najpierw do kosza.");
    for (const k of await t.query<{ id: number }>("SELECT id FROM kola WHERE region_id = $1", [id])) await purgeUnit(t, k.id);
    await t.query("DELETE FROM regiony WHERE id = $1", [id]);
  });
  return c.json({ ok: true });
});

adminRoutes.post("/kola", async (c) => {
  requirePermission(c, "zarzadza_struktura");
  const b = name.extend({ kraj_id: z.number().int(), region_id: z.number().int().nullable() }).parse(await c.req.json());
  try {
    await c.get("db").query("INSERT INTO kola (nazwa, region_id, kraj_id) VALUES ($1, $2, $3)", [b.nazwa, b.region_id, b.kraj_id]);
  } catch (e) {
    if (e instanceof UniqueViolation) return c.json({ error: `Koło o nazwie '${b.nazwa}' już istnieje.` }, 409);
    throw e;
  }
  return c.json({ ok: true });
});

adminRoutes.put("/kola/:id", async (c) => {
  requirePermission(c, "zarzadza_struktura");
  const b = name.extend({ region_id: z.number().int().nullable() }).parse(await c.req.json());
  try {
    await c.get("db").query("UPDATE kola SET nazwa = $1, region_id = $2 WHERE id = $3", [b.nazwa, b.region_id, intParam(c, "id")]);
  } catch (e) {
    if (e instanceof UniqueViolation) return c.json({ error: "Koło o takiej nazwie już istnieje." }, 409);
    throw e;
  }
  return c.json({ ok: true });
});

adminRoutes.post("/kola/:id/trash", async (c) => {
  requirePermission(c, "zarzadza_struktura");
  await c.get("db").query("UPDATE kola SET is_deleted = TRUE, deleted_at = $1, deleted_by_region_id = NULL WHERE id = $2", [new Date(), intParam(c, "id")]);
  return c.json({ ok: true });
});

adminRoutes.post("/kola/:id/restore", async (c) => {
  requirePermission(c, "zarzadza_struktura");
  const id = intParam(c, "id");
  const db = c.get("db");
  const region = await db.one<{ nazwa: string; is_deleted: boolean }>("SELECT r.nazwa, r.is_deleted FROM kola k JOIN regiony r ON k.region_id = r.id WHERE k.id = $1", [id]);
  if (region?.is_deleted) return c.json({ error: `Nie można przywrócić koła: jego region nadrzędny ('${region.nazwa}') znajduje się w koszu!` }, 409);
  await db.query("UPDATE kola SET is_deleted = FALSE, deleted_at = NULL, deleted_by_region_id = NULL WHERE id = $1", [id]);
  return c.json({ ok: true });
});

adminRoutes.delete("/kola/:id", async (c) => {
  requirePermission(c, "zarzadza_koszem");
  const id = intParam(c, "id");
  await c.get("db").tx(async (t) => {
    const r = await t.one<{ is_deleted: boolean }>("SELECT is_deleted FROM kola WHERE id = $1", [id]);
    if (!r || !r.is_deleted) fail(409, "Nie można trwale usunąć aktywnego koła! Przenieś je najpierw do kosza.");
    await purgeUnit(t, id);
  });
  return c.json({ ok: true });
});

// ---------------------------------------------------------------- Audit & backup
adminRoutes.get("/audit", async (c) => {
  requirePermission(c, "widzi_audyt");
  const table = c.req.query("table");
  const db = c.get("db");
  const rows = table && table !== "Wszystkie"
    ? await db.query("SELECT * FROM audit_log WHERE tabela = $1 ORDER BY id DESC LIMIT 100", [table])
    : await db.query("SELECT * FROM audit_log ORDER BY id DESC LIMIT 100");
  return c.json(rows);
});

adminRoutes.get("/backup", async (c) => {
  requirePermission(c, "widzi_audyt");
  const { filename, sql } = await generateSqlDump(c.get("db"));
  c.header("Content-Type", "application/sql; charset=utf-8");
  c.header("Content-Disposition", `attachment; filename="${filename}"`);
  c.header("X-Backup-Size-KB", (Buffer.byteLength(sql, "utf8") / 1024).toFixed(1));
  return c.body(sql);
});

// ---------------------------------------------------------------- Users (Centauri panel)
adminRoutes.get("/users", async (c) => {
  requirePermission(c, "zarzadza_kontami");
  const db = c.get("db");
  const users = await db.query(
    `SELECT u.id, u.login, u.imie_nazwisko, u.rola, u.is_active, u.ostatnie_logowanie, u.ostatnia_aktywnosc, u.sesja_wersja,
            r.nazwa AS region_nazwa, k.nazwa AS kolo_nazwa
     FROM uzytkownicy u LEFT JOIN regiony r ON u.region_id = r.id LEFT JOIN kola k ON u.kolo_id = k.id ORDER BY u.id ASC`,
  );
  const kola = sortByName(await db.query<any>("SELECT id, nazwa FROM aktywne_kola ORDER BY nazwa ASC"));
  return c.json({ users, kola, now: new Date().toISOString() });
});

adminRoutes.post("/users", async (c) => {
  requirePermission(c, "zarzadza_kontami");
  const b = z.object({
    login: z.string().trim().min(1), imie_nazwisko: z.string().trim().min(1), haslo: z.string().min(1),
    rola: z.enum(ROLES as [string, ...string[]]), kraj_id: z.number().int(),
    region_id: z.number().int().nullable().default(null), kolo_id: z.number().int().nullable().default(null),
  }).parse(await c.req.json());
  const db = c.get("db");
  let regionId = b.region_id;
  const koloId = b.rola === "SKARBNIK_KOLA" ? b.kolo_id : null;
  if (b.rola === "SKARBNIK_KOLA" && koloId) regionId = (await db.scalar<number>("SELECT region_id FROM kola WHERE id = $1", [koloId])) ?? null;
  if (b.rola !== "SKARBNIK_REGIONU" && b.rola !== "SKARBNIK_KOLA") regionId = null;
  const salt = generateSalt();
  try {
    await db.query(
      `INSERT INTO uzytkownicy (login, haslo_hash, salt, imie_nazwisko, rola, kraj_id, region_id, kolo_id, is_active, wymus_zmiane_hasla, sesja_wersja)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,TRUE,TRUE,1)`,
      [b.login, hashPassword(b.haslo, salt), salt, b.imie_nazwisko, b.rola, b.kraj_id, regionId, koloId],
    );
  } catch (e) {
    if (e instanceof UniqueViolation) return c.json({ error: "Użytkownik o takim loginie już istnieje." }, 409);
    throw e;
  }
  return c.json({ ok: true });
});

adminRoutes.post("/users/:id/toggle-active", async (c) => {
  requirePermission(c, "zarzadza_kontami");
  const id = intParam(c, "id");
  if (id === c.get("user").id) fail(400, "Nie można zablokować własnego konta.");
  await c.get("db").query("UPDATE uzytkownicy SET is_active = NOT is_active, sesja_wersja = sesja_wersja + 1, ostatnia_aktywnosc = NULL WHERE id = $1", [id]);
  return c.json({ ok: true });
});

adminRoutes.post("/users/:id/role", async (c) => {
  requirePermission(c, "zarzadza_kontami");
  const id = intParam(c, "id");
  if (id === c.get("user").id) fail(400, "Nie można zmienić własnej roli.");
  const b = z.object({ rola: z.enum(ROLES as [string, ...string[]]) }).parse(await c.req.json());
  await c.get("db").query("UPDATE uzytkownicy SET rola = $1, sesja_wersja = sesja_wersja + 1 WHERE id = $2", [b.rola, id]);
  return c.json({ ok: true });
});

adminRoutes.post("/users/:id/reset-password", async (c) => {
  requirePermission(c, "zarzadza_kontami");
  const b = z.object({ haslo: z.string() }).parse(await c.req.json());
  if (b.haslo.length < 6) return c.json({ error: "Min. 6 znaków!" }, 400);
  const salt = generateSalt();
  await c.get("db").query(
    "UPDATE uzytkownicy SET haslo_hash = $1, salt = $2, wymus_zmiane_hasla = TRUE, sesja_wersja = sesja_wersja + 1, ostatnia_aktywnosc = NULL WHERE id = $3",
    [hashPassword(b.haslo, salt), salt, intParam(c, "id")],
  );
  return c.json({ ok: true });
});

adminRoutes.delete("/users/:id", async (c) => {
  requirePermission(c, "zarzadza_kontami");
  const id = intParam(c, "id");
  if (id === c.get("user").id) fail(400, "Nie można usunąć własnego konta.");
  await c.get("db").query("DELETE FROM uzytkownicy WHERE id = $1", [id]);
  return c.json({ ok: true });
});
