import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase-server";
import { autorizarSyncRequest } from "@/lib/auth-server";

export const runtime = "nodejs";

/**
 * POST /api/bilhetes/:id/cancelar
 *
 * Cancela bilhete e reverte caixa do cambista. Exige autenticação:
 *  - admin com X-Sync-Auth → cancela qualquer bilhete da banca dele
 *  - cambista com X-Sync-Auth → cancela apenas os PRÓPRIOS bilhetes
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await autorizarSyncRequest(req);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, erro: auth.erro || "Não autorizado" }, { status: 401 });
  }
  const { id } = await ctx.params;
  const sb = getServerSupabase();
  if (!sb) return NextResponse.json({ ok: false, erro: "DB indisponível" }, { status: 503 });

  const { data: bil, error } = await sb.from("bilhetes").select("*").eq("id", id).maybeSingle();
  if (error || !bil) return NextResponse.json({ ok: false, erro: "Bilhete não encontrado" }, { status: 404 });
  if (bil.situacao === "cancelado") return NextResponse.json({ ok: false, erro: "Já cancelado" }, { status: 400 });

  // Cambista só pode cancelar bilhete próprio
  if (auth.tipo === "cambista" && String(bil.cambista_id) !== String(auth.cambistaId)) {
    return NextResponse.json({ ok: false, erro: "Bilhete não pertence ao cambista logado" }, { status: 403 });
  }

  // Reverte caixa do cambista se ainda estava pendente (entrada + comissão estimada)
  if (bil.situacao === "pendente") {
    const { data: cam } = await sb
      .from("cambistas")
      .select("id, entrada, comissao, comissao_milhar, comissao_centena, comissao_dezena, comissao_grupo")
      .eq("id", bil.cambista_id)
      .maybeSingle();
    if (cam) {
      const itens = Array.isArray(bil.itens) ? bil.itens : [];
      let comissaoBilhete = 0;
      const pct = {
        grupo: Number(cam.comissao_grupo ?? 0),
        dezena: Number(cam.comissao_dezena ?? 0),
        centena: Number(cam.comissao_centena ?? 0),
        milhar: Number(cam.comissao_milhar ?? 0),
      };
      for (const item of itens as Array<{ modalidade?: string; valor?: number }>) {
        const mod = String(item.modalidade ?? "");
        let base: keyof typeof pct = "milhar";
        // Mantém alinhado com lib/store.ts:baseComissao (inclui passe → grupo,
        // duque/terno_dezena → dezena).
        if (
          mod === "grupo" ||
          mod.startsWith("duque_grupo") ||
          mod.startsWith("terno_grupo") ||
          mod.startsWith("passe")
        ) base = "grupo";
        else if (
          mod === "dezena" ||
          mod.startsWith("duque_dezena") ||
          mod.startsWith("terno_dezena")
        ) base = "dezena";
        else if (
          mod === "centena" ||
          (mod.includes("centena") && mod !== "milhar_e_centena" && mod !== "mc_invertida")
        ) base = "centena";
        comissaoBilhete += Number(item.valor ?? 0) * (pct[base] / 100);
      }
      await sb
        .from("cambistas")
        .update({
          entrada: Math.max(0, Number(cam.entrada) - Number(bil.total)),
          comissao: Math.max(0, Number(cam.comissao ?? 0) - comissaoBilhete),
        })
        .eq("id", cam.id);
    }
  }

  const { error: errUp } = await sb.from("bilhetes").update({ situacao: "cancelado" }).eq("id", id);
  if (errUp) return NextResponse.json({ ok: false, erro: errUp.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
