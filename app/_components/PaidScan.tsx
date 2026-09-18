import { SCAN_PRICE_USDC_UNITS, BASE_USDC } from "@/lib/x402/server";
import { explorerToken } from "@/lib/chains";
import { PayScan } from "./PayScan";

export function PaidScan({ chain, baseUrl }: { chain: string; baseUrl: string }) {
  const usdc = (Number(SCAN_PRICE_USDC_UNITS) / 1e6).toFixed(2).replace(/\.00$/, "");
  const priceLabel = `${usdc} USDC`;
  return (
    <section className="paid-scan">
      <h2 className="display-sub">Run a scan now</h2>
      <p style={{ maxWidth: "62ch" }}>
        Cron opens a {chain} run at 00:00, 08:00 and 16:00 UTC. To start one between those, pay{" "}
        <strong>{priceLabel}</strong> from your own wallet. Zatto answers 402 with x402 payment terms, your wallet
        signs the transfer, and the scan starts as soon as it settles.
      </p>
      <p className="foot-note" style={{ marginTop: 0 }}>
        What you get for it is a fresh read of the tape, which moves the Forming now board to the last few hours
        rather than the last cron.
      </p>

      <PayScan chain={chain} priceLabel={priceLabel} />

      <p className="foot-note">
        Settlement is in{" "}
        <a href={explorerToken(chain, BASE_USDC)} target="_blank" rel="noopener noreferrer">USDC on Base</a>{" "}
        through the PayAI facilitator. Zatto never holds a key and never asks for one: the signature happens in your
        wallet and authorises exactly {priceLabel}.
      </p>

      <details className="terminal-fallback">
        <summary>Or pay from a terminal</summary>
        <pre className="code-block">{`PAYER_KEY=0x… npx tsx scripts/pay.ts \\
  ${baseUrl}/api/scan/${chain}`}</pre>
        <p className="foot-note" style={{ marginTop: 8 }}>
          <code className="code-inline">scripts/pay.ts</code> is in the repository and signs with a key you supply.
        </p>
      </details>
    </section>
  );
}
