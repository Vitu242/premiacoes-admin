import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const started = Date.now();
  const sb = getServerSupabase();
  let dbOk: boolean | "skipped" = "skipped";
  let dbErr: string | undefined;
  /** Idade em segundos do último snapshot do caixa. Usado pra detectar
   *  cron travado: se >2700s (45min, 50% acima do intervalo de 30min)
   *  algo está errado. */
  let snapshotAgeSec: number | null = null;
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
    if (dbOk === true) {
      try {
        const { data } = await sb
          .from("caixa_snapshots")
          .select("criado_em")
          .order("criado_em", { ascending: false })
          .limit(1);
        const criadoEm = (data as Array<{ criado_em?: string }> | null)?.[0]?.criado_em;
        if (criadoEm) {
          const ms = Date.now() - new Date(criadoEm).getTime();
          if (Number.isFinite(ms) && ms >= 0) {
            snapshotAgeSec = Math.round(ms / 1000);
          }
        }
      } catch {
        /* não bloqueia a verificação principal */
      }
    }
  }

  // Snapshot é considerado "saudável" se foi feito há menos de 60min
  // (cron roda a cada 30min; 60 dá tolerância pra atraso de execução).
  const snapshotOk =
    snapshotAgeSec === null ? null : snapshotAgeSec < 3600;

  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({
      ok: true,
      db: dbOk === true,
      snapshotOk,
      snapshotAgeSec,
    });
  }
  return NextResponse.json({
    ok: true,
    uptime: process.uptime(),
    elapsedMs: Date.now() - started,
    db: dbOk,
    dbError: dbErr,
    snapshotOk,
    snapshotAgeSec,
    env: process.env.NODE_ENV,
    timestamp: new Date().toISOString(),
  });
}
