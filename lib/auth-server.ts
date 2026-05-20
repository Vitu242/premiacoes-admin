import { getServerSupabase } from "./supabase-server";
import { verifyPassword } from "./password";
import { rateLimit, clearRateLimit } from "./rate-limit";

const CODIGO_CHEFE = "Lotobrasil";

/** Rate limit anti-bruteforce: 8 tentativas por minuto, lock de 15 min. */
const RL_CHEFE = { max: 8, windowMs: 60_000, lockMs: 15 * 60_000 };

/** Autoriza usando a senha do código "Lotobrasil" (chefe).
 *  Operações sensíveis (restaurar caixa, gerir admins) usam isso.
 *  Possui rate limit anti-brute-force por IP. */
export async function autorizarChefe(
  senhaLotobrasil: string,
  req?: Request,
): Promise<{ ok: boolean; erro?: string }> {
  if (!senhaLotobrasil) return { ok: false, erro: "Senha do Lotobrasil é obrigatória." };
  // Rate limit por IP: 8 tentativas/min, lock 15min após exceder.
  const ip = req
    ? (req.headers.get("x-forwarded-for") ?? "").split(",")[0]!.trim() || "unknown"
    : "unknown";
  const key = `autorizarChefe:${ip}`;
  const rl = rateLimit(key, RL_CHEFE);
  if (!rl.ok) {
    const min = Math.ceil(rl.retryAfterMs / 60_000);
    return { ok: false, erro: `Muitas tentativas. Aguarde ${min} minuto(s).` };
  }
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
    clearRateLimit(key); // sucesso libera contador
    return { ok: true };
  } catch (e) {
    return { ok: false, erro: (e as Error).message };
  }
}

/** Autoriza com a senha do PRÓPRIO código (admin daquela banca). */
export async function autorizarAdminCodigo(
  codigo: string,
  senha: string,
): Promise<{ ok: boolean; erro?: string }> {
  if (!codigo || !senha) return { ok: false, erro: "Código e senha são obrigatórios." };
  const sb = getServerSupabase();
  if (!sb) return { ok: false, erro: "DB indisponível" };
  try {
    const r = await sb
      .from("admin_credenciais")
      .select("senha")
      .eq("codigo", codigo)
      .maybeSingle();
    const data = (r.data ?? null) as { senha?: string } | null;
    if (!data?.senha) return { ok: false, erro: "Admin não encontrado." };
    if (!verifyPassword(senha, data.senha)) {
      return { ok: false, erro: "Senha incorreta." };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, erro: (e as Error).message };
  }
}

/**
 * Autoriza chamadas de cron interno (do servidor para o servidor).
 *
 * Aceita:
 *   1. Token Bearer válido (`CAIXA_BACKUP_TOKEN`) — preferido em produção.
 *   2. Conexão 100% loopback: `Host: 127.0.0.1` (ou ::1/localhost) E sem
 *      `X-Forwarded-For` real. Reverse proxies (Caddy/nginx) adicionam
 *      XFF ao encaminhar requests externos, então essa heurística separa
 *      "curl localhost" de "internet entrando pelo Caddy".
 *
 * Quem chama: o cron a cada 30 min faz `curl http://127.0.0.1:3000/...`
 * direto, sem passar pelo Caddy. Não tem XFF e o Host é 127.0.0.1 — passa.
 */
export function autorizarCronInterno(req: Request): boolean {
  const tokenEnv = process.env.CAIXA_BACKUP_TOKEN;
  if (tokenEnv) {
    const auth = req.headers.get("authorization") ?? "";
    if (auth === `Bearer ${tokenEnv}`) return true;
    // Com token configurado, ainda aceitamos loopback como segundo caminho.
  }
  const host = (req.headers.get("host") ?? "").toLowerCase();
  const fwd = (req.headers.get("x-forwarded-for") ?? "").trim();
  const onlyLoopbackFwd =
    !fwd ||
    fwd
      .split(",")
      .map((p) => p.trim())
      .every((ip) => ip === "127.0.0.1" || ip === "::1" || ip === "localhost");
  const isLoopbackHost =
    host.startsWith("127.0.0.1") ||
    host.startsWith("localhost") ||
    host.startsWith("::1") ||
    host.startsWith("[::1]");
  return isLoopbackHost && onlyLoopbackFwd;
}

/**
 * Auth para chamadas vindas do BROWSER autenticado (admin ou cambista).
 *
 * Header esperado: `X-Sync-Auth: <base64("admin:<codigo>:<senha>")>`
 * OU                                `<base64("cambista:<cambistaId>:<senha>")>`
 *
 * Não substitui sessão server-side, mas impede chamadas anônimas
 * (curl/scripts externos) sem credencial.
 */
export async function autorizarSyncRequest(
  req: Request,
): Promise<{
  ok: boolean;
  tipo?: "admin" | "cambista";
  codigo?: string;
  cambistaId?: string;
  erro?: string;
}> {
  const header = req.headers.get("x-sync-auth") ?? "";
  if (!header) return { ok: false, erro: "Auth obrigatório" };
  let decoded = "";
  try {
    decoded = Buffer.from(header, "base64").toString("utf8");
  } catch {
    return { ok: false, erro: "Auth malformado" };
  }
  const partes = decoded.split(":");
  if (partes.length < 3) return { ok: false, erro: "Auth malformado" };
  const tipo = partes[0];
  const id = partes[1];
  const senha = partes.slice(2).join(":");
  if (!id || !senha) return { ok: false, erro: "Auth malformado" };

  const sb = getServerSupabase();
  if (!sb) return { ok: false, erro: "DB indisponível" };

  if (tipo === "admin") {
    try {
      const r = await sb
        .from("admin_credenciais")
        .select("senha")
        .eq("codigo", id)
        .maybeSingle();
      const data = (r.data ?? null) as { senha?: string } | null;
      if (data?.senha && verifyPassword(senha, data.senha)) {
        return { ok: true, tipo: "admin", codigo: id };
      }
    } catch {
      /* trata como inválido */
    }
    return { ok: false, erro: "Credenciais inválidas" };
  }

  if (tipo === "cambista") {
    try {
      const r = await sb
        .from("cambistas")
        .select("id, senha, codigo, status")
        .eq("id", id)
        .maybeSingle();
      const data = (r.data ?? null) as { senha?: string; codigo?: string; status?: string } | null;
      if (
        data?.senha &&
        verifyPassword(senha, data.senha) &&
        data.status !== "excluido"
      ) {
        return { ok: true, tipo: "cambista", cambistaId: id, codigo: data.codigo };
      }
    } catch {
      /* trata como inválido */
    }
    return { ok: false, erro: "Credenciais inválidas" };
  }

  return { ok: false, erro: "Tipo de auth inválido" };
}
