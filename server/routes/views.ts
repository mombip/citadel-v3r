/** Dictionaries and the aggregated country / region dashboards. */
import { Hono } from "hono";
import { type Env, fail, intQuery, requirePermission } from "../context";
import { computeUnits, summarise, type UnitTotals } from "../finance";
import { dynamicKdiThreshold, kdiOf } from "../../shared/calculations";
import { can } from "../../shared/rbac";
import { todayPL } from "../../shared/dates";
import { fmt, sortByName } from "../../shared/num";

export const viewRoutes = new Hono<Env>();

viewRoutes.get("/dictionaries", async (c) => {
  const db = c.get("db");
  const user = c.get("user");
  const kraje = await db.query<{ id: number; nazwa: string }>("SELECT id, nazwa FROM kraje ORDER BY id ASC");
  const krajId = intQuery(c, "krajId", user.kraj_id ?? kraje[0]?.id ?? 1);
  const regiony = sortByName(await db.query<{ id: number; nazwa: string }>("SELECT id, nazwa FROM aktywne_regiony WHERE kraj_id = $1 ORDER BY nazwa ASC", [krajId]));
  const kolaBezRegionu = Number(await db.scalar("SELECT COUNT(*) FROM aktywne_kola WHERE region_id IS NULL AND kraj_id = $1", [krajId]) ?? 0);
  let userRegionId: number | null = user.region_id;
  if (user.rola === "SKARBNIK_KOLA" && user.kolo_id) {
    userRegionId = (await db.scalar<number>("SELECT region_id FROM kola WHERE id = $1", [user.kolo_id])) ?? null;
  }
  const pendingCount = can(user.rola, "akceptuje_wplaty")
    ? Number(await db.scalar("SELECT COUNT(*) FROM wplaty_oczekujace WHERE status = 'OCZEKUJE'") ?? 0)
    : 0;
  return c.json({ kraje, regiony, kolaBezRegionu, userRegionId, pendingCount, today: todayPL() });
});

function unitRow(name: string, u: UnitTotals) {
  const czl = u.members.length;
  const upr = u.members.filter((d) => d.moze_glosowac).length;
  const kdi = kdiOf(u.totalZGr, u.totalSGr);
  const [, progStr] = dynamicKdiThreshold(u.members);
  return {
    nazwa: name,
    czlonkowie: czl,
    kasa: `${fmt(u.kasaGr / 100, 2, { thousands: true })} zł`,
    wplaty: `${fmt(u.wplatyKasaGr / 100, 2, { thousands: true })} zł`,
    wydatki: `${fmt(u.wydatkiGr / 100, 2, { thousands: true })} zł`,
    kdi: kdi !== null ? fmt(kdi, 2) : "Brak danych",
    kdiVal: kdi,
    prog: progStr,
    uprawnieni: `${upr}/${czl} (${fmt(czl > 0 ? (upr / czl) * 100 : 0, 1)}%)`,
  };
}

viewRoutes.get("/views/kraj", async (c) => {
  requirePermission(c, "widzi_kraj");
  const db = c.get("db");
  const krajId = intQuery(c, "krajId");
  const today = todayPL();
  const kraj = await db.one<{ nazwa: string }>("SELECT nazwa FROM kraje WHERE id = $1", [krajId]);
  const regiony = sortByName(await db.query<{ id: number; nazwa: string }>("SELECT id, nazwa FROM aktywne_regiony WHERE kraj_id = $1 ORDER BY nazwa ASC", [krajId]));
  const kola = sortByName(await db.query<{ id: number; nazwa: string; region_id: number | null }>(
    "SELECT id, nazwa, region_id FROM aktywne_kola WHERE kraj_id = $1 ORDER BY nazwa ASC", [krajId],
  ));
  const units = await computeUnits(db, kola.map((k) => k.id), today);
  const summary = summarise([...units.values()]);
  const perRegion = regiony.map((r) => {
    const mine = kola.filter((k) => k.region_id === r.id);
    const list = mine.map((k) => units.get(k.id)!);
    const merged: UnitTotals = {
      members: list.flatMap((u) => u.members),
      wplatyKasaGr: list.reduce((a, u) => a + u.wplatyKasaGr, 0),
      kasaGr: list.reduce((a, u) => a + u.kasaGr, 0),
      wydatkiGr: list.reduce((a, u) => a + u.wydatkiGr, 0),
      korektyKasyGr: 0,
      totalZGr: list.reduce((a, u) => a + u.totalZGr, 0),
      totalSGr: list.reduce((a, u) => a + u.totalSGr, 0),
    };
    return { ...unitRow(r.nazwa, merged), liczbaKol: mine.length };
  });
  const bez = kola.filter((k) => k.region_id === null);
  const rows = [...perRegion];
  if (bez.length) {
    const list = bez.map((k) => units.get(k.id)!);
    const merged: UnitTotals = {
      members: list.flatMap((u) => u.members),
      wplatyKasaGr: list.reduce((a, u) => a + u.wplatyKasaGr, 0),
      kasaGr: list.reduce((a, u) => a + u.kasaGr, 0),
      wydatkiGr: list.reduce((a, u) => a + u.wydatkiGr, 0),
      korektyKasyGr: 0,
      totalZGr: list.reduce((a, u) => a + u.totalZGr, 0),
      totalSGr: list.reduce((a, u) => a + u.totalSGr, 0),
    };
    rows.push({ ...unitRow("⚠️ Bez regionu (nieprzypisane)", merged), liczbaKol: bez.length });
  }
  return c.json({
    nazwaKraju: kraj?.nazwa ?? "Polska",
    kolaBezRegionu: bez.map((k) => k.nazwa),
    liczbaKol: kola.length,
    summary,
    rows,
    chart: rows.filter((r) => r.kdiVal !== null).map((r) => ({ nazwa: r.nazwa, kdi: r.kdiVal as number })),
  });
});

