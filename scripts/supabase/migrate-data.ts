/**
 * Copies the whole Citadel database from one PostgreSQL server to another and verifies the copy exactly.
 * Built for the Netlify Database → Supabase move; it works between any two PostgreSQL servers.
 *
 *   npx tsx scripts/supabase/migrate-data.ts [--verify-only]
 *
 * Connection strings come from SOURCE_DB_URL and TARGET_DB_URL (see .env.example); they are never printed.
 * What it does on the target:
 *   1. creates the schema, views and audit triggers if missing (same initSchema as the app), incl. Supabase hardening;
 *   2. in one transaction: truncates every table, copies all rows with their ids (values transferred as text, so
 *      timestamps keep microseconds and decimals keep trailing zeros), restores the audit log exactly as in the source
 *      (rows the triggers wrote during the copy are discarded) and sets every id sequence;
 *   3. verifies: per table the row count and an MD5 of all rows, and every sequence position, must match the source.
 * Exit code 1 when anything differs. Safe to rerun: each run replaces the target completely.
 */
import postgres from "postgres";
import { existsSync, readFileSync } from "node:fs";
import { openPostgres, postgresOptions } from "../../server/db";
import { AUDITED_TABLES, initSchema } from "../../server/schema";

// .env (gitignored) holds the connection strings; values already in the environment win.
if (existsSync(".env")) {
  for (const line of readFileSync(".env", "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^(["'])(.*)\1$/, "$2");
  }
}
const verifyOnly = process.argv.includes("--verify-only");
// The source is only ever read. Netlify's read-only role cannot read sequence positions, so the owner string is
// preferred when both are present.
const SOURCE = process.env.SOURCE_DB_URL || process.env.SOURCE_DB_URL_READ_WRITE || process.env.SOURCE_DB_URL_READ_ONLY;
const TARGET = process.env.TARGET_DB_URL || process.env.DATABASE_URL;
if (!SOURCE || !TARGET) {
  console.error("Set SOURCE_DB_URL and TARGET_DB_URL (or DATABASE_URL) in .env or the environment.");
  process.exit(2);
}
const describe = (url: string) => {
  const u = new URL(url);
  return `${u.hostname}${u.port ? ":" + u.port : ""}${u.pathname}`;
};

type Sql = ReturnType<typeof postgres>;
const connect = (url: string): Sql => {
  const o = postgresOptions(url);
  return postgres(url, { max: 1, onnotice: () => {}, ssl: o.ssl, prepare: o.prepare, connect_timeout: 20 });
};

interface Column { column_name: string; udt_name: string; identity_generation: string | null }
const columnsOf = (sql: Sql, table: string) =>
  sql<Column[]>`SELECT column_name, udt_name, identity_generation FROM information_schema.columns
                WHERE table_schema = 'public' AND table_name = ${table} ORDER BY ordinal_position`;

/** Row count + MD5 of every row's text form, computed with fixed output settings so both servers format alike. */
async function fingerprint(sql: Sql, table: string) {
  return sql.begin(async (tx) => {
    await tx.unsafe("SET LOCAL timezone = 'UTC'; SET LOCAL datestyle = 'ISO, YMD'; SET LOCAL extra_float_digits = 3");
    const [r] = await tx.unsafe<{ n: string; h: string }[]>(
      `SELECT count(*)::text AS n, md5(coalesce(string_agg(t::text, '|' ORDER BY id), '')) AS h FROM "${table}" t`,
    );
    const [s] = await tx.unsafe<{ seq: string | null }[]>(`SELECT pg_get_serial_sequence('"${table}"', 'id') AS seq`);
    let seq = "-";
    if (s.seq) {
      const [v] = await tx.unsafe<{ last_value: string; is_called: boolean }[]>(`SELECT last_value::text, is_called FROM ${s.seq}`);
      seq = `${v.last_value}/${v.is_called ? "called" : "fresh"}`;
    }
    return { n: Number(r.n), h: r.h, seq };
  });
}

const src = connect(SOURCE);
const dst = connect(TARGET);
console.log(`source: ${describe(SOURCE)}\ntarget: ${describe(TARGET)}`);

if (!verifyOnly) {
  // 1. schema on the target (idempotent; same code path as the app on cold start)
  const db = await openPostgres(TARGET);
  await initSchema(db);
  await db.close();

  // 2. copy
  const plan: { table: string; cols: Column[]; rows: (string | null)[][] }[] = [];
  for (const table of AUDITED_TABLES) {
    const cols = await columnsOf(dst, table);
    const srcCols = (await columnsOf(src, table)).map((c) => c.column_name);
    const missing = cols.map((c) => c.column_name).filter((c) => !srcCols.includes(c));
    const extra = srcCols.filter((c) => !cols.some((k) => k.column_name === c));
    if (missing.length || extra.length) throw new Error(`${table}: column mismatch — missing in source: [${missing}], extra in source: [${extra}]`);
    const sel = cols.map((c) => `"${c.column_name}"::text`).join(", ");
    const rows = await src.begin(async (tx) => {
      await tx.unsafe("SET LOCAL timezone = 'UTC'; SET LOCAL datestyle = 'ISO, YMD'; SET LOCAL extra_float_digits = 3");
      return (await tx.unsafe<Record<string, string | null>[]>(`SELECT ${sel} FROM "${table}" ORDER BY id`)).map((r) => cols.map((c) => r[c.column_name]));
    });
    plan.push({ table, cols, rows });
  }
  const CHUNK = 200;
  await dst.begin(async (tx) => {
    await tx.unsafe(`TRUNCATE TABLE ${[...AUDITED_TABLES].reverse().map((t) => `"${t}"`).join(", ")} RESTART IDENTITY CASCADE`);
    const insert = async (p: (typeof plan)[number]) => {
      const names = p.cols.map((c) => `"${c.column_name}"`).join(", ");
      const overriding = p.cols.some((c) => c.identity_generation === "ALWAYS") ? " OVERRIDING SYSTEM VALUE" : "";
      for (let i = 0; i < p.rows.length; i += CHUNK) {
        const chunk = p.rows.slice(i, i + CHUNK);
        const values = chunk.map((_, r) => `(${p.cols.map((c, k) => `$${r * p.cols.length + k + 1}::text::${c.udt_name}`).join(", ")})`).join(", ");
        await tx.unsafe(`INSERT INTO "${p.table}" (${names})${overriding} VALUES ${values}`, chunk.flat() as any[]);
      }
    };
    for (const p of plan) if (p.table !== "audit_log") await insert(p);
    // the audit triggers logged the copy itself; replace that with the source's audit log, row for row
    await tx.unsafe(`DELETE FROM "audit_log"`);
    await insert(plan.find((p) => p.table === "audit_log")!);
    // sequences: copy the exact position (the source may sit above max(id) after deletes)
    for (const p of plan) {
      const [s] = await src.unsafe<{ seq: string | null }[]>(`SELECT pg_get_serial_sequence('"${p.table}"', 'id') AS seq`);
      if (!s.seq) continue;
      const [v] = await src.unsafe<{ last_value: string; is_called: boolean }[]>(`SELECT last_value::text, is_called FROM ${s.seq}`);
      await tx.unsafe(`SELECT setval(pg_get_serial_sequence('"${p.table}"', 'id'), $1::text::bigint, $2::text::boolean)`, [v.last_value, String(v.is_called)]);
    }
  });
  console.log(`copied ${plan.reduce((a, p) => a + p.rows.length, 0)} rows in ${plan.length} tables`);
}

// 3. verify
let bad = 0;
for (const table of AUDITED_TABLES) {
  const [a, b] = await Promise.all([fingerprint(src, table), fingerprint(dst, table)]);
  const same = a.n === b.n && a.h === b.h && a.seq === b.seq;
  if (!same) bad++;
  console.log(`${same ? "✓" : "✗"} ${table.padEnd(18)} rows ${String(a.n).padStart(4)} → ${String(b.n).padStart(4)}  md5 ${same ? "identical" : `${a.h.slice(0, 8)} ≠ ${b.h.slice(0, 8)}`}  seq ${a.seq}${a.seq === b.seq ? "" : ` ≠ ${b.seq}`}`);
}
console.log(bad ? `\n${bad} table(s) differ.` : "\nTarget is an exact copy of the source.");
await src.end();
await dst.end();
process.exit(bad ? 1 : 0);
