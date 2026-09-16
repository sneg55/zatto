import { describe, it, expect } from "vitest";
import { openTestDb } from "../helpers/d1";
import { fetchStub, type Scripted } from "../helpers/fetchStub";
import { handleLiveToken, type TokenScan } from "@/lib/liveToken";
import type { AppContext } from "@/lib/http/context";

const TOKEN = "0x" + "b".repeat(40);
const A = "0x" + "a".repeat(40);
const B = "0x" + "c".repeat(40);
const NOW = new Date("2026-09-15T12:00:00Z");

const trade = (ts: string, trader: string, tx: string) => ({
  block_timestamp: ts, transaction_hash: tx, trader_address: trader, trader_address_label: null,
  action: "BUY", estimated_swap_price_usd: 1, estimated_value_usd: 100,
});

function ctx(db: ReturnType<typeof openTestDb>, reply: (url: string, body: Record<string, unknown>) => Scripted, budget = "3000"): AppContext {
  const f = fetchStub((url, init) => reply(url, JSON.parse(String(init.body ?? "{}")) as Record<string, unknown>));
  return {
    db,
    env: { DB: db, NANSEN_API_KEY: "k", X402_PAY_TO: "0x1", INTERNAL_SECRET: "s", FACILITATOR_URL: "https://f", DAILY_CREDIT_BUDGET: budget, RUN_REQUEST_CAP: "600", LIVE_WALLET_PER_IP_PER_HOUR: "2", LIVE_WALLET_CONCURRENCY: "1", PUBLIC_BASE_URL: "https://z.test" },
    now: () => NOW, fetch: f, waitUntil: () => {},
  };
}

const ohlcv = { status: 200, body: { token_address: TOKEN, timeframe: "1m", truncated: false, data: [] } };
const emptyTape = { status: 200, body: { data: [], pagination: { page: 1, per_page: 1000, is_last_page: true } } };

function replier(smBuys: unknown[], tapeRows: unknown[], isLast = true): (url: string, body: Record<string, unknown>) => Scripted {
  return (url, body) => {
    if (url.endsWith("token-ohlcv")) return ohlcv;
    if (body.only_smart_money) return { status: 200, body: { data: smBuys, pagination: { page: 1, per_page: 1000, is_last_page: isLast } } };
    return { status: 200, body: { data: tapeRows, pagination: { page: 1, per_page: 1000, is_last_page: true } } };
  };
}

async function scan(res: Response): Promise<TokenScan> {
  return ((await res.json()) as { scan: TokenScan }).scan;
}

describe("live token", () => {
  it("rejects an address that is not 0x40 hex and a chain it does not scan", async () => {
    const c = ctx(openTestDb(), () => emptyTape);
    expect((await handleLiveToken(c, "base", "0x12", "1.1.1.1")).status).toBe(400);
    expect((await handleLiveToken(c, "solana", TOKEN, "1.1.1.1")).status).toBe(400);
  });

  it("keeps two wallets that entered in the same hour, and collapses one wallet's split swap into one entry", async () => {
    const db = openTestDb();
    const c = ctx(db, replier([
      trade("2026-09-11T10:04:00Z", A, "0xa1"),
      trade("2026-09-11T10:31:00Z", A, "0xa2"),
      trade("2026-09-11T10:12:00Z", B, "0xb1"),
    ], []));
    const s = await scan(await handleLiveToken(c, "base", TOKEN, "1.1.1.1"));
    expect(s.smartMoneyBuys).toBe(3);
    expect(s.entries).toBe(2);
    expect(s.wallets.sort()).toEqual([A, B].sort());
  });

  it("burst-scores an entry too recent to carry a return and keeps it out of the settled board", async () => {
    const db = openTestDb();
    const recent = "2026-09-15T09:00:00.000Z";
    const tape = [
      trade("2026-09-15T08:30:00Z", "0xprior", "0xp1"),
      trade(recent, A, "0xr1"),
      trade("2026-09-15T09:00:05Z", "0xf1", "0xf1"),
      trade("2026-09-15T09:02:00Z", "0xf2", "0xf2"),
      trade("2026-09-15T09:04:00Z", "0xf3", "0xf3"),
      trade("2026-09-15T09:06:00Z", "0xf4", "0xf4"),
      trade("2026-09-15T09:08:00Z", "0xf5", "0xf5"),
      trade("2026-09-15T09:09:00Z", "0xf6", "0xf6"),
    ];
    const c = ctx(db, replier([trade(recent, A, "0xr1")], tape));
    const s = await scan(await handleLiveToken(c, "base", TOKEN, "1.1.1.1"));
    expect(s.stat?.buys).toBe(0);
    expect(s.forming).toHaveLength(1);
    expect(s.forming[0]).toMatchObject({ wallet: A, newBuyers10: 6, crowded: true, settled: true });
  });

  it("says the window is truncated when the token filled a page of Smart Money buys", async () => {
    const db = openTestDb();
    const c = ctx(db, replier([trade("2026-09-11T10:04:00Z", A, "0xa1")], [], false));
    expect((await scan(await handleLiveToken(c, "base", TOKEN, "1.1.1.1"))).truncated).toBe(true);
  });

  it("caches for an hour, then counts against the per-ip limit under its own key", async () => {
    const db = openTestDb();
    const c = ctx(db, replier([trade("2026-09-11T10:04:00Z", A, "0xa1")], []));
    await handleLiveToken(c, "base", TOKEN, "5.5.5.5");
    const before = (await db.prepare("SELECT COUNT(*) AS n FROM calls").first<{ n: number }>())?.n;
    const again = await handleLiveToken(c, "base", TOKEN, "5.5.5.5");
    expect(((await again.json()) as { stale: boolean }).stale).toBe(false);
    expect((await db.prepare("SELECT COUNT(*) AS n FROM calls").first<{ n: number }>())?.n).toBe(before);
    const other = "0x" + "d".repeat(40);
    await handleLiveToken(c, "base", other, "5.5.5.5");
    const third = await handleLiveToken(c, "base", "0x" + "e".repeat(40), "5.5.5.5");
    expect(third.status).toBe(429);
    expect(((await third.json()) as { reason: string }).reason).toBe("per-ip limit");
  });

  it("returns the stale scan with a reason when the daily budget is gone", async () => {
    const db = openTestDb();
    const c = ctx(db, replier([trade("2026-09-11T10:04:00Z", A, "0xa1")], []), "0");
    const r = await handleLiveToken(c, "base", TOKEN, "6.6.6.6");
    expect(r.status).toBe(503);
    expect(((await r.json()) as { reason: string }).reason).toBe("daily budget exhausted");
  });
});
