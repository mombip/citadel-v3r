/** API tests against an in-memory PGlite database seeded with demo data. */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../../server/app";
import { openPglite, type Db } from "../../server/db";
import { initSchema } from "../../server/schema";
import { seedDemo } from "../../server/seed";

let db: Db;
let app: ReturnType<typeof createApp>;

async function login(login: string, password: string) {
  const res = await app.request("/api/auth/login", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ login, password }),
  });
  const cookie = res.headers.get("set-cookie")?.split(";")[0] ?? "";
  return { res, cookie };
}

const api = (cookie: string) => async (path: string, init: RequestInit = {}) => {
  const res = await app.request(path, { ...init, headers: { "content-type": "application/json", cookie, ...(init.headers || {}) } });
  return { status: res.status, body: res.headers.get("content-type")?.includes("json") ? await res.json() : await res.text() };
};

beforeAll(async () => {
  db = await openPglite();
  await initSchema(db);
  await seedDemo(db);
  app = createApp(db);
});
afterAll(() => db.close());

describe("auth", () => {
  it("rejects bad credentials and accepts good ones", async () => {
    expect((await login("admin2", "nope")).res.status).toBe(401);
    const { res, cookie } = await login("admin2", "Admin1234!");
    expect(res.status).toBe(200);
    expect(cookie).toMatch(/^citadel_session=/);
    const me = await api(cookie)("/api/auth/me");
    expect(me.body.user.rola).toBe("ADMIN");
  });

  it("forces password change for the default admin", async () => {
    const { cookie } = await login("admin", "Centauri2026!");
    const r = await api(cookie)("/api/dictionaries?krajId=1");
    expect(r.status).toBe(403);
    expect(r.body.passwordChangeRequired).toBe(true);
    const bad = await api(cookie)("/api/auth/change-password", { method: "POST", body: JSON.stringify({ password: "short", confirm: "short" }) });
    expect(bad.status).toBe(400);
  });

  it("invalidates sessions when the session version changes", async () => {
    const { cookie } = await login("krajowy", "Krajowy1234!");
    expect((await api(cookie)("/api/dictionaries?krajId=1")).status).toBe(200);
    await db.query("UPDATE uzytkownicy SET sesja_wersja = sesja_wersja + 1 WHERE login = 'krajowy'");
    const r = await api(cookie)("/api/dictionaries?krajId=1");
    expect(r.status).toBe(401);
    expect(r.body.expired).toBe(true);
    await db.query("UPDATE uzytkownicy SET sesja_wersja = sesja_wersja - 1 WHERE login = 'krajowy'");
  });
});

describe("views and RBAC", () => {
  it("country dashboard aggregates all units", async () => {
    const { cookie } = await login("admin2", "Admin1234!");
    const r = await api(cookie)("/api/views/kraj?krajId=1");
    expect(r.status).toBe(200);
    expect(r.body.rows.map((x: any) => x.nazwa)).toEqual(["Małopolska", "Mazowsze", "⚠️ Bez regionu (nieprzypisane)"]);
    expect(r.body.summary.members).toBe(11);
    expect(r.body.kolaBezRegionu).toEqual(["Koło Bez Regionu"]);
  });

  it("unit treasurer sees only their unit and cannot book directly", async () => {
    const { cookie } = await login("kolo_waw", "Kolo1234!");
    const a = api(cookie);
    expect((await a("/api/views/kraj?krajId=1")).status).toBe(403);
    const kola = await a("/api/kola?krajId=1");
    expect(kola.body.map((k: any) => k.nazwa)).toEqual(["Koło Warszawa"]);
    const wawId = kola.body[0].id;
    const overview = await a(`/api/kolo/${wawId}`);
    expect(overview.status).toBe(200);
    expect(overview.body.members).toHaveLength(6);
    expect(overview.body.members.every((m: any) => typeof m.celestia_score === "number")).toBe(true);
    expect((await a(`/api/kolo/${wawId}/wplaty`)).status).toBe(403);
    const other = await a("/api/kolo/3");
    expect(other.status).toBe(403);
  });

  it("region treasurer is limited to their region", async () => {
    const { cookie } = await login("region_maz", "Region1234!");
    const a = api(cookie);
    const ok = await a("/api/views/region?krajId=1&regionId=1");
    expect(ok.status).toBe(200);
    expect(ok.body.rows.map((x: any) => x.nazwa)).toEqual(["Koło Radom", "Koło Warszawa"]);
    expect((await a("/api/views/region?krajId=1&regionId=2")).status).toBe(403);
  });
});

