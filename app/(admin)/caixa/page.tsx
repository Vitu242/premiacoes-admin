"use client";

import { useEffect, useMemo, useState } from "react";
import {
  getCambistasPorCodigo,
  getGerentesPorCodigo,
  calcularTotalCaixa,
  getJogosEmAberto,
  getBilhetes,
} from "@/lib/store";
import { getAdminCodigo } from "@/lib/auth";
import { useVisibilityRefresh } from "@/lib/use-config-refresh";
import type { Bilhete, Cambista, Gerente } from "@/lib/types";

function formatarMoeda(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function corValor(v: number): string {
  if (v > 0) return "text-emerald-700";
  if (v < 0) return "text-rose-700";
  return "text-gray-800";
}

/**
 * Fórmulas (idênticas às planilhas de fechamento da banca):
 *   • Saldo Cambista = Entrada − Saída + Lançamentos − Comissão
 *   • Saldo Banca    = Entrada − Saída − Comissão
 *   • GERENTE        = soma(entrada cambistas do gerente) × comissaoBruto / 100
 *   • BANCA          = soma(Saldo Banca) − GERENTE
 */
interface LinhaCambista {
  cambista: Cambista;
  qtd: number;
  jogosAberto: number;
  saldoCambista: number;
  saldoBanca: number;
}

interface TotalGerente {
  qtd: number;
  jogosAberto: number;
  entrada: number;
  saidas: number;
  comissao: number;
  lancamentos: number;
  saldoCambista: number;
  saldoBanca: number;
  comissaoGerente: number;
  bancaLiquida: number;
}

function zerado(): TotalGerente {
  return {
    qtd: 0,
    jogosAberto: 0,
    entrada: 0,
    saidas: 0,
    comissao: 0,
    lancamentos: 0,
    saldoCambista: 0,
    saldoBanca: 0,
    comissaoGerente: 0,
    bancaLiquida: 0,
  };
}

export default function CaixaPage() {
  const codigo = getAdminCodigo();
  const [cambistas, setCambistas] = useState<Cambista[]>(() =>
    getCambistasPorCodigo(codigo ?? ""),
  );
  const [bilhetes, setBilhetes] = useState<Bilhete[]>([]);
  const [filtroGerente, setFiltroGerente] = useState("todos");
  const gerentes = useMemo<Gerente[]>(
    () => getGerentesPorCodigo(codigo ?? ""),
    [codigo],
  );

  const recarregar = () => {
    if (!codigo) return;
    setCambistas(getCambistasPorCodigo(codigo));
    setBilhetes(getBilhetes());
  };

  useEffect(() => {
    recarregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [codigo]);
  useVisibilityRefresh(recarregar);

  // Mapa cambistaId -> qtd de bilhetes não cancelados (= "Qtd." da imagem).
  const qtdPorCambista = useMemo(() => {
    const m = new Map<string, number>();
    for (const b of bilhetes) {
      if (b.situacao === "cancelado") continue;
      m.set(b.cambistaId, (m.get(b.cambistaId) ?? 0) + 1);
    }
    return m;
  }, [bilhetes]);

  // Aplica filtro de gerente (se houver) e calcula linhas + totais por gerente.
  const gerentesVisiveis = useMemo<Gerente[]>(() => {
    if (filtroGerente === "todos") return gerentes;
    return gerentes.filter((g) => g.id === filtroGerente);
  }, [gerentes, filtroGerente]);

  const grupos = useMemo(() => {
    return gerentesVisiveis.map((g) => {
      const meusCambistas = cambistas.filter((c) => c.gerenteId === g.id);
      const linhas: LinhaCambista[] = meusCambistas.map((c) => {
        const saldoCambista = calcularTotalCaixa(c);
        const saldoBanca = c.entrada - c.saidas - c.comissao;
        return {
          cambista: c,
          qtd: qtdPorCambista.get(c.id) ?? 0,
          jogosAberto: getJogosEmAberto(c.id),
          saldoCambista,
          saldoBanca,
        };
      });

      const totais = linhas.reduce<TotalGerente>((acc, l) => {
        acc.qtd += l.qtd;
        acc.jogosAberto += l.jogosAberto;
        acc.entrada += l.cambista.entrada;
        acc.saidas += l.cambista.saidas;
        acc.comissao += l.cambista.comissao;
        acc.lancamentos += l.cambista.lancamentos;
        acc.saldoCambista += l.saldoCambista;
        acc.saldoBanca += l.saldoBanca;
        return acc;
      }, zerado());

      totais.comissaoGerente = (totais.entrada * (g.comissaoBruto ?? 0)) / 100;
      totais.bancaLiquida = totais.saldoBanca - totais.comissaoGerente;

      return { gerente: g, linhas, totais };
    });
  }, [gerentesVisiveis, cambistas, qtdPorCambista]);

  // Total Geral da Banca = soma de todos os grupos
  const totalGeral = useMemo<TotalGerente>(() => {
    return grupos.reduce<TotalGerente>((acc, g) => {
      acc.qtd += g.totais.qtd;
      acc.jogosAberto += g.totais.jogosAberto;
      acc.entrada += g.totais.entrada;
      acc.saidas += g.totais.saidas;
      acc.comissao += g.totais.comissao;
      acc.lancamentos += g.totais.lancamentos;
      acc.saldoCambista += g.totais.saldoCambista;
      acc.saldoBanca += g.totais.saldoBanca;
      acc.comissaoGerente += g.totais.comissaoGerente;
      acc.bancaLiquida += g.totais.bancaLiquida;
      return acc;
    }, zerado());
  }, [grupos]);

  const bilhetesPendentes = bilhetes.filter((b) => {
    if (b.situacao !== "pendente") return false;
    if (filtroGerente === "todos") return true;
    const cam = cambistas.find((c) => c.id === b.cambistaId);
    return cam?.gerenteId === filtroGerente;
  }).length;

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-gray-800">Caixa</h1>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <select
          value={filtroGerente}
          onChange={(e) => setFiltroGerente(e.target.value)}
          className="rounded border border-gray-300 px-3 py-2 text-sm"
        >
          <option value="todos">Todos os gerentes</option>
          {gerentes.map((g) => (
            <option key={g.id} value={g.id}>
              {g.login}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => window.print()}
          className="rounded bg-orange-500 px-4 py-2 text-sm font-medium text-white hover:bg-orange-600 print:hidden"
        >
          Resumo para fechamento
        </button>
      </div>

      <p className="mb-1 text-sm text-gray-600">
        <strong>Saldo Cambista</strong> = Entrada − Saída + Lançamentos − Comissão ·{" "}
        <strong>Saldo Banca</strong> = Entrada − Saída − Comissão (lançamentos não entram
        no resultado da banca).
      </p>
      <p className="mb-4 text-xs text-gray-500">
        Bilhetes pendentes nesta seleção: <strong>{bilhetesPendentes}</strong> · Jogos em
        aberto (geral): <strong>{formatarMoeda(totalGeral.jogosAberto)}</strong>
      </p>

      {/* Cards rápidos do total geral */}
      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
        <CardKPI label="Entrada" tone="green" valor={totalGeral.entrada} />
        <CardKPI label="Saída" tone="rose" valor={totalGeral.saidas} />
        <CardKPI label="Comissão" tone="amber" valor={totalGeral.comissao} />
        <CardKPI
          label="Lançamentos"
          tone={totalGeral.lancamentos >= 0 ? "green" : "rose"}
          valor={totalGeral.lancamentos}
        />
        <CardKPI label="Saldo Cambista" tone="neutral" valor={totalGeral.saldoCambista} />
        <CardKPI
          label="Saldo Banca"
          tone={totalGeral.bancaLiquida >= 0 ? "green" : "rose"}
          valor={totalGeral.bancaLiquida}
        />
      </div>

      {/* Tabelas por gerente */}
      <div className="space-y-6">
        {grupos.length === 0 && (
          <div className="rounded border border-dashed border-gray-300 bg-white p-6 text-center text-sm text-gray-500">
            Nenhum gerente para exibir.
          </div>
        )}
        {grupos.map(({ gerente, linhas, totais }) => (
          <TabelaGerente
            key={gerente.id}
            gerente={gerente}
            linhas={linhas}
            totais={totais}
          />
        ))}
      </div>

      {/* TOTAL GERAL DA BANCA */}
      {grupos.length > 1 && (
        <div className="mt-6 overflow-x-auto rounded-lg border border-emerald-300 bg-white shadow">
          <div className="bg-emerald-600 px-4 py-2 text-center text-sm font-bold uppercase tracking-wide text-white">
            Total Geral da Banca
          </div>
          <table className="min-w-full divide-y divide-emerald-200">
            <thead className="bg-emerald-50 text-xs uppercase text-emerald-800">
              <tr>
                <th className="px-3 py-2 text-right">Qtd.</th>
                <th className="px-3 py-2 text-right">Entrada</th>
                <th className="px-3 py-2 text-right">Saída</th>
                <th className="px-3 py-2 text-right">Comissões</th>
                <th className="px-3 py-2 text-right">Lançamentos</th>
                <th className="px-3 py-2 text-right">Saldo Cambista</th>
                <th className="px-3 py-2 text-right">Saldo Banca</th>
              </tr>
            </thead>
            <tbody>
              <tr className="text-sm font-bold">
                <td className="px-3 py-3 text-right text-gray-900">{totalGeral.qtd}</td>
                <td className="px-3 py-3 text-right text-emerald-700">
                  {formatarMoeda(totalGeral.entrada)}
                </td>
                <td className="px-3 py-3 text-right text-rose-700">
                  {formatarMoeda(totalGeral.saidas)}
                </td>
                <td className="px-3 py-3 text-right text-amber-700">
                  {formatarMoeda(totalGeral.comissao)}
                </td>
                <td
                  className={`px-3 py-3 text-right ${corValor(totalGeral.lancamentos)}`}
                >
                  {formatarMoeda(totalGeral.lancamentos)}
                </td>
                <td
                  className={`px-3 py-3 text-right ${corValor(totalGeral.saldoCambista)}`}
                >
                  {formatarMoeda(totalGeral.saldoCambista)}
                </td>
                <td
                  className={`px-3 py-3 text-right ${corValor(totalGeral.bancaLiquida)}`}
                >
                  {formatarMoeda(totalGeral.bancaLiquida)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function TabelaGerente({
  gerente,
  linhas,
  totais,
}: {
  gerente: Gerente;
  linhas: LinhaCambista[];
  totais: TotalGerente;
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow">
      <div className="bg-gray-700 px-4 py-2 text-center text-sm font-semibold text-white">
        {gerente.login}
        {gerente.comissaoBruto > 0 && (
          <span className="ml-2 text-xs font-normal text-gray-200">
            (comissão bruto: {gerente.comissaoBruto.toFixed(2)}%)
          </span>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50 text-xs uppercase text-gray-600">
            <tr>
              <th className="px-3 py-2 text-left">Cambista</th>
              <th className="px-3 py-2 text-right">Qtd.</th>
              <th className="px-3 py-2 text-right">Entrada</th>
              <th className="px-3 py-2 text-right">Saída</th>
              <th className="px-3 py-2 text-right">Comissão</th>
              <th className="px-3 py-2 text-right">Lançamentos</th>
              <th className="px-3 py-2 text-right">Saldo Cambista</th>
              <th className="px-3 py-2 text-right">Saldo Banca</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {linhas.length === 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-6 text-center text-xs text-gray-400">
                  Este gerente não tem cambistas cadastrados.
                </td>
              </tr>
            )}
            {linhas.map((l) => (
              <tr key={l.cambista.id} className="hover:bg-gray-50">
                <td className="px-3 py-2 font-medium text-gray-900">
                  {l.cambista.login}
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-gray-700">
                  {l.qtd}
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-gray-700">
                  {formatarMoeda(l.cambista.entrada)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-gray-700">
                  {formatarMoeda(l.cambista.saidas)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-gray-700">
                  {formatarMoeda(l.cambista.comissao)}
                </td>
                <td
                  className={`px-3 py-2 text-right tabular-nums ${corValor(l.cambista.lancamentos)}`}
                >
                  {formatarMoeda(l.cambista.lancamentos)}
                </td>
                <td
                  className={`px-3 py-2 text-right font-semibold tabular-nums ${corValor(l.saldoCambista)}`}
                >
                  {formatarMoeda(l.saldoCambista)}
                </td>
                <td
                  className={`px-3 py-2 text-right font-semibold tabular-nums ${corValor(l.saldoBanca)}`}
                >
                  {formatarMoeda(l.saldoBanca)}
                </td>
              </tr>
            ))}
          </tbody>
          {linhas.length > 0 && (
            <tfoot className="bg-gray-100 font-bold text-gray-900">
              <tr>
                <td className="px-3 py-2">Total:</td>
                <td className="px-3 py-2 text-right tabular-nums">{totais.qtd}</td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {formatarMoeda(totais.entrada)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {formatarMoeda(totais.saidas)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {formatarMoeda(totais.comissao)}
                </td>
                <td
                  className={`px-3 py-2 text-right tabular-nums ${corValor(totais.lancamentos)}`}
                >
                  {formatarMoeda(totais.lancamentos)}
                </td>
                <td
                  className={`px-3 py-2 text-right tabular-nums ${corValor(totais.saldoCambista)}`}
                >
                  {formatarMoeda(totais.saldoCambista)}
                </td>
                <td
                  className={`px-3 py-2 text-right tabular-nums ${corValor(totais.saldoBanca)}`}
                >
                  {formatarMoeda(totais.saldoBanca)}
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      {/* Rodapé: GERENTE: R$ X | BANCA: R$ Y */}
      <div className="grid grid-cols-1 divide-y divide-gray-200 border-t border-gray-200 bg-gray-50 text-sm sm:grid-cols-2 sm:divide-x sm:divide-y-0">
        <div className="flex items-center justify-center gap-2 px-4 py-3 font-semibold text-gray-700">
          GERENTE:{" "}
          <span className={corValor(totais.comissaoGerente)}>
            {formatarMoeda(totais.comissaoGerente)}
          </span>
        </div>
        <div className="flex items-center justify-center gap-2 px-4 py-3 font-semibold text-gray-700">
          BANCA:{" "}
          <span className={corValor(totais.bancaLiquida)}>
            {formatarMoeda(totais.bancaLiquida)}
          </span>
        </div>
      </div>
    </div>
  );
}

function CardKPI({
  label,
  tone,
  valor,
}: {
  label: string;
  tone: "neutral" | "green" | "rose" | "amber";
  valor: number;
}) {
  const bg =
    tone === "green"
      ? "border-emerald-200 bg-emerald-50"
      : tone === "rose"
        ? "border-rose-200 bg-rose-50"
        : tone === "amber"
          ? "border-amber-200 bg-amber-50"
          : "border-gray-200 bg-white";
  const txt =
    tone === "green"
      ? "text-emerald-700"
      : tone === "rose"
        ? "text-rose-700"
        : tone === "amber"
          ? "text-amber-700"
          : "text-gray-800";
  return (
    <div className={`rounded-lg border p-3 shadow-sm ${bg}`}>
      <p className="text-xs uppercase tracking-wide text-gray-500">{label}</p>
      <p className={`mt-1 text-xl font-extrabold tabular-nums ${txt}`}>
        {formatarMoeda(valor)}
      </p>
    </div>
  );
}
