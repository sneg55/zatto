import type { BuyScore, WalletScore } from "./types";

export interface ScoredSnapshot { wallet: string; computedAt: string; score: WalletScore }

export interface CopiedRow {
  wallets: string[];
  buys: number;
  crowded: number;
  tokens: number;
  medianBurst: number | null;
  maxBurst: number | null;
  crowdedDelayed24h: number | null;
  crowdedReturns: number;
  newestBuy: string | null;
  lastScored: string;
}

function median(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function scorable(b: BuyScore): boolean {
  return b.usable && typeof b.crowdRatio10 === "number" && Number.isFinite(b.crowdRatio10);
}

function signature(buys: BuyScore[]): string {
  return buys.map((b) => `${b.token}|${b.ts}`).sort().join(",");
}

export function copiedBoard(snapshots: ScoredSnapshot[]): CopiedRow[] {
  const kept = snapshots
    .map((s) => ({ ...s, buys: s.score.buys.filter(scorable) }))
    .filter((s) => s.buys.length > 0);

  const fleets = new Map<string, typeof kept>();
  for (const s of kept) {
    const key = signature(s.buys);
    fleets.set(key, [...(fleets.get(key) ?? []), s]);
  }

  return [...fleets.values()]
    .map((members) => {
      const buys = members[0].buys;
      const crowded = buys.filter((b) => b.crowded);
      const returns = crowded.map((b) => b.delayedReturn.h24).filter((v): v is number => v != null);
      const bursts = buys.map((b) => b.crowdRatio10);
      return {
        wallets: members.map((m) => m.wallet).sort(),
        buys: buys.length,
        crowded: crowded.length,
        tokens: new Set(buys.map((b) => b.token)).size,
        medianBurst: median(bursts),
        maxBurst: Math.max(...bursts),
        crowdedDelayed24h: median(returns),
        crowdedReturns: returns.length,
        newestBuy: buys.map((b) => b.ts).sort().at(-1) ?? null,
        lastScored: members.map((m) => m.computedAt).sort().at(-1)!,
      };
    })
    .sort((a, b) =>
      b.crowded - a.crowded
      || (b.maxBurst ?? -Infinity) - (a.maxBurst ?? -Infinity)
      || b.buys - a.buys
      || a.wallets[0].localeCompare(b.wallets[0]));
}
