import bcrypt from "bcryptjs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "../src/db.js";
import { up } from "../src/migrate.js";
import { createPgliteDb } from "../src/pglite.js";
import { seed } from "../src/seed.js";
import { DEMO_EMAIL, DEMO_PASSWORD } from "../src/seed/fixtures.js";
import { generateDataset } from "../src/seed/generate.js";
import { bogotaDate } from "../src/seed/time.js";

let db: Db;

beforeAll(async () => {
  db = await createPgliteDb();
  await up(db, undefined, () => undefined);
  await seed(db);
});
afterAll(async () => {
  await db.close();
});

const count = async (sql: string): Promise<number> =>
  Number(((await db.query<{ n: string }>(sql))[0] as { n: string }).n);

describe("generator", () => {
  it("is deterministic for a fixed seed and clock", () => {
    const now = new Date("2026-06-15T15:00:00Z");
    const a = generateDataset({ now, seed: 5 });
    const b = generateDataset({ now, seed: 5 });
    expect(a.dailyLogs).toEqual(b.dailyLogs);
    expect(a.seizures.map((s) => s.startedAt)).toEqual(b.seizures.map((s) => s.startedAt));
  });

  it("makes seizures far likelier after short sleep than after normal sleep", () => {
    let low = 0, lowS = 0, ok = 0, okS = 0;
    for (let seed = 1; seed <= 15; seed++) {
      const d = generateDataset({ seed, now: new Date("2026-06-15T15:00:00Z") });
      const days = new Set(d.seizures.map((s) => bogotaDate(s.startedAt)));
      for (const l of d.dailyLogs) {
        const hit = days.has(l.logDate) ? 1 : 0;
        if (l.sleepHours < 5) { low++; lowS += hit; } else { ok++; okS += hit; }
      }
    }
    expect(lowS / low).toBeGreaterThan(3 * (okS / ok));
  });
});

describe("seeded database", () => {
  it("creates the demo user with a valid bcrypt password", async () => {
    const [u] = await db.query<{ password_hash: string }>("SELECT password_hash FROM users WHERE email = $1", [DEMO_EMAIL]);
    expect(await bcrypt.compare(DEMO_PASSWORD, u!.password_hash)).toBe(true);
  });

  it("has ~90 days of logs and realistic volumes", async () => {
    expect(await count("SELECT count(*) AS n FROM daily_logs")).toBe(90);
    expect(await count("SELECT count(*) AS n FROM seizures")).toBeGreaterThanOrEqual(8);
    expect(await count("SELECT count(*) AS n FROM wearable_samples")).toBeGreaterThan(1500);
    expect(await count("SELECT count(*) AS n FROM risk_assessments")).toBe(90);
    expect(await count("SELECT count(*) AS n FROM emergency_contacts")).toBe(3);
    expect(await count("SELECT count(*) AS n FROM insights")).toBeGreaterThan(0);
  });

  it("is idempotent when re-run", async () => {
    await seed(db);
    expect(await count("SELECT count(*) AS n FROM users WHERE email = 'demo@episafe.app'")).toBe(1);
    expect(await count("SELECT count(*) AS n FROM daily_logs")).toBe(90);
  });

  it("keeps wearable alerts linked to emergency events", async () => {
    expect(await count("SELECT count(*) AS n FROM wearable_alerts WHERE converted_event_id IS NOT NULL")).toBe(1);
    expect(await count("SELECT count(*) AS n FROM wearable_alerts WHERE converted_event_id IS NULL")).toBeGreaterThanOrEqual(1);
  });
});
