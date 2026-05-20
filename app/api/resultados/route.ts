import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase-server";
import { autorizarSyncRequest } from "@/lib/auth-server";

export const runtime = "nodejs";

/**
 * POST /api/resultados
 * body: { extracaoId, extracaoNome, data, grupos, premios: {1..10: string} }
 *
 * EXIGE autenticação admin via header `X-Sync-Auth` (ver autorizarSyncRequest).
 * Sem autenticação, atacante poderia gravar resultados falsos e fazer o
 * sistema marcar bilhetes como pago/perdedor incorretamente.
 */
export async function POST(req: Request) {
  const auth = await autorizarSyncRequest(req);
  if (!auth.ok || auth.tipo !== "admin") {
    return NextResponse.json({ ok: false, erro: auth.erro || "Não autorizado" }, { status: 401 });
  }
  const sb = getServerSupabase();
  if (!sb) return NextResponse.json({ ok: false, erro: "DB indisponível" }, { status: 503 });

  interface ResultadoBody {
    id?: string;
    extracaoId?: string;
    extracaoNome?: string;
    data?: string;
    grupos?: string;
    dezenas?: unknown;
    premios?: unknown;
  }
  let body: ResultadoBody;
  try {
    body = (await req.json()) as ResultadoBody;
  } catch {
    return NextResponse.json({ ok: false, erro: "Body inválido" }, { status: 400 });
  }

  const id = body.id ?? String(Date.now());
  const r = {
    id,
    extracao_id: String(body.extracaoId ?? ""),
    extracao_nome: String(body.extracaoNome ?? ""),
    data: String(body.data ?? ""),
    grupos: String(body.grupos ?? ""),
    dezenas: body.dezenas ?? null,
    premios: body.premios ?? null,
  };
  const { error } = await sb.from("resultados").upsert(r, { onConflict: "id" });
  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, resultado: r });
}
