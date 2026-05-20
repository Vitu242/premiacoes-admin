import { NextResponse } from "next/server";
import { getServerSupabase, addRemoteTombstoneServer } from "@/lib/supabase-server";

export const runtime = "nodejs";

/**
 * DELETE /api/gerentes/:id
 *
 * Soft delete do gerente server-side, com cascata nos cambistas dele,
 * seguido de tentativa de hard delete (melhor-esforço).
 */
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!id) return NextResponse.json({ ok: false, erro: "id obrigatório" }, { status: 400 });

  const sb = getServerSupabase();
  if (!sb) return NextResponse.json({ ok: false, erro: "DB indisponível" }, { status: 503 });

  // 1) Soft delete cascateando nos cambistas do gerente.
  try {
    await sb.from("cambistas").update({ status: "excluido" }).eq("gerente_id", id);
  } catch {
    /* ignore */
  }
  let softDeleted = false;
  try {
    const { error } = await sb.from("gerentes").update({ status: "excluido" }).eq("id", id);
    if (!error) softDeleted = true;
  } catch {
    /* ignore */
  }

  // 2) Best-effort hard delete dos cambistas sem dependência, depois do gerente.
  try {
    await sb.from("cambistas").delete().eq("gerente_id", id);
  } catch {
    /* ignore */
  }
  let hardDeleted = false;
  try {
    const { data, error } = await sb.from("gerentes").delete().eq("id", id).select("id");
    if (!error && Array.isArray(data) && data.length > 0) hardDeleted = true;
  } catch {
    /* ignore */
  }

  // Tombstone remota para gerente + cambistas dele.
  try { await addRemoteTombstoneServer("gerentes", id); } catch { /* ignore */ }
  try {
    const sb = getServerSupabase();
    if (sb) {
      // Reabsorve os ids dos cambistas que tinham sido marcados como excluido.
      const { data } = await sb.from("cambistas").select("id").eq("gerente_id", id);
      const ids = Array.isArray(data) ? (data as Array<{ id?: unknown }>) : [];
      for (const row of ids) {
        if (row?.id != null) await addRemoteTombstoneServer("cambistas", String(row.id));
      }
    }
  } catch { /* ignore */ }

  if (!softDeleted && !hardDeleted) {
    return NextResponse.json({ ok: false, erro: "Falha ao apagar gerente" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, softDeleted, hardDeleted });
}
