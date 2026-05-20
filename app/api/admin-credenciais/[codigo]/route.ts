import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase-server";
import { ensureHashed, verifyPassword } from "@/lib/password";
import { normalizeLogin, normalizeLoginKey } from "@/lib/login-normalize";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CODIGO_CHEFE = "Lotobrasil";

async function autorizarChefe(
  senhaLotobrasil: string,
): Promise<{ ok: boolean; erro?: string }> {
  if (!senhaLotobrasil) return { ok: false, erro: "Senha do Lotobrasil é obrigatória." };
  const sb = getServerSupabase();
  if (!sb) return { ok: false, erro: "DB indisponível" };
  try {
    const r = await sb
      .from("admin_credenciais")
      .select("senha")
      .eq("codigo", CODIGO_CHEFE)
      .maybeSingle();
    const data = (r.data ?? null) as { senha?: string } | null;
    if (!data?.senha) return { ok: false, erro: "Cadastro do chefe não encontrado." };
    if (!verifyPassword(senhaLotobrasil, data.senha)) {
      return { ok: false, erro: "Senha do Lotobrasil incorreta." };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, erro: (e as Error).message };
  }
}

/**
 * PUT /api/admin-credenciais/:codigo
 * body: { admin?, senha?, novoCodigo?, senhaLotobrasil }
 *
 * Atualiza login e/ou senha de um admin existente. O `novoCodigo` permite
 * renomear o código (raro, mas útil — só para o chefe, e não pode colidir
 * com outro existente).
 */
export async function PUT(req: Request, ctx: { params: Promise<{ codigo: string }> }) {
  const { codigo: codigoOriginal } = await ctx.params;
  if (!codigoOriginal) return NextResponse.json({ ok: false, erro: "Código obrigatório" }, { status: 400 });
  let body: { admin?: string; senha?: string; novoCodigo?: string; senhaLotobrasil?: string };
  try { body = await req.json(); } catch {
    return NextResponse.json({ ok: false, erro: "Body inválido" }, { status: 400 });
  }
  const senhaLotobrasil = body.senhaLotobrasil ?? "";
  const auth = await autorizarChefe(senhaLotobrasil);
  if (!auth.ok) return NextResponse.json({ ok: false, erro: auth.erro }, { status: 401 });

  const sb = getServerSupabase();
  if (!sb) return NextResponse.json({ ok: false, erro: "DB indisponível" }, { status: 503 });

  const existente = await sb
    .from("admin_credenciais")
    .select("codigo, admin, senha")
    .eq("codigo", codigoOriginal)
    .maybeSingle();
  if (!existente.data) {
    return NextResponse.json({ ok: false, erro: "Admin não encontrado." }, { status: 404 });
  }
  const atual = existente.data as { codigo: string; admin: string; senha: string };

  const update: Record<string, unknown> = {};
  if (typeof body.admin === "string" && body.admin.trim()) {
    update.admin = normalizeLogin(body.admin);
  }
  if (typeof body.senha === "string" && body.senha.length > 0) {
    if (body.senha.length < 4) {
      return NextResponse.json({ ok: false, erro: "A senha deve ter no mínimo 4 caracteres." }, { status: 400 });
    }
    update.senha = ensureHashed(body.senha);
  }
  // Mudança de código: só permitida se o novo não existir e não for o próprio.
  let aplicaUpdate = true;
  if (typeof body.novoCodigo === "string" && body.novoCodigo.trim() && body.novoCodigo.trim() !== codigoOriginal) {
    const novoCodigo = body.novoCodigo.trim();
    if (normalizeLoginKey(codigoOriginal) === normalizeLoginKey(CODIGO_CHEFE)) {
      return NextResponse.json(
        { ok: false, erro: "O código do chefe (Lotobrasil) não pode ser renomeado." },
        { status: 400 },
      );
    }
    const colide = await sb.from("admin_credenciais").select("codigo").eq("codigo", novoCodigo).maybeSingle();
    if (colide.data) return NextResponse.json({ ok: false, erro: "Já existe um admin com esse código." }, { status: 409 });
    // Como `codigo` é PRIMARY KEY, fazemos delete+insert.
    const novoRegistro = {
      codigo: novoCodigo,
      admin: typeof update.admin === "string" ? (update.admin as string) : atual.admin,
      senha: typeof update.senha === "string" ? (update.senha as string) : atual.senha,
    };
    const ins = await sb.from("admin_credenciais").insert(novoRegistro);
    if (ins.error) return NextResponse.json({ ok: false, erro: ins.error.message }, { status: 500 });
    const del = await sb.from("admin_credenciais").delete().eq("codigo", codigoOriginal);
    if (del.error) return NextResponse.json({ ok: false, erro: del.error.message }, { status: 500 });
    aplicaUpdate = false;
  }

  if (aplicaUpdate && Object.keys(update).length > 0) {
    const r = await sb.from("admin_credenciais").update(update).eq("codigo", codigoOriginal);
    if (r.error) return NextResponse.json({ ok: false, erro: r.error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

/**
 * DELETE /api/admin-credenciais/:codigo
 *
 * Remove um admin. O `senhaLotobrasil` precisa vir no body. O chefe
 * (Lotobrasil) NÃO pode ser removido.
 */
export async function DELETE(req: Request, ctx: { params: Promise<{ codigo: string }> }) {
  const { codigo } = await ctx.params;
  if (!codigo) return NextResponse.json({ ok: false, erro: "Código obrigatório" }, { status: 400 });
  if (normalizeLoginKey(codigo) === normalizeLoginKey(CODIGO_CHEFE)) {
    return NextResponse.json({ ok: false, erro: "O código do chefe não pode ser removido." }, { status: 400 });
  }
  let body: { senhaLotobrasil?: string };
  try { body = await req.json(); } catch {
    return NextResponse.json({ ok: false, erro: "Body inválido" }, { status: 400 });
  }
  const auth = await autorizarChefe(body.senhaLotobrasil ?? "");
  if (!auth.ok) return NextResponse.json({ ok: false, erro: auth.erro }, { status: 401 });

  const sb = getServerSupabase();
  if (!sb) return NextResponse.json({ ok: false, erro: "DB indisponível" }, { status: 503 });

  const r = await sb.from("admin_credenciais").delete().eq("codigo", codigo);
  if (r.error) return NextResponse.json({ ok: false, erro: r.error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
