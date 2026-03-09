"use client";

/** Status da modalidade conforme SAE (Tela 17). Ativa e Desbloqueado permitem apostar; Bloqueada não. */
export type StatusModalidade = "ativa" | "desbloqueado" | "bloqueada";

/** Config por modalidade (admin). Retorna true se o cliente pode apostar. */
export function modalidadePodeApostar(cfg: { ativa?: boolean; status?: StatusModalidade } | undefined): boolean {
  if (!cfg) return true;
  if (typeof cfg.status === "string") return cfg.status !== "bloqueada";
  return cfg.ativa !== false;
}

/** Chaves das 22 cotações padrão do jogo do bicho */
export type CotacaoKey =
  | "milhar"
  | "centena"
  | "dezena"
  | "grupo"
  | "milhar_e_centena"
  | "milhar_invertida"
  | "mc_invertida"
  | "centena_invertida"
  | "duque_grupo_1_2"
  | "duque_grupo_1_5"
  | "terno_grupo_1_3"
  | "terno_grupo_1_5"
  | "terno_grupo_1_10"
  | "duque_dezena_1_2"
  | "duque_dezena_1_5"
  | "terno_dezena_1_3"
  | "terno_dezena_1_5"
  | "terno_dezena_1_10"
  | "passe_1_2"
  | "passe_1_5"
  | "passe_vai_e_volta_1_2"
  | "passe_vai_e_volta_1_5";

export type CotacoesPadroes = Record<CotacaoKey, number>;

/** Valores padrão (cotações padrões da imagem) */
export const COTACOES_PADROES_DEFAULT: CotacoesPadroes = {
  milhar: 6000,
  centena: 800,
  dezena: 80,
  grupo: 20,
  milhar_e_centena: 6800,
  milhar_invertida: 6000,
  mc_invertida: 6800,
  centena_invertida: 800,
  duque_grupo_1_2: 60,
  duque_grupo_1_5: 20,
  terno_grupo_1_3: 200,
  terno_grupo_1_5: 150,
  terno_grupo_1_10: 20,
  duque_dezena_1_2: 1000,
  duque_dezena_1_5: 300,
  terno_dezena_1_3: 3000,
  terno_dezena_1_5: 2000,
  terno_dezena_1_10: 0,
  passe_1_2: 90,
  passe_1_5: 100,
  passe_vai_e_volta_1_2: 90,
  passe_vai_e_volta_1_5: 40,
};

/** Labels para exibição no admin e cliente */
export const COTACOES_LABELS: Record<CotacaoKey, string> = {
  milhar: "Milhar",
  centena: "Centena",
  dezena: "Dezena",
  grupo: "Grupo",
  milhar_e_centena: "Milhar e Centena",
  milhar_invertida: "Milhar Invertida",
  mc_invertida: "MC Invertida",
  centena_invertida: "Centena Invertida",
  duque_grupo_1_2: "Duque de Grupo 1/2",
  duque_grupo_1_5: "Duque de Grupo 1/5",
  terno_grupo_1_3: "Terno de Grupo 1/3",
  terno_grupo_1_5: "Terno de Grupo 1/5",
  terno_grupo_1_10: "Terno de Grupo 1/10",
  duque_dezena_1_2: "Duque de Dezena 1/2",
  duque_dezena_1_5: "Duque de Dezena 1/5",
  terno_dezena_1_3: "Terno de Dezena 1/3",
  terno_dezena_1_5: "Terno de Dezena 1/5",
  terno_dezena_1_10: "Terno de Dezena 1/10",
  passe_1_2: "Passe 1/2",
  passe_1_5: "Passe 1/5",
  passe_vai_e_volta_1_2: "Passe vai e vem 1/2",
  passe_vai_e_volta_1_5: "Passe vai e vem 1/5",
};

export const COTACOES_KEYS_ORDER: CotacaoKey[] = [
  "milhar",
  "centena",
  "dezena",
  "grupo",
  "milhar_e_centena",
  "milhar_invertida",
  "mc_invertida",
  "centena_invertida",
  "duque_grupo_1_2",
  "duque_grupo_1_5",
  "terno_grupo_1_3",
  "terno_grupo_1_5",
  "terno_grupo_1_10",
  "duque_dezena_1_2",
  "duque_dezena_1_5",
  "terno_dezena_1_3",
  "terno_dezena_1_5",
  "terno_dezena_1_10",
  "passe_1_2",
  "passe_1_5",
  "passe_vai_e_volta_1_2",
  "passe_vai_e_volta_1_5",
];
