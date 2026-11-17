/** Demo user lives in America/Bogota (UTC-5, no DST). */
export const BOGOTA_OFFSET_HOURS = -5;
const DAY_MS = 86_400_000;

/** Calendar date (YYYY-MM-DD) in Bogota for an instant. */
export function bogotaDate(instant: Date): string {
  return new Date(instant.getTime() + BOGOTA_OFFSET_HOURS * 3_600_000).toISOString().slice(0, 10);
}

export function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

/** Converts a Bogota local date + "HH:MM" into a UTC instant. */
export function localToUtc(date: string, hhmm: string): Date {
  const [h, m] = hhmm.split(":").map(Number) as [number, number];
  return new Date(Date.parse(`${date}T00:00:00Z`) + (h - BOGOTA_OFFSET_HOURS) * 3_600_000 + m * 60_000);
}

export const minutes = (n: number): number => n * 60_000;
export const hours = (n: number): number => n * 3_600_000;
