/**
 * Compares the full contents of two databases after the same scenario ran in each app.
 * Values that legitimately differ between runs are normalised: timestamps become "<set>"/null, random UUID
 * idempotency keys become "<uuid>", password hashes and salts become "<hash>". Everything else must be identical,
 * including row ids and the JSON stored by the audit trigger.
 * Usage: npx tsx scripts/ops-diff/diff-db.ts <urlA> <urlB> [baselineAuditId]
 */
import postgres from "postgres";

const [urlA, urlB, baseline = "0"] = process.argv.slice(2);
const TABLES = ["kraje", "regiony", "kola", "uzytkownicy", "czlonkowie", "wplaty", "wplaty_oczekujace", "naliczenia_reczne",
  "korekty", "wydatki", "korekty_kasy", "terminy_glosowan", "audit_log"];
const TIME = new Set(["deleted_at", "data_wpisu", "utworzono_o", "ostatnie_logowanie", "ostatnia_aktywnosc", "data_zgloszenia",
  "data_rozpatrzenia", "zmieniono_o"]);
const SECRET = new Set(["haslo_hash", "salt"]);
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

function norm(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    if (TIME.has(k)) out[k] = v == null ? null : "<set>";
    else if (SECRET.has(k)) out[k] = v == null ? null : "<hash>";
    else if (k === "stare_dane" || k === "nowe_dane") out[k] = v == null ? null : norm(typeof v === "string" ? JSON.parse(v) : (v as Record<string, unknown>));
    else if (typeof v === "string") out[k] = v.replace(UUID, "<uuid>");
    else if (v instanceof Date) out[k] = v.toISOString().slice(0, 10);
    else out[k] = v;
  }
  return out;
}

async function dump(url: string) {
  const sql = postgres(url, { onnotice: () => {}, types: { bigint: postgres.BigInt } });
  const res: Record<string, string[]> = {};
  for (const t of TABLES) {
    const where = t === "audit_log" ? sql`WHERE id > ${Number(baseline)}` : sql``;
    const rows = await sql`SELECT * FROM ${sql(t)} ${where} ORDER BY id`;
    res[t] = rows.map((r) => JSON.stringify(norm(r), (_k, v) => (typeof v === "bigint" ? Number(v) : v)));
  }
  await sql.end();
  return res;
}

/** Retries when the OS has no free ephemeral port (EADDRINUSE on connect) — seen on busy Windows machines. */
async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try { return await fn(); } catch (e) {
      if (attempt >= 8 || !String((e as { code?: string }).code ?? e).includes("EADDRINUSE")) throw e;
      await new Promise((r) => setTimeout(r, 5000 * attempt));
    }
  }
}
const a = await withRetry(() => dump(urlA));
const b = await withRetry(() => dump(urlB));
let diffs = 0;
for (const t of TABLES) {
  const n = Math.max(a[t].length, b[t].length);
  const bad: string[] = [];
  for (let i = 0; i < n; i++) if (a[t][i] !== b[t][i]) bad.push(`  A: ${a[t][i] ?? "—"}\n  B: ${b[t][i] ?? "—"}`);
  diffs += bad.length;
  console.log(`${bad.length ? "✗" : "✓"} ${t.padEnd(18)} A ${String(a[t].length).padStart(4)} rows, B ${String(b[t].length).padStart(4)} rows${bad.length ? `, ${bad.length} differ` : ""}`);
  for (const line of bad.slice(0, 6)) console.log(line);
}
console.log(diffs ? `\n${diffs} differing rows.` : "\nDatabases identical (after normalisation).");
process.exitCode = diffs ? 1 : 0;
