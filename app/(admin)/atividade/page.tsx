"use client";

import { useEffect, useMemo, useState } from "react";
import {
  getBilhetes,
  getCambistasPorCodigo,
  calcularComissaoBilhete,
  calcularPremioPotencialBilhete,
} from "@/lib/store";
import { getAdminCodigo } from "@/lib/auth";
import { COTACOES_LABELS } from "@/lib/cotacoes";
import { parseDataPtBrOuIso, formatarDataHoraBr } from "@/lib/date-utils";
import { useConfigRefresh, useVisibilityRefresh } from "@/lib/use-config-refresh";
import type { Bilhete } from "@/lib/types";

function formatarMoeda(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function formatarData(s: string) {
  return formatarDataHoraBr(s);
}

const SITUACAO_STYLE: Record<string, { bg: string; text: string; label: string; pulse?: boolean }> = {
  pendente: { bg: "bg-amber-100", text: "text-amber-700", label: "Aguardando", pulse: true },
  pago: { bg: "bg-emerald-100", text: "text-emerald-700", label: "Pago" },
  perdedor: { bg: "bg-slate-100", text: "text-slate-600", label: "Sem prêmio" },
  cancelado: { bg: "bg-rose-100", text: "text-rose-700", label: "Cancelado" },
};

export default function AtividadeAoVivoPage() {
  const codigo = getAdminCodigo();
  const cambistas = useMemo(() => getCambistasPorCodigo(codigo ?? ""), [codigo]);
  const idsCambistas = useMemo(() => new Set(cambistas.map((c) => c.id)), [cambistas]);
  const [bilhetes, setBilhetes] = useState<Bilhete[]>([]);
  const [cambistaSel, setCambistaSel] = useState<string>("todos");
  const [hilight, setHilight] = useState<Set<string>>(new Set());
  const [previousIds, setPreviousIds] = useState<Set<string>>(new Set());

  const recarregar = () => {
    const lista = getBilhetes()
      .filter((b) => idsCambistas.has(b.cambistaId))
      .sort((a, z) => {
        const da = parseDataPtBrOuIso(a.data)?.getTime() ?? 0;
        const dz = parseDataPtBrOuIso(z.data)?.getTime() ?? 0;
        return dz - da;
      });
    setBilhetes(lista);
    // destaca novos
    const novos = new Set<string>();
    for (const b of lista) {
      if (!previousIds.has(b.id)) novos.add(b.id);
    }
    if (novos.size > 0) {
      setHilight(novos);
      setTimeout(() => setHilight(new Set()), 4000);
    }
    setPreviousIds(new Set(lista.map((b) => b.id)));
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { recarregar(); }, []);
  useConfigRefresh(recarregar);
  useVisibilityRefresh(recarregar);
  // polling rápido (5s) para o caso de não haver realtime
  useEffect(() => {
    const id = setInterval(recarregar, 5000);
    return () => clearInterval(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsCambistas]);

  const listaFiltrada = useMemo(() => {
    if (cambistaSel === "todos") return bilhetes;
    return bilhetes.filter((b) => b.cambistaId === cambistaSel);
  }, [bilhetes, cambistaSel]);

  const hoje = new Date();
  const totalHoje = useMemo(
    () =>
      listaFiltrada
        .filter((b) => {
          const m = b.data.match(/^(\d{2})\/(\d{2})\/(\d{2,4})/);
          if (!m) return false;
          const [, d, mm, y] = m;
          return Number(d) === hoje.getDate() && Number(mm) === hoje.getMonth() + 1 &&
            (y.length === 2 ? Number("20" + y) : Number(y)) === hoje.getFullYear();
        })
        .reduce((s, b) => s + b.total, 0),
    [listaFiltrada, hoje]
  );

  const valorEmAberto = listaFiltrada
    .filter((b) => b.situacao === "pendente")
    .reduce((s, b) => s + b.total, 0);
  const ganhosHojeQtd = listaFiltrada.filter((b) => b.situacao === "pago").length;

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="relative inline-flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60"></span>
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500"></span>
            </span>
            <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Atividade ao vivo</h1>
          </div>
          <p className="text-sm text-slate-500">
            Bilhetes dos cambistas em tempo real (atualiza a cada 5s + Realtime quando disponível)
          </p>
        </div>
        <select
          value={cambistaSel}
          onChange={(e) => setCambistaSel(e.target.value)}
          className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm"
        >
          <option value="todos">Todos os cambistas</option>
          {cambistas.map((c) => (
            <option key={c.id} value={c.id}>
              {c.login}
            </option>
          ))}
        </select>
      </div>

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Vendido hoje</p>
          <p className="mt-1 text-2xl font-bold text-emerald-600">{formatarMoeda(totalHoje)}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Valor em aberto</p>
          <p className="mt-1 text-2xl font-bold text-amber-600">{formatarMoeda(valorEmAberto)}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Pagos</p>
          <p className="mt-1 text-2xl font-bold text-emerald-700">{ganhosHojeQtd}</p>
        </div>
      </div>

      {listaFiltrada.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-slate-200 p-12 text-center">
          <p className="text-slate-500">Nenhum bilhete registrado ainda.</p>
          <p className="mt-1 text-xs text-slate-400">
            Quando um cambista fizer uma aposta no app, ela aparecerá aqui em segundos.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {listaFiltrada.slice(0, 60).map((b) => {
            const cam = cambistas.find((c) => c.id === b.cambistaId);
            const isNew = hilight.has(b.id);
            const st = SITUACAO_STYLE[b.situacao] ?? SITUACAO_STYLE.pendente;
            const comissao = cam ? calcularComissaoBilhete(b, cam) : 0;
            const premio = cam ? calcularPremioPotencialBilhete(b, cam) : 0;
            return (
              <div
                key={b.id}
                className={`relative overflow-hidden rounded-xl border bg-white p-4 shadow-sm transition-all ${
                  isNew
                    ? "animate-pulse-once border-emerald-300 ring-2 ring-emerald-200"
                    : "border-slate-200"
                }`}
              >
                {isNew && (
                  <span className="absolute right-3 top-3 rounded-full bg-emerald-500 px-2 py-0.5 text-[10px] font-bold uppercase text-white">
                    Novo
                  </span>
                )}
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm text-slate-500">#{b.codigo}</span>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${st.bg} ${st.text}`}>
                        {st.label}
                      </span>
                    </div>
                    <p className="mt-1 text-sm font-semibold text-slate-800">{b.extracaoNome}</p>
                    <p className="text-xs text-slate-500">
                      {cam?.login ?? "—"} · {formatarData(b.data)}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {b.itens.slice(0, 4).map((it, i) => (
                        <span
                          key={i}
                          className="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-700"
                        >
                          {COTACOES_LABELS[it.modalidade] ?? it.modalidade}: {it.numeros}
                        </span>
                      ))}
                      {b.itens.length > 4 && (
                        <span className="rounded bg-slate-100 px-2 py-0.5 text-[10px] text-slate-500">
                          +{b.itens.length - 4} item(ns)
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-xs uppercase text-slate-400">Total</p>
                    <p className="text-lg font-bold text-slate-900">{formatarMoeda(b.total)}</p>
                    <p className="mt-1 text-[10px] text-slate-500">Comissão: {formatarMoeda(comissao)}</p>
                    <p className="text-[10px] text-emerald-600">Prêmio máx: {formatarMoeda(premio)}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <style jsx>{`
        @keyframes pulse-once {
          0%, 100% { background-color: rgb(255 255 255); }
          50% { background-color: rgb(220 252 231); }
        }
        .animate-pulse-once { animation: pulse-once 1.2s ease-in-out 2; }
      `}</style>
    </div>
  );
}
