"use client";

import type { Resultado, ItemBilhete, Bilhete, Cambista } from "./types";
import type { ModalidadeBilhete } from "./types";

/** Parse "1/3" -> [1,2,3], "5/10" -> [5,6,7,8,9,10] */
export function parsePremioRange(premio: string): number[] {
  const def = [1];
  if (!premio || !premio.includes("/")) return def;
  const [a, b] = premio.split("/").map((x) => parseInt(x.trim(), 10));
  if (isNaN(a) || isNaN(b) || a < 1 || b > 10 || a > b) return def;
  const out: number[] = [];
  for (let p = a; p <= b; p++) out.push(p);
  return out;
}

/**
 * Divisor do prêmio para cálculo: 1/1 → 1, 1/5 → 5, 1/10 → 10.
 * Prêmio = (valor apostado × cotação) ÷ divisor (em todas as modalidades).
 */
export function getPremioDivisor(premio: string | undefined): number {
  if (!premio || !premio.includes("/")) return 1;
  const [, b] = premio.split("/").map((x) => parseInt(x.trim(), 10));
  if (isNaN(b) || b < 1 || b > 10) return 1;
  return b;
}

/** Jogo do bicho: grupo 1 = dezenas 01,02,03,04; 2 = 05,06,07,08; ... 25 = 97,98,99,00 */
function grupoParaDezenas(grupoNum: number): string[] {
  const start = (grupoNum - 1) * 4;
  return [start, start + 1, start + 2, start + 3].map((d) =>
    d === 100 ? "00" : String(d).padStart(2, "0")
  );
}

/** Grupos string "01-02-03-04-05" -> set de dezenas ganhadoras (1º prêmio) */
function gruposStringToDezenas(gruposStr: string): Set<string> {
  const set = new Set<string>();
  const parts = gruposStr.split(/[-,\s]+/).filter(Boolean);
  for (const p of parts) {
    const n = parseInt(p, 10);
    if (n >= 1 && n <= 25) grupoParaDezenas(n).forEach((d) => set.add(d));
  }
  return set;
}

/** Grupos string -> set de números de grupo (01..25) */
function gruposStringToSet(gruposStr: string): Set<string> {
  const set = new Set<string>();
  const parts = gruposStr.split(/[-,\s]+/).filter(Boolean);
  for (const p of parts) {
    const n = parseInt(p, 10);
    if (n >= 1 && n <= 25) set.add(String(n).padStart(2, "0"));
  }
  return set;
}

function getGruposDoPremio(r: Resultado, premioNum: number): string {
  if (r.premios && r.premios[premioNum]) return r.premios[premioNum];
  if (premioNum === 1) return r.grupos;
  return "";
}

/** Dados do resultado por prêmio: número formado pelas 5 dezenas (1ª de cada grupo). Milhar = últimos 4, centena = últimos 3, dezena = últimos 2. */
export interface WinningData {
  grupos: Set<string>;
  dezenas: Set<string>;
  /** 5 dezenas em ordem (ex: ["00","04","08","12","16"]) */
  dezenasOrdenadas: string[];
  /** Últimos 4 dígitos = milhar (ex: "1216") */
  milhar4: string;
  /** Últimos 3 dígitos = centena (ex: "216") */
  centena3: string;
  /** Últimos 2 dígitos = dezena (ex: "16") */
  dezena2: string;
}

function getWinningData(gruposStr: string): WinningData | null {
  const setGrupos = gruposStringToSet(gruposStr);
  const setDezenas = gruposStringToDezenas(gruposStr);
  const parts = gruposStr.split(/[-,\s]+/).filter(Boolean);
  if (parts.length < 5) return null;
  const dezenasOrdenadas: string[] = [];
  for (let i = 0; i < 5; i++) {
    const n = parseInt(parts[i], 10);
    if (n >= 1 && n <= 25) {
      const d = grupoParaDezenas(n)[0];
      dezenasOrdenadas.push(d);
    }
  }
  if (dezenasOrdenadas.length < 5) return null;
  const concat = dezenasOrdenadas.join("");
  const milhar4 = concat.slice(-4);
  const centena3 = concat.slice(-3);
  const dezena2 = concat.slice(-2);
  return { grupos: setGrupos, dezenas: setDezenas, dezenasOrdenadas, milhar4, centena3, dezena2 };
}

