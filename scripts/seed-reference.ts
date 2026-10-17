/** Seeds the demo data into an external PostgreSQL (DATABASE_URL) so the original app can show the same data. */
import { openDb } from "../server/db";
import { initSchema } from "../server/schema";
import { seedDemo } from "../server/seed";

const db = await openDb();
await initSchema(db);
console.log((await seedDemo(db)) ? "seeded" : "already has data");
await db.close();
