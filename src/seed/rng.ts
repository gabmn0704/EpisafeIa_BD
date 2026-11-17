/** Deterministic PRNG (mulberry32) so the seed produces the same dataset every run. */
export class Rng {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  /** Uniform in [0, 1). */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  between(min: number, max: number): number {
    return min + (max - min) * this.next();
  }

  int(min: number, max: number): number {
    return Math.floor(this.between(min, max + 1));
  }

  chance(p: number): boolean {
    return this.next() < p;
  }

  /** Normal distribution via Box-Muller. */
  gauss(mean = 0, sd = 1): number {
    const u = Math.max(this.next(), 1e-12);
    const v = this.next();
    return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  pick<T>(items: readonly T[]): T {
    return items[Math.floor(this.next() * items.length)] as T;
  }
}

export const clamp = (x: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, x));
export const round = (x: number, digits = 0): number => {
  const f = 10 ** digits;
  return Math.round(x * f) / f;
};
export const sigmoid = (z: number): number => 1 / (1 + Math.exp(-z));