function normalizarMilhar(s: string): string {
  return s.replace(/\D/g, "").slice(-4).padStart(4, "0");
}
function normalizarCentena(s: string): string {
  return s.replace(/\D/g, "").slice(-3).padStart(3, "0");
}
function normalizarDezena(s: string): string {
  return s.replace(/\D/g, "").slice(-2).padStart(2, "0");
}
function digitosOrdenados(s: string): string {
  return s.replace(/\D/g, "").split("").sort().join("");
}

/** Separa números do item conforme a modalidade (grupos, dezenas, milhares, etc.) */
function splitNumeros(numeros: string, modalidade: string): string[] {
  const s = numeros.trim().replace(/\s+/g, " ");
  const isGrupo = modalidade === "grupo" || modalidade.startsWith("duque_grupo") || modalidade.startsWith("terno_grupo");
  const isDezena = modalidade === "dezena" || modalidade.startsWith("duque_dezena") || modalidade.startsWith("terno_dezena");
  if (isDezena || isGrupo) {
    return s.split(/\s+/).filter(Boolean).map((n) => n.length >= 2 ? n.slice(-2).padStart(2, "0") : n.padStart(2, "0"));
  }
  if (modalidade === "centena" || modalidade === "milhar" || modalidade === "milhar_e_centena" || modalidade === "milhar_invertida" || modalidade === "mc_invertida" || modalidade === "centena_invertida") {
    const parts = s.split(/\s+/).filter(Boolean);
    if (parts.length > 1) return parts;
    return [s];
  }
  return [s];
}

/** Verifica se o item bateu em algum prêmio do range. Usa número oficial do resultado: milhar 4 díg, centena 3, dezena 2, grupo. */
export function itemBateu(item: ItemBilhete, resultado: Resultado): boolean {
  const range = parsePremioRange(item.premio ?? "1/1");
  const modalidade = item.modalidade;
  const numerosList = splitNumeros(item.numeros, modalidade);

  for (const p of range) {
    const gruposStr = getGruposDoPremio(resultado, p);
    if (!gruposStr.trim()) continue;
    const w = getWinningData(gruposStr);
    if (!w) continue;

    if (modalidade === "grupo") {
      for (const num of numerosList) {
        const g = num.length <= 2 ? num.padStart(2, "0") : num.slice(0, 2);
        if (w.grupos.has(g)) return true;
      }
    }

    if (modalidade === "dezena") {
      for (const num of numerosList) {
        const dez = normalizarDezena(num);
        if (w.dezenas.has(dez)) return true;
      }
    }

    if (modalidade === "centena") {
      for (const num of numerosList) {
        const c = normalizarCentena(num);
        if (c === w.centena3) return true;
      }
    }

    if (modalidade === "milhar") {
      for (const num of numerosList) {
        const m = normalizarMilhar(num);
        if (m === w.milhar4) return true;
      }
    }

    if (modalidade === "milhar_invertida") {
      const winSort = digitosOrdenados(w.milhar4);
      for (const num of numerosList) {
        if (digitosOrdenados(normalizarMilhar(num)) === winSort) return true;
      }
    }

    if (modalidade === "centena_invertida") {
      const winSort = digitosOrdenados(w.centena3);
      for (const num of numerosList) {
        if (digitosOrdenados(normalizarCentena(num)) === winSort) return true;
      }
    }

    if (modalidade === "mc_invertida") {
      const winMilhar = digitosOrdenados(w.milhar4);
      const winCentena = digitosOrdenados(w.centena3);
      for (const num of numerosList) {
        const m = normalizarMilhar(num);
        const c = normalizarCentena(num);
        if (digitosOrdenados(m) === winMilhar || digitosOrdenados(c) === winCentena) return true;
      }
    }

    if (modalidade === "milhar_e_centena") {
      for (const num of numerosList) {
        const m = normalizarMilhar(num);
        const c = normalizarCentena(num);
        if (m === w.milhar4 || c === w.centena3) return true;
      }
    }

    if (modalidade.startsWith("duque_grupo") || modalidade.startsWith("terno_grupo")) {
      const allIn = numerosList.length >= 1 && numerosList.every((num) => {
        const g = num.length <= 2 ? num.padStart(2, "0") : num.slice(0, 2);
        return w.grupos.has(g);
      });
      if (allIn && numerosList.length === (modalidade.startsWith("duque") ? 2 : 3)) return true;
    }

    if (modalidade.startsWith("duque_dezena") || modalidade.startsWith("terno_dezena")) {
      const allIn = numerosList.length >= 1 && numerosList.every((num) => {
        const dez = normalizarDezena(num);
        return w.dezenas.has(dez);
      });
      if (allIn && numerosList.length === (modalidade.startsWith("duque") ? 2 : 3)) return true;
    }
  }
  return false;
}

