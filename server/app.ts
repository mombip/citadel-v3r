import { Hono } from "hono";
import { getCookie } from "hono/cookie";
import { HTTPException } from "hono/http-exception";
import { ZodError } from "zod";
import type { Db } from "./db";
import type { Env } from "./context";
import { SESSION_COOKIE } from "./auth";
import { authRoutes, loadSessionUser } from "./routes/auth";
import { viewRoutes } from "./routes/views";
import { koloRoutes } from "./routes/kolo";
import { adminRoutes } from "./routes/admin";

export function createApp(db: Db) {
  const app = new Hono<Env>();

  app.use("*", async (c, next) => {
    c.set("db", db);
    await next();
  });

  app.onError((err, c) => {
    if (err instanceof HTTPException) return c.json({ error: err.message }, err.status);
    if (err instanceof ZodError) {
      const msg = err.issues.map((i) => i.message).join("; ");
      return c.json({ error: msg || "Nieprawidłowe dane." }, 400);
    }
    console.error(err);
    return c.json({ error: "Wewnętrzny błąd serwera." }, 500);
  });

  app.get("/api/health", (c) => c.json({ ok: true, db: db.kind }));

  const api = new Hono<Env>();
  api.route("/auth", authRoutes);

  api.use("*", async (c, next) => {
    const user = await loadSessionUser(db, getCookie(c, SESSION_COOKIE));
    if (!user) return c.json({ error: "Sesja wygasła lub konto zostało zablokowane / zmodyfikowane. Zaloguj się ponownie.", expired: true }, 401);
    if (user.wymus_zmiane_hasla) return c.json({ error: "Wymagana zmiana hasła.", passwordChangeRequired: true }, 403);
    c.set("user", user);
    await next();
  });
  api.route("/", viewRoutes);
  api.route("/kolo", koloRoutes);
  api.route("/", adminRoutes);

  app.route("/api", api);
  return app;
}
