export type TapeRow = [ts: string, trader: string, action: "BUY" | "SELL", usd: number | null, price: number | null, tx: string, label: string | null];

export interface TapeBucket { hour: string; rows: TapeRow[]; final: boolean; capped: boolean }

export interface Buy { chain: string; wallet: string; token: string; tx: string; ts: string; usd: number | null; price: number | null }

export interface BuyInput {
  buy: Buy;
  buckets: TapeBucket[];
  closes: Map<string, { close: number; final: boolean }>;
}

export interface BuyScore {
  tx: string; token: string; ts: string;
  baselineRate: number;
  newBuyers: { m10: number; m30: number; m60: number };
  fastShare: number | null;
  crowdRatio: number;
  crowded: boolean;
  fillPrice: number | null;
  entryPrice: number | null;
  leaderReturn: { h1: number | null; h24: number | null };
  delayedReturn: { h1: number | null; h24: number | null };
  mature: boolean;
  usable: boolean;
  exclusion: "capped" | "immature" | "no-price" | null;
}
