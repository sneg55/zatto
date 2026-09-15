import { SCAN_PRICE_USDC_UNITS, BASE_USDC } from "@/lib/x402/server";
import { explorerToken } from "@/lib/chains";

export function PaidScan({ chain, baseUrl }: { chain: string; baseUrl: string }) {
  const usdc = (Number(SCAN_PRICE_USDC_UNITS) / 1e6).toFixed(2).replace(/\.00$/, "");
  return (
    <section className="paid-scan">
      <h2 className="display-sub">Run a scan now</h2>
      <p style={{ maxWidth: "60ch" }}>
        Cron opens a {chain} run at 00:00, 08:00 and 16:00 UTC. To start one between those, pay{" "}
        <strong>{usdc} USDC</strong> on Base to <code className="code-inline">POST /api/scan/{chain}</code>. The endpoint
        answers 402 with x402 payment terms until the payment settles, then 202 with the run id of the scan it started.
      </p>
      <pre className="code-block">{`PAYER_KEY=0x… npx tsx scripts/pay.ts \\
  ${baseUrl}/api/scan/${chain}`}</pre>
      <p className="foot-note">
        Settlement is in{" "}
        <a href={explorerToken(chain, BASE_USDC)} target="_blank" rel="noopener noreferrer">USDC on Base</a>{" "}
        through the PayAI facilitator. The signing script is <code className="code-inline">scripts/pay.ts</code> in the
        repository; Zatto never holds a key.
      </p>
    </section>
  );
}
