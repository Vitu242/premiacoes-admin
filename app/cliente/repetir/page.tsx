"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  getBilhetes,
  getCambistas,
  getExtracoes,
  extracaoAceitaApostas,
  extracaoRodaHoje,
  addBilhete,
  podeRealizarVenda,
  getSaldoDisponivel,
  getCotacaoEfetiva,
  getConfig,
} from "@/lib/store";
import type { Bilhete, Extracao, ItemBilhete } from "@/lib/types";
import { COTACOES_LABELS, modalidadePodeApostar } from "@/lib/cotacoes";
import type { StatusModalidade } from "@/lib/cotacoes";
import { hojeIsoDate, isSameIsoInputDate, parseDataPtBrOuIso, formatarDataHoraBr } from "@/lib/date-utils";
import { useVisibilityRefresh } from "@/lib/use-config-refresh";

type Step = "bilhetes" | "extracao" | "confirmar";

function formatarMoeda(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function formatarData(s: string) {
  return formatarDataHoraBr(s);
}

export default function ClienteRepetirPage() {
  const router = useRouter();
  const [cambistaId, setCambistaId] = useState<string | null>(null);
  const [step, setStep] = useState<Step>("bilhetes");
  const [filtroData, setFiltroData] = useState<string>(() => hojeIsoDate());
  const [todos, setTodos] = useState<Bilhete[]>([]);
  const [bilheteSelecionado, setBilheteSelecionado] = useState<Bilhete | null>(null);
  const [extracaoSelecionada, setExtracaoSelecionada] = useState<Extracao | null>(null);
  const [erro, setErro] = useState<string>("");
  const [sucesso, setSucesso] = useState<{ codigo: string } | null>(null);
  const [enviando, setEnviando] = useState(false);

  const carregar = () => setTodos(getBilhetes());

  useEffect(() => {
    const auth = localStorage.getItem("premiacoes_cliente");
    if (!auth) {
      router.replace("/cliente");
      return;
    }
    const { cambistaId: cid } = JSON.parse(auth);
    setCambistaId(cid);
    carregar();
  }, [router]);

  useVisibilityRefresh(carregar);

  const cambista = cambistaId ? getCambistas().find((c) => c.id === cambistaId) : null;
  const cfg = getConfig() as {
    modalidades?: Record<
      string,
      { minValor?: number; maxValor?: number; ativa?: boolean; status?: StatusModalidade }
    >;
  };
  const modalidadesCfg = cfg.modalidades ?? null;

  const bilhetesDoCambista = useMemo(
    () =>
      cambistaId
        ? todos.filter((b) => b.cambistaId === cambistaId && b.situacao !== "cancelado")
        : [],
    [todos, cambistaId],
  );

  const bilhetesFiltrados = useMemo(
    () =>
      bilhetesDoCambista
        .filter((b) => !filtroData || isSameIsoInputDate(b.data, filtroData))
        .sort((a, b) => {
          const da = parseDataPtBrOuIso(a.data)?.getTime() ?? 0;
          const db = parseDataPtBrOuIso(b.data)?.getTime() ?? 0;
          return db - da;
        }),
    [bilhetesDoCambista, filtroData],
  );

  const extracoesDisponiveis = useMemo(
    () =>
      getExtracoes().filter(
        (e) => e.ativa && extracaoAceitaApostas(e.encerra) && extracaoRodaHoje(e),
      ),
    [],
  );

  const irParaExtracoes = (b: Bilhete) => {
    setErro("");
    setBilheteSelecionado(b);
    setExtracaoSelecionada(null);
    setStep("extracao");
  };

  const escolherExtracao = (e: Extracao) => {
    setErro("");
    if (!extracaoAceitaApostas(e.encerra)) {
      setErro("Esta extração já encerrou apostas.");
      return;
    }
    setExtracaoSelecionada(e);
    setStep("confirmar");
  };

  const totalOriginal = bilheteSelecionado?.total ?? 0;

  const confirmarRepeticao = async () => {
    setErro("");
    if (!bilheteSelecionado || !extracaoSelecionada || !cambistaId || !cambista) return;

    if (!extracaoAceitaApostas(extracaoSelecionada.encerra)) {
      setErro("Esta extração acabou de encerrar. Escolha outra.");
      setStep("extracao");
      return;
    }

    for (const it of bilheteSelecionado.itens) {
      const cfgMod = modalidadesCfg?.[it.modalidade];
      if (cfgMod) {
        if (!modalidadePodeApostar(cfgMod)) {
          setErro(
            `A modalidade ${COTACOES_LABELS[it.modalidade] ?? it.modalidade} está bloqueada pela banca.`,
          );
          return;
        }
        const min = cfgMod.minValor ?? 0;
        const max = cfgMod.maxValor ?? 0;
        if (min > 0 && it.valor < min) {
          setErro(
            `Valor mínimo para ${COTACOES_LABELS[it.modalidade] ?? it.modalidade}: ${formatarMoeda(min)}.`,
          );
          return;
        }
        if (max > 0 && it.valor > max) {
          setErro(
            `Valor máximo para ${COTACOES_LABELS[it.modalidade] ?? it.modalidade}: ${formatarMoeda(max)}.`,
          );
          return;
        }
      }
    }

    const check = podeRealizarVenda(cambistaId, totalOriginal);
    if (!check.ok) {
      setErro(check.erro ?? "Saldo insuficiente.");
      return;
    }

    try {
      setEnviando(true);
      let milharBrindeAplicada = false;
      const itens: ItemBilhete[] = bilheteSelecionado.itens.map((it) => {
        const manterBrinde = !!it.milharBrinde && !milharBrindeAplicada;
        if (manterBrinde) milharBrindeAplicada = true;
        return {
          modalidade: it.modalidade,
          numeros: it.numeros,
          valor: it.valor,
          premio: it.premio,
          ...(manterBrinde ? { milharBrinde: it.milharBrinde } : {}),
        };
      });
      const novo = await addBilhete({
        cambistaId,
        extracaoId: extracaoSelecionada.id,
        extracaoNome: extracaoSelecionada.nome,
        itens,
        total: totalOriginal,
        data: new Date().toLocaleString("pt-BR"),
        situacao: "pendente",
      });
      setSucesso({ codigo: novo.codigo });
      carregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao repetir o bilhete.");
    } finally {
      setEnviando(false);
    }
  };

  const reiniciar = () => {
    setSucesso(null);
    setBilheteSelecionado(null);
    setExtracaoSelecionada(null);
    setErro("");
    setStep("bilhetes");
  };

  const voltar = () => {
    if (sucesso) {
      reiniciar();
      return;
    }
    if (step === "confirmar") {
      setStep("extracao");
      return;
    }
    if (step === "extracao") {
      setStep("bilhetes");
      setBilheteSelecionado(null);
      setExtracaoSelecionada(null);
      return;
    }
    router.push("/cliente");
  };

  if (!cambista) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white dark:bg-slate-950">
        <p className="text-gray-500 dark:text-slate-400">Carregando...</p>
      </div>
    );
  }

  if (sucesso) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-emerald-50 to-white p-4 pb-24 dark:from-slate-900 dark:to-slate-950">
        <div className="mx-auto w-full max-w-md rounded-3xl border border-emerald-100 bg-white p-8 text-center shadow-xl dark:border-slate-700 dark:bg-slate-800">
          <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/40">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={3}
              className="h-10 w-10 text-emerald-600 dark:text-emerald-400"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100">
            Bilhete repetido!
          </h2>
          <p className="mt-2 text-slate-600 dark:text-slate-300">Código do novo bilhete</p>
          <p className="mt-1 font-mono text-3xl font-extrabold tracking-wide text-emerald-600">
            {sucesso.codigo}
          </p>
          <div className="mt-8 flex gap-3">
            <button
              onClick={reiniciar}
              className="flex-1 rounded-xl bg-emerald-600 py-3 font-semibold text-white shadow-md hover:bg-emerald-700"
            >
              Repetir outro
            </button>
            <Link
              href="/cliente/bilhete"
              className="flex-1 rounded-xl border border-slate-300 py-3 font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300"
            >
              Ver bilhetes
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white pb-28 dark:from-slate-950 dark:to-slate-900">
      <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-slate-200/60 bg-white/85 px-4 py-3 backdrop-blur-md dark:border-slate-800 dark:bg-slate-900/85">
        <button
          onClick={voltar}
          className="rounded-full p-2 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
          aria-label="Voltar"
        >
          <svg
            className="h-5 w-5"
            fill="none"
            stroke="currentColor"
            strokeWidth={2.2}
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <div className="flex-1">
          <h1 className="text-base font-bold text-slate-800 dark:text-slate-100">
            Repetir bilhete
          </h1>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            {step === "bilhetes"
              ? "Passo 1 · escolha um bilhete"
              : step === "extracao"
                ? "Passo 2 · escolha a extração"
                : "Passo 3 · confirme a repetição"}
          </p>
        </div>
      </header>

      <div className="p-4">
        {erro && (
          <div className="mb-4 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700 dark:border-rose-800 dark:bg-rose-900/30 dark:text-rose-200">
            <svg
              className="mt-0.5 h-4 w-4 shrink-0"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
            >
              <circle cx="12" cy="12" r="10" />
              <path strokeLinecap="round" d="M12 8v4M12 16h.01" />
            </svg>
            {erro}
          </div>
        )}

        {/* Passo 1 — bilhetes do cambista (default: hoje) */}
        {step === "bilhetes" && (
          <div>
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <input
                type="date"
                value={filtroData}
                onChange={(e) => setFiltroData(e.target.value)}
                className="rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
              />
              {filtroData && (
                <button
                  type="button"
                  onClick={() => setFiltroData("")}
                  className="rounded border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                  title="Mostrar bilhetes de todas as datas"
                >
                  Ver todos
                </button>
              )}
            </div>
            <p className="mb-3 text-sm text-slate-600 dark:text-slate-300">
              {filtroData
                ? `Bilhetes de ${filtroData.split("-").reverse().join("/")}`
                : "Todos os seus bilhetes"}{" "}
              ({bilhetesFiltrados.length})
            </p>

            {bilhetesFiltrados.length === 0 ? (
              <div className="rounded-2xl border-2 border-dashed border-slate-200 p-12 text-center dark:border-slate-700">
                <p className="font-medium text-slate-700 dark:text-slate-200">
                  Nenhum bilhete encontrado
                </p>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  Ajuste a data ou faça uma nova venda.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {bilhetesFiltrados.map((b) => (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => irParaExtracoes(b)}
                    className="w-full rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-emerald-300 hover:shadow-md dark:border-slate-700 dark:bg-slate-800 dark:hover:border-emerald-700"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-mono text-base font-extrabold text-slate-900 dark:text-white">
                          {b.codigo}
                        </p>
                        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                          {b.extracaoNome} · {formatarData(b.data)}
                        </p>
                      </div>
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200">
                        {formatarMoeda(b.total)}
                      </span>
                    </div>
                    <div className="mt-2 space-y-0.5">
                      {b.itens.slice(0, 3).map((it, i) => (
                        <p
                          key={i}
                          className="truncate text-xs text-slate-600 dark:text-slate-300"
                        >
                          <span className="font-semibold">
                            {COTACOES_LABELS[it.modalidade] ?? it.modalidade}
                          </span>{" "}
                          {it.numeros}
                          <span className="text-slate-400 dark:text-slate-500">
                            {" "}
                            · {formatarMoeda(it.valor)}
                          </span>
                        </p>
                      ))}
                      {b.itens.length > 3 && (
                        <p className="text-[10px] text-slate-500 dark:text-slate-400">
                          +{b.itens.length - 3} jogo(s)
                        </p>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Passo 2 — escolher extração para a repetição */}
        {step === "extracao" && bilheteSelecionado && (
          <div>
            <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm dark:border-emerald-800 dark:bg-emerald-900/30">
              <p className="text-emerald-900 dark:text-emerald-200">
                Repetindo o bilhete{" "}
                <strong className="font-mono">{bilheteSelecionado.codigo}</strong> (
                {bilheteSelecionado.itens.length} jogo(s) ·{" "}
                {formatarMoeda(bilheteSelecionado.total)})
              </p>
              <p className="mt-1 text-xs text-emerald-800 dark:text-emerald-300">
                Original: {bilheteSelecionado.extracaoNome} ·{" "}
                {formatarData(bilheteSelecionado.data)}
              </p>
            </div>
            <p className="mb-3 text-slate-700 dark:text-slate-200">
              Escolha a extração em que deseja repetir:
            </p>
            {extracoesDisponiveis.length === 0 ? (
              <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-950/50 dark:text-amber-200">
                Nenhuma extração disponível agora (todas encerraram ou estão inativas).
              </p>
            ) : (
              <div className="space-y-2">
                {extracoesDisponiveis.map((e) => (
                  <button
                    key={e.id}
                    type="button"
                    onClick={() => escolherExtracao(e)}
                    className="w-full rounded-xl bg-slate-100 px-4 py-4 text-left transition hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700"
                  >
                    <span className="font-medium text-slate-900 dark:text-slate-100">
                      {e.nome}
                    </span>
                    <span className="ml-2 text-sm text-slate-600 dark:text-slate-300">
                      Encerra às {e.encerra}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Passo 3 — confirmação com os jogos na extração escolhida */}
        {step === "confirmar" && bilheteSelecionado && extracaoSelecionada && (
          <div>
            <div className="mb-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800">
              <p className="text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Extração escolhida
              </p>
              <p className="mt-1 text-lg font-extrabold text-slate-900 dark:text-white">
                {extracaoSelecionada.nome}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Encerra às {extracaoSelecionada.encerra}
              </p>
              <p className="mt-2 text-[11px] text-slate-500 dark:text-slate-400">
                Origem:{" "}
                <span className="font-mono font-semibold">{bilheteSelecionado.codigo}</span> ·{" "}
                {bilheteSelecionado.extracaoNome}
              </p>
            </div>

            <div className="mb-2 flex items-center justify-between">
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                Jogos que serão registrados
              </p>
              <span className="text-xs text-slate-500 dark:text-slate-400">
                {bilheteSelecionado.itens.length} jogo(s)
              </span>
            </div>
            <div className="space-y-2">
              {bilheteSelecionado.itens.map((it, i) => {
                const label = COTACOES_LABELS[it.modalidade] ?? it.modalidade;
                const cotacao = getCotacaoEfetiva(cambista, it.modalidade);
                return (
                  <div
                    key={i}
                    className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-800"
                  >
                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                      <span className="text-sm font-bold">{i + 1}</span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                        {label}{" "}
                        <span className="text-xs font-normal text-slate-600 dark:text-slate-400">
                          · prêmio {it.premio ?? "1/1"}
                        </span>
                      </p>
                      <p className="truncate font-mono text-base font-bold text-emerald-600 dark:text-emerald-400">
                        {it.numeros}
                      </p>
                      {it.milharBrinde && (
                        <p className="text-[10px] text-emerald-600">
                          Brinde: {it.milharBrinde}
                        </p>
                      )}
                      <p className="text-[10px] text-slate-500 dark:text-slate-400">
                        Cotação: {formatarMoeda(cotacao)}
                      </p>
                    </div>
                    <p className="text-sm font-extrabold text-slate-900 dark:text-white">
                      {formatarMoeda(it.valor)}
                    </p>
                  </div>
                );
              })}
            </div>

            <div className="mt-4 flex items-baseline justify-between rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-900/50">
              <span className="text-sm text-slate-600 dark:text-slate-400">Total</span>
              <span className="text-2xl font-extrabold text-slate-900 dark:text-white">
                {formatarMoeda(totalOriginal)}
              </span>
            </div>
            <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
              Disponível para venda:{" "}
              <strong>{formatarMoeda(getSaldoDisponivel(cambista))}</strong>
            </p>

            <button
              type="button"
              onClick={confirmarRepeticao}
              disabled={enviando}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-br from-emerald-500 to-green-600 py-3.5 text-base font-bold text-white shadow-lg shadow-emerald-500/30 transition-all active:scale-[0.99] disabled:cursor-not-allowed disabled:from-slate-400 disabled:to-slate-400 disabled:shadow-none"
            >
              <svg
                className="h-5 w-5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2.5}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
              {enviando ? "Enviando..." : "Confirmar e gerar bilhete"}
            </button>
            <p className="mt-2 text-center text-[11px] text-slate-500 dark:text-slate-400">
              Os mesmos números, valores e prêmios serão registrados em{" "}
              <strong>{extracaoSelecionada.nome}</strong>.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
