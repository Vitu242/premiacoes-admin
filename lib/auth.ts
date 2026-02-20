"use client";

const CREDENCIAIS_KEY = "premiacoes_admin_credenciais";

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

export function validarLogin(codigo: string, admin: string, senha: string): boolean {
  const creds = getCredenciais();
  const porCodigo = creds[codigo];
  if (!porCodigo) return true; // Primeiro acesso para este código - aceita
  return porCodigo.admin === admin && porCodigo.senha === senha;
}

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
