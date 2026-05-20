"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  getBilhetes,
  getCambistas,
  getExtracoes,
  getTempoCancelamentoMinutos,
  getResultadoByExtracaoData,
  podeCancelarBilhete,
  cancelarBilhete,
  calcularComissaoBilhete,
  getCotacaoEfetiva,
  getConfig,
  getPremioMilharBrinde,
  podeImprimirSegundaVia,
} from "@/lib/store";
import { conferirBilhete } from "@/lib/conferencia";
import type { Bilhete, Extracao } from "@/lib/types";

import { parseDataPtBrOuIso, hojeIsoDate, isSameIsoInputDate, formatarDataHoraBr } from "@/lib/date-utils";
import { ordenarBilhetesRecentesPrimeiro } from "@/lib/list-order";
import { COTACOES_LABELS } from "@/lib/cotacoes";
import { useConfigRefresh, useVisibilityRefresh } from "@/lib/use-config-refresh";
import PrintTermicaBtn from "@/app/components/PrintTermicaBtn";
import BilheteDetalhado from "@/app/components/BilheteDetalhado";
import CompartilharBilheteBtn from "@/app/components/CompartilharBilheteBtn";
import { useBranding } from "@/app/components/BrandingProvider";

const MODALIDADES: Record<string, string> = {
  grupo: "GRUPO",
  dezena: "DEZENA",
  centena: "CENTENA",
  milhar: "MILHAR",
  ...Object.fromEntries(Object.entries(COTACOES_LABELS).map(([k, v]) => [k, v.toUpperCase()])),
};

