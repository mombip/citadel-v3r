/**
 * Thin database adapter with two interchangeable backends:
 *  - PostgreSQL (production) via the `postgres` driver when DATABASE_URL is set,
 *  - PGlite (embedded WASM Postgres) for development and tests when it is not.
 *
 * Both run the same SQL, so there is one schema and one query layer.
 * Types: BIGINT/NUMERIC → number, DATE → "YYYY-MM-DD" string, TIMESTAMPTZ → Date.
 */
import type postgresType from "postgres";

export interface Queryable {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
  one<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T | undefined>;
  scalar<T = unknown>(sql: string, params?: unknown[]): Promise<T | undefined>;
  exec(sql: string): Promise<void>;
}

export interface Db extends Queryable {
  tx<T>(fn: (q: Queryable) => Promise<T>): Promise<T>;
  close(): Promise<void>;
  readonly kind: "postgres" | "pglite";
}

export class UniqueViolation extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UniqueViolation";
  }
}

function wrap(err: unknown): never {
  const code = (err as { code?: string })?.code;
  if (code === "23505") throw new UniqueViolation((err as Error).message);
  throw err;
}

function withHelpers(q: Pick<Queryable, "query" | "exec">): Queryable {
  return {
    ...q,
    async one(sql, params) {
      const rows = await q.query<any>(sql, params);
      return rows[0];
    },
    async scalar(sql, params) {
      const rows = await q.query<any>(sql, params);
      const row = rows[0];
      return row ? (Object.values(row)[0] as any) : undefined;
    },
  };
}

export async function openPostgres(url: string): Promise<Db> {
  const postgres = (await import("postgres")).default;
  const sql = postgres(url, {
    max: 5,
    onnotice: () => {},
    types: {
      bigint: { to: 20, from: [20], serialize: (x: unknown) => String(x), parse: Number },
      numeric: { to: 1700, from: [1700], serialize: (x: unknown) => String(x), parse: Number },
      date: { to: 1082, from: [1082], serialize: (x: unknown) => String(x), parse: (x: string) => x },
    },
  });
  const make = (s: postgresType.Sql | postgresType.TransactionSql): Queryable =>
    withHelpers({
      async query(text, params = []) {
        try {
          return (await s.unsafe(text, params as any)) as any;
        } catch (e) {
          wrap(e);
        }
      },
      async exec(text) {
        try {
          await s.unsafe(text);
        } catch (e) {
          wrap(e);
        }
      },
    });
  const base = make(sql);
  return {
    kind: "postgres",
    ...base,
    tx: (fn) => sql.begin((t) => fn(make(t))) as Promise<any>,
    close: () => sql.end(),
  };
}

export async function openPglite(dataDir?: string): Promise<Db> {
  const { PGlite } = await import("@electric-sql/pglite");
  const parsers = { 20: Number, 1700: Number, 1082: (v: string) => v };
  const pg = dataDir ? new PGlite(dataDir, { parsers }) : new PGlite({ parsers });
  await pg.waitReady;
  const make = (p: { query: Function; exec: Function }): Queryable =>
    withHelpers({
      async query(text, params = []) {
        try {
          return (await p.query(text, params)).rows;
        } catch (e) {
          wrap(e);
        }
      },
      async exec(text) {
        try {
          await p.exec(text);
        } catch (e) {
          wrap(e);
        }
      },
    });
  const base = make(pg);
  return {
    kind: "pglite",
    ...base,
    tx: (fn) => pg.transaction((t) => fn(make(t))) as Promise<any>,
    close: () => pg.close(),
  };
}

export async function openDb(): Promise<Db> {
  const url = process.env.DATABASE_URL;
  if (url) return openPostgres(url);
  return openPglite(process.env.PGLITE_DIR || undefined);
}
