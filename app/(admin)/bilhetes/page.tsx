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
  calcularComissaoBilhete,
  calcularPremioPotencialBilhete,
  cancelarBilheteAdmin,
  reconferirBilhetesComResultados,
  recalculateComissaoFromBilhetes,
} from "@/lib/store";
import { conferirBilhete } from "@/lib/conferencia";
import { getAdminCodigo, CODIGO_CHEFE } from "@/lib/auth";
import { COTACOES_LABELS } from "@/lib/cotacoes";
import { initFromSupabase, useSupabase } from "@/lib/sync-supabase";
import { addLog } from "@/lib/auditoria";

function formatarMoeda(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function parseDataBrasil(dataStr: string): Date | null {
  const m = dataStr.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (!m) return null;
  const [, d, M, y] = m;
  const ano = (y ?? "").length === 2 ? `20${y}` : y;
  const dia = String(d ?? "").padStart(2, "0");
  const mes = String(M ?? "").padStart(2, "0");
  const iso = `${ano}-${mes}-${dia}T00:00:00`;
  const dt = new Date(iso);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

const MODALIDADES: Record<string, string> = { ...COTACOES_LABELS };

export default function BilhetesAdminPage() {
  const codigo = getAdminCodigo();
  const [bilhetes, setBilhetes] = useState(getBilhetes());
  const [filtroGerente, setFiltroGerente] = useState("todos");
  const [filtroCambista, setFiltroCambista] = useState("todos");
  const [filtroSituacao, setFiltroSituacao] = useState("todos");
  const [filtroExtracao, setFiltroExtracao] = useState("todos");
  const [filtroData, setFiltroData] = useState("");
  const [filtroCodigo, setFiltroCodigo] = useState("");
  const [ordenacao, setOrdenacao] = useState<
    "data_desc" | "data_asc" | "valor_desc" | "valor_asc" | "premio_desc" | "premio_asc"
  >("data_desc");
  const [detalheBilhete, setDetalheBilhete] = useState<(typeof bilhetesDoCodigo)[0] | null>(null);

  const cambistas = getCambistasPorCodigo(codigo ?? "");
  const gerentes = getGerentesPorCodigo(codigo ?? "");
  const extracoes = getExtracoes();
  const todosCambistas = getCambistas();
  const cfg = getConfig();
  const podeCancelarAdmin = cfg.gerentePodeCancelarAposta !== false || (codigo?.trim().toLowerCase() === CODIGO_CHEFE.toLowerCase());
  const usarFallback = cambistas.length === 0 && codigo && codigo.trim().toLowerCase() === CODIGO_CHEFE.toLowerCase();
  const cambistasParaFiltro = usarFallback
    ? todosCambistas.filter((c) => ((c as { codigo?: string }).codigo ?? "default").toLowerCase() === "default")
    : cambistas;
  const idsCambistasCodigo = new Set(cambistasParaFiltro.map((c) => c.id));
  const bilhetesDoCodigo = bilhetes.filter((b) => idsCambistasCodigo.has(b.cambistaId));

  const refreshBilhetes = () => setBilhetes(getBilhetes());

  const handleSincronizar = async () => {
    if (useSupabase) {
      await initFromSupabase();
      reconferirBilhetesComResultados();
      recalculateComissaoFromBilhetes();
    }
    refreshBilhetes();
  };

  useEffect(() => {
    refreshBilhetes();
  }, [codigo]);

  const filtrar = bilhetesDoCodigo.filter((b) => {
    const cam = cambistasParaFiltro.find((c) => c.id === b.cambistaId);
    if (!cam) return false;
    if (filtroGerente !== "todos" && cam.gerenteId !== filtroGerente) return false;
    if (filtroCambista !== "todos" && b.cambistaId !== filtroCambista) return false;
    if (filtroSituacao !== "todos" && b.situacao !== filtroSituacao) return false;
    if (filtroExtracao !== "todos" && b.extracaoId !== filtroExtracao) return false;
    if (filtroData) {
      const [y, m, d] = filtroData.split("-");
      const busca = `${d}/${m}/${y.slice(2)}`;
      if (!b.data.includes(busca)) return false;
    }
    if (filtroCodigo.trim() && !b.codigo.includes(filtroCodigo.trim())) return false;
    return true;
  });

  const getCambistaNome = (id: string) => cambistasParaFiltro.find((c) => c.id === id)?.login ?? "-";

  const handleCancelarAdmin = (b: (typeof filtrar)[0]) => {
    if (b.situacao === "cancelado") return;
    if (!confirm(`Cancelar o bilhete ${b.codigo}? O admin pode cancelar a qualquer momento.`)) return;
    if (cancelarBilheteAdmin(b.id)) {
      addLog("Cancelou bilhete", `Código ${b.codigo} (${formatarMoeda(b.total)})`);
      refreshBilhetes();
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
        />
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
            className="rounded bg-blue-500 px-4 py-2 text-sm font-medium text-white hover:bg-blue-600"
          >
            Sincronizar
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
                    const camA = cambistasParaFiltro.find((c) => c.id === a.cambistaId);
                    const camB = cambistasParaFiltro.find((c) => c.id === b.cambistaId);
                    const premioA = camA ? calcularPremioPotencialBilhete(a, camA) : 0;
                    const premioB = camB ? calcularPremioPotencialBilhete(b, camB) : 0;
                    return ordenacao === "premio_desc" ? premioB - premioA : premioA - premioB;
                  }
                  const da = parseDataBrasil(a.data)?.getTime() ?? 0;
                  const db = parseDataBrasil(b.data)?.getTime() ?? 0;
                  if (ordenacao === "data_asc") return da - db;
                  return db - da;
                })
                .map((b) => {
                const cam = cambistasParaFiltro.find((c) => c.id === b.cambistaId);
                const comissao = cam ? calcularComissaoBilhete(b, cam) : 0;
                const jogo = b.itens.map((i) => `${MODALIDADES[i.modalidade] || i.modalidade} ${i.numeros}${i.milharBrinde ? ` + Brinde ${i.milharBrinde}` : ""}`).join(" | ");
                return (
                  <tr key={b.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-mono text-sm font-medium text-black">{b.codigo}</td>
                    <td className="px-4 py-3 text-sm text-black">{getCambistaNome(b.cambistaId)}</td>
                    <td className="px-4 py-3 text-sm text-black">{b.extracaoNome}</td>
                    <td className="px-4 py-3 text-sm text-black">{b.data.replace(",", " ")}</td>
                    <td className="max-w-[200px] truncate px-4 py-3 text-xs text-black" title={jogo}>{jogo}</td>
                    <td className="px-4 py-3 text-right text-sm font-medium text-black">{formatarMoeda(b.total)}</td>
                    <td className="px-4 py-3 text-right text-sm font-medium text-black">{formatarMoeda(cam ? calcularPremioPotencialBilhete(b, cam) : 0)}</td>
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
                            className="rounded bg-red-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-600"
                          >
                            Cancelar
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
        const conf = cam ? conferirBilhete(b, resultado, cam, getCotacaoEfetiva) : { vencedor: false, valorGanho: 0, itens: [] };
        const jogo = b.itens.map((i) => `${MODALIDADES[i.modalidade] || i.modalidade} ${i.numeros}${i.milharBrinde ? ` + Brinde ${i.milharBrinde}` : ""}`).join(" | ");
        return (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
            onClick={() => setDetalheBilhete(null)}
          >
            <div
              className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg bg-white p-6 shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-xl font-bold text-gray-800">Bilhete {b.codigo}</h2>
                <button
                  type="button"
                  onClick={() => setDetalheBilhete(null)}
                  className="rounded p-2 text-gray-500 hover:bg-gray-100"
                  aria-label="Fechar"
                >
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div className="space-y-2 text-sm text-gray-700">
                <p><strong>Cambista:</strong> {getCambistaNome(b.cambistaId)}</p>
                <p><strong>Data:</strong> {b.data.replace(",", " ")}</p>
                <p><strong>Extração:</strong> {b.extracaoNome}</p>
                <p><strong>Valor aposta:</strong> {formatarMoeda(b.total)}</p>
                <p><strong>Prêmio potencial:</strong> {formatarMoeda(cam ? calcularPremioPotencialBilhete(b, cam) : 0)}</p>
                <p><strong>Situação:</strong> {b.situacao}</p>
              </div>
              <div className="mt-4 border-t border-gray-200 pt-4">
                <p className="mb-2 font-medium text-gray-800">Jogos</p>
                <p className="text-sm text-gray-600">{jogo}</p>
              </div>
              {b.itens.length > 0 && (
                <ul className="mt-2 list-inside list-disc text-sm text-gray-600">
                  {b.itens.map((item, i) => (
                    <li key={i}>
                      {MODALIDADES[item.modalidade] || item.modalidade} {item.numeros} | {item.premio || "1/1"} — {formatarMoeda(item.valor)}
                      {item.milharBrinde && ` + Brinde ${item.milharBrinde}`}
                    </li>
                  ))}
                </ul>
              )}
              {resultado && (
                <div className="mt-4 rounded-lg border border-gray-200 bg-gray-50 p-3">
                  <p className="mb-2 font-medium text-gray-800">Conferência</p>
                  <p className={`font-bold ${conf.vencedor ? "text-green-700" : "text-gray-700"}`}>
                    {conf.vencedor ? `Vencedor ${formatarMoeda(conf.valorGanho)}` : "Perdedor"}
                  </p>
                  {conf.itens.some((x) => x.bateu) && (
                    <ul className="mt-1 list-inside list-disc text-xs text-gray-600">
                      {conf.itens.filter((x) => x.bateu).map((x, i) => (
                        <li key={i}>{MODALIDADES[x.item.modalidade]} {x.item.numeros}: {formatarMoeda(x.valorGanho)}</li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          </div>
        );
      })()}
    </div>
  );
}