/** Para MC: retorna se bateu na milhar e/ou na centena (para aplicar 50/50). */
export function itemBateuMC(item: ItemBilhete, resultado: Resultado): { milhar: boolean; centena: boolean } {
  const range = parsePremioRange(item.premio ?? "1/1");
  const numerosList = splitNumeros(item.numeros, item.modalidade);
  let milhar = false;
  let centena = false;
  for (const p of range) {
    const gruposStr = getGruposDoPremio(resultado, p);
    const w = getWinningData(gruposStr ?? "");
    if (!w) continue;
    for (const num of numerosList) {
      if (normalizarMilhar(num) === w.milhar4) milhar = true;
      if (normalizarCentena(num) === w.centena3) centena = true;
    }
  }
  return { milhar, centena };
}

export interface ConferenciaItem {
  item: ItemBilhete;
  bateu: boolean;
  valorGanho: number;
}

export interface ConferenciaBilhete {
  vencedor: boolean;
  valorGanho: number;
  itens: ConferenciaItem[];
}

/** Confere bilhete contra resultado. getCotacao(cambista, modalidade) retorna a cotação para cálculo do prêmio. MC aplica regra 50/50. */
export function conferirBilhete(
  bilhete: Bilhete,
  resultado: Resultado | null,
  cambista: Cambista | null,
  getCotacao: (c: Cambista, mod: ModalidadeBilhete) => number
): ConferenciaBilhete {
  const itens: ConferenciaItem[] = [];
  let valorGanho = 0;

  if (!resultado || !cambista) {
    return { vencedor: false, valorGanho: 0, itens: bilhete.itens.map((item) => ({ item, bateu: false, valorGanho: 0 })) };
  }

  for (const item of bilhete.itens) {
    const divisor = getPremioDivisor(item.premio);
    const qtdPalpites = splitNumeros(item.numeros, item.modalidade).length;
    const valorPorPalpite = qtdPalpites >= 1 ? item.valor / qtdPalpites : item.valor;

    let valorGanhoItem = 0;
    let bateu = false;

    if (item.modalidade === "milhar_e_centena") {
      const { milhar: hitMilhar, centena: hitCentena } = itemBateuMC(item, resultado);
      const cotacaoM = getCotacao(cambista, "milhar");
      const cotacaoC = getCotacao(cambista, "centena");
      const metade = valorPorPalpite / 2;
      if (hitMilhar) valorGanhoItem += (metade * cotacaoM) / divisor;
      if (hitCentena) valorGanhoItem += (metade * cotacaoC) / divisor;
      bateu = hitMilhar || hitCentena;
    } else {
      bateu = itemBateu(item, resultado);
      const cotacao = getCotacao(cambista, item.modalidade);
      valorGanhoItem = bateu ? (valorPorPalpite * cotacao) / divisor : 0;
    }

    valorGanho += valorGanhoItem;
    itens.push({ item, bateu, valorGanho: valorGanhoItem });
  }

  return { vencedor: valorGanho > 0, valorGanho, itens };
}
