import { buildContext } from "@/lib/http/context";
import { handleBackfill } from "@/lib/backfill";
import { constantTimeEqual } from "@/lib/http/context";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const ctx = await buildContext();
  const secret = req.headers.get("X-Zatto-Internal") ?? "";
  if (!secret || !constantTimeEqual(secret, ctx.env.INTERNAL_SECRET)) return new Response("not found", { status: 404 });
  return handleBackfill(ctx, req);
}
