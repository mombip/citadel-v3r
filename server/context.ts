/** Shared request context: authenticated user, access checks and small helpers. */
import type { Context } from "hono";
import { HTTPException } from "hono/http-exception";
import type { Db } from "./db";
import { can, type Action } from "../shared/rbac";

export interface AuthUser {
  id: number;
  login: string;
  imie_nazwisko: string;
  rola: string;
  kraj_id: number | null;
  region_id: number | null;
  kolo_id: number | null;
  is_active: boolean;
  wymus_zmiane_hasla: boolean;
  sesja_wersja: number;
}

export type Env = { Variables: { user: AuthUser; db: Db } };
export type Ctx = Context<Env>;

export const fail = (status: 400 | 401 | 403 | 404 | 409, message: string): never => {
  throw new HTTPException(status, { message });
};

export function requirePermission(c: Ctx, action: Action): void {
  if (!can(c.get("user").rola, action)) fail(403, "Brak uprawnień do tej operacji.");
}

/** Members of a unit may only be touched by users allowed to see that unit. */
export async function assertUnitAccess(c: Ctx, koloId: number): Promise<void> {
  const user = c.get("user");
  const db = c.get("db");
  if (can(user.rola, "widzi_kraj")) return;
  const kolo = await db.one<{ region_id: number | null; is_deleted: boolean }>("SELECT region_id, is_deleted FROM kola WHERE id = $1", [koloId]);
  if (!kolo) fail(404, "Koło nie istnieje.");
  if (user.rola === "SKARBNIK_REGIONU" && kolo!.region_id === user.region_id) return;
  if (user.rola === "SKARBNIK_KOLA" && user.kolo_id === koloId) return;
  fail(403, "Brak dostępu do tego koła.");
}

export const intParam = (c: Ctx, name: string): number => {
  const v = Number(c.req.param(name));
  if (!Number.isInteger(v)) fail(400, `Nieprawidłowy parametr ${name}.`);
  return v;
};

export const intQuery = (c: Ctx, name: string, fallback?: number): number => {
  const raw = c.req.query(name);
  if (raw === undefined || raw === "") {
    if (fallback !== undefined) return fallback;
    fail(400, `Brak parametru ${name}.`);
  }
  const v = Number(raw);
  if (!Number.isInteger(v)) fail(400, `Nieprawidłowy parametr ${name}.`);
  return v;
};

export const nowIso = () => new Date();
