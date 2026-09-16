import { describe, it, expect } from "vitest";
import { serialiseTypedData } from "@/app/_components/PayScan";

describe("serialiseTypedData", () => {
  const domain = { name: "USD Coin", version: "2", chainId: 8453, verifyingContract: "0x8335" };
  const types = { TransferWithAuthorization: [{ name: "from", type: "address" }] };

  it("adds the EIP712Domain type a raw provider needs and viem supplies for itself", () => {
    const out = JSON.parse(serialiseTypedData({ domain, types, primaryType: "TransferWithAuthorization", message: { from: "0xabc" } }));
    expect(out.types.EIP712Domain).toEqual([
      { name: "name", type: "string" },
      { name: "version", type: "string" },
      { name: "chainId", type: "uint256" },
      { name: "verifyingContract", type: "address" },
    ]);
  });

  it("leaves an EIP712Domain the caller already supplied alone", () => {
    const given = { EIP712Domain: [{ name: "name", type: "string" }], ...types };
    const out = JSON.parse(serialiseTypedData({ domain, types: given, primaryType: "TransferWithAuthorization", message: {} }));
    expect(out.types.EIP712Domain).toEqual([{ name: "name", type: "string" }]);
  });

  it("writes bigint amounts and deadlines as strings, which JSON cannot do on its own", () => {
    const message = { value: BigInt(1000000), validAfter: BigInt(0), validBefore: BigInt(1789000000), from: "0xabc" };
    const out = JSON.parse(serialiseTypedData({ domain, types, primaryType: "TransferWithAuthorization", message }));
    expect(out.message).toEqual({ value: "1000000", validAfter: "0", validBefore: "1789000000", from: "0xabc" });
  });

  it("omits a domain field the token does not use, so the signature covers the right struct", () => {
    const out = JSON.parse(serialiseTypedData({ domain: { name: "X", chainId: 8453 }, types, primaryType: "TransferWithAuthorization", message: {} }));
    expect(out.types.EIP712Domain).toEqual([{ name: "name", type: "string" }, { name: "chainId", type: "uint256" }]);
  });
});
