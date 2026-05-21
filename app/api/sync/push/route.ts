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

  // Cache de validação de extração por id (uma busca só por requisição).
  const cacheExtracoes = new Map<
    string,
    { ok: true } | { ok: false; erro: string }
  >();

  const validarExtracaoBilhete = async (
    extId: string,
  ): Promise<{ ok: true } | { ok: false; erro: string }> => {
    if (!extId) return { ok: true };
    const cache = cacheExtracoes.get(extId);
    if (cache) return cache;
    const { data: ext } = await sb
      .from("extracoes")
      .select("id,nome,encerra,ativa,dias")
      .eq("id", extId)
      .maybeSingle();
    if (!ext) {
      const r = { ok: false as const, erro: "Extração não encontrada" };
      cacheExtracoes.set(extId, r);
      return r;
    }
    if (!ext.ativa) {
      const r = { ok: false as const, erro: `Extração "${ext.nome}" não está ativa` };
      cacheExtracoes.set(extId, r);
      return r;
    }
    const fmt = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Sao_Paulo",
      hour: "2-digit",
      minute: "2-digit",
      weekday: "short",
      hour12: false,
    });
    const parts: Record<string, string> = {};
    for (const p of fmt.formatToParts(new Date())) {
      if (p.type !== "literal") parts[p.type] = p.value;
    }
    const horaAgora = parseInt(parts.hour ?? "0", 10) * 60 + parseInt(parts.minute ?? "0", 10);
    const wkMap: Record<string, string> = { Sun: "Dom", Mon: "Seg", Tue: "Ter", Wed: "Qua", Thu: "Qui", Fri: "Sex", Sat: "Sab" };
    const hojeKey = wkMap[parts.weekday ?? "Sun"] ?? "Dom";
    const dias = (ext.dias ?? null) as string[] | null;
    if (Array.isArray(dias) && dias.length > 0 && !dias.includes(hojeKey)) {
      const r = { ok: false as const, erro: `Extração "${ext.nome}" não roda hoje` };
      cacheExtracoes.set(extId, r);
      return r;
    }
    const m = String(ext.encerra ?? "").match(/(\d{1,2}):(\d{2})/);
    if (m) {
      const minEnc = parseInt(m[1] ?? "0", 10) * 60 + parseInt(m[2] ?? "0", 10);
      if (horaAgora >= minEnc) {
        const r = {
          ok: false as const,
          erro: `Horário de encerramento da extração "${ext.nome}" (${ext.encerra}) já passou. Bilhete não confirmado.`,
        };
        cacheExtracoes.set(extId, r);
        return r;
      }
    }
    const ok = { ok: true as const };
    cacheExtracoes.set(extId, ok);
    return ok;
  };

  const results: Array<{ ok: boolean; error?: string }> = [];
  for (const op of ops) {
    try {
      // CRÍTICO: validar horário de encerramento ANTES de upsertar bilhete.
      // Cliente offline pode confirmar venda fora do horário e a fila enviar
      // depois — aqui rejeitamos a inserção retroativa.
      if (op.kind === "upsert" && op.table === "bilhetes") {
        const linhas = Array.isArray(op.payload) ? op.payload : [op.payload];
        let bloqueio: string | null = null;
        for (const row of linhas) {
          const r = row as Record<string, unknown>;
          // Só valida bilhetes NOVOS (insert). Updates de situacao=cancelado
          // continuam funcionando.
          const sit = String(r.situacao ?? "");
          if (sit !== "pendente") continue;
          const extId = String(r.extracao_id ?? "");
          const v = await validarExtracaoBilhete(extId);
          if (!v.ok) {
            bloqueio = v.erro;
            break;
          }
        }
        if (bloqueio) {
          results.push({ ok: false, error: bloqueio });
          continue;
        }
      }
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
