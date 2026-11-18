import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "../src/db.js";
import { loadMigrations, status, up } from "../src/migrate.js";
import { createPgliteDb } from "../src/pglite.js";

let db: Db;
const quiet = () => undefined;

beforeAll(async () => {
  db = await createPgliteDb();
});
afterAll(async () => {
  await db.close();
});

describe("migration runner", () => {
  it("loads numbered migrations in order", async () => {
    const files = await loadMigrations();
    expect(files.length).toBeGreaterThan(0);
    expect(files.map((f) => f.version)).toEqual(files.map((_, i) => String(i + 1).padStart(3, "0")));
  });

  it("applies all migrations and is idempotent", async () => {
    const first = await up(db, undefined, quiet);
    expect(first.length).toBeGreaterThan(0);
    const second = await up(db, undefined, quiet);
    expect(second).toEqual([]);
    const st = await status(db);
    expect(st.every((s) => s.state === "applied")).toBe(true);
  });
});

describe("migration runner safety", () => {
  it("rejects a migration edited after it was applied", async () => {
    await db.query("UPDATE schema_migrations SET checksum = 'tampered' WHERE version = '001'");
    await expect(up(db, undefined, quiet)).rejects.toThrow(/modified after being applied/);
    const st = await status(db);
    expect(st[0]?.state).toBe("modified");
  });
});
