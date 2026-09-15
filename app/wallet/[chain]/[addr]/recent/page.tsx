import { RecentPanel } from "./RecentPanel";

export default async function RecentPage({ params }: { params: Promise<{ chain: string; addr: string }> }) {
  const { chain, addr } = await params;
  const wallet = addr.toLowerCase();
  return (
    <main>
      <h1>Recent buys, {chain}</h1>
      <RecentPanel chain={chain} wallet={wallet} />
    </main>
  );
}
