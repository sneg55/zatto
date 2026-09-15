import { RecentPanel } from "./RecentPanel";

export default async function RecentPage({ params }: { params: Promise<{ chain: string; addr: string }> }) {
  const { chain, addr } = await params;
  const wallet = addr.toLowerCase();
  return (
    <main>
      <p className="eyebrow">{chain} wallet</p>
      <h1>Recent buys</h1>
      <RecentPanel chain={chain} wallet={wallet} />
    </main>
  );
}
