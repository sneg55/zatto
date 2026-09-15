import type { Buy } from "./types";

export const BUY_LOAD_MULTIPLE = 6;

export function distinctEvents(buys: Buy[], max: number): Buy[] {
  const byTokenHour = new Map<string, Buy>();
  for (const b of buys) {
    const key = `${b.token}|${b.ts.slice(0, 13)}`;
    const held = byTokenHour.get(key);
    if (!held || b.ts < held.ts) byTokenHour.set(key, b);
  }
  return [...byTokenHour.values()].sort((a, b) => (a.ts < b.ts ? 1 : a.ts > b.ts ? -1 : a.tx.localeCompare(b.tx))).slice(0, max);
}
