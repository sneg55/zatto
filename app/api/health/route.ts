import { NextResponse } from "next/server";
import { getDb, getEnv } from "@/lib/db/d1";
import { buildHealth } from "@/lib/health";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await buildHealth(getDb(), getEnv(), new Date()));
}
