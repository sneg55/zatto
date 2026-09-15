import { buildContext } from "@/lib/http/context";
import { handleLiveWallet } from "@/lib/liveWallet";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ chain: string; addr: string }> }) {
  const { chain, addr } = await params;
  return handleLiveWallet(await buildContext(), chain, addr, req.headers.get("cf-connecting-ip") ?? "0.0.0.0");
}
