import { MIN_GROUP, MIN_USABLE_BUYS } from "./constants";
import type { BuyScore, GroupStat, PooledRun, Verdict, WalletScore } from "./types";

function median(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function group(values: Array<number | null>): GroupStat {
  const xs = values.filter((v): v is number => v != null && Number.isFinite(v));
  const insufficient = xs.length < MIN_GROUP;
  return { n: xs.length, median: insufficient ? null : median(xs), insufficient };
}

const pct = (x: number) => `${x >= 0 ? "+" : ""}${(x * 100).toFixed(1)}%`;

export function scoreWallet(chain: string, wallet: string, buys: BuyScore[]): WalletScore {
  const usable = buys.filter((b) => b.usable);
  const crowded = usable.filter((b) => b.crowded);
  const uncrowded = usable.filter((b) => !b.crowded);
  const excluded = { capped: 0, immature: 0, noPrice: 0 };
  for (const b of buys) {
    if (b.exclusion === "capped") excluded.capped++;
    else if (b.exclusion === "immature") excluded.immature++;
    else if (b.exclusion === "no-price") excluded.noPrice++;
  }
  const split = (pick: (b: BuyScore) => number | null) => ({ crowded: group(crowded.map(pick)), uncrowded: group(uncrowded.map(pick)) });
  const delayed24h = split((b) => b.delayedReturn.h24);
  const fast = usable.map((b) => b.fastShare).filter((v): v is number => v != null);
  const n = usable.length;
  const crowdedShare = n ? crowded.length / n : null;
  const verdict: Verdict = n < MIN_USABLE_BUYS ? "THIN" : crowdedShare! > 0.5 ? "CROWDED" : "QUIET";
  const returnNote = !delayed24h.crowded.insufficient && !delayed24h.uncrowded.insufficient
    ? `delayed entry after crowded buys returned ${pct(delayed24h.crowded.median!)} vs ${pct(delayed24h.uncrowded.median!)} after quiet buys`
    : "not enough mature buys in one group to compare";
  return {
    chain, wallet, n, nCrowded: crowded.length, nUncrowded: uncrowded.length,
    tokens: new Set(usable.map((b) => b.token)).size, excluded,
    newBuyersPerBuy: median(usable.map((b) => b.newBuyers.m60)),
    burstRatio: median(usable.map((b) => b.crowdRatio10)),
    baselinePerBuy: median(usable.map((b) => b.baselineRate)),
    fastShare: { mean: fast.length ? fast.reduce((a, b) => a + b, 0) / fast.length : null, contributing: fast.length },
    delayed24h, delayed1h: split((b) => b.delayedReturn.h1),
    leader24h: split((b) => b.leaderReturn.h24), leader1h: split((b) => b.leaderReturn.h1),
    crowdedShare, verdict, returnNote,
    provisional: buys.some((b) => !b.mature),
    buys,
  };
}

const rank: Record<Verdict, number> = { CROWDED: 0, QUIET: 1, THIN: 2 };

export function sortLeaderboard(rows: WalletScore[]): WalletScore[] {
  return [...rows].sort((a, b) =>
    rank[a.verdict] - rank[b.verdict]
    || (b.newBuyersPerBuy ?? -Infinity) - (a.newBuyersPerBuy ?? -Infinity)
    || b.n - a.n
    || a.wallet.localeCompare(b.wallet));
}

export function quantile(xs: number[], q: number): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const i = (s.length - 1) * q;
  const lo = Math.floor(i);
  const hi = Math.ceil(i);
  return lo === hi ? s[lo] : s[lo] + (s[hi] - s[lo]) * (i - lo);
}

export function pooledRun(rows: WalletScore[]): PooledRun {
  const usable = rows.flatMap((r) => r.buys.filter((b) => b.usable));
  const crowded = usable.filter((b) => b.crowded);
  const uncrowded = usable.filter((b) => !b.crowded);
  const ratios = usable.map((b) => b.crowdRatio10).filter((v) => Number.isFinite(v));
  return {
    buys: usable.length,
    wallets: rows.length,
    crowded: group(crowded.map((b) => b.delayedReturn.h24)),
    uncrowded: group(uncrowded.map((b) => b.delayedReturn.h24)),
    nCrowded: crowded.length,
    burst: { median: quantile(ratios, 0.5), p90: quantile(ratios, 0.9), max: ratios.length ? Math.max(...ratios) : null },
  };
}
