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
 * POST /api/auth/cliente/login
 * body: { codigo, login, senha }
 *
 * Aceita codigo "default" como sinônimo de "Lotobrasil" (compat).
 */
export async function POST(req: Request) {
  let body: { codigo?: string; login?: string; senha?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, erro: "Body inválido" }, { status: 400 });
  }

  const codigoRaw = (body.codigo ?? "").trim();
  const login = normalizeLogin(body.login ?? "");
  const senha = body.senha ?? "";

  if (!codigoRaw || !login || !senha) {
    return NextResponse.json({ ok: false, erro: "Campos obrigatórios" }, { status: 400 });
  }

  const ip = getIp(req);
  const key = `cliente:${ip}:${codigoRaw.toLowerCase()}:${login.toLowerCase()}`;
  const rl = rateLimit(key, { max: 10, windowMs: 5 * 60 * 1000, lockMs: 5 * 60 * 1000 });
  if (!rl.ok) {
    return NextResponse.json(
      { ok: false, erro: `Muitas tentativas. Tente novamente em ${Math.ceil(rl.retryAfterMs / 1000)}s` },
      { status: 429, headers: { "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000)) } }
    );
  }

  const sb = getServerSupabase();
  if (!sb) {
    return NextResponse.json({ ok: false, erro: "Supabase não configurado" }, { status: 500 });
  }

  // Tenta os dois códigos equivalentes (default ↔ Lotobrasil)
  const possiveis = new Set<string>();
  possiveis.add(codigoRaw);
  if (codigoRaw.toLowerCase() === "lotobrasil") possiveis.add("default");
  if (codigoRaw.toLowerCase() === "default") possiveis.add("Lotobrasil");

  const codigosIn = Array.from(possiveis);
  interface CambistaRow {
    id: string;
    codigo: string;
    login: string;
    senha: string;
    status?: string | null;
    tipo?: string | null;
    saldo?: number | null;
    entrada?: number | null;
    comissao?: number | null;
    lancamentos?: number | null;
  }
  let lista: CambistaRow[] = [];
  try {
    const r = await sb
      .from("cambistas")
      .select("id, codigo, login, senha, status, tipo, saldo, entrada, comissao, lancamentos")
      .in("codigo", codigosIn);
    if (r.error) {
      const msg = r.error.message || "";
      if (/fetch failed|ENOTFOUND|ECONNREFUSED|getaddrinfo|NetworkError/i.test(msg)) {
        return NextResponse.json(
          { ok: false, erro: "Servidor de dados indisponível. Tente novamente em alguns instantes." },
          { status: 503 }
        );
      }
      return NextResponse.json(
        { ok: false, erro: msg || "Erro no servidor" },
        { status: 500 }
      );
    }
    lista = r.data ?? [];
  } catch (e) {
    const msg = (e as Error)?.message ?? "";
    if (/fetch failed|ENOTFOUND|ECONNREFUSED|getaddrinfo/i.test(msg)) {
      return NextResponse.json(
        { ok: false, erro: "Servidor de dados indisponível. Tente novamente em alguns instantes ou peça ao admin." },
        { status: 503 }
      );
    }
    return NextResponse.json({ ok: false, erro: msg || "Erro no servidor" }, { status: 500 });
  }

  const loginKey = normalizeLoginKey(login);
  const cam = lista.find((c) => normalizeLoginKey(c.login ?? "") === loginKey && verifyPassword(senha, c.senha));
  if (!cam) {
    return NextResponse.json({ ok: false, erro: "Login ou senha incorretos" }, { status: 401 });
  }

  if (cam.status === "excluido") {
    return NextResponse.json({ ok: false, erro: "Login ou senha incorretos" }, { status: 401 });
  }
  if (cam.status === "inativo") {
    return NextResponse.json({ ok: false, erro: "Cambista inativo. Procure o administrador." }, { status: 403 });
  }

  // Migração suave de senha
  if (!isHashed(cam.senha)) {
    await sb
      .from("cambistas")
      .update({ senha: ensureHashed(senha), ultimo_acesso: new Date().toISOString() })
      .eq("id", cam.id);
  } else {
    await sb
      .from("cambistas")
      .update({ ultimo_acesso: new Date().toISOString() })
      .eq("id", cam.id);
  }

  clearRateLimit(key);
  return NextResponse.json({
    ok: true,
    cambistaId: cam.id,
    codigo: cam.codigo,
    login: cam.login,
    tipo: cam.tipo ?? "cambista",
  });
}
