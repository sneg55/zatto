import Link from "next/link";
import { SUPPORTED_CHAINS } from "@/lib/chains";

export default function NotFound() {
  return (
    <main>
      <div className="empty-state">
        <p className="eyebrow">Not found</p>
        <h1>No such page</h1>
        <p>
          Zatto scores wallets on {SUPPORTED_CHAINS.join(", ")}, and a wallet path needs a full 0x address. Whatever
          was in that link is neither.
        </p>
        <p className="link-row" style={{ justifyContent: "center", marginTop: 16 }}>
          <Link href="/">Back to the start</Link>
          <span className="divider-dot">&middot;</span>
          <Link href="/scan/base">Base leaderboard</Link>
        </p>
      </div>
    </main>
  );
}
