import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const started = Date.now();
  const sb = getServerSupabase();
  let dbOk: boolean | "skipped" = "skipped";
  let dbErr: string | undefined;
  if (sb) {
    try {
      const { error } = await sb.from("config").select("id").limit(1);
      if (error) {
        dbOk = false;
        dbErr = error.message;
      } else {
        dbOk = true;
      }
    } catch (e) {
      dbOk = false;
      dbErr = (e as Error).message;
    }
  }
  return NextResponse.json({
    ok: true,
    uptime: process.uptime(),
    elapsedMs: Date.now() - started,
    db: dbOk,
    dbError: dbErr,
    env: process.env.NODE_ENV,
    timestamp: new Date().toISOString(),
  });
}
