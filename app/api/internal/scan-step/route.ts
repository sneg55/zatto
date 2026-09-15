import { buildContext } from "@/lib/http/context";
import { handleInternalStep } from "@/lib/http/internal";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  return handleInternalStep(buildContext(), req);
}