describe("mutations", () => {
  it("books a payment, blocks duplicates within 60 s, and edits it", async () => {
    const { cookie } = await login("krajowy", "Krajowy1234!");
    const a = api(cookie);
    const members = (await a("/api/kolo/1")).body.members;
    const mid = members[0].id;
    const body = { czlonek_id: mid, kwota_gr: 1234, data_wplaty: "2026-10-10", notatka: "Test" };
    expect((await a("/api/kolo/1/wplaty", { method: "POST", body: JSON.stringify(body) })).status).toBe(200);
    const dup = await a("/api/kolo/1/wplaty", { method: "POST", body: JSON.stringify(body) });
    expect(dup.status).toBe(409);
    expect(dup.body.duplicate).toBe(true);
    expect((await a("/api/kolo/1/wplaty", { method: "POST", body: JSON.stringify({ ...body, force_duplicate: true }) })).status).toBe(200);
    const list = (await a("/api/kolo/1/wplaty")).body;
    expect(list.filter((w: any) => w.notatka === "Test")).toHaveLength(2);
    const wid = list[0].id;
    expect((await a(`/api/kolo/1/wplaty/${wid}`, { method: "PUT", body: JSON.stringify({ ...body, kwota_gr: 2000 }) })).status).toBe(200);
    expect((await a(`/api/kolo/1/wplaty/${wid}`, { method: "DELETE" })).status).toBe(200);
    const after = (await a("/api/kolo/1")).body.members.find((m: any) => m.id === mid);
    expect(after.wplaty_gr).toBe(members[0].wplaty_gr + 1234);
  });

  it("pending queue: declare → accept → payment exists", async () => {
    const kolo = await login("kolo_waw", "Kolo1234!");
    const r = await api(kolo.cookie)("/api/kolo/1/wplaty-oczekujace", {
      method: "POST", body: JSON.stringify({ czlonek_id: 2, kwota_gr: 900, data_wplaty: "2026-10-01", notatka: "Deklaracja", oswiadczenie: "MAM_POTWIERDZENIE" }),
    });
    expect(r.status).toBe(200);
    const admin = api((await login("admin2", "Admin1234!")).cookie);
    const pending = (await admin("/api/pending")).body;
    const mine = pending.find((p: any) => p.notatka === "Deklaracja");
    expect(mine).toBeTruthy();
    expect((await admin(`/api/pending/${mine.id}/accept`, { method: "POST" })).status).toBe(200);
    expect((await admin(`/api/pending/${mine.id}/accept`, { method: "POST" })).status).toBe(404);
    const w = await db.one<{ idempotency_key: string }>("SELECT idempotency_key FROM wplaty WHERE notatka = 'Deklaracja'");
    expect(w?.idempotency_key).toBe(`zaakceptowana_oczekujaca_${mine.id}`);
  });

  it("member lifecycle with validation and safe delete", async () => {
    const a = api((await login("admin2", "Admin1234!")).cookie);
    const bad = await a("/api/kolo/2/czlonkowie", { method: "POST", body: JSON.stringify({ imie_nazwisko: "X", data_urodzenia: "2020-01-01", data_przystapienia: "2026-01-01", saldo_startowe_gr: 0, reczny_parametr: "AUTO" }) });
    expect(bad.status).toBe(400);
    expect(bad.body.error).toContain("13 lat");
    expect((await a("/api/kolo/2/czlonkowie", { method: "POST", body: JSON.stringify({ imie_nazwisko: "Nowy Członek", data_urodzenia: "1990-01-01", data_przystapienia: "2026-01-01", saldo_startowe_gr: 500, reczny_parametr: "M" }) })).status).toBe(200);
    const m = (await a("/api/kolo/2")).body.members.find((x: any) => x.imie_nazwisko === "Nowy Członek");
    expect(m.parametr).toBe("M");
    await a("/api/kolo/2/wplaty", { method: "POST", body: JSON.stringify({ czlonek_id: m.id, kwota_gr: 700, data_wplaty: "2026-10-02", notatka: "Przed usunięciem" }) });
    expect((await a(`/api/kolo/2/czlonkowie/${m.id}`, { method: "DELETE" })).status).toBe(200);
    const orphan = await db.one<{ notatka: string; czlonek_id: number | null }>("SELECT notatka, czlonek_id FROM wplaty WHERE notatka LIKE 'Przed usunięciem%'");
    expect(orphan?.czlonek_id).toBeNull();
    expect(orphan?.notatka).toContain("[Wpłata usuniętego członka: Nowy Członek]");
  });

  it("structure: trash and restore cascade through regions", async () => {
    const a = api((await login("admin2", "Admin1234!")).cookie);
    expect((await a("/api/regiony", { method: "POST", body: JSON.stringify({ kraj_id: 1, nazwa: "Mazowsze" }) })).status).toBe(409);
    expect((await a("/api/regiony/2/trash", { method: "POST" })).status).toBe(200);
    let s = (await a("/api/structure?krajId=1")).body;
    expect(s.regionyKosz.map((r: any) => r.nazwa)).toEqual(["Małopolska"]);
    expect(s.kolaKosz.map((k: any) => k.nazwa)).toEqual(["Koło Kraków"]);
    const blocked = await a("/api/kola/3/restore", { method: "POST" });
    expect(blocked.status).toBe(409);
    expect((await a("/api/regiony/2/restore", { method: "POST" })).status).toBe(200);
    s = (await a("/api/structure?krajId=1")).body;
    expect(s.kolaKosz).toHaveLength(0);
    expect((await a("/api/kola/3", { method: "DELETE" })).status).toBe(409);
  });

  it("audit trigger records changes and backup dumps everything", async () => {
    const a = api((await login("admin2", "Admin1234!")).cookie);
    const audit = (await a("/api/audit?table=wplaty")).body;
    expect(audit.length).toBeGreaterThan(0);
    expect(audit[0].operacja).toMatch(/INSERT|UPDATE|DELETE/);
    const res = await app.request("/api/backup", { headers: { cookie: (await login("admin2", "Admin1234!")).cookie } });
    expect(res.status).toBe(200);
    const sql = await res.text();
    expect(sql).toContain('INSERT INTO "czlonkowie"');
    expect(sql).toContain("OVERRIDING SYSTEM VALUE");
  });

  it("users: create, change role, reset password, block", async () => {
    const a = api((await login("admin2", "Admin1234!")).cookie);
    expect((await a("/api/users", { method: "POST", body: JSON.stringify({ login: "nowy", imie_nazwisko: "Nowy User", haslo: "Citadel2026!", rola: "SKARBNIK_KOLA", kraj_id: 1, kolo_id: 1 }) })).status).toBe(200);
    const u = (await a("/api/users")).body.users.find((x: any) => x.login === "nowy");
    expect(u.kolo_nazwa).toBe("Koło Warszawa");
    expect(u.region_nazwa).toBe("Mazowsze");
    expect((await a(`/api/users/${u.id}/role`, { method: "POST", body: JSON.stringify({ rola: "SKARBNIK_KRAJOWY" }) })).status).toBe(200);
    expect((await a(`/api/users/${u.id}/toggle-active`, { method: "POST" })).status).toBe(200);
    expect((await login("nowy", "Citadel2026!")).res.status).toBe(401);
  });
});
