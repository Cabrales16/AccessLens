import { buildSources } from '../js/seed.js';
import { extractAll } from '../js/connectors.js';
import { audit } from '../js/rules.js';

export const TODAY = new Date(Date.UTC(2026, 9, 26));

export function memoryStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
}

let cached;
export function sample() {
  if (!cached) {
    const sources = buildSources(20261026, TODAY);
    const accounts = extractAll(null, sources);
    cached = { sources, accounts, roster: sources.roster, result: audit(accounts, sources.roster, {}, TODAY) };
  }
  return cached;
}
