import type { Buy } from "./types";

export const BUY_LOAD_MULTIPLE = 6;

function collapse(buys: Buy[], key: (b: Buy) => string, max: number): Buy[] {
  const first = new Map<string, Buy>();
  for (const b of buys) {
    const k = key(b);
    const held = first.get(k);
    if (!held || b.ts < held.ts) first.set(k, b);
  }
  return [...first.values()].sort((a, b) => (a.ts < b.ts ? 1 : a.ts > b.ts ? -1 : a.tx.localeCompare(b.tx))).slice(0, max);
}

export function distinctEvents(buys: Buy[], max: number): Buy[] {
  return collapse(buys, (b) => `${b.token}|${b.ts.slice(0, 13)}`, max);
}

export function distinctEntries(buys: Buy[], max: number): Buy[] {
  return collapse(buys, (b) => `${b.wallet}|${b.token}|${b.ts.slice(0, 13)}`, max);
}
