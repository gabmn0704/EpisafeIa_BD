import { PGlite } from "@electric-sql/pglite";
import type { Db, Row } from "./db.js";

/**
 * In-process PostgreSQL (WASM) adapter. Used by the test-suite and by `npm run verify`
 * to exercise migrations and seed without Docker.
 */
function wrap(pg: PGlite, close: () => Promise<void>): Db {
  const db: Db = {
    async query<T extends Row = Row>(sql: string, params?: unknown[]) {
      const res = await pg.query<T>(sql, params);
      return res.rows;
    },
    async exec(sql) {
      await pg.exec(sql);
    },
    async transaction(fn) {
      return pg.transaction(async (tx) => {
        const inner: Db = {
          query: async <T extends Row = Row>(sql: string, params?: unknown[]) =>
            (await tx.query<T>(sql, params)).rows,
          exec: async (sql) => {
            await tx.exec(sql);
          },
          transaction: (f) => f(inner),
          close: async () => undefined,
        };
        return fn(inner);
      });
    },
    close,
  };
  return db;
}

export async function createPgliteDb(): Promise<Db> {
  const pg = new PGlite();
  await pg.waitReady;
  return wrap(pg, () => pg.close());
}
