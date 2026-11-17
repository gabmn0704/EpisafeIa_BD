import { randomUUID } from "node:crypto";
import { Rng, clamp, round, sigmoid } from "./rng.js";
import { localToUtc, minutes } from "./time.js";
import type {
  SeedContact,
  SeedDailyLog,
  SeedEmergencyEvent,
  SeedNotification,
  SeedSeizure,
} from "./types.js";

const SEIZURE_TYPES = ["tonico-clonica", "focal con alteracion de conciencia", "focal consciente", "ausencia"] as const;
const LOCATIONS = ["Casa", "Casa", "Universidad", "Trabajo", "Transporte publico", "Calle"];
const BOGOTA_COORDS: Array<[number, number]> = [
  [4.6486, -74.0628],
  [4.7110, -74.0721],
  [4.6097, -74.0817],
  [4.6682, -74.0535],
];

/** Hidden "ground truth" used only to generate data; the AI service must learn it back. */
export function seizureProbability(d: SeedDailyLog): number {
  const z =
    -4.6 +
    3.6 * (d.sleepHours < 5 ? 1 : 0) +
    0.5 * Math.max(0, d.stressLevel - 6) +
    2.8 * (d.missedMeds > 0 ? 1 : 0) +
    0.5 * (d.alcoholUnits >= 2 ? 1 : 0) +
    0.004 * Math.max(0, d.caffeineMg - 300);
  return sigmoid(z);
}

export function triggersFor(d: SeedDailyLog): string[] {
  const t: string[] = [];
  if (d.sleepHours < 5) t.push("sueño insuficiente");
  if (d.stressLevel >= 8) t.push("estrés alto");
  if (d.missedMeds > 0) t.push("medicación omitida");
  if (d.alcoholUnits >= 2) t.push("alcohol");
  if (d.caffeineMg > 350) t.push("exceso de cafeína");
  return t;
}

export interface SeizuresResult {
  seizures: SeedSeizure[];
  events: SeedEmergencyEvent[];
  notifications: SeedNotification[];
}

export function generateSeizures(
  rng: Rng,
  logs: SeedDailyLog[],
  contacts: SeedContact[],
  now: Date,
): SeizuresResult {
  const seizures: SeedSeizure[] = [];
  const events: SeedEmergencyEvent[] = [];
  const notifications: SeedNotification[] = [];

  for (const log of logs) {
    if (!rng.chance(seizureProbability(log))) continue;
    const hour = rng.chance(0.55) ? rng.int(5, 11) : rng.int(12, 23);
    const startedAt = new Date(
      localToUtc(log.logDate, `${String(hour).padStart(2, "0")}:00`).getTime() + minutes(rng.int(0, 59)),
    );
    if (startedAt.getTime() > now.getTime() - minutes(30)) continue;

    const duration = Math.round(clamp(rng.gauss(95, 45), 20, 360));
    const severity = Math.round(clamp(1 + duration / 80 + rng.gauss(0, 0.7), 1, 5));
    const triggers = triggersFor(log);
    const source = rng.chance(0.25) ? "emergency" : "manual";
    const seizure: SeedSeizure = {
      id: randomUUID(),
      startedAt,
      durationSeconds: duration,
      severity,
      seizureType: rng.pick(SEIZURE_TYPES),
      triggersNoted: triggers,
      location: rng.pick(LOCATIONS),
      notes: triggers.length ? `Posibles desencadenantes: ${triggers.join(", ")}` : null,
      source,
      resolvedAt: new Date(startedAt.getTime() + (duration + rng.int(120, 900)) * 1000),
    };
    seizures.push(seizure);
    if (source === "emergency") addEmergency(rng, seizure, contacts, events, notifications);
  }
  return { seizures, events, notifications };
}

/** Creates a resolved emergency event and its notification fan-out ordered by contact priority. */
export function addEmergency(
  rng: Rng,
  seizure: SeedSeizure,
  contacts: SeedContact[],
  events: SeedEmergencyEvent[],
  notifications: SeedNotification[],
): SeedEmergencyEvent {
  const [lat, lon] = rng.pick(BOGOTA_COORDS);
  const event: SeedEmergencyEvent = {
    id: randomUUID(),
    seizureId: seizure.id,
    triggeredAt: seizure.startedAt,
    status: "resolved",
    latitude: round(lat + rng.gauss(0, 0.004), 6),
    longitude: round(lon + rng.gauss(0, 0.004), 6),
    resolvedAt: seizure.resolvedAt,
  };
  events.push(event);
  const ordered = [...contacts].sort((a, b) => a.priority - b.priority);
  ordered.forEach((c, idx) => {
    const channels = [c.notifySms && "sms", c.notifyEmail && "email"].filter(Boolean) as Array<"sms" | "email">;
    for (const channel of channels) {
      const createdAt = new Date(event.triggeredAt.getTime() + idx * 2000);
      notifications.push({
        contactId: c.id,
        eventId: event.id,
        channel,
        payload: {
          message: "Laura activó la alerta de emergencia por una posible crisis.",
          latitude: event.latitude,
          longitude: event.longitude,
          priority: c.priority,
        },
        status: "sent",
        createdAt,
        sentAt: new Date(createdAt.getTime() + 1500),
      });
    }
  });
  return event;
}
