import { Rng, clamp, round } from "./rng.js";
import { bogotaDate, localToUtc, minutes } from "./time.js";
import type { SeedDailyLog, SeedWearableSample } from "./types.js";

export interface AnomalyWindow {
  start: Date;
  end: Date;
  kind: "convulsive" | "tachycardia";
}

const STEP_MIN = 5;

/**
 * Samples every 5 minutes for the last `days` days up to `now`.
 * Resting heart rate and HRV follow the previous night's sleep and the day's stress,
 * which gives the risk model realistic physiological inputs.
 */
export function generateSamples(
  rng: Rng,
  logs: SeedDailyLog[],
  now: Date,
  days: number,
  anomalies: AnomalyWindow[],
): SeedWearableSample[] {
  const byDate = new Map(logs.map((l) => [l.logDate, l]));
  const samples: SeedWearableSample[] = [];
  const start = new Date(Math.floor((now.getTime() - days * 86_400_000) / 300_000) * 300_000);

  for (let t = start.getTime(); t <= now.getTime(); t += minutes(STEP_MIN)) {
    const at = new Date(t);
    const date = bogotaDate(at);
    const log = byDate.get(date);
    const localHour = (new Date(t - 5 * 3_600_000).getUTCHours()) + new Date(t).getUTCMinutes() / 60;
    const asleep = localHour < 6 || localHour >= 23;
    const exercising = !!log && log.exerciseMinutes > 0 &&
      t >= localToUtc(date, "18:00").getTime() &&
      t < localToUtc(date, "18:00").getTime() + minutes(log.exerciseMinutes);
    const anomaly = anomalies.find((a) => t >= a.start.getTime() && t <= a.end.getTime());

    const stressBoost = log ? (log.stressLevel - 4) * 1.1 : 0;
    const sleepBoost = log && log.sleepHours < 5 ? 5 : 0;
    let hr = 66 + (asleep ? -9 : 4 * Math.sin((localHour - 9) / 24 * 2 * Math.PI)) + stressBoost + sleepBoost;
    let motion = asleep ? 0.03 : 0.25;
    let hrv = clamp(52 - (log ? (log.stressLevel - 4) * 2.5 : 0) - sleepBoost * 1.5 + (asleep ? 8 : 0), 15, 90);
    let steps = asleep ? 0 : rng.chance(0.5) ? rng.int(0, 45) : 0;

    if (exercising) {
      hr += rng.between(45, 70);
      motion = rng.between(0.9, 1.6);
      steps = rng.int(300, 600);
      hrv *= 0.5;
    }
    if (anomaly?.kind === "convulsive") {
      hr = rng.between(125, 165);
      motion = rng.between(2.5, 4.2);
      hrv = rng.between(8, 18);
      steps = 0;
    } else if (anomaly?.kind === "tachycardia") {
      hr = rng.between(122, 140);
      motion = rng.between(0.02, 0.12);
      hrv = rng.between(12, 22);
      steps = 0;
    }

    samples.push({
      sampledAt: at,
      heartRate: Math.round(clamp(hr + rng.gauss(0, 2.5), 38, 190)),
      hrvMs: round(clamp(hrv + rng.gauss(0, 3), 5, 110), 1),
      spo2: round(clamp(rng.gauss(asleep ? 96.5 : 97.5, 0.7), 90, 100), 1),
      motionIntensity: round(clamp(motion + rng.gauss(0, 0.04), 0, 6), 3),
      skinTempC: round(rng.gauss(asleep ? 33.8 : 34.4, 0.25), 1),
      steps,
    });
  }
  return samples;
}
