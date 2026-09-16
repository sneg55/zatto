import { describe, it, expect } from "vitest";
import { dexscreenerToken, explorerToken, explorerTx, isAddress, isSupportedChain, nansenToken } from "@/lib/chains";

describe("chain and address guards", () => {
  it("accepts base and rejects a chain Zatto does not scan", () => {
    expect(isSupportedChain("base")).toBe(true);
    expect(isSupportedChain("ethereum")).toBe(false);
    expect(isSupportedChain("")).toBe(false);
  });

  it("accepts a 20 byte hex address and rejects anything else", () => {
    expect(isAddress("0x" + "a".repeat(40))).toBe(true);
    expect(isAddress("0x" + "A".repeat(40))).toBe(true);
    expect(isAddress("notanaddress")).toBe(false);
    expect(isAddress("0x" + "a".repeat(39))).toBe(false);
    expect(isAddress("0x" + "a".repeat(41))).toBe(false);
    expect(isAddress("0x" + "g".repeat(40))).toBe(false);
  });

  it("builds explorer links for the chain", () => {
    expect(explorerTx("base", "0xabc")).toBe("https://basescan.org/tx/0xabc");
    expect(explorerToken("base", "0xdef")).toBe("https://basescan.org/token/0xdef");
  });

  it("builds a Nansen token page link with the parameter names Nansen uses", () => {
    expect(nansenToken("base", "0xdef")).toBe("https://app.nansen.ai/token-god-mode?tokenAddress=0xdef&chain=base");
  });

  it("builds a Dexscreener link on the token's own chain", () => {
    expect(dexscreenerToken("base", "0xdef")).toBe("https://dexscreener.com/base/0xdef");
  });
});
