import { MIN_GROUP, MIN_USABLE_BUYS } from "./constants";
import type { BuyScore, EvidenceWindow, GroupStat, PooledRun, TokenStat, Verdict, WalletScore } from "./types";

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

export const BURST_BANDS: Array<{ label: string; min: number; max: number }> = [
  { label: "under 1x", min: 0, max: 1 },
  { label: "1 to 2x", min: 1, max: 2 },
  { label: "2 to 3x", min: 2, max: 3 },
  { label: "3 to 5x", min: 3, max: 5 },
  { label: "5x and up", min: 5, max: Infinity },
];

export function burstDistribution(ratios: number[]): Array<{ label: string; count: number }> {
  return BURST_BANDS.map((b) => ({ label: b.label, count: ratios.filter((r) => r >= b.min && r < b.max).length }));
}

export function observations(buys: BuyScore[]): BuyScore[] {
  const first = new Map<string, BuyScore>();
  for (const b of buys) {
    const key = `${b.token}|${b.ts}`;
    const held = first.get(key);
    if (!held || b.tx.localeCompare(held.tx) < 0) first.set(key, b);
  }
  return [...first.values()];
}

export function tokenBreakdown(rows: WalletScore[]): TokenStat[] {
  const byToken = new Map<string, Array<{ wallet: string; buy: BuyScore }>>();
  for (const r of rows) for (const buy of r.buys) {
    if (!buy.usable) continue;
    byToken.set(buy.token, [...(byToken.get(buy.token) ?? []), { wallet: r.wallet, buy }]);
  }
  return [...byToken.entries()]
    .map(([token, hits]) => {
      const obs = observations(hits.map((h) => h.buy));
      const bursts = obs.map((b) => b.crowdRatio10).filter((v) => Number.isFinite(v));
      const crowded = obs.filter((b) => b.crowded).length;
      const entries = hits
        .map((h) => ({ wallet: h.wallet, ts: h.buy.ts, burst: h.buy.crowdRatio10, crowded: h.buy.crowded, delayed24h: h.buy.delayedReturn.h24 }))
        .sort((a, b) => b.burst - a.burst || (a.ts < b.ts ? 1 : a.ts > b.ts ? -1 : a.wallet.localeCompare(b.wallet)));
      return {
        token,
        buys: obs.length,
        events: obs.length,
        wallets: new Set(hits.map((h) => h.wallet)).size,
        crowded,
        maxBurst: bursts.length ? Math.max(...bursts) : null,
        medianBurst: median(bursts),
        medianDelayed24h: median(obs.map((b) => b.delayedReturn.h24).filter((v): v is number => v != null)),
        newest: entries.length ? entries.map((e) => e.ts).sort()[entries.length - 1] : null,
        verdict: (crowded > 0 ? "CROWDED" : "QUIET") as TokenStat["verdict"],
        entries,
      };
    })
    .sort((a, b) =>
      Number(b.verdict === "CROWDED") - Number(a.verdict === "CROWDED")
      || (b.maxBurst ?? -Infinity) - (a.maxBurst ?? -Infinity)
      || b.buys - a.buys
      || a.token.localeCompare(b.token));
}

function evidenceWindow(buys: BuyScore[]): EvidenceWindow {
  const ts = buys.map((b) => b.ts).sort();
  if (ts.length === 0) return { newest: null, median: null, oldest: null };
  return { newest: ts[ts.length - 1], median: ts[Math.floor((ts.length - 1) / 2)], oldest: ts[0] };
}

export function pooledRun(rows: WalletScore[]): PooledRun {
  const walletBuys = rows.flatMap((r) => r.buys.filter((b) => b.usable));
  const usable = observations(walletBuys);
  const crowded = usable.filter((b) => b.crowded);
  const uncrowded = usable.filter((b) => !b.crowded);
  const ratios = usable.map((b) => b.crowdRatio10).filter((v) => Number.isFinite(v));
  const tokens = (xs: BuyScore[]) => new Set(xs.map((b) => b.token)).size;
  return {
    buys: usable.length,
    walletBuys: walletBuys.length,
    events: usable.length,
    crowdedEvents: crowded.length,
    crowdedTokens: tokens(crowded),
    wallets: rows.length,
    crowded: group(crowded.map((b) => b.delayedReturn.h24)),
    uncrowded: group(uncrowded.map((b) => b.delayedReturn.h24)),
    nCrowded: crowded.length,
    burst: { median: quantile(ratios, 0.5), p90: quantile(ratios, 0.9), max: ratios.length ? Math.max(...ratios) : null },
    distribution: burstDistribution(ratios),
    evidence: evidenceWindow(usable),
  };
}

export function clusterGroups(rows: WalletScore[]): string[][] {
  const byShape = new Map<string, string[]>();
  for (const r of rows) {
    if (r.n === 0) continue;
    const shape = r.buys.map((b) => `${b.token}|${b.ts}`).sort().join(",");
    byShape.set(shape, [...(byShape.get(shape) ?? []), r.wallet]);
  }
  return [...byShape.values()].filter((g) => g.length > 1).sort((a, b) => b.length - a.length);
}

export function clusters(rows: WalletScore[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const wallets of clusterGroups(rows)) for (const w of wallets) out.set(w, wallets.length);
  return out;
}
