"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  getCambistas,
  calcularTotalCaixa,
  getJogosEmAberto,
  getBilhetes,
  getLancamentos,
  getResultadoByExtracaoData,
  getCotacaoEfetiva,
  getPremioMilharBrinde,
  calcularComissaoBilhete,
} from "@/lib/store";
import { conferirBilhete } from "@/lib/conferencia";
import { parseDataPtBrOuIso, startOfDay, endOfDay, isoDateInputToDate, hojeIsoDate } from "@/lib/date-utils";
import { useVisibilityRefresh } from "@/lib/use-config-refresh";
import type { Cambista } from "@/lib/types";

function formatarMoeda(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

interface ResumoCaixa {
  entrada: number;
  saidas: number;
  comissao: number;
  lancamentos: number;
  jogosAberto: number;
}

type Periodo = "atual" | "hoje" | "dia" | "intervalo";

function calcularResumoNoPeriodo(cambista: Cambista, ini: Date | null, fim: Date | null): ResumoCaixa {
  const dentro = (data: string): boolean => {
    const d = parseDataPtBrOuIso(data);
    if (!d) return false;
    if (ini && d.getTime() < ini.getTime()) return false;
    if (fim && d.getTime() > fim.getTime()) return false;
    return true;
  };

  const bilhetesDoCam = getBilhetes().filter((b) => b.cambistaId === cambista.id);
  const lancamentosDoCam = getLancamentos().filter((l) => l.cambistaId === cambista.id);

  let entrada = 0;
  let saidas = 0;
  let comissao = 0;
  let jogosAberto = 0;
  for (const b of bilhetesDoCam) {
    if (b.situacao === "cancelado") continue;
    if (!dentro(b.data)) continue;
    entrada += b.total;
    comissao += calcularComissaoBilhete(b, cambista);
    if (b.situacao === "pendente") {
      jogosAberto += b.total;
    }
    if (b.situacao === "pago") {
      const resultado = getResultadoByExtracaoData(b.extracaoId, b.data);
      if (resultado) {
        const conf = conferirBilhete(b, resultado, cambista, getCotacaoEfetiva, getPremioMilharBrinde());
        saidas += conf.valorGanho;
      }
    }
  }

  let lancamentos = 0;
  for (const l of lancamentosDoCam) {
    if (!dentro(l.data)) continue;
    const delta = l.tipo === "adiantar" ? l.valor : -l.valor;
    lancamentos += delta;
  }

  return { entrada, saidas, comissao, lancamentos, jogosAberto };
}

export default function ClienteCaixaPage() {
  const router = useRouter();
  const [cambistaId, setCambistaId] = useState<string | null>(null);
  const [cambista, setCambista] = useState<Cambista | null>(null);
  const [periodo, setPeriodo] = useState<Periodo>("atual");
  const [dataUnica, setDataUnica] = useState<string>(hojeIsoDate());
  const [dataInicio, setDataInicio] = useState<string>(hojeIsoDate());
  const [dataFim, setDataFim] = useState<string>(hojeIsoDate());

  const recarregarCambista = () => {
    const auth = localStorage.getItem("premiacoes_cliente");
    if (!auth) return;
    const { cambistaId: cid } = JSON.parse(auth);
    setCambistaId(cid);
    const cam = getCambistas().find((c) => c.id === cid);
    if (cam) setCambista(cam);
  };

  useEffect(() => {
    const auth = localStorage.getItem("premiacoes_cliente");
    if (!auth) {
      router.replace("/cliente");
      return;
    }
    recarregarCambista();
  }, [router]);

  useVisibilityRefresh(recarregarCambista);

  const resumo = useMemo<ResumoCaixa | null>(() => {
    if (!cambista) return null;
    if (periodo === "atual") {
      return {
        entrada: cambista.entrada ?? 0,
        saidas: cambista.saidas ?? 0,
        comissao: cambista.comissao ?? 0,
        lancamentos: cambista.lancamentos ?? 0,
        jogosAberto: cambistaId ? getJogosEmAberto(cambistaId) : 0,
      };
    }
    let ini: Date | null = null;
    let fim: Date | null = null;
    if (periodo === "hoje") {
      const hoje = new Date();
      ini = startOfDay(hoje);
      fim = endOfDay(hoje);
    } else if (periodo === "dia") {
      const d = isoDateInputToDate(dataUnica);
      if (d) {
        ini = startOfDay(d);
        fim = endOfDay(d);
      }
    } else if (periodo === "intervalo") {
      const di = isoDateInputToDate(dataInicio);
      const df = isoDateInputToDate(dataFim);
      if (di) ini = startOfDay(di);
      if (df) fim = endOfDay(df);
    }
    return calcularResumoNoPeriodo(cambista, ini, fim);
  }, [cambista, cambistaId, periodo, dataUnica, dataInicio, dataFim]);

  if (!cambista || !resumo) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white dark:bg-slate-950">
        <p className="text-gray-500 dark:text-slate-400">Carregando...</p>
      </div>
    );
  }

  const total = calcularTotalCaixa(resumo);

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white p-4 pb-28 text-slate-900 dark:from-slate-950 dark:to-slate-900 dark:text-slate-100">
      <div className="mb-4 flex items-center gap-2">
        <button
          type="button"
          onClick={() => router.push("/cliente")}
          className="rounded p-2 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
          aria-label="Voltar"
        >
          <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h1 className="text-lg font-bold text-slate-800 dark:text-slate-100">Caixa</h1>
      </div>

      <p className="mb-3 text-sm text-slate-600 dark:text-slate-300">
        Jogos em aberto = valor apostado ainda sem resultado. Saídas = prêmios já pagos (após sair o resultado).
      </p>

      <div className="mb-4 rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/80">
        <div className="mb-2 flex flex-wrap gap-2">
          {([
            { id: "atual", label: "Saldo atual" },
            { id: "hoje", label: "Hoje" },
            { id: "dia", label: "Por data" },
            { id: "intervalo", label: "Período" },
          ] as Array<{ id: Periodo; label: string }>).map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setPeriodo(p.id)}
              className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                periodo === p.id
                  ? "bg-orange-500 text-white"
                  : "border border-slate-300 bg-white text-slate-800 hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-700"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
        {periodo === "dia" && (
          <div className="flex items-center gap-2">
            <label className="text-xs font-medium text-slate-600 dark:text-slate-300">Data:</label>
            <input
              type="date"
              value={dataUnica}
              onChange={(e) => setDataUnica(e.target.value)}
              className="flex-1 rounded border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
            />
          </div>
        )}
        {periodo === "intervalo" && (
          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col">
              <label className="text-[11px] font-medium text-slate-600 dark:text-slate-300">De</label>
              <input
                type="date"
                value={dataInicio}
                onChange={(e) => setDataInicio(e.target.value)}
                className="rounded border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
              />
            </div>
            <div className="flex flex-col">
              <label className="text-[11px] font-medium text-slate-600 dark:text-slate-300">Até</label>
              <input
                type="date"
                value={dataFim}
                onChange={(e) => setDataFim(e.target.value)}
                className="rounded border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
              />
            </div>
          </div>
        )}
        {periodo !== "atual" && (
          <p className="mt-2 text-[11px] text-slate-600 dark:text-slate-400">
            Mostrando movimento referente ao período selecionado, calculado a partir dos bilhetes e lançamentos.
          </p>
        )}
      </div>

      <div className="space-y-3">
        <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 dark:border-blue-800/60 dark:bg-blue-950/40">
          <p className="text-sm text-slate-700 dark:text-slate-300">Jogos em aberto</p>
          <p className="text-xl font-bold text-blue-700 dark:text-blue-400">{formatarMoeda(resumo.jogosAberto)}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/80">
          <p className="text-sm text-slate-600 dark:text-slate-300">Entrada</p>
          <p className="text-xl font-bold text-green-700 dark:text-green-400">{formatarMoeda(resumo.entrada)}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/80">
          <p className="text-sm text-slate-600 dark:text-slate-300">Saídas (prêmios pagos)</p>
          <p className="text-xl font-bold text-red-700 dark:text-red-400">{formatarMoeda(resumo.saidas)}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/80">
          <p className="text-sm text-slate-600 dark:text-slate-300">Comissão</p>
          <p className="text-xl font-bold text-orange-600 dark:text-orange-400">{formatarMoeda(resumo.comissao)}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/80">
          <p className="text-sm text-slate-600 dark:text-slate-300">Lançamentos</p>
          <p className={`text-xl font-bold ${resumo.lancamentos >= 0 ? "text-green-700 dark:text-green-400" : "text-red-700 dark:text-red-400"}`}>
            {formatarMoeda(resumo.lancamentos)}
          </p>
        </div>
        <div className="rounded-xl border-2 border-orange-200 bg-orange-50 p-4 dark:border-orange-700/60 dark:bg-orange-950/35">
          <p className="text-sm text-slate-700 dark:text-slate-300">Total a prestar</p>
          <p className="text-2xl font-bold text-orange-700 dark:text-orange-400">{formatarMoeda(total)}</p>
        </div>
      </div>
    </div>
  );
}
