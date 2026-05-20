"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { getAdminCodigo } from "@/lib/auth";
import {
  analisarCambistasPrejuizo,
  type AnaliseCambista,
  type SeveridadeAlerta,
  type TendenciaPrejuizo,
} from "@/lib/analise-cambistas";
import { useVisibilityRefresh } from "@/lib/use-config-refresh";

function moeda(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

const SEVER_LABELS: Record<
  SeveridadeAlerta,
  { label: string; classes: string }
> = {
  critico: {
    label: "Crítico",
    classes: "bg-rose-100 text-rose-700 border-rose-300",
  },
  alto: {
    label: "Alto",
    classes: "bg-orange-100 text-orange-700 border-orange-300",
  },
  medio: {
    label: "Médio",
    classes: "bg-amber-100 text-amber-700 border-amber-300",
  },
  baixo: {
    label: "Baixo",
    classes: "bg-slate-100 text-slate-700 border-slate-300",
  },
};

const TEND_LABELS: Record<TendenciaPrejuizo, { txt: string; classes: string }> = {
  piorando: { txt: "↓ piorando", classes: "text-rose-600" },
  melhorando: { txt: "↑ melhorando", classes: "text-emerald-600" },
  estavel: { txt: "→ estável", classes: "text-slate-500" },
};

interface Props {
  /** Padrão: 30 dias. */
  diasAnalise?: number;
  /** Quantos itens mostrar na lista (resto vira "+ N"). Padrão: 5. */
  maxItens?: number;
  /** Mínimo de bilhetes para entrar no relatório. Padrão: 5. */
  minBilhetes?: number;
}

export default function AlertasCambistas({
  diasAnalise = 30,
  maxItens = 5,
  minBilhetes = 5,
}: Props) {
  const [analises, setAnalises] = useState<AnaliseCambista[]>([]);
  const codigo = getAdminCodigo();

  const refresh = useCallback(() => {
    if (!codigo) {
      setAnalises([]);
      return;
    }
    try {
      setAnalises(
        analisarCambistasPrejuizo({
          codigo,
          dias: diasAnalise,
          minBilhetes,
        }),
      );
    } catch {
      setAnalises([]);
    }
  }, [codigo, diasAnalise, minBilhetes]);

  useEffect(() => {
    refresh();
  }, [refresh]);
  useVisibilityRefresh(refresh);

  const topo = useMemo(() => analises.slice(0, maxItens), [analises, maxItens]);
  const totalCriticos = analises.filter((a) => a.severidade === "critico").length;
  const prejuizoTotal = analises.reduce((s, a) => s + a.lucro, 0);

  return (
    <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-t-lg bg-gray-800 px-3 py-2 text-white">
        <div className="text-xs font-semibold uppercase tracking-wide">
          Alertas inteligentes · últimos {diasAnalise} dias
        </div>
        <div className="flex items-center gap-2 text-[11px]">
          <span className="rounded-full bg-rose-500/20 px-2 py-0.5 font-bold text-rose-100">
            {analises.length} cambista(s) em prejuízo
          </span>
          {analises.length > 0 && (
            <span className="rounded-full bg-white/10 px-2 py-0.5 font-semibold text-white">
              {moeda(prejuizoTotal)}
            </span>
          )}
        </div>
      </div>

      <div className="p-3">
        {analises.length === 0 ? (
          <div className="rounded border border-dashed border-emerald-200 bg-emerald-50 p-4 text-center text-sm text-emerald-700">
            Nenhum cambista em prejuízo no período. Tudo certo por aqui.
          </div>
        ) : (
          <>
            {totalCriticos > 0 && (
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-rose-700">
                {totalCriticos} cambista(s) crítico(s) — atenção imediata
              </p>
            )}

            <ul className="space-y-2">
              {topo.map((a) => {
                const sev = SEVER_LABELS[a.severidade];
                const tend = TEND_LABELS[a.tendencia];
                return (
                  <li
                    key={a.cambista.id}
                    className="flex flex-col gap-2 rounded-md border border-gray-200 bg-gray-50 px-3 py-2 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase ${sev.classes}`}
                        >
                          {sev.label}
                        </span>
                        <span className="truncate text-sm font-semibold text-gray-900">
                          {a.cambista.login}
                        </span>
                        <span
                          className={`text-[11px] font-semibold ${tend.classes}`}
                        >
                          {tend.txt}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-gray-600">
                        {a.motivos.join(" ")}
                      </p>
                    </div>

                    <div className="text-right sm:min-w-[160px]">
                      <p className="text-[10px] uppercase tracking-wide text-gray-500">
                        Lucro líquido
                      </p>
                      <p className="text-base font-extrabold text-rose-700">
                        {moeda(a.lucro)}
                      </p>
                      <p className="text-[10px] text-gray-500">
                        Venda {moeda(a.venda)} · Prêmios {moeda(a.premio)}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>

            {analises.length > maxItens && (
              <p className="mt-2 text-right text-xs text-gray-500">
                + {analises.length - maxItens} cambista(s) com alerta.{" "}
                <Link href="/cambistas" className="text-orange-600 hover:underline">
                  Ver lista completa
                </Link>
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
