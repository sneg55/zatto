import type { Buy } from "../score/types";

const base = ["0x0000000000000000000000000000000000000000", "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
  "0x4200000000000000000000000000000000000006", "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",
  "0xd9aaec86b65d86f6a7b5b1b0c42ffa531710b6ca", "0xfde4c96c8593536e31f229ea8f37b2ada2699bb2",
  "0x50c5725949a6f0c72e6c4a641f24049a917db0cb"];

export const QUOTE_SETS: Record<string, Set<string>> = { base: new Set(base) };

export interface ProfilerTrade {
  chain: string; block_timestamp: string; transaction_hash: string; trader_address: string;
  token_bought_address: string; token_sold_address: string; token_bought_amount: number; token_sold_amount: number;
  token_bought_symbol: string; token_sold_symbol: string; trade_value_usd: number | null;
}

export function isQualifyingBuy(chain: string, t: ProfilerTrade): boolean {
  const q = QUOTE_SETS[chain];
  if (!q) return false;
  const sold = t.token_sold_address.toLowerCase();
  const bought = t.token_bought_address.toLowerCase();
  return q.has(sold) && !q.has(bought);
}

export function toBuy(chain: string, wallet: string, t: ProfilerTrade): Buy {
  const price = t.trade_value_usd != null && t.token_bought_amount > 0 ? t.trade_value_usd / t.token_bought_amount : null;
  return { chain, wallet: wallet.toLowerCase(), token: t.token_bought_address.toLowerCase(), tx: t.transaction_hash, ts: new Date(t.block_timestamp).toISOString(), usd: t.trade_value_usd, price };
}
