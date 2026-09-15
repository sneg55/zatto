import { describe, it, expect } from "vitest";
import { isQualifyingBuy, toBuy } from "@/lib/nansen/quote";

const t = (sold: string, bought: string) => ({ chain: "base", block_timestamp: "2026-09-10T14:03:11Z", transaction_hash: "0x1", trader_address: "0xW", token_bought_address: bought, token_sold_address: sold, token_bought_amount: 200, token_sold_amount: 1, token_bought_symbol: "T", token_sold_symbol: "Q", trade_value_usd: 100 });
const USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", WETH = "0x4200000000000000000000000000000000000006", TOK = "0xabc";

describe("quote rule", () => {
  it("USDC to token qualifies, token to USDC does not, quote to quote does not, token to token does not", () => {
    expect(isQualifyingBuy("base", t(USDC, TOK))).toBe(true);
    expect(isQualifyingBuy("base", t(TOK, USDC))).toBe(false);
    expect(isQualifyingBuy("base", t(USDC, WETH))).toBe(false);
    expect(isQualifyingBuy("base", t(TOK, "0xdef"))).toBe(false);
  });
  it("derives price from usd over amount and lowercases", () => {
    const b = toBuy("base", "0xW", t(USDC, "0xABC"));
    expect(b.price).toBe(0.5); expect(b.wallet).toBe("0xw"); expect(b.token).toBe("0xabc"); expect(b.ts).toBe("2026-09-10T14:03:11.000Z");
  });
});
