import type { NextRequest } from "next/server";
import { buildContext } from "@/lib/http/context";
import { handlePaidScan } from "@/lib/x402/server";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, { params }: { params: Promise<{ chain: string }> }) {
  const { chain } = await params;
  return handlePaidScan(buildContext(), req, chain);
}
