import { NextResponse } from "next/server";
import { getServerSupabase, addRemoteTombstoneServer } from "@/lib/supabase-server";

export const runtime = "nodejs";

/**
 * DELETE /api/lancamentos/:id
 *
 * Remove um lançamento direto no Supabase. Como nenhum outro registro
 * tem FK para `lancamentos`, o hard delete sempre pode ser feito.
 *
 * Roda em server-side para garantir que a deleção viaje para todos os
 * dispositivos via Supabase mesmo se o bundle do navegador estiver em cache
 * antigo (sem a lógica de tombstone/sync atualizada).
 */
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!id) return NextResponse.json({ ok: false, erro: "id obrigatório" }, { status: 400 });

  const sb = getServerSupabase();
  if (!sb) return NextResponse.json({ ok: false, erro: "DB indisponível" }, { status: 503 });

  try {
    const { data, error } = await sb
      .from("lancamentos")
      .delete()
      .eq("id", id)
      .select("id");
    if (error) {
      return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
    }
    const removed = Array.isArray(data) && data.length > 0;
    // Tombstone remota: bloqueia outros dispositivos de ressuscitar via upsert.
    try { await addRemoteTombstoneServer("lancamentos", id); } catch { /* ignore */ }
    return NextResponse.json({ ok: true, removed });
  } catch (e) {
    return NextResponse.json({ ok: false, erro: (e as Error).message }, { status: 500 });
  }
}
