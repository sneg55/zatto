"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { isAddress } from "@/lib/chains";

type Subject = "wallet" | "token";

export function WalletLookup({ chain }: { chain: string }) {
  const [subject, setSubject] = useState<Subject>("token");
  const [value, setValue] = useState("");
  const [error, setError] = useState("");
  const router = useRouter();
  return (
    <form
      className="lookup"
      onSubmit={(e) => {
        e.preventDefault();
        const addr = value.trim();
        if (!isAddress(addr)) { setError("That is not a 0x address."); return; }
        setError("");
        router.push(`/${subject}/${chain}/${addr.toLowerCase()}`);
      }}
    >
      <label className="lookup-label" htmlFor="address-lookup">Check a {chain} token or wallet</label>
      <div className="segmented" role="group" aria-label="What to score">
        {(["token", "wallet"] as Subject[]).map((s) => (
          <button
            key={s}
            type="button"
            className={subject === s ? "segment segment-on" : "segment"}
            aria-pressed={subject === s}
            onClick={() => { setSubject(s); setError(""); }}
          >
            {s === "token" ? "Token" : "Wallet"}
          </button>
        ))}
      </div>
      <div className="lookup-row">
        <input
          id="address-lookup"
          className="input"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={subject === "token" ? "Contract address 0x…" : "Wallet address 0x…"}
          spellCheck={false}
          autoComplete="off"
        />
        <button className="btn" type="submit">Check it</button>
      </div>
      <p className="lookup-note">
        {subject === "token"
          ? "Which Smart Money wallets bought it, and how many new buyers arrived behind each one."
          : "Who buys after this wallet does, and what copying it one minute later returned."}
      </p>
      {error ? <p className="status-note">{error}</p> : null}
    </form>
  );
}
