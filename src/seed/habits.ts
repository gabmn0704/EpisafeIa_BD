import { Rng, clamp, round } from "./rng.js";
import { addDays, localToUtc, minutes } from "./time.js";
import type { SeedDailyLog, SeedMedication, SeedMedicationLog } from "./types.js";

const NOTES_BAD_SLEEP = ["Dormi muy poco, mucha ansiedad", "Noche de insomnio", "Me desperte varias veces"];
const NOTES_STRESS = ["Semana de examenes", "Entrega en el trabajo", "Discusion familiar"];

export interface HabitsResult {
  dailyLogs: SeedDailyLog[];
  medicationLogs: SeedMedicationLog[];
}

/**
 * Generates habits and medication intake for `days` days ending at `today` (inclusive).
 * Stress follows an AR(1) process, bad nights (<5 h) happen ~14% of the time and
 * missed doses cluster in short streaks, so downstream seizure risk has real structure.
 */
export function generateHabits(
  rng: Rng,
  meds: SeedMedication[],
  today: string,
  now: Date,
  days: number,
): HabitsResult {
  const dailyLogs: SeedDailyLog[] = [];
  const medicationLogs: SeedMedicationLog[] = [];
  let stress = 4;
  let missStreak = 0;

  for (let i = days - 1; i >= 0; i--) {
    const date = addDays(today, -i);

    stress = clamp(round(0.7 * stress + 0.3 * 4 + rng.gauss(0, 1.5)), 1, 10);
    const badNight = rng.chance(0.14) || (stress >= 8 && rng.chance(0.3));
    const sleep = round(clamp(badNight ? rng.gauss(4.2, 0.5) : rng.gauss(7.1, 0.9), 2.5, 10), 2);
    const caffeine = Math.round(clamp(rng.gauss(150 + (sleep < 6 ? 80 : 0), 70), 0, 500) / 5) * 5;
    const exercise = rng.chance(0.4) ? 0 : Math.round(clamp(rng.gauss(35, 15), 5, 120) / 5) * 5;
    const alcohol = rng.chance(0.1) ? round(rng.between(1, 4), 1) : 0;

    if (missStreak > 0) missStreak--;
    else if (rng.chance(0.04)) missStreak = rng.int(1, 2);

    let missedToday = 0;
    for (const med of meds) {
      for (const t of med.scheduleTimes) {
        const scheduledFor = localToUtc(date, t);
        if (scheduledFor.getTime() > now.getTime()) {
          medicationLogs.push({ medicationId: med.id, scheduledFor, takenAt: null, status: "pending" });
          continue;
        }
        const roll = rng.next();
        const missed = missStreak > 0 ? roll < 0.85 : roll < 0.03;
        const skipped = !missed && roll > 0.985;
        if (missed) {
          missedToday++;
          medicationLogs.push({ medicationId: med.id, scheduledFor, takenAt: null, status: "missed" });
        } else if (skipped) {
          medicationLogs.push({ medicationId: med.id, scheduledFor, takenAt: null, status: "skipped" });
        } else {
          const delay = minutes(Math.max(0, Math.round(rng.gauss(12, 15))));
          medicationLogs.push({
            medicationId: med.id,
            scheduledFor,
            takenAt: new Date(scheduledFor.getTime() + delay),
            status: "taken",
          });
        }
      }
    }

    const mood = Math.round(clamp(4.2 - 0.25 * (stress - 4) - (sleep < 5 ? 0.9 : 0) + rng.gauss(0, 0.6), 1, 5));
    let notes: string | null = null;
    if (sleep < 5 && rng.chance(0.6)) notes = rng.pick(NOTES_BAD_SLEEP);
    else if (stress >= 8 && rng.chance(0.5)) notes = rng.pick(NOTES_STRESS);
    else if (missedToday > 0 && rng.chance(0.5)) notes = "Olvide tomar la medicacion";

    dailyLogs.push({
      logDate: date,
      sleepHours: sleep,
      stressLevel: stress,
      caffeineMg: caffeine,
      exerciseMinutes: exercise,
      mood,
      alcoholUnits: alcohol,
      notes,
      missedMeds: missedToday,
    });
  }
  return { dailyLogs, medicationLogs };
}
