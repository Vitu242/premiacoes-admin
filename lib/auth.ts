"use client";

/**
 * Camada de autenticação do cliente.
 *
 * - Mantém compatibilidade com o uso antigo (`validarLogin`, `criarNovoAdmin`, etc.).
 * - O caminho preferencial agora é o login server-side via /api/auth/admin/login,
 *   que faz bcrypt + rate-limit. Use loginAdminServer() abaixo.
 */

import { normalizeLogin, normalizeLoginKey } from "./login-normalize";

const CREDENCIAIS_KEY = "premiacoes_admin_credenciais";

/** Código do chefe: só ele pode criar novos admins/códigos. Primeiro acesso: admin / admin */
export const CODIGO_CHEFE = "Lotobrasil";
const PRIMEIRO_ACCESS_LOGIN = "admin";
const PRIMEIRO_ACCESS_SENHA = "admin";

export interface CredenciaisPorCodigo {
  [codigo: string]: { admin: string; senha: string };
}

function getCredenciais(): CredenciaisPorCodigo {
  if (typeof window === "undefined") return {};
  try {
    const data = localStorage.getItem(CREDENCIAIS_KEY);
    return data ? JSON.parse(data) : {};
  } catch {
    return {};
  }
}

function salvarCredenciais(creds: CredenciaisPorCodigo) {
  if (typeof window !== "undefined") {
    localStorage.setItem(CREDENCIAIS_KEY, JSON.stringify(creds));
  }
}

/** Login server-side (preferido). */
export async function loginAdminServer(
  codigo: string,
  admin: string,
  senha: string
): Promise<{ ok: boolean; erro?: string }> {
  try {
    const r = await fetch("/api/auth/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ codigo, admin, senha }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return { ok: false, erro: j?.erro ?? "Falha ao entrar" };
    return { ok: true };
  } catch (e) {
    return { ok: false, erro: (e as Error).message };
  }
}

/** Login server-side do cliente (cambista) */
export async function loginClienteServer(
  codigo: string,
  login: string,
  senha: string
): Promise<{ ok: boolean; erro?: string; cambistaId?: string; tipo?: "cambista" | "cliente" }> {
  try {
    const r = await fetch("/api/auth/cliente/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ codigo, login, senha }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return { ok: false, erro: j?.erro ?? "Falha ao entrar" };
    return { ok: true, cambistaId: j.cambistaId, tipo: j.tipo };
  } catch (e) {
    return { ok: false, erro: (e as Error).message };
  }
}

/**
 * Login legado (offline / fallback) — usado por código antigo.
 * Não use diretamente em UI nova: prefira loginAdminServer().
 */
export function validarLogin(codigo: string, admin: string, senha: string): boolean {
  const creds = getCredenciais();
  const porCodigo = creds[codigo];

  if (codigo === CODIGO_CHEFE && !porCodigo) {
    return normalizeLoginKey(admin) === normalizeLoginKey(PRIMEIRO_ACCESS_LOGIN) && senha === PRIMEIRO_ACCESS_SENHA;
  }
  if (!porCodigo) return false;
  return normalizeLoginKey(porCodigo.admin) === normalizeLoginKey(admin) && porCodigo.senha === senha;
}

export function salvarPrimeiroLogin(codigo: string, admin: string, senha: string) {
  const creds = getCredenciais();
  creds[codigo] = { admin: normalizeLogin(admin), senha };
  salvarCredenciais(creds);
}

export function atualizarAdminSenha(codigo: string, admin: string, senha: string) {
  const creds = getCredenciais();
  const atual = creds[codigo];
  creds[codigo] = {
    admin: normalizeLogin(admin),
    senha: senha || (atual?.senha ?? ""),
  };
  salvarCredenciais(creds);
}

export function getAdminAtual(codigo: string): string | null {
  const creds = getCredenciais();
  return creds[codigo]?.admin ?? null;
}

/** Cria novo admin/código. Só o chefe (Lotobrasil) pode criar. Retorna false se código já existe. */
export function criarNovoAdmin(codigo: string, admin: string, senha: string): { ok: boolean; erro?: string } {
  const creds = getCredenciais();
  if (creds[codigo]) return { ok: false, erro: "Este código já está em uso." };
  if (!codigo.trim()) return { ok: false, erro: "Informe o código." };
  if (!normalizeLogin(admin)) return { ok: false, erro: "Informe o login." };
  if (!senha || senha.length < 4) return { ok: false, erro: "A senha deve ter no mínimo 4 caracteres." };
  creds[codigo.trim()] = { admin: normalizeLogin(admin), senha };
  salvarCredenciais(creds);
  return { ok: true };
}

export function listarCodigosRegistrados(): { codigo: string; admin: string }[] {
  const creds = getCredenciais();
  return Object.entries(creds).map(([codigo, { admin }]) => ({ codigo, admin }));
}

export function getAdminCodigo(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const auth = localStorage.getItem("premiacoes_admin");
    if (!auth) return null;
    const { codigo } = JSON.parse(auth);
    return codigo ?? null;
  } catch {
    return null;
  }
}
