import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "../src/db.js";
import { up } from "../src/migrate.js";
import { createPgliteDb } from "../src/pglite.js";
import { seed } from "../src/seed.js";

let db: Db;

beforeAll(async () => {
  db = await createPgliteDb();
  await up(db, undefined, () => undefined);
  await seed(db);
});
afterAll(async () => {
  await db.close();
});

describe("views", () => {
  it("v_daily_risk_inputs returns one row per logged day with labels", async () => {
    const rows = await db.query<{ n: string; labelled: string; missed: string }>(
      `SELECT count(*) AS n,
              count(*) FILTER (WHERE had_seizure) AS labelled,
              coalesce(sum(missed_meds), 0) AS missed
       FROM v_daily_risk_inputs`);
    expect(Number(rows[0]!.n)).toBe(90);
    expect(Number(rows[0]!.labelled)).toBeGreaterThan(0);
    expect(Number(rows[0]!.missed)).toBeGreaterThan(0);
  });

  it("v_daily_risk_inputs carries watch averages for recent days only", async () => {
    const rows = await db.query<{ with_hr: string }>(
      "SELECT count(*) FILTER (WHERE hr_avg IS NOT NULL) AS with_hr FROM v_daily_risk_inputs");
    const n = Number(rows[0]!.with_hr);
    expect(n).toBeGreaterThanOrEqual(7);
    expect(n).toBeLessThan(90);
  });

  it("v_adherence_30d reports a percentage between 0 and 100 per active medication", async () => {
    const rows = await db.query<{ medication_name: string; adherence_pct: string }>(
      "SELECT medication_name, adherence_pct FROM v_adherence_30d ORDER BY medication_name");
    expect(rows.map((r) => r.medication_name)).toEqual(["Lamotrigina", "Levetiracetam"]);
    for (const r of rows) {
      expect(Number(r.adherence_pct)).toBeGreaterThan(0);
      expect(Number(r.adherence_pct)).toBeLessThanOrEqual(100);
    }
  });

  it("v_seizure_summary exposes the streak since the last seizure", async () => {
    const [r] = await db.query<{ total: string; days_since_last: number }>(
      "SELECT total, days_since_last FROM v_seizure_summary");
    expect(Number(r!.total)).toBeGreaterThan(0);
    expect(r!.days_since_last).toBeGreaterThanOrEqual(0);
  });

  it("v_active_emergencies is empty because every seeded event is closed", async () => {
    expect(await db.query("SELECT 1 FROM v_active_emergencies")).toHaveLength(0);
  });
});
