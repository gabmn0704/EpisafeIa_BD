import { randomUUID } from "node:crypto";
import { demoContacts, demoMedications, demoUser } from "./fixtures.js";
import { generateHabits } from "./habits.js";
import { Rng } from "./rng.js";
import { buildInsights, scoreDay } from "./risk.js";
import { addEmergency, generateSeizures } from "./seizures.js";
import { addDays, bogotaDate, hours, localToUtc, minutes } from "./time.js";
import type { SeedDataset, SeedEmergencyEvent, SeedSeizure, SeedWearableAlert } from "./types.js";
import { generateSamples, type AnomalyWindow } from "./wearables.js";

export interface GenerateOptions {
  days?: number;
  seed?: number;
  now?: Date;
  /** Days of watch samples (5 min cadence). */
  wearableDays?: number;
}

export function generateDataset(opts: GenerateOptions = {}): SeedDataset {
  const days = opts.days ?? 90;
  const now = opts.now ?? new Date();
  const wearableDays = opts.wearableDays ?? 7;
  const rng = new Rng(opts.seed ?? 17);
  const today = bogotaDate(now);

  const user = demoUser();
  const contacts = demoContacts();
  const medications = demoMedications();
  const { dailyLogs, medicationLogs } = generateHabits(rng, medications, today, now, days);
  const { seizures, events, notifications } = generateSeizures(rng, dailyLogs, contacts, now);

  // Eventos curados para que el panel muestre cada flujo del reloj.
  const alerts: SeedWearableAlert[] = [];
  const anomalies: AnomalyWindow[] = [];

  const convStart = new Date(localToUtc(addDays(today, -3), "10:20").getTime());
  if (convStart.getTime() < now.getTime()) {
    const seizure: SeedSeizure = {
      id: randomUUID(),
      startedAt: convStart,
      durationSeconds: 110,
      severity: 3,
      seizureType: "tonico-clonica",
      triggersNoted: ["sueño insuficiente"],
      location: "Casa",
      notes: "Detectada automáticamente por el reloj; confirmada por el usuario.",
      source: "wearable",
      resolvedAt: new Date(convStart.getTime() + minutes(12)),
    };
    seizures.push(seizure);
    const event: SeedEmergencyEvent = addEmergency(rng, seizure, contacts, events, notifications);
    anomalies.push({ start: convStart, end: new Date(convStart.getTime() + seizure.durationSeconds * 1000), kind: "convulsive" });
    alerts.push({
      id: randomUUID(),
      detectedAt: new Date(convStart.getTime() + 20_000),
      kind: "motion_convulsive",
      confidence: 0.93,
      payload: { bandHz: [3, 8], energyRatio: 6.2, heartRate: 148 },
      convertedEventId: event.id,
    });
  }

  const tachyStart = new Date(now.getTime() - hours(26));
  anomalies.push({ start: tachyStart, end: new Date(tachyStart.getTime() + minutes(15)), kind: "tachycardia" });
  alerts.push({
    id: randomUUID(),
    detectedAt: new Date(tachyStart.getTime() + minutes(6)),
    kind: "tachycardia",
    confidence: 0.81,
    payload: { sustainedMinutes: 10, heartRate: 131, restingBaseline: 68 },
    convertedEventId: null,
  });

  // Una falsa alarma del boton SOS (sin crisis asociada).
  events.push({
    id: randomUUID(),
    seizureId: null,
    triggeredAt: new Date(localToUtc(addDays(today, -21), "15:40")),
    status: "false_alarm",
    latitude: 4.6486,
    longitude: -74.0628,
    resolvedAt: new Date(localToUtc(addDays(today, -21), "15:42")),
  });

  seizures.sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime());
  const samples = generateSamples(rng, dailyLogs, now, wearableDays, anomalies);

  return {
    user,
    contacts,
    medications,
    medicationLogs,
    dailyLogs,
    seizures,
    events,
    notifications,
    device: { id: randomUUID(), provider: "fitbit", deviceName: "Fitbit Charge 6", externalId: "FBT-DEMO-0001" },
    samples,
    alerts,
    risks: dailyLogs.map(scoreDay),
    insights: buildInsights(dailyLogs, seizures, now),
  };
}
