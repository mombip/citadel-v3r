/** Writes the Citadel schema (tables, views, indexes; no triggers) as the Netlify Database migration. */
import { mkdirSync, writeFileSync } from "node:fs";
import { DDL_SCHEMA_EXPORT, EXTRA_DDL } from "../server/schema";

const dir = "netlify/database/migrations/20261017000000_citadel_schema";
mkdirSync(dir, { recursive: true });
writeFileSync(`${dir}/migration.sql`, `-- Citadel for NG schema (identical to Citadel V3). Audit triggers are installed by the app on start-up.\n${DDL_SCHEMA_EXPORT}\n${EXTRA_DDL}\n`);
console.log("written", dir);
