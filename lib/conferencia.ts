"use client";

import type { Resultado, ItemBilhete, Bilhete, Cambista } from "./types";
import type { ModalidadeBilhete } from "./types";

/** Parse "1/3" -> [1,2,3], "5/10" -> [5,6,7,8,9,10].
 *  `maxPremio` opcional limita o range superior (config da extração).
 *  Sem isso, atacante poderia forjar bilhete `premio: "1/10"` numa banca
 *  que só vende até 1/5 e ganhar prêmios das faixas 6..10. */
export function parsePremioRange(premio: string, maxPremio?: number): number[] {
  const def = [1];
  if (!premio || !premio.includes("/")) return def;
  const [a, b] = premio.split("/").map((x) => parseInt(x.trim(), 10));
  if (isNaN(a) || isNaN(b) || a < 1 || b > 10 || a > b) return def;
  const cap = Number.isFinite(maxPremio) && maxPremio! > 0 ? Math.min(maxPremio!, 10) : 10;
  const out: number[] = [];
  for (let p = a; p <= Math.min(b, cap); p++) out.push(p);
  return out.length ? out : def;
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

function dezenaParaGrupo(dezena: string): string {
  const n = parseInt(dezena, 10);
  if (Number.isNaN(n) || n < 0 || n > 99) return "";
  if (n === 0) return "25";
  return String(Math.ceil(n / 4)).padStart(2, "0");
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

function getWinningData(resultadoStr: string): WinningData | null {
  const parts = resultadoStr.split(/[-,\s]+/).filter(Boolean);
  if (!parts.length) return null;

  // Resultado lançado como milhar/centena/dezena direta, ex.: "0001".
  // Nesse caso:
  //   milhar = 0001
  //   centena = 001
  //   dezena = 01
  //   grupo = 01 (Avestruz)
  const rawNumber = parts.length === 1 ? parts[0]!.replace(/\D/g, "") : "";
  if (rawNumber.length >= 3) {
    const milhar4 = normalizarMilhar(rawNumber);
    const centena3 = normalizarCentena(rawNumber);
    const dezena2 = normalizarDezena(rawNumber);
    const grupo = dezenaParaGrupo(dezena2);
    return {
      grupos: grupo ? new Set([grupo]) : new Set(),
      dezenas: new Set([dezena2]),
      dezenasOrdenadas: [dezena2],
      milhar4,
      centena3,
      dezena2,
    };
  }

  const setGrupos = gruposStringToSet(resultadoStr);
  const setDezenas = gruposStringToDezenas(resultadoStr);

  // Resultado lançado como um ou mais grupos diretos, ex.: "01" ou "01-02".
  // Serve para apostas de grupo quando a banca não informa a milhar completa.
  if (parts.length < 5) {
    return {
      grupos: setGrupos,
      dezenas: setDezenas,
      dezenasOrdenadas: [],
      milhar4: "",
      centena3: "",
      dezena2: "",
    };
  }

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

/** Verifica se o item bateu em algum prêmio do range. Usa número oficial do resultado: milhar 4 díg, centena 3, dezena 2, grupo.
 *
 *  Retrocompatível com chamadores antigos. Internamente delega para
 *  `contarHitsItem` (que conta duplicatas) e devolve true quando há ao menos
 *  1 hit. Para CALCULAR PRÊMIO use `contarHitsItem` direto. */
export function itemBateu(item: ItemBilhete, resultado: Resultado, maxPremio?: number): boolean {
  return contarHitsItem(item, resultado, maxPremio) > 0;
}

/**
 * Conta QUANTOS palpites do item bateram em algum prêmio do range,
 * **considerando duplicatas**. É a função usada por `conferirBilhete` para
 * calcular o valor ganho corretamente.
 *
 * Cenário concreto que motivou esta função:
 *   - Cliente apostou no grupo "05" duas vezes (R$1 cada) num bilhete com
 *     9 palpites totalizando R$9.
 *   - Antes, o sistema só retornava `bateu = true` no primeiro hit e pagava
 *     1× a cotação, mesmo o cliente tendo pago 2× pela aposta no 05.
 *   - Agora retorna `hits = 2` e o conferidor paga 2× a cotação.
 *
 * Combinações (duque/terno de grupo/dezena) NÃO usam essa contagem — para elas
 * a lista inteira é UM ÚNICO palpite (precisa todos os números casarem).
 * Repetir uma combinação no mesmo item não faz sentido.
 *
 * Múltiplos prêmios do range (1/5, 1/10): cada palpite é contado UMA VEZ
 * mesmo que case em mais de um prêmio — a divisão pelo divisor já compensa
 * a probabilidade ampliada da faixa.
 */
export function contarHitsItem(
  item: ItemBilhete,
  resultado: Resultado,
  maxPremio?: number,
): number {
  const range = parsePremioRange(item.premio ?? "1/1", maxPremio);
  const modalidade = item.modalidade;
  const numerosList = splitNumeros(item.numeros, modalidade);

  // Combinações: lista inteira = 1 palpite. Mantém o comportamento antigo
  // (boolean → 1 ou 0) usando o teste de "todos os números bateram".
  if (
    modalidade.startsWith("duque_grupo") ||
    modalidade.startsWith("terno_grupo") ||
    modalidade.startsWith("duque_dezena") ||
    modalidade.startsWith("terno_dezena")
  ) {
    for (const p of range) {
      const gruposStr = getGruposDoPremio(resultado, p);
      if (!gruposStr.trim()) continue;
      const w = getWinningData(gruposStr);
      if (!w) continue;
      const isGrupo = modalidade.startsWith("duque_grupo") || modalidade.startsWith("terno_grupo");
      const tamanhoEsperado = modalidade.startsWith("duque") ? 2 : 3;
      if (numerosList.length !== tamanhoEsperado) continue;
      const allIn = numerosList.every((num) => {
        if (isGrupo) {
          const g = num.length <= 2 ? num.padStart(2, "0") : num.slice(0, 2);
          return w.grupos.has(g);
        }
        const dez = normalizarDezena(num);
        return w.dezenas.has(dez);
      });
      if (allIn) return 1;
    }
    return 0;
  }

  // Para modalidades de número simples (grupo/dezena/centena/milhar/invertidas/MC),
  // cada palpite é independente. Conta quantos casaram em pelo menos 1 prêmio.
  let hits = 0;
  for (const num of numerosList) {
    let matched = false;
    for (const p of range) {
      const gruposStr = getGruposDoPremio(resultado, p);
      if (!gruposStr.trim()) continue;
      const w = getWinningData(gruposStr);
      if (!w) continue;

      if (modalidade === "grupo") {
        const g = num.length <= 2 ? num.padStart(2, "0") : num.slice(0, 2);
        if (w.grupos.has(g)) { matched = true; break; }
      } else if (modalidade === "dezena") {
        const dez = normalizarDezena(num);
        if (w.dezenas.has(dez)) { matched = true; break; }
      } else if (modalidade === "centena") {
        const c = normalizarCentena(num);
        if (w.centena3 && c === w.centena3) { matched = true; break; }
      } else if (modalidade === "milhar") {
        const m = normalizarMilhar(num);
        if (w.milhar4 && m === w.milhar4) { matched = true; break; }
      } else if (modalidade === "milhar_invertida") {
        if (!w.milhar4) continue;
        if (digitosOrdenados(normalizarMilhar(num)) === digitosOrdenados(w.milhar4)) {
          matched = true;
          break;
        }
      } else if (modalidade === "centena_invertida") {
        if (!w.centena3) continue;
        if (digitosOrdenados(normalizarCentena(num)) === digitosOrdenados(w.centena3)) {
          matched = true;
          break;
        }
      } else if (modalidade === "mc_invertida") {
        const winMilhar = w.milhar4 ? digitosOrdenados(w.milhar4) : "";
        const winCentena = w.centena3 ? digitosOrdenados(w.centena3) : "";
        const m = normalizarMilhar(num);
        const c = normalizarCentena(num);
        if (
          (winMilhar && digitosOrdenados(m) === winMilhar) ||
          (winCentena && digitosOrdenados(c) === winCentena)
        ) {
          matched = true;
          break;
        }
      } else if (modalidade === "milhar_e_centena") {
        const m = normalizarMilhar(num);
        const c = normalizarCentena(num);
        if ((w.milhar4 && m === w.milhar4) || (w.centena3 && c === w.centena3)) {
          matched = true;
          break;
        }
      }
    }
    if (matched) hits++;
  }
  return hits;
}

/** Para MC: retorna se bateu na milhar e/ou na centena (para aplicar 50/50).
 *  Mantida por retrocompatibilidade — usa `contarHitsMC` por baixo. */
export function itemBateuMC(
  item: ItemBilhete,
  resultado: Resultado,
  maxPremio?: number,
): { milhar: boolean; centena: boolean } {
  const { milhar, centena } = contarHitsMC(item, resultado, maxPremio);
  return { milhar: milhar > 0, centena: centena > 0 };
}

/** Para MC: conta QUANTOS palpites bateram em milhar e quantos em centena
 *  (incluindo duplicatas). Cada palpite conta UMA vez por categoria, mesmo
 *  que case em vários prêmios da faixa 1/5 ou 1/10. */
export function contarHitsMC(
  item: ItemBilhete,
  resultado: Resultado,
  maxPremio?: number,
): { milhar: number; centena: number } {
  const range = parsePremioRange(item.premio ?? "1/1", maxPremio);
  const numerosList = splitNumeros(item.numeros, item.modalidade);
  let milhar = 0;
  let centena = 0;
  for (const num of numerosList) {
    let hitM = false;
    let hitC = false;
    for (const p of range) {
      const gruposStr = getGruposDoPremio(resultado, p);
      const w = getWinningData(gruposStr ?? "");
      if (!w) continue;
      if (!hitM && w.milhar4 && normalizarMilhar(num) === w.milhar4) hitM = true;
      if (!hitC && w.centena3 && normalizarCentena(num) === w.centena3) hitC = true;
      if (hitM && hitC) break;
    }
    if (hitM) milhar++;
    if (hitC) centena++;
  }
  return { milhar, centena };
}

export interface ConferenciaItem {
  item: ItemBilhete;
  bateu: boolean;
  valorGanho: number;
  brindeBateu?: boolean;
  brindeValorGanho?: number;
}

export interface ConferenciaBilhete {
  vencedor: boolean;
  valorGanho: number;
  itens: ConferenciaItem[];
}

/** Confere bilhete contra resultado. getCotacao(cambista, modalidade) retorna a cotação para cálculo do prêmio. MC aplica regra 50/50.
 *  `maxPremio` opcional limita o range superior — útil quando a banca/extração
 *  só vende até 1/5 e o resultado tem 10 prêmios (impede ganho fora da faixa
 *  vendável). */
export function conferirBilhete(
  bilhete: Bilhete,
  resultado: Resultado | null,
  cambista: Cambista | null,
  getCotacao: (c: Cambista, mod: ModalidadeBilhete) => number,
  premioMilharBrinde = 0,
  maxPremio?: number,
): ConferenciaBilhete {
  const itens: ConferenciaItem[] = [];
  let valorGanho = 0;

  if (!resultado || !cambista) {
    return { vencedor: false, valorGanho: 0, itens: bilhete.itens.map((item) => ({ item, bateu: false, valorGanho: 0 })) };
  }

  for (const item of bilhete.itens) {
    const divisor = getPremioDivisor(item.premio);
    const qtdPalpites = splitNumeros(item.numeros, item.modalidade).length;

    // Sem palpites válidos OU valor não-finito: bilhete não pode ganhar nada.
    // Sem isso, um bilhete corrompido (numeros: "", valor: 100) com qtdPalpites=0
    // usaria valor integral e poderia gerar prêmio fictício.
    if (qtdPalpites < 1 || !Number.isFinite(item.valor) || item.valor <= 0) {
      itens.push({ item, bateu: false, valorGanho: 0 });
      continue;
    }
    const valorPorPalpite = item.valor / qtdPalpites;

    let valorGanhoItem = 0;
    let bateu = false;
    let brindeBateu = false;
    let brindeValorGanho = 0;

    if (item.modalidade === "milhar_e_centena") {
      // MC: cada palpite vale 50% pra milhar + 50% pra centena. Conta-se
      // QUANTOS palpites casaram em cada (incluindo duplicatas) — antes só
      // verificava boolean e pagava 1× mesmo se o cliente apostou no mesmo
      // número várias vezes.
      const { milhar: hitsM, centena: hitsC } = contarHitsMC(item, resultado, maxPremio);
      const cotacaoM = getCotacao(cambista, "milhar");
      const cotacaoC = getCotacao(cambista, "centena");
      const metade = valorPorPalpite / 2;
      if (hitsM > 0) valorGanhoItem += (hitsM * metade * cotacaoM) / divisor;
      if (hitsC > 0) valorGanhoItem += (hitsC * metade * cotacaoC) / divisor;
      bateu = hitsM > 0 || hitsC > 0;
    } else {
      // CRÍTICO: usar contarHitsItem em vez de itemBateu. Bilhete com palpite
      // duplicado (ex.: grupo 05 duas vezes em 9 palpites) precisa pagar 2×
      // a cotação se 05 for sorteado — antes pagava só 1× porque o
      // itemBateu retornava boolean.
      const hits = contarHitsItem(item, resultado, maxPremio);
      bateu = hits > 0;
      const cotacao = getCotacao(cambista, item.modalidade);
      valorGanhoItem = hits > 0 ? (hits * valorPorPalpite * cotacao) / divisor : 0;
    }

    // Milhar brinde é uma regra separada: só vale no 1º prêmio (1/1) e paga
    // um valor fixo definido pelo admin, independente do valor apostado.
    if (item.milharBrinde && premioMilharBrinde > 0) {
      const primeiroPremio = getGruposDoPremio(resultado, 1);
      const w = getWinningData(primeiroPremio);
      const brinde = normalizarMilhar(item.milharBrinde);
      brindeBateu = !!w?.milhar4 && brinde === w.milhar4;
      if (brindeBateu) {
        brindeValorGanho = premioMilharBrinde;
        valorGanhoItem += brindeValorGanho;
      }
    }

    // Arredonda monetariamente para evitar acúmulo de floats (R$ 153,2600001).
    valorGanhoItem = Math.round(valorGanhoItem * 100) / 100;
    if (brindeValorGanho) {
      brindeValorGanho = Math.round(brindeValorGanho * 100) / 100;
    }
    valorGanho += valorGanhoItem;
    itens.push({
      item,
      bateu: bateu || brindeBateu,
      valorGanho: valorGanhoItem,
      brindeBateu,
      brindeValorGanho,
    });
  }

  valorGanho = Math.round(valorGanho * 100) / 100;
  return { vencedor: valorGanho > 0, valorGanho, itens };
}
