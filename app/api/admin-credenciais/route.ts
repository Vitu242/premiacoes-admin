import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase-server";
import { ensureHashed, verifyPassword } from "@/lib/password";
import { normalizeLogin, normalizeLoginKey } from "@/lib/login-normalize";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CODIGO_CHEFE = "Lotobrasil";

/**
 * Confere se o solicitante é o chefe (Lotobrasil). Espera que a senha
 * venha em `senhaLotobrasil` no body. Devolve `{ok:true}` ou erro.
 */
async function autorizarChefe(senhaLotobrasil: string): Promise<{ ok: boolean; erro?: string }> {
  if (!senhaLotobrasil) return { ok: false, erro: "Senha do Lotobrasil é obrigatória." };
  const sb = getServerSupabase();
  if (!sb) return { ok: false, erro: "DB indisponível" };
  try {
    const r = await sb
      .from("admin_credenciais")
      .select("codigo, admin, senha")
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

/** GET /api/admin-credenciais → lista (codigo + admin, sem senha).
 *  Exige header `X-Senha-Lotobrasil` com a senha do chefe. */
export async function GET(req: Request) {
  const senha = req.headers.get("x-senha-lotobrasil") ?? "";
  const auth = await autorizarChefe(senha);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, erro: auth.erro || "Não autorizado" }, { status: 401 });
  }
  const sb = getServerSupabase();
  if (!sb) return NextResponse.json({ ok: false, erro: "DB indisponível" }, { status: 503 });
  const r = await sb.from("admin_credenciais").select("codigo, admin").order("codigo");
  if (r.error) return NextResponse.json({ ok: false, erro: r.error.message }, { status: 500 });
  return NextResponse.json({ ok: true, lista: r.data ?? [] });
}

/**
 * POST /api/admin-credenciais
 * body: { codigo, admin, senha, senhaLotobrasil }
 *
 * Cria um novo admin/código. Só o Lotobrasil pode chamar (autenticado pela
 * senha do chefe no body).
 */
export async function POST(req: Request) {
  let body: { codigo?: string; admin?: string; senha?: string; senhaLotobrasil?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, erro: "Body inválido" }, { status: 400 });
  }
  const codigo = (body.codigo ?? "").trim();
  const admin = normalizeLogin(body.admin ?? "");
  const senha = body.senha ?? "";
  const senhaLotobrasil = body.senhaLotobrasil ?? "";

  if (!codigo) return NextResponse.json({ ok: false, erro: "Informe o código." }, { status: 400 });
  if (normalizeLoginKey(codigo) === normalizeLoginKey(CODIGO_CHEFE)) {
    return NextResponse.json(
      { ok: false, erro: "O código do chefe não pode ser criado por aqui — use Editar." },
      { status: 400 },
    );
  }
  if (!admin) return NextResponse.json({ ok: false, erro: "Informe o login do admin." }, { status: 400 });
  if (!senha || senha.length < 4) {
    return NextResponse.json({ ok: false, erro: "A senha deve ter no mínimo 4 caracteres." }, { status: 400 });
  }

  const auth = await autorizarChefe(senhaLotobrasil);
  if (!auth.ok) return NextResponse.json({ ok: false, erro: auth.erro }, { status: 401 });

  const sb = getServerSupabase();
  if (!sb) return NextResponse.json({ ok: false, erro: "DB indisponível" }, { status: 503 });

  const existe = await sb.from("admin_credenciais").select("codigo").eq("codigo", codigo).maybeSingle();
  if (existe.data) return NextResponse.json({ ok: false, erro: "Esse código já está em uso." }, { status: 409 });

  const senhaHash = ensureHashed(senha);
  const r = await sb
    .from("admin_credenciais")
    .insert({ codigo, admin, senha: senhaHash });
  if (r.error) return NextResponse.json({ ok: false, erro: r.error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
