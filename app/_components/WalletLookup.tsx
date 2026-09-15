"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { isAddress } from "@/lib/chains";

export function WalletLookup({ chain }: { chain: string }) {
  const [value, setValue] = useState("");
  const [error, setError] = useState("");
  const router = useRouter();
  return (
    <form
      className="lookup"
      onSubmit={(e) => {
        e.preventDefault();
        const addr = value.trim();
        if (!isAddress(addr)) { setError("That is not a 0x wallet address."); return; }
        setError("");
        router.push(`/wallet/${chain}/${addr.toLowerCase()}`);
      }}
    >
      <label className="lookup-label" htmlFor="wallet-lookup">Score any {chain} wallet</label>
      <div className="lookup-row">
        <input
          id="wallet-lookup"
          className="input"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="0x…"
          spellCheck={false}
          autoComplete="off"
        />
        <button className="btn" type="submit">Score it</button>
      </div>
      {error ? <p className="status-note">{error}</p> : null}
    </form>
  );
}
