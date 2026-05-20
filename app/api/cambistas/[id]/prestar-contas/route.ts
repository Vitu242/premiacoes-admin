import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/cambistas/:id/prestar-contas
 * Zera o caixa no Supabase imediatamente (não depende da fila offline).
 */
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!id) return NextResponse.json({ ok: false, erro: "id obrigatório" }, { status: 400 });

  const sb = getServerSupabase();
  if (!sb) return NextResponse.json({ ok: false, erro: "DB indisponível" }, { status: 503 });

  // BRT explícito: o servidor pode estar em UTC. Sem isso, ultima_prestacao
  // fica 3h à frente do horário local do admin e o merge no F5 quebra.
  const agora = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(new Date());

  const { error } = await sb
    .from("cambistas")
    .update({
      entrada: 0,
      saidas: 0,
      comissao: 0,
      lancamentos: 0,
      ultima_prestacao: agora,
    })
    .eq("id", id);

  if (error) {
    return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, ultimaPrestacao: agora });
}
