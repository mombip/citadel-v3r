/**
 * Netlify Function hosting the Hono API (all /api/* routes). The SPA is served statically from web/dist.
 * Database: Netlify Database (schema migration in netlify/database/migrations), or DATABASE_URL as an override.
 * Also requires SESSION_SECRET on the site.
 * Set SKIP_SCHEMA_INIT=1 to skip the idempotent schema/trigger setup on cold start.
 */
import { createApp } from "../../server/app";
import { openPostgres } from "../../server/db";
import { initSchema } from "../../server/schema";
import { getConnectionString } from "@netlify/database";

let appPromise: Promise<ReturnType<typeof createApp>> | null = null;

function getApp() {
  appPromise ??= (async () => {
    // Netlify Database connection (NETLIFY_DB_URL); DATABASE_URL overrides it.
    const url = process.env.DATABASE_URL || getConnectionString();
    const db = await openPostgres(url);
    if (process.env.SKIP_SCHEMA_INIT !== "1") await initSchema(db);
    return createApp(db);
  })();
  return appPromise;
}

export default async (req: Request) => (await getApp()).fetch(req);

export const config = { path: "/api/*" };
