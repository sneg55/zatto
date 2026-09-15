import { redirect } from "next/navigation";
import { getDb } from "@/lib/db/d1";
import { latestPublishedJob } from "@/lib/db/queries";

export const dynamic = "force-dynamic";

export default async function ScanLatest({ params }: { params: Promise<{ chain: string }> }) {
  const { chain } = await params;
  const job = await latestPublishedJob(getDb(), chain);
  if (!job) return <main><h1>{chain} scan</h1><p>No completed run yet. The first cron run lands within six hours of deploy; a paid run can be requested with the script in the README.</p></main>;
  redirect(`/scan/${chain}/${job.run_id}`);
}