function formatarMoeda(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatarData(s: string) {
  return formatarDataHoraBr(s);
}

export default function ClienteBilhetePage() {
  const router = useRouter();
  const { branding } = useBranding();
  const bilheteRef = useRef<HTMLDivElement>(null);
  const [cambistaId, setCambistaId] = useState<string | null>(null);
  const [codigoBanca, setCodigoBanca] = useState("");
  const [filtroSituacao, setFiltroSituacao] = useState("todos");
  const [filtroData, setFiltroData] = useState<string>(() => hojeIsoDate());
  const [filtroCodigo, setFiltroCodigo] = useState("");
  const [bilhetes, setBilhetes] = useState<Bilhete[]>([]);
  const [detalhe, setDetalhe] = useState<Bilhete | null>(null);
  const [textoBilhete, setTextoBilhete] = useState("");

  const cambistas = getCambistas();
  const extracoes = getExtracoes();
  const tempoCancel = getTempoCancelamentoMinutos();
  const cfg = getConfig();
  const tempoSegundaVia = cfg.tempoSegundaViaMinutos ?? 60;

  useEffect(() => {
    const auth = localStorage.getItem("premiacoes_cliente");
    if (!auth) {
      router.replace("/cliente");
      return;
    }
    const { cambistaId: cid, codigo: c } = JSON.parse(auth);
    setCambistaId(cid);
    setCodigoBanca(c || "");
    const cfg = getConfig();
    setTextoBilhete(cfg.textoRodapeBilhete ?? "");
  }, [router]);

  useConfigRefresh((c) => {
    setTextoBilhete(c.textoRodapeBilhete ?? "");
  });

  const aplicarFiltros = useCallback(() => {
    if (!cambistaId) return;
    let lista = getBilhetes().filter((b) => b.cambistaId === cambistaId);
    if (filtroSituacao !== "todos") {
      lista = lista.filter((b) => b.situacao === filtroSituacao);
    }
    if (filtroData) {
      lista = lista.filter((b) => isSameIsoInputDate(b.data, filtroData));
    }
    if (filtroCodigo.trim()) {
      lista = lista.filter((b) => b.codigo.includes(filtroCodigo.trim()));
    }
    setBilhetes(ordenarBilhetesRecentesPrimeiro(lista));
  }, [cambistaId, filtroSituacao, filtroData, filtroCodigo]);

  useVisibilityRefresh(aplicarFiltros);

  useEffect(() => {
    aplicarFiltros();
  }, [aplicarFiltros]);

  const cambista = cambistaId ? cambistas.find((c) => c.id === cambistaId) : null;
  const bancaNome = codigoBanca ? codigoBanca.charAt(0).toUpperCase() + codigoBanca.slice(1) + " Premiações" : "Premiações";

  const handleCancelar = async (b: Bilhete) => {
    const ext = extracoes.find((e) => e.id === b.extracaoId);
    if (b.situacao !== "pendente") {
      alert("Só é possível cancelar bilhetes pendentes.");
      return;
    }
    if (!ext || !podeCancelarBilhete(b, ext, tempoCancel)) {
      const msg = ext
        ? `Não é mais possível cancelar: passou do tempo limite (${tempoCancel} min após a aposta) ou do horário de encerramento da extração (${ext.encerra}).`
        : `Não é mais possível cancelar: passou do tempo limite (${tempoCancel} min) ou do horário da extração.`;
      alert(msg);
      return;
    }
    if (!confirm("Cancelar este bilhete?")) return;
    if (await cancelarBilhete(b.id)) {
      setBilhetes((prev) => prev.map((x) => (x.id === b.id ? { ...x, situacao: "cancelado" as const } : x)));
      setDetalhe((prev) => (prev?.id === b.id ? { ...prev, situacao: "cancelado" as const } : prev));
    }
  };

  const getExtracao = (b: Bilhete): Extracao | undefined => extracoes.find((e) => e.id === b.extracaoId);
  const podeCancelar = (b: Bilhete) => {
    const ext = getExtracao(b);
    return ext ? podeCancelarBilhete(b, ext, tempoCancel) : false;
  };
  const getComissao = (b: Bilhete) => (cambista ? calcularComissaoBilhete(b, cambista) : 0);

  if (!cambista) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white dark:bg-slate-950">
        <p className="text-gray-500 dark:text-slate-400">Carregando...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white pb-28 dark:from-slate-950 dark:to-slate-900">
      {/* Header */}
      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-slate-200/60 bg-white/85 px-4 py-3 backdrop-blur-md dark:border-slate-800 dark:bg-slate-900/85">
        <button
          type="button"
          onClick={() => router.push("/cliente")}
          className="rounded-full p-2 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
          aria-label="Voltar"
        >
          <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2.2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h1 className="text-base font-bold text-slate-800 dark:text-slate-100">Meus bilhetes</h1>
        <div className="w-9" />
      </header>

      {/* Filtros */}
      <div className="border-b border-gray-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-900/80">
        <div className="flex flex-wrap gap-2">
          <select
            value={filtroSituacao}
            onChange={(e) => setFiltroSituacao(e.target.value)}
            className="rounded border border-gray-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
          >
            <option value="todos">Todos</option>
            <option value="pendente">Pendente</option>
            <option value="pago">Pago</option>
            <option value="perdedor">Perdedor</option>
            <option value="cancelado">Cancelado</option>
          </select>
          <input
            type="date"
            value={filtroData}
            onChange={(e) => setFiltroData(e.target.value)}
            className="rounded border border-gray-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
          />
          {filtroData && (
            <button
              type="button"
              onClick={() => setFiltroData("")}
              className="rounded border border-gray-300 bg-white px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
              title="Ver bilhetes de todas as datas"
            >
              Ver todos
            </button>
          )}
          <input
            type="text"
            placeholder="Código"
            value={filtroCodigo}
            onChange={(e) => setFiltroCodigo(e.target.value)}
            className="flex-1 min-w-[100px] rounded border border-gray-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500"
          />
          {/* Botão "Buscar" removido — filtros são aplicados automaticamente
              via useEffect com aplicarFiltros como dependência. */}
        </div>
      </div>

      {/* Lista de bilhetes */}
      <div className="space-y-3 p-4">
        {bilhetes.length === 0 ? (
          <div className="rounded-2xl border-2 border-dashed border-slate-200 p-12 text-center dark:border-slate-700">
            <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-slate-100 text-slate-400 dark:bg-slate-800">
              <svg className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M3 8a2 2 0 012-2h14a2 2 0 012 2v2a2 2 0 100 4v2a2 2 0 01-2 2H5a2 2 0 01-2-2v-2a2 2 0 100-4V8z"/></svg>
            </div>
            <p className="font-medium text-slate-700 dark:text-slate-200">Nenhum bilhete encontrado</p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Tente ajustar os filtros ou faça uma nova venda</p>
          </div>
        ) : (
          bilhetes.map((b) => {
            const cor =
              b.situacao === "pago" ? "border-emerald-300 bg-emerald-50/40 dark:bg-emerald-900/10" :
              b.situacao === "cancelado" ? "border-rose-200 bg-rose-50/40 dark:bg-rose-900/10" :
              b.situacao === "perdedor" ? "border-slate-200 bg-slate-50/40 dark:bg-slate-800/40" :
              "border-amber-200 bg-amber-50/40 dark:bg-amber-900/10";
            const badge =
              b.situacao === "pago" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-200" :
              b.situacao === "cancelado" ? "bg-rose-100 text-rose-700 dark:bg-rose-900/50 dark:text-rose-200" :
              b.situacao === "perdedor" ? "bg-red-100 text-red-700 ring-1 ring-red-200 dark:bg-red-900/50 dark:text-red-200 dark:ring-red-800" :
              "bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200";
            const label =
              b.situacao === "pago" ? "Pago" :
              b.situacao === "cancelado" ? "Cancelado" :
              b.situacao === "perdedor" ? "Sem prêmio" :
              "Aguardando";
            return (
            <div
              key={b.id}
              className={`overflow-hidden rounded-2xl border bg-white shadow-sm transition-all hover:shadow-md dark:bg-slate-800 ${cor}`}
            >
              <div className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-300">Bilhete</span>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${badge}`}>{label}</span>
                  </div>
                  <p className="mt-0.5 font-mono text-xl font-extrabold tracking-wide text-slate-800 dark:text-slate-100">
                    {b.codigo}
                  </p>
                  <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
                    {b.extracaoNome} · {formatarData(b.data)}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-3 text-[11px]">
                    <span className="text-slate-700 dark:text-slate-200">
                      <span className="text-slate-500 dark:text-slate-400">Total:</span>{" "}
                      <strong className="text-slate-900 dark:text-white">{formatarMoeda(b.total)}</strong>
                    </span>
                    <span className="text-slate-700 dark:text-slate-200">
                      <span className="text-slate-500 dark:text-slate-400">Comissão:</span>{" "}
                      <span className="font-medium text-slate-900 dark:text-white">{formatarMoeda(getComissao(b))}</span>
                    </span>
                  </div>
                </div>
              </div>
              {b.situacao === "pendente" && podeCancelar(b) && (
                <button
                  onClick={() => handleCancelar(b)}
                  className="mt-3 w-full rounded bg-red-600 py-2 text-sm font-medium text-white hover:bg-red-700"
                >
                  CANCELAR
                </button>
              )}
              <button
                onClick={() => setDetalhe(detalhe?.id === b.id ? null : b)}
                className="mt-2 w-full rounded border border-gray-300 py-2 text-sm font-medium text-slate-800 hover:bg-gray-50 dark:border-slate-500 dark:bg-slate-700/80 dark:text-slate-50 dark:hover:bg-slate-600"
              >
                {detalhe?.id === b.id ? "Ocultar detalhes" : "Ver detalhes"}
              </button>

              {/* Detalhe expandido — layout fiel ao recibo da banca */}
              {detalhe?.id === b.id && (() => {
                const resultado = getResultadoByExtracaoData(b.extracaoId, b.data);
                const conf = conferirBilhete(b, resultado, cambista ?? null, getCotacaoEfetiva, getPremioMilharBrinde());
                const captionShare = `Bilhete ${b.codigo}\n${b.extracaoNome}\nTotal: ${formatarMoeda(b.total)}`;
                return (
                <div className="mt-4 border-t border-gray-100 pt-4">
                  <BilheteDetalhado
                    ref={bilheteRef}
                    bilhete={b}
                    bancaNome={branding.displayName || bancaNome}
                    cambistaNome={cambista?.login ?? ""}
                    cotacaoPara={(mod) => cambista ? getCotacaoEfetiva(cambista, mod as never) : 0}
                    rodapeTexto={branding.bilheteRodape || textoBilhete || undefined}
                    logoUrl={branding.logoUrl ?? null}
                  />

                  {/* Conferência (não vai pra imagem; fica abaixo do bilhete) */}
                  <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800">
                    <p className="mb-2 text-sm font-semibold text-slate-800 dark:text-slate-100">Conferência</p>
                    {resultado ? (
                      <>
                        <p className={`text-lg font-bold ${conf.vencedor ? "text-emerald-700" : "text-slate-600 dark:text-slate-300"}`}>
                          {conf.vencedor ? `Vencedor — ${formatarMoeda(conf.valorGanho)}` : "Sem prêmio nesta extração"}
                        </p>
                        {conf.itens.some((x) => x.bateu) && (
                          <ul className="mt-1 list-inside list-disc text-xs text-slate-600 dark:text-slate-300">
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
                      <p className="text-sm text-slate-500 dark:text-slate-400">Aguardando resultado da extração.</p>
                    )}
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    <Link
                      href="/cliente"
                      className="flex-1 min-w-[80px] rounded-lg bg-blue-100 py-2 text-center text-sm font-medium text-blue-700 dark:bg-blue-900/40 dark:text-blue-300"
                    >
                      Início
                    </Link>

                    <CompartilharBilheteBtn
                      targetRef={bilheteRef}
                      caption={captionShare}
                      filename={`bilhete-${b.codigo}.png`}
                      label="Enviar"
                      className="flex-1 min-w-[100px]"
                    />

                    {podeImprimirSegundaVia(b.data, tempoSegundaVia) ? (
                      <>
                        <button
                          onClick={() => window.print()}
                          className="flex-1 min-w-[80px] rounded-lg bg-slate-700 py-2 text-sm font-medium text-white hover:bg-slate-800"
                        >
                          Imprimir
                        </button>
                        <PrintTermicaBtn
                          className="flex-1 min-w-[80px]"
                          bilhete={{
                            banca: branding.displayName || bancaNome,
                            codigo: b.codigo,
                            data: b.data,
                            cambista: cambista?.login ?? "",
                            extracaoNome: b.extracaoNome,
                            itens: b.itens.map((it) => ({
                              modalidade: MODALIDADES[it.modalidade] || it.modalidade,
                              numeros: it.numeros,
                              valor: it.valor,
                              premio: it.premio,
                            })),
                            total: b.total,
                            rodape: branding.bilheteRodape || textoBilhete || undefined,
                          }}
                        />
                      </>
                    ) : (
                      <span className="flex-1 min-w-[80px] rounded-lg bg-gray-200 py-2 text-center text-xs text-gray-500 dark:bg-slate-700 dark:text-slate-400">
                        2ª via: prazo de {tempoSegundaVia} min expirado
                      </span>
                    )}
                  </div>
                </div>
                );
              })()}
              </div>
            </div>
            );
          })
        )}
      </div>
    </div>
  );
}
