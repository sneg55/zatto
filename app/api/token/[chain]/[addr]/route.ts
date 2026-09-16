import { buildContext } from "@/lib/http/context";
import { handleLiveToken } from "@/lib/liveToken";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ chain: string; addr: string }> }) {
  const { chain, addr } = await params;
  return handleLiveToken(await buildContext(), chain, addr, req.headers.get("cf-connecting-ip") ?? "0.0.0.0");
}
