import pg from "pg";

export type Row = Record<string, unknown>;

/** Minimal DB abstraction so the runner/seed work with node-postgres and PGlite (tests). */
export interface Db {
  query<T extends Row = Row>(sql: string, params?: unknown[]): Promise<T[]>;
  /** Runs a script that may contain several statements (no parameters). */
  exec(sql: string): Promise<void>;
  /** Runs fn inside BEGIN/COMMIT; rolls back on error. */
  transaction<T>(fn: (tx: Db) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

export const DEFAULT_DATABASE_URL =
  "postgres://episafe:episafe_dev@localhost:5432/episafe";

function wrapClient(client: pg.PoolClient | pg.Pool, onClose: () => Promise<void>): Db {
  const db: Db = {
    async query<T extends Row = Row>(sql: string, params?: unknown[]) {
      const res = await client.query(sql, params as unknown[] | undefined);
      return res.rows as T[];
    },
    async exec(sql) {
      await client.query(sql);
    },
    async transaction(fn) {
      const conn = "release" in client ? client : await (client as pg.Pool).connect();
      const owned = conn !== client;
      const tx = wrapClient(conn, async () => undefined);
      try {
        await conn.query("BEGIN");
        const out = await fn(tx);
        await conn.query("COMMIT");
        return out;
      } catch (err) {
        await conn.query("ROLLBACK");
        throw err;
      } finally {
        if (owned) conn.release();
      }
    },
    close: onClose,
  };
  return db;
}

export function connect(
  url = process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL,
  ssl = process.env.DATABASE_SSL === "true",
): Db {
  const pool = new pg.Pool({
    connectionString: url,
    ssl: ssl ? { rejectUnauthorized: false } : undefined,
    max: 5,
  });
  return wrapClient(pool, () => pool.end());
}
