import { round, sigmoid } from "./rng.js";
import { bogotaDate } from "./time.js";
import type { SeedDailyLog, SeedInsight, SeedRisk, SeedSeizure } from "./types.js";

export const MODEL_VERSION = "logistic-prior-1.0";

type Factor = SeedRisk["factors"][number];

function levelFor(score: number): SeedRisk["level"] {
  if (score < 25) return "low";
  if (score < 50) return "moderate";
  if (score < 75) return "high";
  return "critical";
}

/** Clinical-prior logistic score, mirroring what the AI service returns as its default. */
export function scoreDay(d: SeedDailyLog): SeedRisk {
  const factors: Factor[] = [];
  let z = -1.7;
  const add = (name: string, impact: number, detail: string) => {
    if (impact === 0) return;
    z += impact;
    factors.push({ name, impact: round(impact, 2), direction: impact > 0 ? "up" : "down", detail });
  };

  if (d.sleepHours < 5) add("sueño", 1.5, `Dormiste ${d.sleepHours} h (menos de 5 h)`);
  else if (d.sleepHours < 6.5) add("sueño", 0.5, `Dormiste ${d.sleepHours} h`);
  else add("sueño", -0.3, `Dormiste ${d.sleepHours} h`);
  if (d.stressLevel >= 8) add("estrés", 1.0, `Estrés ${d.stressLevel}/10`);
  else if (d.stressLevel >= 6) add("estrés", 0.4, `Estrés ${d.stressLevel}/10`);
  if (d.missedMeds > 0) add("medicación", 1.4, `${d.missedMeds} toma(s) omitida(s)`);
  if (d.alcoholUnits >= 2) add("alcohol", 0.5, `${d.alcoholUnits} unidades de alcohol`);
  if (d.caffeineMg > 350) add("cafeína", 0.3, `${d.caffeineMg} mg de cafeína`);
  if (d.exerciseMinutes >= 20) add("ejercicio", -0.3, `${d.exerciseMinutes} min de ejercicio`);

  const score = Math.round(100 * sigmoid(z));
  return {
    assessedOn: d.logDate,
    score,
    level: levelFor(score),
    factors: factors.sort((a, b) => Math.abs(b.impact) - Math.abs(a.impact)),
    modelVersion: MODEL_VERSION,
  };
}

export function wilson(k: number, n: number, z = 1.96): [number, number] {
  if (n === 0) return [0, 0];
  const p = k / n;
  const denom = 1 + (z * z) / n;
  const centre = (p + (z * z) / (2 * n)) / denom;
  const margin = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / denom;
  return [round(Math.max(0, centre - margin), 3), round(Math.min(1, centre + margin), 3)];
}

interface Condition {
  kind: string;
  title: string;
  phrase: string;
  test: (d: SeedDailyLog) => boolean;
}

const CONDITIONS: Condition[] = [
  { kind: "sleep_pattern", title: "Poco sueño y crisis", phrase: "tras dormir menos de 5 horas", test: (d) => d.sleepHours < 5 },
  { kind: "stress_pattern", title: "Estrés alto y crisis", phrase: "en días con estrés de 8 o más", test: (d) => d.stressLevel >= 8 },
  { kind: "medication_pattern", title: "Medicación omitida y crisis", phrase: "en días con tomas omitidas", test: (d) => d.missedMeds > 0 },
];

/** Computes real statistics over the generated history (n, lift, Wilson interval). */
export function buildInsights(logs: SeedDailyLog[], seizures: SeedSeizure[], now: Date): SeedInsight[] {
  const seizureDays = new Map<string, number>();
  for (const s of seizures) {
    const day = bogotaDate(s.startedAt);
    seizureDays.set(day, (seizureDays.get(day) ?? 0) + 1);
  }
  const totalSeizures = seizures.length;
  const out: SeedInsight[] = [];

  for (const c of CONDITIONS) {
    const exposed = logs.filter(c.test);
    const rest = logs.filter((d) => !c.test(d));
    const k = exposed.reduce((a, d) => a + (seizureDays.get(d.logDate) ?? 0), 0);
    if (k < 3 || totalSeizures === 0) continue;
    const pExposed = k / Math.max(1, exposed.length);
    const pRest = (totalSeizures - k) / Math.max(1, rest.length);
    const lift = pRest > 0 ? pExposed / pRest : null;
    if (lift !== null && lift < 1.5) continue;
    const [lo, hi] = wilson(k, totalSeizures);
    const pct = Math.round((100 * k) / totalSeizures);
    out.push({
      kind: c.kind,
      title: c.title,
      body: `El ${pct}% de tus crisis (${k} de ${totalSeizures}) ocurrieron ${c.phrase}. Comenta este patrón con tu neurólogo; no cambies tu tratamiento por tu cuenta.`,
      evidence: {
        n: k,
        totalSeizures,
        exposedDays: exposed.length,
        share: round(k / totalSeizures, 3),
        lift: lift === null ? null : round(lift, 2),
        wilson95: [lo, hi],
      },
      createdAt: now,
    });
  }
  return out;
}
