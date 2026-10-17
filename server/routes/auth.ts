import { Hono } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { z } from "zod";
import type { Env } from "../context";
import { decodeSession, encodeSession, generateSalt, hashPassword, SESSION_COOKIE, verifyPassword } from "../auth";
import type { Db } from "../db";
import type { AuthUser } from "../context";

const USER_COLS = "id, login, imie_nazwisko, rola, kraj_id, region_id, kolo_id, is_active, wymus_zmiane_hasla, sesja_wersja";

/** Last activity ping is throttled to one DB write per user per 60 seconds, like the original. */
const lastPing = new Map<number, number>();

export async function loadSessionUser(db: Db, token: string | undefined): Promise<AuthUser | null> {
  const s = decodeSession(token);
  if (!s) return null;
  const u = await db.one<AuthUser>(`SELECT ${USER_COLS} FROM uzytkownicy WHERE id = $1`, [s.uid]);
  if (!u || !u.is_active || u.sesja_wersja !== s.sv) return null;
  const now = Date.now();
  if ((lastPing.get(u.id) ?? 0) + 60_000 <= now) {
    await db.query("UPDATE uzytkownicy SET ostatnia_aktywnosc = $1 WHERE id = $2", [new Date(now), u.id]);
    lastPing.set(u.id, now);
  }
  return u;
}

export const authRoutes = new Hono<Env>();

authRoutes.post("/login", async (c) => {
  const body = z.object({ login: z.string(), password: z.string() }).parse(await c.req.json());
  const db = c.get("db");
  const u = await db.one<AuthUser & { salt: string; haslo_hash: string }>(
    `SELECT ${USER_COLS}, salt, haslo_hash FROM uzytkownicy WHERE login = $1`, [body.login.trim()],
  );
  if (!u) return c.json({ error: "Nieprawidłowy login lub hasło." }, 401);
  if (!u.is_active) return c.json({ error: "Konto zostało zablokowane przez Administratora." }, 401);
  if (!verifyPassword(body.password, u.salt, u.haslo_hash)) return c.json({ error: "Nieprawidłowy login lub hasło." }, 401);
  const now = new Date();
  await db.query("UPDATE uzytkownicy SET ostatnie_logowanie = $1, ostatnia_aktywnosc = $1 WHERE id = $2", [now, u.id]);
  lastPing.set(u.id, now.getTime());
  setCookie(c, SESSION_COOKIE, encodeSession({ uid: u.id, sv: u.sesja_wersja, iat: now.getTime() }), {
    httpOnly: true, sameSite: "Lax", path: "/",
  });
  const { salt: _s, haslo_hash: _h, ...user } = u;
  return c.json({ user });
});

authRoutes.post("/logout", async (c) => {
  const u = await loadSessionUser(c.get("db"), getCookie(c, SESSION_COOKIE));
  if (u) {
    await c.get("db").query("UPDATE uzytkownicy SET ostatnia_aktywnosc = NULL WHERE id = $1", [u.id]);
    lastPing.delete(u.id);
  }
  deleteCookie(c, SESSION_COOKIE, { path: "/" });
  return c.json({ ok: true });
});

authRoutes.get("/me", async (c) => {
  const u = await loadSessionUser(c.get("db"), getCookie(c, SESSION_COOKIE));
  if (!u) return c.json({ user: null }, 200);
  return c.json({ user: u });
});

authRoutes.post("/change-password", async (c) => {
  const db = c.get("db");
  const u = await loadSessionUser(db, getCookie(c, SESSION_COOKIE));
  if (!u) return c.json({ error: "Sesja wygasła." }, 401);
  const body = z.object({ password: z.string(), confirm: z.string() }).parse(await c.req.json());
  if (body.password.length < 8) return c.json({ error: "Hasło musi mieć co najmniej 8 znaków." }, 400);
  if (body.password !== body.confirm) return c.json({ error: "Wprowadzone hasła nie są identyczne." }, 400);
  const salt = generateSalt();
  await db.query(
    "UPDATE uzytkownicy SET haslo_hash = $1, salt = $2, wymus_zmiane_hasla = FALSE, sesja_wersja = sesja_wersja + 1 WHERE id = $3",
    [hashPassword(body.password, salt), salt, u.id],
  );
  setCookie(c, SESSION_COOKIE, encodeSession({ uid: u.id, sv: u.sesja_wersja + 1, iat: Date.now() }), { httpOnly: true, sameSite: "Lax", path: "/" });
  return c.json({ ok: true });
});
