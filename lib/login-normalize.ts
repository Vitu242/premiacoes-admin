/** Normaliza o login para exibição/salvamento: trim + espaços internos únicos. */
export function normalizeLogin(login: string): string {
  return login.trim().replace(/\s+/g, " ");
}

/**
 * Chave de comparação para login: case-insensitive e tolerante a espaços.
 * Ex.: " Alana  Santos ", "alana santos" e "ALANASANTOS" comparam igual.
 */
export function normalizeLoginKey(login: string): string {
  return normalizeLogin(login)
    .toLocaleLowerCase("pt-BR")
    .replace(/\s+/g, "");
}
