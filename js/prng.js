// Generador pseudoaleatorio determinista (mulberry32): la misma semilla produce siempre los mismos datos.
export function createRng(seed) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (min, max) => min + Math.floor(next() * (max - min + 1));
  const pick = (arr) => arr[Math.floor(next() * arr.length)];
  const chance = (p) => next() < p;
  const sample = (arr, n) => {
    const c = arr.slice();
    for (let i = c.length - 1; i > 0; i--) {
      const j = Math.floor(next() * (i + 1));
      [c[i], c[j]] = [c[j], c[i]];
    }
    return c.slice(0, Math.min(n, c.length));
  };
  const weighted = (items, weights) => {
    const total = weights.reduce((x, y) => x + y, 0);
    let r = next() * total;
    for (let i = 0; i < items.length; i++) {
      r -= weights[i];
      if (r < 0) return items[i];
    }
    return items[items.length - 1];
  };
  return { next, int, pick, chance, sample, weighted };
}
