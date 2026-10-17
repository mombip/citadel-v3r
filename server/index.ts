/**
 * Entry point: opens the database (PostgreSQL via DATABASE_URL, otherwise embedded PGlite),
 * applies the schema, optionally seeds demo data, serves the API and the built SPA.
 */
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { openDb } from "./db";
import { initSchema } from "./schema";
import { createApp } from "./app";
import { seedDemo } from "./seed";

const port = Number(process.env.PORT || 8700);
const db = await openDb();
await initSchema(db);
if (process.env.SEED_DEMO === "1") await seedDemo(db);

const app = createApp(db);
const dist = join(process.cwd(), "web", "dist");
if (existsSync(dist)) {
  app.use("/*", serveStatic({ root: "web/dist" }));
  const index = readFileSync(join(dist, "index.html"), "utf8");
  app.get("*", (c) => c.html(index));
}

serve({ fetch: app.fetch, port }, () => {
  console.log(`Citadel for NG listening on http://localhost:${port} (db: ${db.kind})`);
});