viewRoutes.get("/views/region", async (c) => {
  requirePermission(c, "widzi_region");
  const db = c.get("db");
  const user = c.get("user");
  const krajId = intQuery(c, "krajId");
  const regionId = intQuery(c, "regionId");
  if (user.rola === "SKARBNIK_REGIONU" && regionId !== user.region_id) fail(403, "Brak dostępu do tego regionu.");
  const today = todayPL();
  const kola = sortByName(regionId === -1
    ? await db.query<{ id: number; nazwa: string }>("SELECT id, nazwa FROM aktywne_kola WHERE region_id IS NULL AND kraj_id = $1 ORDER BY nazwa ASC", [krajId])
    : await db.query<{ id: number; nazwa: string }>("SELECT id, nazwa FROM aktywne_kola WHERE region_id = $1 ORDER BY nazwa ASC", [regionId]));
  const units = await computeUnits(db, kola.map((k) => k.id), today);
  const summary = summarise([...units.values()]);
  const rows = kola.map((k) => ({ id: k.id, ...unitRow(k.nazwa, units.get(k.id)!) }));
  return c.json({
    liczbaKol: kola.length,
    summary,
    rows,
    chart: rows.filter((r) => r.kdiVal !== null).map((r) => ({ nazwa: r.nazwa, kdi: r.kdiVal as number })),
  });
});

/** Units the current user may open in the "Koło" view. */
viewRoutes.get("/kola", async (c) => {
  const db = c.get("db");
  const user = c.get("user");
  const krajId = intQuery(c, "krajId", user.kraj_id ?? 1);
  if (user.rola === "SKARBNIK_KOLA") {
    return c.json(await db.query("SELECT id, nazwa, region_id, NULL AS region_nazwa FROM aktywne_kola WHERE id = $1", [user.kolo_id]));
  }
  if (user.rola === "SKARBNIK_REGIONU") {
    return c.json(sortByName(await db.query<any>(
      "SELECT k.id, k.nazwa, k.region_id, r.nazwa AS region_nazwa FROM aktywne_kola k LEFT JOIN aktywne_regiony r ON k.region_id = r.id WHERE k.region_id = $1 ORDER BY k.nazwa ASC",
      [user.region_id],
    )));
  }
  const regionRaw = c.req.query("regionId");
  if (regionRaw === undefined || regionRaw === "") return c.json([]);
  const regionId = Number(regionRaw);
  if (regionId === -1) {
    return c.json(sortByName(await db.query<any>("SELECT id, nazwa, region_id, NULL AS region_nazwa FROM aktywne_kola WHERE region_id IS NULL AND kraj_id = $1 ORDER BY nazwa ASC", [krajId])));
  }
  return c.json(sortByName(await db.query<any>(
    "SELECT k.id, k.nazwa, k.region_id, r.nazwa AS region_nazwa FROM aktywne_kola k JOIN aktywne_regiony r ON k.region_id = r.id WHERE k.region_id = $1 ORDER BY k.nazwa ASC",
    [regionId],
  )));
});
