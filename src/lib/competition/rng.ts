/**
 * Randomness for fixture and bracket generation, injectable so tests are
 * deterministic.
 *
 * The prototype shuffled with `sort(() => Math.random() - 0.5)`, which is
 * biased (the comparator is inconsistent, so some orders come up far more
 * often than others). Team groups and knockout seeding must be fair, so this
 * is a Fisher-Yates shuffle.
 */

/** Returns a number in [0, 1), like `Math.random`. */
export type Rng = () => number;

/** Returns a new array in random order. Does not mutate its input. */
export function shuffle<T>(items: readonly T[], rng: Rng = Math.random): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** A small seedable generator (mulberry32) for repeatable tests. */
export function seededRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
