import { buildContext } from "@/lib/http/context";
import { handleRecent } from "@/lib/recent";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ chain: string; addr: string }> }) {
  const { chain, addr } = await params;
  return handleRecent(await buildContext(), chain, addr);
}
