"use client";

import { useMemo, useState } from "react";
import {
  getBilhetes,
  getCambistasPorCodigo,
  getGerentesPorCodigo,
  getExtracoes,
  getLancamentos,
  getResultadoByExtracaoData,
  calcularComissaoBilhete,
  getCotacaoEfetiva,
  getPremioMilharBrinde,
} from "@/lib/store";
import { getAdminCodigo } from "@/lib/auth";
import { conferirBilhete } from "@/lib/conferencia";
import { hojeIsoDate, isoDateInputToDate, startOfDay, endOfDay, parseDataPtBrOuIso } from "@/lib/date-utils";
import type { Cambista } from "@/lib/types";

function formatarMoeda(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function classeValor(v: number) {
  if (Math.abs(v) < 0.005) return "text-slate-900 dark:text-slate-100";
  return v > 0 ? "text-green-700 dark:text-emerald-300" : "text-rose-700 dark:text-rose-300";
}

interface LinhaVenda {
  cambista: Cambista;
  qtd: number;
  entrada: number;
  saida: number;
  comissao: number;
  lancamentos: number;
  saldoCambista: number;
  saldoBanca: number;
}

interface GrupoVenda {
  gerenteId: string;
  gerenteNome: string;
  gerenteComissao: number;
  linhas: LinhaVenda[];
  total: Omit<LinhaVenda, "cambista">;
}

function vazioTotal(): Omit<LinhaVenda, "cambista"> {
  return {
    qtd: 0,
    entrada: 0,
    saida: 0,
    comissao: 0,
    lancamentos: 0,
    saldoCambista: 0,
    saldoBanca: 0,
  };
}

function somarTotal(a: Omit<LinhaVenda, "cambista">, b: Omit<LinhaVenda, "cambista">) {
  a.qtd += b.qtd;
  a.entrada += b.entrada;
  a.saida += b.saida;
  a.comissao += b.comissao;
  a.lancamentos += b.lancamentos;
  a.saldoCambista += b.saldoCambista;
  a.saldoBanca += b.saldoBanca;
}

export default function VendasAdminPage() {
  const codigo = getAdminCodigo();
  const gerentes = useMemo(
    () => getGerentesPorCodigo(codigo ?? ""),
    [codigo],
  );
  const cambistas = useMemo(
    () => getCambistasPorCodigo(codigo ?? ""),
    [codigo],
  );
  const extracoes = useMemo(() => getExtracoes(), []);
  const [tipoFiltro, setTipoFiltro] = useState<"todos" | "gerente">("todos");
  const [gerenteId, setGerenteId] = useState<string>("todos");
  const [cambistaId, setCambistaId] = useState<string>("todos");
  const [extracaoId, setExtracaoId] = useState<string>("todos");
  const [dataInicio, setDataInicio] = useState<string>(() => hojeIsoDate());
  const [dataFim, setDataFim] = useState<string>(() => hojeIsoDate());
  const [refreshKey, setRefreshKey] = useState(0);
  const bilhetesTodos = useMemo(() => getBilhetes(), [refreshKey]);
  const lancamentosTodos = useMemo(() => getLancamentos(), [refreshKey]);

  const cambistasDoGerente = useMemo(() => {
    if (tipoFiltro !== "gerente" || gerenteId === "todos") return cambistas;
    return cambistas.filter((c) => c.gerenteId === gerenteId);
  }, [cambistas, tipoFiltro, gerenteId]);

  const cambistasFiltrados = useMemo(() => {
    if (cambistaId === "todos") return cambistasDoGerente;
    return cambistasDoGerente.filter((c) => c.id === cambistaId);
  }, [cambistasDoGerente, cambistaId]);

  const idsCambistasFiltro = useMemo(
    () => new Set(cambistasFiltrados.map((c) => c.id)),
    [cambistasFiltrados],
  );

  const dataInicioDate = dataInicio ? startOfDay(isoDateInputToDate(dataInicio) ?? new Date()) : null;
  const dataFimDate = dataFim ? endOfDay(isoDateInputToDate(dataFim) ?? new Date()) : null;

  const dentroDoPeriodo = (data: string) => {
    if (!dataInicioDate && !dataFimDate) return true;
    const dt = parseDataPtBrOuIso(data);
    if (!dt) return false;
    if (dataInicioDate && dt < dataInicioDate) return false;
    if (dataFimDate && dt > dataFimDate) return false;
    return true;
  };

  const bilhetes = bilhetesTodos.filter((b) => {
    if (!idsCambistasFiltro.has(b.cambistaId)) return false;
    if (extracaoId !== "todos" && b.extracaoId !== extracaoId) return false;
    if (!dentroDoPeriodo(b.data)) return false;
    return true;
  });

  const relatorio = useMemo<GrupoVenda[]>(() => {
    const porCambista = new Map<string, LinhaVenda>();

    for (const cam of cambistasFiltrados) {
      porCambista.set(cam.id, {
        cambista: cam,
        qtd: 0,
        entrada: 0,
        saida: 0,
        comissao: 0,
        lancamentos: 0,
        saldoCambista: 0,
        saldoBanca: 0,
      });
    }

    for (const b of bilhetes) {
      const linha = porCambista.get(b.cambistaId);
      if (!linha) continue;
      linha.qtd += 1;
      if (b.situacao !== "cancelado") {
        linha.entrada += b.total;
        linha.comissao += calcularComissaoBilhete(b, linha.cambista);
      }
      if (b.situacao === "pago") {
        const resultado = getResultadoByExtracaoData(b.extracaoId, b.data);
        if (resultado) {
          const conf = conferirBilhete(b, resultado, linha.cambista, getCotacaoEfetiva, getPremioMilharBrinde());
          linha.saida += conf.valorGanho;
        }
      }
    }

    for (const l of lancamentosTodos) {
      const linha = porCambista.get(l.cambistaId);
      if (!linha) continue;
      if (!dentroDoPeriodo(l.data)) continue;
      linha.lancamentos += l.tipo === "adiantar" ? l.valor : -l.valor;
    }

    for (const linha of porCambista.values()) {
      linha.saldoCambista = linha.entrada - linha.saida - linha.comissao + linha.lancamentos;
      linha.saldoBanca = linha.entrada - linha.saida - linha.comissao;
    }

    const grupos = new Map<string, GrupoVenda>();
    for (const linha of [...porCambista.values()].sort((a, b) => a.cambista.login.localeCompare(b.cambista.login))) {
      const gerente = gerentes.find((g) => g.id === linha.cambista.gerenteId);
      const gid = linha.cambista.gerenteId || "sem-gerente";
      if (!grupos.has(gid)) {
        grupos.set(gid, {
          gerenteId: gid,
          gerenteNome: gerente?.login ?? "Sem gerente",
          gerenteComissao: 0,
          linhas: [],
          total: vazioTotal(),
        });
      }
      const grupo = grupos.get(gid)!;
      grupo.linhas.push(linha);
      somarTotal(grupo.total, linha);
    }

    for (const grupo of grupos.values()) {
      const gerente = gerentes.find((g) => g.id === grupo.gerenteId);
      const comissaoBruto = Number(gerente?.comissaoBruto ?? 0);
      const comissaoLucro = Number(gerente?.comissaoLucro ?? 0);
      grupo.gerenteComissao =
        (grupo.total.entrada * comissaoBruto) / 100 +
        (Math.max(0, grupo.total.saldoBanca) * comissaoLucro) / 100;
    }

    return [...grupos.values()].sort((a, b) => a.gerenteNome.localeCompare(b.gerenteNome));
  }, [bilhetes, cambistasFiltrados, gerentes, lancamentosTodos, dataInicioDate, dataFimDate]);

  const totalGeral = relatorio.reduce((acc, grupo) => {
    somarTotal(acc, grupo.total);
    return acc;
  }, vazioTotal());

  return (
    <div className="text-slate-900 dark:text-slate-100">
      <div className="mb-2 bg-neutral-900 px-3 py-2 text-sm font-bold text-white print:bg-neutral-900">
        Venda
      </div>

      <div className="mb-3 grid gap-2 border border-slate-300 bg-white p-2 print:hidden dark:border-slate-700 dark:bg-slate-900 md:grid-cols-[1fr_1fr_1fr_1fr_1fr_auto]">
        <select
          value={tipoFiltro === "gerente" ? gerenteId : "todos"}
          onChange={(e) => {
            const value = e.target.value;
            setGerenteId(value);
            setTipoFiltro(value === "todos" ? "todos" : "gerente");
            setCambistaId("todos");
          }}
          className="h-9 border border-slate-300 bg-white px-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
        >
          <option value="todos">Todos</option>
          {gerentes.map((g) => (
            <option key={g.id} value={g.id}>
              {g.login}
            </option>
          ))}
        </select>
        <select
          value={cambistaId}
          onChange={(e) => setCambistaId(e.target.value)}
          className="h-9 border border-slate-300 bg-white px-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
        >
          <option value="todos">Todas</option>
          {cambistasDoGerente.map((c) => (
            <option key={c.id} value={c.id}>
              {c.login}
            </option>
          ))}
        </select>
        <select
          value={extracaoId}
          onChange={(e) => setExtracaoId(e.target.value)}
          className="h-9 border border-slate-300 bg-white px-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
        >
          <option value="todos">Todas as loterias</option>
          {extracoes.map((e) => (
            <option key={e.id} value={e.id}>
              {e.nome}
            </option>
          ))}
        </select>
        <input
          type="date"
          value={dataInicio}
          onChange={(e) => setDataInicio(e.target.value)}
          className="h-9 border border-slate-300 px-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
        />
        <input
          type="date"
          value={dataFim}
          onChange={(e) => setDataFim(e.target.value)}
          className="h-9 border border-slate-300 px-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
        />
        <button
          type="button"
          onClick={() => setRefreshKey((k) => k + 1)}
          className="h-9 bg-blue-600 px-8 text-sm font-bold text-white hover:bg-blue-700"
        >
          Buscar
        </button>
      </div>

      <div className="overflow-x-auto">
        {relatorio.length === 0 ? (
          <div className="border border-slate-300 bg-white p-8 text-center text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
            Nenhuma venda encontrada para o filtro selecionado.
          </div>
        ) : (
          relatorio.map((grupo) => (
            <div key={grupo.gerenteId} className="mb-4">
              <table className="w-full min-w-[860px] border-collapse text-center text-sm">
                <thead>
                  <tr>
                    <th colSpan={8} className="border border-slate-400 bg-neutral-700 px-2 py-2 text-sm font-bold text-white">
                      {grupo.gerenteNome}
                    </th>
                  </tr>
                  <tr className="bg-slate-300 text-slate-900 dark:bg-slate-800 dark:text-slate-100">
                    <th className="border border-slate-400 px-2 py-2 font-bold">Cambista</th>
                    <th className="border border-slate-400 px-2 py-2 font-bold">Qtd.</th>
                    <th className="border border-slate-400 px-2 py-2 font-bold">Entrada</th>
                    <th className="border border-slate-400 px-2 py-2 font-bold">Saída</th>
                    <th className="border border-slate-400 px-2 py-2 font-bold">Comissão</th>
                    <th className="border border-slate-400 px-2 py-2 font-bold">Lançamentos</th>
                    <th className="border border-slate-400 px-2 py-2 font-bold">Saldo Cambista</th>
                    <th className="border border-slate-400 px-2 py-2 font-bold">Saldo Banca</th>
                  </tr>
                </thead>
                <tbody>
                  {grupo.linhas.map((linha) => (
                    <tr key={linha.cambista.id} className="odd:bg-white even:bg-slate-100 dark:odd:bg-slate-900 dark:even:bg-slate-800">
                      <td className="border border-slate-300 px-2 py-2">{linha.cambista.login}</td>
                      <td className="border border-slate-300 px-2 py-2">{linha.qtd}</td>
                      <td className="border border-slate-300 px-2 py-2">{formatarMoeda(linha.entrada)}</td>
                      <td className="border border-slate-300 px-2 py-2">{formatarMoeda(linha.saida)}</td>
                      <td className="border border-slate-300 px-2 py-2">{formatarMoeda(linha.comissao)}</td>
                      <td className="border border-slate-300 px-2 py-2">{formatarMoeda(linha.lancamentos)}</td>
                      <td className={`border border-slate-300 px-2 py-2 font-bold ${classeValor(linha.saldoCambista)}`}>
                        {formatarMoeda(linha.saldoCambista)}
                      </td>
                      <td className={`border border-slate-300 px-2 py-2 font-bold ${classeValor(linha.saldoBanca)}`}>
                        {formatarMoeda(linha.saldoBanca)}
                      </td>
                    </tr>
                  ))}
                  <tr className="bg-slate-200 font-bold dark:bg-slate-800">
                    <td className="border border-slate-300 px-2 py-2">Total:</td>
                    <td className="border border-slate-300 px-2 py-2">{grupo.total.qtd}</td>
                    <td className="border border-slate-300 px-2 py-2">{formatarMoeda(grupo.total.entrada)}</td>
                    <td className="border border-slate-300 px-2 py-2">{formatarMoeda(grupo.total.saida)}</td>
                    <td className="border border-slate-300 px-2 py-2">{formatarMoeda(grupo.total.comissao)}</td>
                    <td className="border border-slate-300 px-2 py-2">{formatarMoeda(grupo.total.lancamentos)}</td>
                    <td className={`border border-slate-300 px-2 py-2 ${classeValor(grupo.total.saldoCambista)}`}>
                      {formatarMoeda(grupo.total.saldoCambista)}
                    </td>
                    <td className={`border border-slate-300 px-2 py-2 ${classeValor(grupo.total.saldoBanca)}`}>
                      {formatarMoeda(grupo.total.saldoBanca)}
                    </td>
                  </tr>
                  <tr className="bg-slate-300 font-bold dark:bg-slate-700">
                    <td colSpan={4} className="border border-slate-300 px-2 py-3">
                      GERENTE: {formatarMoeda(grupo.gerenteComissao)}
                    </td>
                    <td colSpan={4} className="border border-slate-300 px-2 py-3">
                      BANCA: <span className={classeValor(grupo.total.saldoBanca)}>{formatarMoeda(grupo.total.saldoBanca)}</span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          ))
        )}

        <table className="mt-4 w-full min-w-[860px] border-collapse text-center text-sm">
          <thead>
            <tr>
              <th colSpan={7} className="border border-green-900 bg-green-700 px-2 py-2 text-sm font-bold uppercase text-white">
                Total Geral da Banca
              </th>
            </tr>
            <tr className="bg-green-700 text-white">
              <th className="border border-green-900 px-2 py-2">Qtd.</th>
              <th className="border border-green-900 px-2 py-2">Entrada</th>
              <th className="border border-green-900 px-2 py-2">Saída</th>
              <th className="border border-green-900 px-2 py-2">Comissões</th>
              <th className="border border-green-900 px-2 py-2">Lançamentos</th>
              <th className="border border-green-900 px-2 py-2">Saldo Cambista</th>
              <th className="border border-green-900 px-2 py-2">Saldo Banca</th>
            </tr>
          </thead>
          <tbody>
            <tr className="bg-white font-bold dark:bg-slate-900">
              <td className="border border-slate-300 px-2 py-2">{totalGeral.qtd}</td>
              <td className="border border-slate-300 px-2 py-2">{formatarMoeda(totalGeral.entrada)}</td>
              <td className="border border-slate-300 px-2 py-2">{formatarMoeda(totalGeral.saida)}</td>
              <td className="border border-slate-300 px-2 py-2">{formatarMoeda(totalGeral.comissao)}</td>
              <td className="border border-slate-300 px-2 py-2">{formatarMoeda(totalGeral.lancamentos)}</td>
              <td className={`border border-slate-300 px-2 py-2 ${classeValor(totalGeral.saldoCambista)}`}>
                {formatarMoeda(totalGeral.saldoCambista)}
              </td>
              <td className={`border border-slate-300 px-2 py-2 ${classeValor(totalGeral.saldoBanca)}`}>
                {formatarMoeda(totalGeral.saldoBanca)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <button
        type="button"
        onClick={() => window.print()}
        className="mt-3 border border-slate-500 bg-slate-100 px-3 py-2 text-sm font-bold text-slate-900 hover:bg-slate-200 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700 print:hidden"
      >
        Salvar PDF
      </button>
    </div>
  );
}

