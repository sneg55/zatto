import { wrapFetchWithPaymentFromConfig, decodePaymentResponseHeader } from "@x402/fetch";
import { ExactEvmScheme } from "@x402/evm";
import { privateKeyToAccount } from "viem/accounts";

const url = process.argv[2] ?? `${process.env.ZATTO_URL ?? "http://localhost:3000"}/api/scan/base`;
const key = process.env.PAYER_KEY;
if (!key) { console.error("PAYER_KEY missing"); process.exit(1); }
const account = privateKeyToAccount(key as `0x${string}`);
const paidFetch = wrapFetchWithPaymentFromConfig(fetch, { schemes: [{ network: "eip155:8453", client: new ExactEvmScheme(account) }] });
const res = await paidFetch(url, { method: "POST" });
console.log(res.status, await res.text());
const pr = res.headers.get("PAYMENT-RESPONSE");
if (pr) console.log(decodePaymentResponseHeader(pr));
