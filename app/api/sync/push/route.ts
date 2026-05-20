import { NextResponse } from "next/server";
import { executeSyncOp, isAllowedSyncTable, type SyncOp } from "@/lib/sync-op";
import { getServerSupabase } from "@/lib/supabase-server";
import { autorizarSyncRequest } from "@/lib/auth-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** 30 ops/req é confortável a partir do compute Small. Quem está no NANO
 *  vai mandar lotes pequenos (a fila adapta sozinha). */
const MAX_OPS = 30;

function temIdNaoVazio(match: unknown): boolean {
  if (!match || typeof match !== "object") return false;
  const obj = match as Record<string, unknown>;
  return Object.keys(obj).length > 0 && Object.values(obj).every((v) => v != null && v !== "");
}

function isSyncOp(v: unknown): v is SyncOp {
  if (!v || typeof v !== "object") return false;
  const o = v as SyncOp;
  if (!isAllowedSyncTable(String((o as { table?: string }).table ?? ""))) return false;
  if (o.kind === "upsert") {
    if (!o.table || o.payload == null) return false;
    // payload precisa ter pelo menos 1 linha não-vazia
    const arr = Array.isArray(o.payload) ? o.payload : [o.payload];
    return arr.length > 0 && arr.every((r) => r && typeof r === "object");
  }
  if (o.kind === "update") return !!o.table && temIdNaoVazio(o.match) && !!o.payload;
  if (o.kind === "delete") return !!o.table && temIdNaoVazio(o.match);
  return false;
}

/**
 * POST /api/sync/push
 * Executa operações da fila offline com service_role (bypass RLS).
 * Usado quando o browser não consegue falar com supabase.co diretamente.
 */
export async function POST(req: Request) {
  // AUTH: impede que clientes anônimos escrevam no banco com service_role.
  const auth = await autorizarSyncRequest(req);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, erro: auth.erro || "Não autorizado" }, { status: 401 });
  }

  const sb = getServerSupabase();
  if (!sb) {
    return NextResponse.json({ ok: false, erro: "Supabase não configurado no servidor" }, { status: 503 });
  }

  let body: { ops?: unknown };
  try {
    body = (await req.json()) as { ops?: unknown };
  } catch {
    return NextResponse.json({ ok: false, erro: "Body inválido" }, { status: 400 });
  }

  const raw = Array.isArray(body.ops) ? body.ops : [];
  if (!raw.length) {
    return NextResponse.json({ ok: false, erro: "Nenhuma operação" }, { status: 400 });
  }
  if (raw.length > MAX_OPS) {
    return NextResponse.json({ ok: false, erro: `Máximo ${MAX_OPS} operações por requisição` }, { status: 400 });
  }

  const ops = raw.filter(isSyncOp);
  if (ops.length !== raw.length) {
    return NextResponse.json({ ok: false, erro: "Operação inválida na lista" }, { status: 400 });
  }

  const results: Array<{ ok: boolean; error?: string }> = [];
  for (const op of ops) {
    try {
      await executeSyncOp(sb, op);
      results.push({ ok: true });
    } catch (e) {
      results.push({ ok: false, error: (e as Error).message });
    }
    // Espaçamento mínimo entre writes para suavizar pico de carga.
    await new Promise((r) => setTimeout(r, 30));
  }

  const falhas = results.filter((r) => !r.ok).length;
  return NextResponse.json({
    ok: falhas === 0,
    results,
    processados: ops.length,
    falhas,
  });
}
