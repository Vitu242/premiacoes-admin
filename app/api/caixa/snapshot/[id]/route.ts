import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase-server";
import { obterSnapshot } from "@/lib/caixa-snapshot";
import { autorizarChefe } from "@/lib/auth-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/caixa/snapshot/:id
 * Retorna o snapshot completo (cambistas com saldos). Exige senha do chefe
 * via header `X-Senha-Lotobrasil` — vazaria caixa de todos os cambistas.
 */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!id) return NextResponse.json({ ok: false, erro: "id obrigatório" }, { status: 400 });

  const senha = req.headers.get("x-senha-lotobrasil") ?? "";
  const auth = await autorizarChefe(senha);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, erro: auth.erro || "Não autorizado" }, { status: 401 });
  }

  const sb = getServerSupabase();
  if (!sb) return NextResponse.json({ ok: false, erro: "DB indisponível" }, { status: 503 });

  const snap = await obterSnapshot(sb, id);
  if (!snap) return NextResponse.json({ ok: false, erro: "Snapshot não encontrado" }, { status: 404 });

  return NextResponse.json({ ok: true, snapshot: snap });
}
