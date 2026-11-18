import bcrypt from "bcryptjs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { connect, type Db } from "./db.js";
import { DEMO_EMAIL, DEMO_PASSWORD } from "./seed/fixtures.js";
import { generateDataset, type GenerateOptions } from "./seed/generate.js";
import type { SeedDataset } from "./seed/types.js";

type Col = string | [name: string, cast: string];

const iso = (d: Date | null): string | null => (d ? d.toISOString() : null);
const pgArray = (items: string[]): string =>
  `{${items.map((s) => `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`).join(",")}}`;
const json = (v: unknown): string => JSON.stringify(v);

/** Multi-row INSERT in chunks; each column may carry a cast such as ::timestamptz. */
async function bulk(db: Db, table: string, cols: Col[], rows: unknown[][], chunk = 200): Promise<void> {
  const names = cols.map((c) => (typeof c === "string" ? c : c[0]));
  for (let i = 0; i < rows.length; i += chunk) {
    const slice = rows.slice(i, i + chunk);
    const params: unknown[] = [];
    const tuples = slice.map((row) => {
      const ph = row.map((value, idx) => {
        params.push(value);
        const col = cols[idx]!;
        return `$${params.length}${typeof col === "string" ? "" : col[1]}`;
      });
      return `(${ph.join(", ")})`;
    });
    await db.query(`INSERT INTO ${table} (${names.join(", ")}) VALUES ${tuples.join(", ")}`, params);
  }
}

export async function seedDataset(db: Db, data: SeedDataset, passwordHash: string): Promise<void> {
  await db.transaction(async (tx) => {
    // Idempotente: borra al usuario demo previo (las FK en cascada limpian sus datos).
    await tx.query("DELETE FROM users WHERE email = $1", [DEMO_EMAIL]);
    const uid = data.user.id;

    await tx.query(
      `INSERT INTO users (id, email, password_hash, full_name, birth_date, timezone, role)
       VALUES ($1, $2, $3, $4, $5, $6, 'patient')`,
      [uid, data.user.email, passwordHash, data.user.fullName, data.user.birthDate, data.user.timezone],
    );

    await bulk(tx, "emergency_contacts",
      ["id", "user_id", "name", "relationship", "phone", "email", "priority", "notify_sms", "notify_email"],
      data.contacts.map((c) => [c.id, uid, c.name, c.relationship, c.phone, c.email, c.priority, c.notifySms, c.notifyEmail]));

    await bulk(tx, "medications",
      ["id", "user_id", "name", "dose", "unit", ["schedule_times", "::text[]"], "active", "notes"],
      data.medications.map((m) => [m.id, uid, m.name, m.dose, m.unit, pgArray(m.scheduleTimes), true, m.notes]));

    await bulk(tx, "medication_logs",
      ["user_id", "medication_id", ["scheduled_for", "::timestamptz"], ["taken_at", "::timestamptz"], "status"],
      data.medicationLogs.map((l) => [uid, l.medicationId, iso(l.scheduledFor), iso(l.takenAt), l.status]));

    await bulk(tx, "daily_logs",
      ["user_id", ["log_date", "::date"], "sleep_hours", "stress_level", "caffeine_mg", "exercise_minutes", "mood", "alcohol_units", "notes"],
      data.dailyLogs.map((d) => [uid, d.logDate, d.sleepHours, d.stressLevel, d.caffeineMg, d.exerciseMinutes, d.mood, d.alcoholUnits, d.notes]));

    await bulk(tx, "seizures",
      ["id", "user_id", ["started_at", "::timestamptz"], "duration_seconds", "severity", "seizure_type",
       ["triggers_noted", "::text[]"], "location", "notes", "source", ["resolved_at", "::timestamptz"]],
      data.seizures.map((s) => [s.id, uid, iso(s.startedAt), s.durationSeconds, s.severity, s.seizureType,
        pgArray(s.triggersNoted), s.location, s.notes, s.source, iso(s.resolvedAt)]));

    await bulk(tx, "emergency_events",
      ["id", "user_id", "seizure_id", ["triggered_at", "::timestamptz"], "status", "latitude", "longitude", ["resolved_at", "::timestamptz"]],
      data.events.map((e) => [e.id, uid, e.seizureId, iso(e.triggeredAt), e.status, e.latitude, e.longitude, iso(e.resolvedAt)]));

    await bulk(tx, "notifications",
      ["user_id", "contact_id", "event_id", "channel", ["payload", "::jsonb"], "status", ["created_at", "::timestamptz"], ["sent_at", "::timestamptz"]],
      data.notifications.map((n) => [uid, n.contactId, n.eventId, n.channel, json(n.payload), n.status, iso(n.createdAt), iso(n.sentAt)]));

    const last = data.samples.at(-1)?.sampledAt ?? null;
    await tx.query(
      `INSERT INTO wearable_devices (id, user_id, provider, device_name, external_id, last_seen_at, active)
       VALUES ($1, $2, $3, $4, $5, $6, true)`,
      [data.device.id, uid, data.device.provider, data.device.deviceName, data.device.externalId, iso(last)],
    );

    await bulk(tx, "wearable_samples",
      ["user_id", "device_id", ["sampled_at", "::timestamptz"], "heart_rate", "hrv_ms", "spo2", "motion_intensity", "skin_temp_c", "steps"],
      data.samples.map((s) => [uid, data.device.id, iso(s.sampledAt), s.heartRate, s.hrvMs, s.spo2, s.motionIntensity, s.skinTempC, s.steps]));

    await bulk(tx, "wearable_alerts",
      ["id", "user_id", "device_id", ["detected_at", "::timestamptz"], "kind", "confidence", ["payload", "::jsonb"], "converted_event_id"],
      data.alerts.map((a) => [a.id, uid, data.device.id, iso(a.detectedAt), a.kind, a.confidence, json(a.payload), a.convertedEventId]));

    await bulk(tx, "risk_assessments",
      ["user_id", ["assessed_on", "::date"], "score", "level", ["factors", "::jsonb"], "model_version"],
      data.risks.map((r) => [uid, r.assessedOn, r.score, r.level, json(r.factors), r.modelVersion]));

    await bulk(tx, "insights",
      ["user_id", "kind", "title", "body", ["evidence", "::jsonb"], ["created_at", "::timestamptz"]],
      data.insights.map((i) => [uid, i.kind, i.title, i.body, json(i.evidence), iso(i.createdAt)]));

    await bulk(tx, "audit_log",
      ["user_id", "action", "entity", "entity_id", ["meta", "::jsonb"]],
      [
        [uid, "seed", "user", uid, json({ source: "npm run seed" })],
        ...data.events.filter((e) => e.status === "resolved").map((e) => [uid, "emergency.resolved", "emergency_event", e.id, json({})]),
      ]);
  });
}

export async function seed(db: Db, opts: GenerateOptions = {}): Promise<SeedDataset> {
  const data = generateDataset(opts);
  const hash = await bcrypt.hash(DEMO_PASSWORD, 10);
  await seedDataset(db, data, hash);
  return data;
}

async function main(): Promise<void> {
  const db = connect();
  try {
    const d = await seed(db);
    console.log(
      `Seed OK: ${DEMO_EMAIL} | ${d.dailyLogs.length} daily logs, ${d.seizures.length} seizures, ` +
        `${d.medicationLogs.length} medication logs, ${d.samples.length} wearable samples`,
    );
  } finally {
    await db.close();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
