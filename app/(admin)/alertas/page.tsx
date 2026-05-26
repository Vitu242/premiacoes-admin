"use client";

import { useEffect, useState } from "react";
import {
  getAlertas,
  marcarComoResolvido,
  marcarTodosResolvidos,
  type AlertaCaixa,
} from "@/lib/alertas";
import { useToast } from "@/app/components/Toast";

function formatarMoeda(v: number | undefined): string {
  if (typeof v !== "number") return "—";
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatarDataHora(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

const TIPO_LABEL: Record<string, { label: string; cor: string }> = {
  bilhete_pago_para_perdedor: {
    label: "Bilhete reverteu (pago → perdedor)",
    cor: "bg-rose-100 text-rose-800 dark:bg-rose-950/50 dark:text-rose-200",
  },
  resultado_corrigido: {
    label: "Resultado corrigido",
    cor: "bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-200",
  },
  outro: {
    label: "Outro",
    cor: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200",
  },
};

export default function AlertasPage() {
  const toast = useToast();
  const [alertas, setAlertas] = useState<AlertaCaixa[]>([]);
  const [filtro, setFiltro] = useState<"pendentes" | "todos">("pendentes");

  const recarregar = () => setAlertas(getAlertas());

  useEffect(() => {
    recarregar();
    const onChange = () => recarregar();
    window.addEventListener("premiacoes_alertas_changed", onChange);
    return () => window.removeEventListener("premiacoes_alertas_changed", onChange);
  }, []);

  const lista = alertas.filter((a) =>
    filtro === "pendentes" ? !a.resolvido : true,
  );
  const pendentes = alertas.filter((a) => !a.resolvido).length;

  const handleResolver = (id: string) => {
    marcarComoResolvido(id);
    recarregar();
    toast.success("Alerta marcado como resolvido.");
  };

  const handleResolverTodos = () => {
    if (pendentes === 0) return;
    if (!confirm(`Marcar todos os ${pendentes} alertas como resolvidos?`)) return;
    marcarTodosResolvidos();
    recarregar();
    toast.success("Todos os alertas marcados como resolvidos.");
  };

  return (
    <div>
      <div className="mb-4 flex items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 dark:text-slate-100">
            Alertas
          </h1>
          <p className="mt-0.5 text-sm text-gray-600 dark:text-slate-300">
            Eventos que precisam da sua atenção (bilhetes que reverteram,
            resultados corrigidos, etc.).
          </p>
        </div>
        {pendentes > 0 && (
          <button
            type="button"
            onClick={handleResolverTodos}
            className="rounded bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700"
          >
            Resolver todos ({pendentes})
          </button>
        )}
      </div>

      <div className="mb-4 flex gap-2">
        <button
          type="button"
          onClick={() => setFiltro("pendentes")}
          className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
            filtro === "pendentes"
              ? "bg-rose-500 text-white"
              : "bg-slate-200 text-slate-700 hover:bg-slate-300 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
          }`}
        >
          Pendentes ({pendentes})
        </button>
        <button
          type="button"
          onClick={() => setFiltro("todos")}
          className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
            filtro === "todos"
              ? "bg-slate-700 text-white"
              : "bg-slate-200 text-slate-700 hover:bg-slate-300 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
          }`}
        >
          Todos ({alertas.length})
        </button>
      </div>

      <div className="space-y-3">
        {lista.length === 0 && (
          <div className="rounded-lg border-2 border-dashed border-gray-300 bg-white p-10 text-center dark:border-slate-700 dark:bg-slate-900">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400">
              <svg
                className="h-6 w-6"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M5 13l4 4L19 7"
                />
              </svg>
            </div>
            <p className="font-medium text-gray-700 dark:text-slate-200">
              {filtro === "pendentes"
                ? "Nenhum alerta pendente."
                : "Nenhum alerta registrado."}
            </p>
            <p className="mt-1 text-xs text-gray-500 dark:text-slate-400">
              Você é avisado aqui quando algo crítico acontece com o caixa.
            </p>
          </div>
        )}
        {lista.map((a) => {
          const meta = TIPO_LABEL[a.tipo] ?? TIPO_LABEL.outro;
          return (
            <div
              key={a.id}
              className={`overflow-hidden rounded-lg border bg-white shadow-sm dark:bg-slate-900 ${
                a.resolvido
                  ? "border-slate-200 opacity-70 dark:border-slate-700"
                  : "border-rose-200 dark:border-rose-900"
              }`}
            >
              <div className="flex flex-wrap items-center gap-2 border-b border-gray-100 bg-gray-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-800">
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${meta.cor}`}>
                  {meta.label}
                </span>
                <span className="text-[11px] text-gray-500 dark:text-slate-400">
                  {formatarDataHora(a.criadoEm)}
                </span>
                {a.resolvido && (
                  <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                    Resolvido{a.resolvidoEm ? ` em ${formatarDataHora(a.resolvidoEm)}` : ""}
                  </span>
                )}
              </div>
              <div className="p-3">
                <p className="text-sm font-bold text-gray-900 dark:text-slate-100">
                  {a.titulo}
                </p>
                <p className="mt-1 text-xs text-gray-600 dark:text-slate-300">
                  {a.detalhes}
                </p>
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-gray-500 dark:text-slate-400">
                  {a.cambistaNome && (
                    <span>
                      <strong>Cambista:</strong> {a.cambistaNome}
                    </span>
                  )}
                  {a.bilheteCodigo && (
                    <span>
                      <strong>Bilhete:</strong>{" "}
                      <span className="font-mono">{a.bilheteCodigo}</span>
                    </span>
                  )}
                  {a.extracaoNome && (
                    <span>
                      <strong>Extração:</strong> {a.extracaoNome}
                      {a.data ? ` (${a.data})` : ""}
                    </span>
                  )}
                  {typeof a.valor === "number" && (
                    <span>
                      <strong>Valor:</strong> {formatarMoeda(a.valor)}
                    </span>
                  )}
                </div>
              </div>
              {!a.resolvido && (
                <div className="border-t border-gray-100 dark:border-slate-700">
                  <button
                    type="button"
                    onClick={() => handleResolver(a.id)}
                    className="w-full bg-emerald-50 py-2.5 text-sm font-semibold text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950/30 dark:text-emerald-300 dark:hover:bg-emerald-950/50"
                  >
                    Marcar como resolvido
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
