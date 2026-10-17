/** Full SQL dump of the database (port of `generuj_zrzut_bazy_sql`). */
import type { Queryable } from "./db";
import { AUDITED_TABLES, DDL_SCHEMA_EXPORT } from "./schema";
import { formatTimePL } from "../shared/dates";

function sqlValue(v: unknown): string {
  if (v === null || v === undefined) return "NULL";
  if (typeof v === "boolean") return v ? "TRUE" : "FALSE";
  if (typeof v === "number" || typeof v === "bigint") return String(v);
  if (v instanceof Date) return `'${v.toISOString()}'`;
  if (typeof v === "object") return `'${JSON.stringify(v).replace(/'/g, "''")}'`;
  return `'${String(v).replace(/'/g, "''")}'`;
}

export async function generateSqlDump(db: Queryable): Promise<{ filename: string; sql: string }> {
  const stamp = formatTimePL(new Date());
  const filename = `citadel_backup_${stamp.replace(/[-: ]/g, "").replace(/(\d{8})(\d{6})/, "$1_$2")}.sql`;
  const out: string[] = [];
  out.push("-- =========================================================================");
  out.push("-- CITADEL NG — PEŁNY ZRZUT BAZY DANYCH (POSTGRESQL)");
  out.push(`-- Data wygenerowania: ${stamp} (Warszawa)`);
  out.push("-- Silnik: Citadel Native TypeScript Engine");
  out.push("-- =========================================================================\n");
  out.push("SET statement_timeout = 0;\nSET client_encoding = 'UTF8';\nSET standard_conforming_strings = on;");
  out.push("SET check_function_bodies = false;\nSET client_min_messages = warning;\nSET row_security = off;");
  out.push("SET session_replication_role = replica;\n\nBEGIN;\n");
  out.push(DDL_SCHEMA_EXPORT);
  out.push("\n-- === CZYSZCZENIE DANYCH PRZED IMPORTEM ===");
  out.push(`TRUNCATE TABLE ${[...AUDITED_TABLES].reverse().map((t) => `"${t}"`).join(", ")} CASCADE;\n`);

  for (const tab of AUDITED_TABLES) {
    const cols = await db.query<{ column_name: string; identity_generation: string | null }>(
      "SELECT column_name, identity_generation FROM information_schema.columns WHERE table_name = $1 ORDER BY ordinal_position",
      [tab],
    );
    if (!cols.length) continue;
    const names = cols.map((c) => `"${c.column_name}"`).join(", ");
    const overriding = cols.some((c) => c.identity_generation === "ALWAYS") ? " OVERRIDING SYSTEM VALUE" : "";
    const rows = await db.query<Record<string, unknown>>(`SELECT ${names} FROM "${tab}" ORDER BY id ASC`);
    out.push(`\n-- Tabela: ${tab} (${rows.length} rekordów)`);
    for (const r of rows) {
      out.push(`INSERT INTO "${tab}" (${names})${overriding} VALUES (${cols.map((c) => sqlValue(r[c.column_name])).join(", ")});`);
    }
    if (rows.length) out.push(`SELECT setval(pg_get_serial_sequence('"${tab}"', 'id'), COALESCE(max(id), 1)) FROM "${tab}";`);
  }
  out.push("\nCOMMIT;\n\nSET session_replication_role = DEFAULT;");
  return { filename, sql: out.join("\n") + "\n" };
}
