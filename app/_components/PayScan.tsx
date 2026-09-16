"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const BASE_CHAIN_HEX = "0x2105";

interface Eip1193 {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
  on?(event: string, handler: (...args: unknown[]) => void): void;
  removeListener?(event: string, handler: (...args: unknown[]) => void): void;
}

type TypedData = { domain: Record<string, unknown>; types: Record<string, unknown>; primaryType: string; message: Record<string, unknown> };

const DOMAIN_FIELDS: Array<{ name: string; type: string }> = [
  { name: "name", type: "string" },
  { name: "version", type: "string" },
  { name: "chainId", type: "uint256" },
  { name: "verifyingContract", type: "address" },
  { name: "salt", type: "bytes32" },
];

export function serialiseTypedData({ domain, types, primaryType, message }: TypedData): string {
  const withDomain = types.EIP712Domain
    ? types
    : { EIP712Domain: DOMAIN_FIELDS.filter((f) => domain[f.name] !== undefined), ...types };
  return JSON.stringify({ domain, types: withDomain, primaryType, message }, (_k, v) => (typeof v === "bigint" ? v.toString() : v));
}

function provider(): Eip1193 | null {
  const injected = (globalThis as { ethereum?: Eip1193 }).ethereum;
  return injected ?? null;
}

function readableError(e: unknown): string {
  const code = (e as { code?: number })?.code;
  if (code === 4001) return "You turned down the signature, so nothing was paid.";
  if (code === 4902) return "Your wallet does not have Base added yet. Add the Base network and try again.";
  const message = e instanceof Error ? e.message : String(e);
  return message.slice(0, 200);
}

export function PayScan({ chain, priceLabel }: { chain: string; priceLabel: string }) {
  const [hasWallet, setHasWallet] = useState<boolean | null>(null);
  const [state, setState] = useState<"idle" | "connecting" | "signing" | "settling" | "done">("idle");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const router = useRouter();

  useEffect(() => { setHasWallet(provider() !== null); }, []);

  const pay = async () => {
    const eth = provider();
    if (!eth) { setError("No browser wallet found in this tab."); return; }
    setError("");
    setNote("");
    try {
      setState("connecting");
      const accounts = (await eth.request({ method: "eth_requestAccounts" })) as string[];
      const address = accounts?.[0];
      if (!address) { setState("idle"); setError("Your wallet returned no account."); return; }

      const chainId = (await eth.request({ method: "eth_chainId" })) as string;
      if (chainId?.toLowerCase() !== BASE_CHAIN_HEX) {
        setNote("Switching your wallet to Base.");
        await eth.request({ method: "wallet_switchEthereumChain", params: [{ chainId: BASE_CHAIN_HEX }] });
      }

      const signer = {
        address: address as `0x${string}`,
        async signTypedData(data: TypedData): Promise<`0x${string}`> {
          return (await eth.request({ method: "eth_signTypedData_v4", params: [address, serialiseTypedData(data)] })) as `0x${string}`;
        },
      };

      setState("signing");
      setNote(`Sign the ${priceLabel} payment in your wallet. It is a signature, not a transaction, so it costs no gas.`);
      const [{ wrapFetchWithPaymentFromConfig }, { ExactEvmScheme }] = await Promise.all([
        import("@x402/fetch"),
        import("@x402/evm"),
      ]);
      const paidFetch = wrapFetchWithPaymentFromConfig(fetch, {
        schemes: [{ network: "eip155:8453", client: new ExactEvmScheme(signer) }],
      });

      const res = await paidFetch(`/api/scan/${chain}`, { method: "POST" });
      setState("settling");
      setNote("Payment signed. Settling on Base and opening the scan.");
      const body = (await res.json().catch(() => null)) as { run_id?: string; error?: string } | null;
      if (res.status === 202 && body?.run_id) {
        setState("done");
        setNote("Scan started.");
        router.push(`/scan/${chain}/${body.run_id}`);
        return;
      }
      setState("idle");
      setError(body?.error ?? `The scan endpoint answered ${res.status}.`);
    } catch (e) {
      setState("idle");
      setNote("");
      setError(readableError(e));
    }
  };

  const busy = state !== "idle" && state !== "done";
  const label = state === "connecting" ? "Connecting your wallet"
    : state === "signing" ? "Waiting for your signature"
    : state === "settling" ? "Settling on Base"
    : state === "done" ? "Opening the scan"
    : `Pay ${priceLabel} and scan now`;

  return (
    <div className="pay-scan">
      <button className="btn" onClick={() => void pay()} disabled={busy || hasWallet === false}>{label}</button>
      {hasWallet === false ? (
        <p className="status-note">
          No browser wallet in this tab. Open Zatto in a wallet browser, or run the command below.
        </p>
      ) : null}
      {note ? <p className="status-note">{note}</p> : null}
      {error ? <p className="status-note pay-error">{error}</p> : null}
    </div>
  );
}
