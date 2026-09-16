"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { isAddress } from "@/lib/chains";

type Subject = "wallet" | "token";

export function WalletLookup({ chain }: { chain: string }) {
  const [subject, setSubject] = useState<Subject>("wallet");
  const [value, setValue] = useState("");
  const [error, setError] = useState("");
  const router = useRouter();
  return (
    <form
      className="lookup"
      onSubmit={(e) => {
        e.preventDefault();
        const addr = value.trim();
        if (!isAddress(addr)) { setError(`That is not a 0x ${subject} address.`); return; }
        setError("");
        router.push(`/${subject}/${chain}/${addr.toLowerCase()}`);
      }}
    >
      <label className="lookup-label" htmlFor="address-lookup">Score any {chain} address</label>
      <div className="segmented" role="group" aria-label="What to score">
        {(["wallet", "token"] as Subject[]).map((s) => (
          <button
            key={s}
            type="button"
            className={subject === s ? "segment segment-on" : "segment"}
            aria-pressed={subject === s}
            onClick={() => { setSubject(s); setError(""); }}
          >
            {s === "wallet" ? "Wallet" : "Token"}
          </button>
        ))}
      </div>
      <div className="lookup-row">
        <input
          id="address-lookup"
          className="input"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="0x…"
          spellCheck={false}
          autoComplete="off"
        />
        <button className="btn" type="submit">Score it</button>
      </div>
      <p className="lookup-note">
        {subject === "wallet"
          ? "Who shows up after this wallet buys, and what a delayed entry behind it returned."
          : "Which Smart Money wallets bought this token, and how hard buying crowded after each one."}
      </p>
      {error ? <p className="status-note">{error}</p> : null}
    </form>
  );
}
