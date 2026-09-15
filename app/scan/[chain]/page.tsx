import { redirect } from "next/navigation";
import { getDb } from "@/lib/db/d1";
import { latestPublishedJob } from "@/lib/db/queries";

export const dynamic = "force-dynamic";

export default async function ScanLatest({ params }: { params: Promise<{ chain: string }> }) {
  const { chain } = await params;
  const job = await latestPublishedJob(getDb(), chain);
  if (!job) {
    return (
      <main>
        <div className="empty-state">
          <p className="eyebrow">{chain} scan</p>
          <h1>No completed run yet</h1>
          <p>The first cron run lands within six hours of deploy. A paid run can be requested with the script in the README.</p>
        </div>
      </main>
    );
  }
  redirect(`/scan/${chain}/${job.run_id}`);
}
