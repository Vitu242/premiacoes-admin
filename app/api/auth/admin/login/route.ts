import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase-server";
import { verifyPassword, ensureHashed, isHashed } from "@/lib/password";
import { rateLimit, clearRateLimit } from "@/lib/rate-limit";
import { normalizeLogin, normalizeLoginKey } from "@/lib/login-normalize";

export const runtime = "nodejs";

function getIp(req: Request): string {
  const h = req.headers;
  return (
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    h.get("x-real-ip") ||
    "unknown"
  );
}

/**
 * POST /api/auth/admin/login
 * body: { codigo, admin, senha }
 *
 * - Confere credenciais na tabela admin_credenciais (Supabase) se disponível.
 * - Para Lotobrasil sem registro, aceita admin/admin (primeiro acesso) e cria registro.
 * - Migração suave: se senha estiver em texto puro no DB, regrava como bcrypt.
 * - Rate-limit: 8 tentativas / 5 min / IP+codigo. Lock de 10 min ao exceder.
 */
export async function POST(req: Request) {
  let body: { codigo?: string; admin?: string; senha?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, erro: "Body inválido" }, { status: 400 });
  }

  const codigo = (body.codigo ?? "").trim();
  const admin = normalizeLogin(body.admin ?? "");
  const senha = body.senha ?? "";

  if (!codigo || !admin || !senha) {
    return NextResponse.json({ ok: false, erro: "Campos obrigatórios" }, { status: 400 });
  }

  const ip = getIp(req);
  const key = `admin:${ip}:${codigo.toLowerCase()}`;
  const rl = rateLimit(key, { max: 8, windowMs: 5 * 60 * 1000, lockMs: 10 * 60 * 1000 });
  if (!rl.ok) {
    return NextResponse.json(
      { ok: false, erro: `Muitas tentativas. Tente novamente em ${Math.ceil(rl.retryAfterMs / 1000)}s` },
      { status: 429, headers: { "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000)) } }
    );
  }

  const sb = getServerSupabase();

  if (!sb) {
    return NextResponse.json(
      { ok: false, erro: "Supabase não configurado." },
      { status: 503 },
    );
  }

  let data: { codigo: string; admin: string; senha: string } | null = null;
  let tabelaIndisponivel = false;
  let dbOffline = false;
  try {
    const r = await sb
      .from("admin_credenciais")
      .select("codigo, admin, senha")
      .eq("codigo", codigo)
      .maybeSingle();
    if (r.error) {
      const code = (r.error as { code?: string })?.code ?? "";
      const msg = r.error.message || "";
      if (/fetch failed|ENOTFOUND|ECONNREFUSED|getaddrinfo|NetworkError/i.test(msg)) {
        dbOffline = true;
      } else if (code === "42P01" || /relation .* does not exist/i.test(msg)) {
        tabelaIndisponivel = true;
      } else if (code !== "PGRST116") {
        return NextResponse.json(
          { ok: false, erro: msg || "Erro no servidor" },
          { status: 500 }
        );
      }
    }
    data = (r.data as { codigo: string; admin: string; senha: string } | null) ?? null;
  } catch (e) {
    const msg = (e as Error)?.message ?? "";
    if (/fetch failed|ENOTFOUND|ECONNREFUSED|getaddrinfo|NetworkError/i.test(msg)) dbOffline = true;
    else tabelaIndisponivel = true;
  }

  if (dbOffline) {
    return NextResponse.json(
      { ok: false, erro: "Servidor de dados indisponível. Tente novamente em instantes." },
      { status: 503 },
    );
  }

  if (tabelaIndisponivel) {
    return NextResponse.json(
      { ok: false, erro: "Cadastro indisponível. Configure a tabela admin_credenciais." },
      { status: 503 },
    );
  }

  if (!data) {
    return NextResponse.json({ ok: false, erro: "Código não cadastrado" }, { status: 401 });
  }

  if (normalizeLoginKey(data.admin) !== normalizeLoginKey(admin) || !verifyPassword(senha, data.senha)) {
    return NextResponse.json({ ok: false, erro: "Login ou senha incorretos" }, { status: 401 });
  }

  if (!isHashed(data.senha)) {
    try {
      await sb
        .from("admin_credenciais")
        .update({ senha: ensureHashed(senha) })
        .eq("codigo", codigo);
    } catch {}
  }

  clearRateLimit(key);
  return NextResponse.json({ ok: true, codigo, admin });
}
