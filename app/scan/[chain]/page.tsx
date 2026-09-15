import Link from "next/link";
import { notFound } from "next/navigation";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db/d1";
import { latestPublishedJob } from "@/lib/db/queries";
import { isSupportedChain, SUPPORTED_CHAINS } from "@/lib/chains";
import { PaidScan } from "@/app/_components/PaidScan";

export const dynamic = "force-dynamic";

export default async function ScanLatest({ params }: { params: Promise<{ chain: string }> }) {
  const { chain } = await params;
  if (!isSupportedChain(chain)) notFound();
  const job = await latestPublishedJob(getDb(), chain);
  if (!job) {
    return (
      <main>
        <div className="empty-state">
          <p className="eyebrow">{chain} scan</p>
          <h1>No completed run yet</h1>
          <p>Cron opens a {chain} run at 00:00, 08:00 and 16:00 UTC. Zatto covers {SUPPORTED_CHAINS.join(", ")}.</p>
          <p className="link-row" style={{ justifyContent: "center", marginTop: 16 }}>
            <Link href="/">Back to the start</Link>
          </p>
        </div>
        <PaidScan chain={chain} baseUrl={process.env.PUBLIC_BASE_URL ?? "https://zatto.nsawinyh.workers.dev"} />
      </main>
    );
  }
  redirect(`/scan/${chain}/${job.run_id}`);
}
