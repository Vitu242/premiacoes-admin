"use client";

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

/**
 * Valida login: só aceita credenciais registradas.
 * - Lotobrasil sem registro: apenas admin/admin (primeiro acesso).
 * - Qualquer outro código: precisa ter sido criado pelo chefe (já estar em credenciais).
 */
export function validarLogin(codigo: string, admin: string, senha: string): boolean {
  const creds = getCredenciais();
  const porCodigo = creds[codigo];

  if (codigo === CODIGO_CHEFE && !porCodigo) {
    return admin === PRIMEIRO_ACCESS_LOGIN && senha === PRIMEIRO_ACCESS_SENHA;
  }
  if (!porCodigo) return false;
  return porCodigo.admin === admin && porCodigo.senha === senha;
}

/** Salva credenciais do primeiro acesso (Lotobrasil admin/admin ou quando chefe cria novo código). */
export function salvarPrimeiroLogin(codigo: string, admin: string, senha: string) {
  const creds = getCredenciais();
  creds[codigo] = { admin, senha };
  salvarCredenciais(creds);
}

export function atualizarAdminSenha(codigo: string, admin: string, senha: string) {
  const creds = getCredenciais();
  const atual = creds[codigo];
  creds[codigo] = {
    admin,
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
  if (!admin.trim()) return { ok: false, erro: "Informe o login." };
  if (!senha || senha.length < 4) return { ok: false, erro: "A senha deve ter no mínimo 4 caracteres." };
  creds[codigo.trim()] = { admin: admin.trim(), senha };
  salvarCredenciais(creds);
  return { ok: true };
}

/** Lista códigos já registrados (para o chefe ver quais admins existem). */
export function listarCodigosRegistrados(): { codigo: string; admin: string }[] {
  const creds = getCredenciais();
  return Object.entries(creds).map(([codigo, { admin }]) => ({ codigo, admin }));
}

/** Código da banca do admin logado (session). Usado para filtrar gerentes/cambistas. */
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
