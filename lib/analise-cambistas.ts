"use client";

import {
  getBilhetes,
  getCambistasPorCodigo,
  getResultadoByExtracaoData,
  getCotacaoEfetiva,
  getPremioMilharBrinde,
  calcularComissaoBilhete,
} from "./store";
import { conferirBilhete } from "./conferencia";
import { parseDataPtBrOuIso } from "./date-utils";
import type { Cambista } from "./types";

export type SeveridadeAlerta = "critico" | "alto" | "medio" | "baixo";
export type TendenciaPrejuizo = "piorando" | "melhorando" | "estavel";

export interface AnaliseCambista {
  cambista: Cambista;
  qtdBilhetes: number;
  diasComMovimento: number;
  venda: number;
  premio: number;
  comissao: number;
  /** venda − prêmios pagos − comissão. Negativo significa prejuízo para a banca. */
  lucro: number;
  /** Percentual de prêmios pagos sobre a venda. */
  pctPremio: number;
  /** Comparação entre primeira e segunda metade do período. */
  tendencia: TendenciaPrejuizo;
  severidade: SeveridadeAlerta;
  motivos: string[];
}

export interface ParamsAnaliseCambista {
  /** Código da banca do admin logado. */
  codigo: string;
  /** Tamanho do período analisado em dias. Padrão: 30. */
  dias?: number;
  /** Mínimo de bilhetes no período para o cambista entrar na análise. Padrão: 5. */
  minBilhetes?: number;
}

interface Acumulado {
  qtdBilhetes: number;
  venda: number;
  premio: number;
  comissao: number;
  diasSet: Set<string>;
  primeiraMetadeLucro: number;
  segundaMetadeLucro: number;
}

function formatarMoeda(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function chaveDia(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

/**
 * Identifica cambistas/clientes que estão dando prejuízo à banca no período.
 *
 * Lucro líquido = soma das vendas − prêmios pagos (bilhetes com situação "pago")
 *                 − comissão devida ao cambista.
 *
 * Quanto maior o prejuízo e maior a porcentagem de prêmios sobre as vendas,
 * maior a severidade do alerta. A tendência compara a primeira e segunda
 * metade do período para indicar se o quadro está se agravando.
 */
export function analisarCambistasPrejuizo(
  params: ParamsAnaliseCambista,
): AnaliseCambista[] {
  const dias = Math.max(1, params.dias ?? 30);
  const minBilhetes = Math.max(1, params.minBilhetes ?? 5);

  const fim = new Date();
  fim.setHours(23, 59, 59, 999);
  const inicio = new Date();
  inicio.setDate(inicio.getDate() - (dias - 1));
  inicio.setHours(0, 0, 0, 0);
  const meioMs = inicio.getTime() + (fim.getTime() - inicio.getTime()) / 2;

  const cambistas = getCambistasPorCodigo(params.codigo);
  const cambistasMap = new Map<string, Cambista>();
  for (const c of cambistas) cambistasMap.set(c.id, c);

  const acumulado = new Map<string, Acumulado>();

  for (const b of getBilhetes()) {
    if (b.situacao === "cancelado") continue;
    const cam = cambistasMap.get(b.cambistaId);
    if (!cam) continue;
    const dt = parseDataPtBrOuIso(b.data);
    if (!dt) continue;
    if (dt < inicio || dt > fim) continue;

    const resultado = getResultadoByExtracaoData(b.extracaoId, b.data);
    const conf = conferirBilhete(b, resultado, cam, getCotacaoEfetiva, getPremioMilharBrinde());
    const premio = b.situacao === "pago" ? conf.valorGanho : 0;
    const comissao = calcularComissaoBilhete(b, cam);
    const lucroBilhete = b.total - premio - comissao;

    const a =
      acumulado.get(cam.id) ??
      ({
        qtdBilhetes: 0,
        venda: 0,
        premio: 0,
        comissao: 0,
        diasSet: new Set<string>(),
        primeiraMetadeLucro: 0,
        segundaMetadeLucro: 0,
      } satisfies Acumulado);

    a.qtdBilhetes += 1;
    a.venda += b.total;
    a.premio += premio;
    a.comissao += comissao;
    a.diasSet.add(chaveDia(dt));
    if (dt.getTime() < meioMs) a.primeiraMetadeLucro += lucroBilhete;
    else a.segundaMetadeLucro += lucroBilhete;

    acumulado.set(cam.id, a);
  }

  const out: AnaliseCambista[] = [];
  for (const [id, a] of acumulado.entries()) {
    if (a.qtdBilhetes < minBilhetes) continue;
    const lucro = a.venda - a.premio - a.comissao;
    if (lucro >= 0) continue;

    const cam = cambistasMap.get(id);
    if (!cam) continue;

    const pctPremio = a.venda > 0 ? (a.premio / a.venda) * 100 : 0;

    // Severidade combinando lucro absoluto e proporção de prêmio.
    // Um cambista pequeno (R$ -150) que paga 95% em prêmio é mais preocupante
    // do que outro com -150 e 50% (volume baixo).
    let severidade: SeveridadeAlerta = "baixo";
    if (lucro <= -1000 || pctPremio >= 100) severidade = "critico";
    else if (lucro <= -500 || pctPremio >= 90) severidade = "alto";
    else if (lucro <= -200 || pctPremio >= 80) severidade = "medio";

    let tendencia: TendenciaPrejuizo = "estavel";
    const delta = a.segundaMetadeLucro - a.primeiraMetadeLucro;
    if (delta < -50) tendencia = "piorando";
    else if (delta > 50) tendencia = "melhorando";

    const motivos: string[] = [];
    motivos.push(
      `Lucro líquido de ${formatarMoeda(lucro)} em ${a.qtdBilhetes} bilhete(s) (${a.diasSet.size} dia(s)).`,
    );
    if (pctPremio >= 80) {
      motivos.push(`Pagou ${pctPremio.toFixed(1)}% da venda em prêmios.`);
    }
    if (tendencia === "piorando") {
      motivos.push("Tendência piorando na segunda metade do período.");
    }

    out.push({
      cambista: cam,
      qtdBilhetes: a.qtdBilhetes,
      diasComMovimento: a.diasSet.size,
      venda: a.venda,
      premio: a.premio,
      comissao: a.comissao,
      lucro,
      pctPremio,
      tendencia,
      severidade,
      motivos,
    });
  }

  const rank: Record<SeveridadeAlerta, number> = {
    critico: 0,
    alto: 1,
    medio: 2,
    baixo: 3,
  };
  out.sort((a, b) => {
    const r = rank[a.severidade] - rank[b.severidade];
    if (r !== 0) return r;
    return a.lucro - b.lucro;
  });

  return out;
}

/**
 * Retorna um mapa rápido de cambistaId -> severidade do alerta, útil para
 * exibir um badge em listas (cambistas, saldo, etc.).
 */
export function mapearAlertasCambistas(
  params: ParamsAnaliseCambista,
): Map<string, AnaliseCambista> {
  const m = new Map<string, AnaliseCambista>();
  for (const a of analisarCambistasPrejuizo(params)) m.set(a.cambista.id, a);
  return m;
}
