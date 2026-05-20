"use client";

import { useState, useEffect } from "react";
import {
  getBilhetes,
  getCambistas,
  getCambistasPorCodigo,
  getGerentesPorCodigo,
  getExtracoes,
  getConfig,
  getResultadoByExtracaoData,
  getCotacaoEfetiva,
  getPremioMilharBrinde,
  cancelarBilheteAdmin,
  reconferirBilhetesComResultados,
  recalculateComissaoFromBilhetes,
} from "@/lib/store";
import { conferirBilhete } from "@/lib/conferencia";
import { getAdminCodigo, CODIGO_CHEFE } from "@/lib/auth";
import { COTACOES_LABELS } from "@/lib/cotacoes";
import { initFromSupabase, useSupabase } from "@/lib/sync-supabase";
import { addLog } from "@/lib/auditoria";
import { hojeIsoDate, isSameIsoInputDate, formatarDataHoraBr, parseDataPtBrOuIso } from "@/lib/date-utils";
import { compararBilheteRecentePrimeiro } from "@/lib/list-order";
import { useVisibilityRefresh } from "@/lib/use-config-refresh";
import BilheteDetalhado from "@/app/components/BilheteDetalhado";
import { useBranding } from "@/app/components/BrandingProvider";
import type { Bilhete } from "@/lib/types";

