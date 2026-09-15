import Link from "next/link";
import { notFound } from "next/navigation";
import { isAddress, isSupportedChain } from "@/lib/chains";
import { shortAddr } from "@/lib/format";
import { RecentPanel } from "./RecentPanel";

export default async function RecentPage({ params }: { params: Promise<{ chain: string; addr: string }> }) {
  const { chain, addr } = await params;
  if (!isSupportedChain(chain) || !isAddress(addr)) notFound();
  const wallet = addr.toLowerCase();
  return (
    <main>
      <div className="page-head">
        <p className="eyebrow">{chain} wallet</p>
        <h1>Buyers after {shortAddr(wallet)}</h1>
        <p className="link-row" style={{ margin: "16px 0 0" }}>
          <Link href={`/wallet/${chain}/${wallet}`}>Wallet score</Link>
          <span className="divider-dot">&middot;</span>
          <Link href={`/scan/${chain}`}>Base leaderboard</Link>
        </p>
      </div>
      <RecentPanel chain={chain} wallet={wallet} />
    </main>
  );
}
