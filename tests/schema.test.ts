import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "../src/db.js";
import { up } from "../src/migrate.js";
import { createPgliteDb } from "../src/pglite.js";

let db: Db;
let userId: string;

beforeAll(async () => {
  db = await createPgliteDb();
  await up(db, undefined, () => undefined);
  const rows = await db.query<{ id: string }>(
    "INSERT INTO users (email, password_hash, full_name) VALUES ('a@b.co', 'x', 'Test') RETURNING id",
  );
  userId = rows[0]!.id;
});
afterAll(async () => {
  await db.close();
});

const rejects = (sql: string, params: unknown[] = []) =>
  expect(db.query(sql, params)).rejects.toThrow();

describe("schema: all contract tables exist", () => {
  it("has every table", async () => {
    const expected = [
      "users", "emergency_contacts", "medications", "medication_logs", "daily_logs", "seizures",
      "emergency_events", "notifications", "risk_assessments", "insights", "wearable_devices",
      "wearable_samples", "wearable_alerts", "audit_log", "refresh_tokens", "schema_migrations",
    ];
    const rows = await db.query<{ table_name: string }>(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'",
    );
    const names = rows.map((r) => r.table_name);
    for (const t of expected) expect(names).toContain(t);
  });
});

describe("schema: constraints", () => {
  it("applies user defaults and rejects bad role / duplicate email", async () => {
    const [u] = await db.query<{ role: string; timezone: string }>(
      "SELECT role, timezone FROM users WHERE id = $1", [userId]);
    expect(u).toEqual({ role: "patient", timezone: "America/Bogota" });
    await rejects("INSERT INTO users (email, password_hash, full_name, role) VALUES ('c@d.co','x','y','boss')");
    await rejects("INSERT INTO users (email, password_hash, full_name) VALUES ('a@b.co','x','y')");
  });

  it("validates daily_logs ranges and uniqueness", async () => {
    await db.query("INSERT INTO daily_logs (user_id, log_date, sleep_hours, stress_level, mood) VALUES ($1,'2026-01-01',7.5,5,3)", [userId]);
    await rejects("INSERT INTO daily_logs (user_id, log_date) VALUES ($1,'2026-01-01')", [userId]);
    await rejects("INSERT INTO daily_logs (user_id, log_date, stress_level) VALUES ($1,'2026-01-02',11)", [userId]);
    await rejects("INSERT INTO daily_logs (user_id, log_date, mood) VALUES ($1,'2026-01-02',0)", [userId]);
    await rejects("INSERT INTO daily_logs (user_id, log_date, sleep_hours) VALUES ($1,'2026-01-02',25)", [userId]);
  });

  it("keeps updated_at fresh through the trigger", async () => {
    await db.query("UPDATE daily_logs SET updated_at = '2000-01-01' WHERE user_id = $1", [userId]);
    await db.query("UPDATE daily_logs SET mood = 4 WHERE user_id = $1", [userId]);
    const [r] = await db.query<{ fresh: boolean }>(
      "SELECT updated_at > now() - interval '1 minute' AS fresh FROM daily_logs WHERE user_id = $1", [userId]);
    expect(r?.fresh).toBe(true);
  });

  it("validates medication schedule format and log consistency", async () => {
    const [m] = await db.query<{ id: string }>(
      "INSERT INTO medications (user_id, name, dose, schedule_times) VALUES ($1,'Levetiracetam',500,ARRAY['08:00','20:00']) RETURNING id", [userId]);
    await rejects("INSERT INTO medications (user_id, name, schedule_times) VALUES ($1,'X',ARRAY['25:99'])", [userId]);
    await db.query("INSERT INTO medication_logs (user_id, medication_id, scheduled_for, status, taken_at) VALUES ($1,$2,now(),'taken',now())", [userId, m!.id]);
    await rejects("INSERT INTO medication_logs (user_id, medication_id, scheduled_for, status) VALUES ($1,$2,now() - interval '1 day','taken')", [userId, m!.id]);
    await rejects("INSERT INTO medication_logs (user_id, medication_id, scheduled_for, status) VALUES ($1,$2,now() - interval '2 day','bogus')", [userId, m!.id]);
  });

  it("validates seizures and emergency events", async () => {
    const [s] = await db.query<{ id: string }>(
      "INSERT INTO seizures (user_id, started_at, severity, source) VALUES ($1, now(), 3, 'emergency') RETURNING id", [userId]);
    await rejects("INSERT INTO seizures (user_id, started_at, severity) VALUES ($1, now(), 9)", [userId]);
    await rejects("INSERT INTO seizures (user_id, started_at, source) VALUES ($1, now(), 'dream')", [userId]);
    await db.query("INSERT INTO emergency_events (user_id, seizure_id, latitude, longitude) VALUES ($1,$2,4.711,-74.07)", [userId, s!.id]);
    await rejects("INSERT INTO emergency_events (user_id, latitude, longitude) VALUES ($1, 95, 0)", [userId]);
    await rejects("INSERT INTO emergency_events (user_id, latitude) VALUES ($1, 4.7)", [userId]);
  });

  it("validates risk assessments and wearable enums", async () => {
    await db.query("INSERT INTO risk_assessments (user_id, assessed_on, score, level) VALUES ($1,'2026-01-01',40,'moderate')", [userId]);
    await rejects("INSERT INTO risk_assessments (user_id, assessed_on, score, level) VALUES ($1,'2026-01-02',101,'low')", [userId]);
    await rejects("INSERT INTO risk_assessments (user_id, assessed_on, score, level) VALUES ($1,'2026-01-03',50,'meh')", [userId]);
    await rejects("INSERT INTO wearable_devices (user_id, provider, device_name) VALUES ($1,'nokia','x')", [userId]);
    await rejects("INSERT INTO wearable_samples (user_id, sampled_at, spo2) VALUES ($1, now(), 150)", [userId]);
  });

  it("cascades user deletion but keeps audit rows", async () => {
    const [u] = await db.query<{ id: string }>("INSERT INTO users (email, password_hash, full_name) VALUES ('z@z.co','x','Z') RETURNING id");
    await db.query("INSERT INTO daily_logs (user_id, log_date) VALUES ($1,'2026-02-01')", [u!.id]);
    await db.query("INSERT INTO audit_log (user_id, action, entity) VALUES ($1,'login','user')", [u!.id]);
    await db.query("DELETE FROM users WHERE id = $1", [u!.id]);
    const logs = await db.query("SELECT 1 FROM daily_logs WHERE user_id = $1", [u!.id]);
    const audit = await db.query<{ user_id: string | null }>("SELECT user_id FROM audit_log WHERE action = 'login'");
    expect(logs).toHaveLength(0);
    expect(audit[0]?.user_id).toBeNull();
  });
});
