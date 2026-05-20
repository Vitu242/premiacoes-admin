import { NextResponse } from "next/server";
import { getServerSupabase, addRemoteTombstoneServer } from "@/lib/supabase-server";

export const runtime = "nodejs";

/**
 * DELETE /api/cambistas/:id
 *
 * Aplica soft delete server-side (status="excluido") direto no Supabase e,
 * em seguida, tenta o DELETE físico como melhor-esforço.
 *
 * Por que existir em server-side:
 *   - Garante que o estado de deleção viaje para todos os dispositivos via
 *     Supabase, mesmo que o navegador do admin esteja com bundle antigo em
 *     cache (sem a lógica de soft delete).
 *   - Roda com a credencial do servidor (service_role quando disponível),
 *     então não é bloqueado por RLS/Realtime racing com o client.
 *
 * Resposta:
 *   { ok: true, softDeleted: boolean, hardDeleted: boolean }
 */
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!id) return NextResponse.json({ ok: false, erro: "id obrigatório" }, { status: 400 });

  const sb = getServerSupabase();
  if (!sb) return NextResponse.json({ ok: false, erro: "DB indisponível" }, { status: 503 });

  // 1) Soft delete: marca status='excluido'. Funciona mesmo se houver FKs.
  let softDeleted = false;
  try {
    const { error } = await sb
      .from("cambistas")
      .update({ status: "excluido" })
      .eq("id", id);
    if (!error) softDeleted = true;
  } catch {
    /* ignore */
  }

  // 2) Best-effort hard delete: se não houver bilhetes/lançamentos
  // referenciando o cambista, removemos a linha de vez. Caso contrário,
  // o status="excluido" continua escondendo o cambista em todas as telas.
  let hardDeleted = false;
  try {
    const { data, error } = await sb
      .from("cambistas")
      .delete()
      .eq("id", id)
      .select("id");
    if (!error && Array.isArray(data) && data.length > 0) hardDeleted = true;
  } catch {
    /* ignore */
  }

  // 3) Tombstone remota: garante que outros dispositivos, mesmo com bundle
  //    antigo em cache, NÃO ressuscitem o cambista via upsert em lote.
  try { await addRemoteTombstoneServer("cambistas", id); } catch { /* ignore */ }

  if (!softDeleted && !hardDeleted) {
    return NextResponse.json({ ok: false, erro: "Falha ao apagar cambista" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, softDeleted, hardDeleted });
}
