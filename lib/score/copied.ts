import { MIN_COPY_BUYS } from "./constants";
import type { BuyScore } from "./types";

export interface WalletHistory { wallet: string; computedAt: string; buys: BuyScore[] }

export interface CopiedRow {
  wallets: string[];
  buys: number;
  crowded: number;
  tokens: number;
  medianBurst: number | null;
  maxBurst: number | null;
  copyReturn: number | null;
  copyHigher: number;
  copyN: number;
  qualifies: boolean;
  crowdedDelayed24h: number | null;
  crowdedReturns: number;
  newestBuy: string | null;
  lastScored: string;
}

export interface Persistence {
  actors: number;
  topActors: number;
  topLater: number;
  topLaterMedian: number | null;
  topLaterHigher: number;
  restLater: number;
  restLaterMedian: number | null;
  restLaterHigher: number;
  spearman: number | null;
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

function settled(b: BuyScore): boolean {
  return scorable(b) && b.delayedReturn.h24 != null;
}

function signature(buys: BuyScore[]): string {
  return buys.map((b) => `${b.token}|${b.ts}`).sort().join(",");
}

function byTime(buys: BuyScore[]): BuyScore[] {
  return [...buys].sort((a, b) => (a.ts < b.ts ? -1 : a.ts > b.ts ? 1 : a.token.localeCompare(b.token)));
}

export function actors(histories: WalletHistory[]): Array<{ wallets: string[]; computedAt: string; buys: BuyScore[] }> {
  const kept = histories
    .map((h) => ({ ...h, buys: h.buys.filter(scorable) }))
    .filter((h) => h.buys.length > 0);
  const fleets = new Map<string, typeof kept>();
  for (const h of kept) {
    const key = signature(h.buys);
    fleets.set(key, [...(fleets.get(key) ?? []), h]);
  }
  return [...fleets.values()].map((members) => ({
    wallets: members.map((m) => m.wallet).sort(),
    computedAt: members.map((m) => m.computedAt).sort().at(-1)!,
    buys: members[0].buys,
  }));
}

export function copiedBoard(histories: WalletHistory[]): CopiedRow[] {
  return actors(histories)
    .map(({ wallets, computedAt, buys }) => {
      const crowded = buys.filter((b) => b.crowded);
      const crowdedReturns = crowded.map((b) => b.delayedReturn.h24).filter((v): v is number => v != null);
      const copy = buys.filter(settled).map((b) => b.delayedReturn.h24 as number);
      const bursts = buys.map((b) => b.crowdRatio10);
      return {
        wallets,
        buys: buys.length,
        crowded: crowded.length,
        tokens: new Set(buys.map((b) => b.token)).size,
        medianBurst: median(bursts),
        maxBurst: Math.max(...bursts),
        copyReturn: median(copy),
        copyHigher: copy.filter((r) => r > 0).length,
        copyN: copy.length,
        qualifies: copy.length >= MIN_COPY_BUYS,
        crowdedDelayed24h: median(crowdedReturns),
        crowdedReturns: crowdedReturns.length,
        newestBuy: buys.map((b) => b.ts).sort().at(-1) ?? null,
        lastScored: computedAt,
      };
    })
    .sort((a, b) =>
      Number(b.qualifies) - Number(a.qualifies)
      || (b.copyReturn ?? -Infinity) - (a.copyReturn ?? -Infinity)
      || b.copyN - a.copyN
      || a.wallets[0].localeCompare(b.wallets[0]));
}

function spearman(xs: number[], ys: number[]): number | null {
  if (xs.length < 3) return null;
  const rank = (v: number[]) => {
    const order = [...v].sort((a, b) => a - b);
    return v.map((x) => order.indexOf(x));
  };
  const a = rank(xs);
  const b = rank(ys);
  const ma = a.reduce((s, x) => s + x, 0) / a.length;
  const mb = b.reduce((s, x) => s + x, 0) / b.length;
  const cov = a.reduce((s, x, i) => s + (x - ma) * (b[i] - mb), 0);
  const sa = Math.sqrt(a.reduce((s, x) => s + (x - ma) ** 2, 0));
  const sb = Math.sqrt(b.reduce((s, x) => s + (x - mb) ** 2, 0));
  return sa === 0 || sb === 0 ? null : cov / (sa * sb);
}

export function persistence(histories: WalletHistory[], topN = 5): Persistence {
  const split = actors(histories)
    .map(({ buys }) => byTime(buys.filter(settled)))
    .filter((buys) => buys.length >= MIN_COPY_BUYS)
    .map((buys) => {
      const half = Math.floor(buys.length / 2);
      return {
        early: median(buys.slice(0, half).map((b) => b.delayedReturn.h24 as number)) as number,
        late: buys.slice(half).map((b) => b.delayedReturn.h24 as number),
      };
    })
    .sort((a, b) => b.early - a.early);

  const pool = (rows: typeof split) => rows.flatMap((r) => r.late);
  const top = pool(split.slice(0, topN));
  const rest = pool(split.slice(topN));
  return {
    actors: split.length,
    topActors: Math.min(topN, split.length),
    topLater: top.length,
    topLaterMedian: median(top),
    topLaterHigher: top.filter((r) => r > 0).length,
    restLater: rest.length,
    restLaterMedian: median(rest),
    restLaterHigher: rest.filter((r) => r > 0).length,
    spearman: spearman(split.map((s) => s.early), split.map((s) => median(s.late) as number)),
  };
}