function formatarMoeda(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

const MODALIDADES: Record<string, string> = { ...COTACOES_LABELS };

export default function BilhetesAdminPage() {
  const codigo = getAdminCodigo();
  const { branding } = useBranding();
  const [bilhetes, setBilhetes] = useState(getBilhetes());
  const [filtroGerente, setFiltroGerente] = useState("todos");
  const [filtroCambista, setFiltroCambista] = useState("todos");
  const [filtroSituacao, setFiltroSituacao] = useState("todos");
  const [filtroExtracao, setFiltroExtracao] = useState("todos");
  const [filtroData, setFiltroData] = useState<string>(() => hojeIsoDate());
  const [filtroCodigo, setFiltroCodigo] = useState("");
  const [ordenacao, setOrdenacao] = useState<
    "data_desc" | "data_asc" | "valor_desc" | "valor_asc" | "premio_desc" | "premio_asc"
  >("data_desc");
  const [detalheBilhete, setDetalheBilhete] = useState<Bilhete | null>(null);
  const [cancelandoId, setCancelandoId] = useState<string | null>(null);
  const [sincronizando, setSincronizando] = useState(false);

  const cambistas = getCambistasPorCodigo(codigo ?? "");
  const gerentes = getGerentesPorCodigo(codigo ?? "");
  const extracoes = getExtracoes();
  const todosCambistas = getCambistas();
  const cfg = getConfig();
  const bancaNome = branding.displayName || (codigo ? `${codigo} Premiações` : "Premiações");
  const podeCancelarAdmin = cfg.gerentePodeCancelarAposta !== false || (codigo?.trim().toLowerCase() === CODIGO_CHEFE.toLowerCase());
  const usarFallback = cambistas.length === 0 && codigo && codigo.trim().toLowerCase() === CODIGO_CHEFE.toLowerCase();
  const cambistasParaFiltro = usarFallback
    ? todosCambistas.filter((c) => ((c as { codigo?: string }).codigo ?? "default").toLowerCase() === "default")
    : cambistas;
  const idsCambistasCodigo = new Set(cambistasParaFiltro.map((c) => c.id));
  const bilhetesDoCodigo = bilhetes.filter((b) => idsCambistasCodigo.has(b.cambistaId));

  const refreshBilhetes = () => setBilhetes(getBilhetes());

  const handleSincronizar = async () => {
    if (sincronizando) return;
    setSincronizando(true);
    try {
      if (useSupabase) {
        await initFromSupabase();
        reconferirBilhetesComResultados();
        recalculateComissaoFromBilhetes();
      }
      refreshBilhetes();
    } finally {
      setSincronizando(false);
    }
  };

  useEffect(() => {
    refreshBilhetes();
  }, [codigo]);
  useVisibilityRefresh(refreshBilhetes);

  // Lock body scroll quando o modal de detalhes do bilhete está aberto.
  useEffect(() => {
    if (typeof window === "undefined" || !detalheBilhete) return;
    const orig = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = orig;
    };
  }, [detalheBilhete]);

  const filtrar = bilhetesDoCodigo.filter((b) => {
    const cam = cambistasParaFiltro.find((c) => c.id === b.cambistaId);
    if (!cam) return false;
    if (filtroGerente !== "todos" && cam.gerenteId !== filtroGerente) return false;
    if (filtroCambista !== "todos" && b.cambistaId !== filtroCambista) return false;
    if (filtroSituacao !== "todos" && b.situacao !== filtroSituacao) return false;
    if (filtroExtracao !== "todos" && b.extracaoId !== filtroExtracao) return false;
    if (filtroData) {
      if (!isSameIsoInputDate(b.data, filtroData)) return false;
    }
    if (filtroCodigo.trim() && !b.codigo.includes(filtroCodigo.trim())) return false;
    return true;
  });

  const getCambistaNome = (id: string) => cambistasParaFiltro.find((c) => c.id === id)?.login ?? "-";

  const getValorPremioReal = (b: Bilhete): number => {
    if (b.situacao === "cancelado") return 0;
    const cam = cambistasParaFiltro.find((c) => c.id === b.cambistaId);
    if (!cam) return 0;
    const resultado = getResultadoByExtracaoData(b.extracaoId, b.data);
    const conf = conferirBilhete(b, resultado, cam, getCotacaoEfetiva, getPremioMilharBrinde());
    return conf.vencedor ? conf.valorGanho : 0;
  };

  const handleCancelarAdmin = async (b: (typeof filtrar)[0]) => {
    if (cancelandoId === b.id || b.situacao === "cancelado") return;
    if (!confirm(`Cancelar o bilhete ${b.codigo}? O admin pode cancelar a qualquer momento.`)) return;
    setCancelandoId(b.id);
    try {
      const ok = await cancelarBilheteAdmin(b.id);
      if (ok) {
        addLog("Cancelou bilhete", `Código ${b.codigo} (${formatarMoeda(b.total)})`);
        refreshBilhetes();
        // Fecha o modal só após confirmação de sucesso.
        setDetalheBilhete((atual) => (atual?.id === b.id ? null : atual));
      } else {
        alert("Não foi possível cancelar o bilhete (pode já estar cancelado).");
      }
    } catch (e) {
      alert(`Erro ao cancelar: ${(e as Error).message}`);
    } finally {
      setCancelandoId(null);
    }
  };

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-gray-800">Bilhetes</h1>

      <div className="mb-4 flex flex-wrap gap-3">
        <select
          value={filtroGerente}
          onChange={(e) => setFiltroGerente(e.target.value)}
          className="rounded border border-gray-300 px-3 py-2 text-sm text-black"
        >
          <option value="todos">Todos gerentes</option>
          {gerentes.map((g) => (
            <option key={g.id} value={g.id}>{g.login}</option>
          ))}
        </select>
        <select
          value={filtroCambista}
          onChange={(e) => setFiltroCambista(e.target.value)}
          className="rounded border border-gray-300 px-3 py-2 text-sm text-black"
        >
          <option value="todos">Todos cambistas</option>
          {cambistasParaFiltro.map((c) => (
            <option key={c.id} value={c.id}>{c.login}</option>
          ))}
        </select>
        <select
          value={filtroSituacao}
          onChange={(e) => setFiltroSituacao(e.target.value)}
          className="rounded border border-gray-300 px-3 py-2 text-sm text-black"
        >
          <option value="todos">Todas situações</option>
          <option value="pendente">Pendente</option>
          <option value="pago">Pago</option>
          <option value="perdedor">Perdedor</option>
          <option value="cancelado">Cancelado</option>
        </select>
        <select
          value={filtroExtracao}
          onChange={(e) => setFiltroExtracao(e.target.value)}
          className="rounded border border-gray-300 px-3 py-2 text-sm text-black"
        >
          <option value="todos">Todas extrações</option>
          {extracoes.map((e) => (
            <option key={e.id} value={e.id}>{e.nome}</option>
          ))}
        </select>
        <input
          type="date"
          value={filtroData}
          onChange={(e) => setFiltroData(e.target.value)}
          className="rounded border border-gray-300 px-3 py-2 text-sm text-black"
          title="Filtra bilhetes pela data selecionada"
        />
        {filtroData && (
          <button
            type="button"
            onClick={() => setFiltroData("")}
            className="rounded border border-gray-300 bg-white px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50"
          >
            Ver todos
          </button>
        )}
        <input
          type="text"
          placeholder="Nº Bilhete"
          value={filtroCodigo}
          onChange={(e) => setFiltroCodigo(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && refreshBilhetes()}
          className="rounded border border-gray-300 px-3 py-2 text-sm text-black"
        />
        <select
          value={ordenacao}
          onChange={(e) =>
            setOrdenacao(
              e.target.value as
                | "data_desc"
                | "data_asc"
                | "valor_desc"
                | "valor_asc"
                | "premio_desc"
                | "premio_asc",
            )
          }
          className="rounded border border-gray-300 px-3 py-2 text-sm text-black"
        >
          <option value="data_desc">Data (mais recentes)</option>
          <option value="data_asc">Data (mais antigos)</option>
          <option value="valor_desc">Valor (maior primeiro)</option>
          <option value="valor_asc">Valor (menor primeiro)</option>
          <option value="premio_desc">Prêmio (maior primeiro)</option>
          <option value="premio_asc">Prêmio (menor primeiro)</option>
        </select>
        <button
          type="button"
          onClick={refreshBilhetes}
          className="rounded bg-orange-500 px-4 py-2 text-sm font-medium text-white hover:bg-orange-600"
        >
          Pesquisar
        </button>
        {useSupabase && (
          <button
            type="button"
            onClick={() => void handleSincronizar()}
            disabled={sincronizando}
            className="rounded bg-blue-500 px-4 py-2 text-sm font-medium text-white hover:bg-blue-600 disabled:opacity-60"
          >
            {sincronizando ? "Sincronizando…" : "Sincronizar"}
          </button>
        )}
      </div>

      {cambistasParaFiltro.length === 0 && (
        <p className="mb-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
          Nenhum cambista com o código da banca. Verifique se está logado com o código correto ou crie cambistas em Cambistas.
        </p>
      )}
      <p className="mb-4 text-sm text-black">{filtrar.length} bilhete(s) encontrado(s)</p>

      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white shadow">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase text-black">Código</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase text-black">Cambista</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase text-black">Extração</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase text-black">Data</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase text-black">Jogo</th>
              <th className="px-4 py-3 text-right text-xs font-medium uppercase text-black">Valor aposta</th>
              <th className="px-4 py-3 text-right text-xs font-medium uppercase text-black">Valor prêmio</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase text-black">Situação</th>
              <th className="px-4 py-3 text-right text-xs font-medium uppercase text-black">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {filtrar.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-black">
                  Nenhum bilhete encontrado.
                </td>
              </tr>
            ) : (
              [...filtrar]
                .sort((a, b) => {
                  if (ordenacao === "valor_desc") return b.total - a.total;
                  if (ordenacao === "valor_asc") return a.total - b.total;
                  if (ordenacao === "premio_desc" || ordenacao === "premio_asc") {
                    const premioA = getValorPremioReal(a);
                    const premioB = getValorPremioReal(b);
                    return ordenacao === "premio_desc" ? premioB - premioA : premioA - premioB;
                  }
                  if (ordenacao === "data_desc") return compararBilheteRecentePrimeiro(a, b);
                  if (ordenacao === "data_asc") {
                    const da = parseDataPtBrOuIso(a.data)?.getTime() ?? 0;
                    const db = parseDataPtBrOuIso(b.data)?.getTime() ?? 0;
                    if (da !== db) return da - db;
                    return Number(a.id) - Number(b.id);
                  }
                  return compararBilheteRecentePrimeiro(a, b);
                })
                .map((b) => {
                const premioReal = getValorPremioReal(b);
                const jogo = b.itens.map((i) => `${MODALIDADES[i.modalidade] || i.modalidade} ${i.numeros}${i.milharBrinde ? ` + Brinde ${i.milharBrinde}` : ""}`).join(" | ");
                return (
                  <tr key={b.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-mono text-sm font-medium text-black">{b.codigo}</td>
                    <td className="px-4 py-3 text-sm text-black">{getCambistaNome(b.cambistaId)}</td>
                    <td className="px-4 py-3 text-sm text-black">{b.extracaoNome}</td>
                    <td className="px-4 py-3 text-sm text-black">{formatarDataHoraBr(b.data)}</td>
                    <td className="max-w-[200px] truncate px-4 py-3 text-xs text-black" title={jogo}>{jogo}</td>
                    <td className="px-4 py-3 text-right text-sm font-medium text-black">{formatarMoeda(b.total)}</td>
                    <td className="px-4 py-3 text-right text-sm font-medium text-black">{formatarMoeda(premioReal)}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2 py-1 text-xs font-medium ${
                          b.situacao === "pendente" ? "bg-yellow-100 text-yellow-700" :
                          b.situacao === "pago" ? "bg-green-100 text-green-700" :
                          b.situacao === "cancelado" ? "bg-red-100 text-red-700" :
                          "bg-gray-100 text-gray-700"
                        }`}
                      >
                        {b.situacao}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setDetalheBilhete(b)}
                          className="rounded bg-blue-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-600"
                        >
                          Bilhete
                        </button>
                        {b.situacao !== "cancelado" && podeCancelarAdmin && (
                          <button
                            type="button"
                            onClick={() => handleCancelarAdmin(b)}
                            disabled={cancelandoId === b.id}
                            className="rounded bg-red-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-600 disabled:opacity-60"
                          >
                            {cancelandoId === b.id ? "..." : "Cancelar"}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Modal detalhes do bilhete */}
      {detalheBilhete && (() => {
        const b = detalheBilhete;
        const cam = cambistasParaFiltro.find((c) => c.id === b.cambistaId);
        const resultado = getResultadoByExtracaoData(b.extracaoId, b.data);
        const conf = cam ? conferirBilhete(b, resultado, cam, getCotacaoEfetiva, getPremioMilharBrinde()) : { vencedor: false, valorGanho: 0, itens: [] };
        return (
          <div
            className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 sm:items-center"
            onClick={() => setDetalheBilhete(null)}
          >
            <div
              className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-2xl bg-slate-100 p-3 shadow-2xl sm:p-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mb-3 flex items-center justify-between px-1">
                <h2 className="text-base font-bold text-slate-800">Visualização do bilhete</h2>
                <button
                  type="button"
                  onClick={() => setDetalheBilhete(null)}
                  className="rounded-full p-2 text-slate-500 hover:bg-white"
                  aria-label="Fechar"
                >
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <BilheteDetalhado
                bilhete={b}
                bancaNome={bancaNome}
                cambistaNome={getCambistaNome(b.cambistaId)}
                cotacaoPara={(mod) => (cam ? getCotacaoEfetiva(cam, mod as never) : 0)}
                rodapeTexto={branding.bilheteRodape || cfg.textoRodapeBilhete || undefined}
                logoUrl={branding.logoUrl ?? null}
              />

              <div className="mt-4 rounded-xl border border-slate-200 bg-white p-3">
                <p className="mb-2 text-sm font-semibold text-slate-800">Conferência do admin</p>
                {resultado ? (
                  <>
                    <p className={`text-base font-bold ${conf.vencedor ? "text-emerald-700" : "text-slate-600"}`}>
                      {conf.vencedor ? `Vencedor — ${formatarMoeda(conf.valorGanho)}` : "Sem prêmio nesta extração"}
                    </p>
                    {conf.itens.some((x) => x.bateu) && (
                      <ul className="mt-1 list-inside list-disc text-xs text-slate-600">
                        {conf.itens.filter((x) => x.bateu).map((x, i) => (
                          <li key={i}>
                            {x.brindeBateu
                              ? `Milhar Brinde ${x.item.milharBrinde}: ${formatarMoeda(x.brindeValorGanho ?? x.valorGanho)}`
                              : `${MODALIDADES[x.item.modalidade] || x.item.modalidade} ${x.item.numeros}: ${formatarMoeda(x.valorGanho)}`}
                          </li>
                        ))}
                      </ul>
                    )}
                  </>
                ) : (
                  <p className="text-sm text-slate-500">Aguardando resultado da extração.</p>
                )}
              </div>

              <div className="mt-3 flex justify-end gap-2">
                {b.situacao !== "cancelado" && podeCancelarAdmin && (
                  <button
                    type="button"
                    onClick={() => {
                      // Não fechar antes do cancelamento confirmar — o handler
                      // fecha o modal sozinho em caso de sucesso.
                      void handleCancelarAdmin(b);
                    }}
                    disabled={cancelandoId === b.id}
                    className="rounded-lg bg-red-500 px-4 py-2 text-sm font-medium text-white hover:bg-red-600 disabled:opacity-60"
                  >
                    {cancelandoId === b.id ? "Cancelando…" : "Cancelar bilhete"}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setDetalheBilhete(null)}
                  className="rounded-lg bg-slate-700 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
                >
                  Fechar
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
