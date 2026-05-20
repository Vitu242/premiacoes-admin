"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { getResultados } from "@/lib/store";
import { useVisibilityRefresh } from "@/lib/use-config-refresh";
import { hojeIsoDate, isSameIsoInputDate, formatarDataBr } from "@/lib/date-utils";
import type { Resultado } from "@/lib/types";

function premiosDoResultado(r: Resultado): Array<{ premio: number; grupos: string }> {
  const lista: Array<{ premio: number; grupos: string }> = [];
  for (let p = 1; p <= 10; p++) {
    const grupos = r.premios?.[p] ?? (p === 1 ? r.grupos : "");
    if (grupos?.trim()) lista.push({ premio: p, grupos: grupos.trim() });
  }
  return lista;
}

export default function ClienteResultadoPage() {
  const router = useRouter();
  const [resultados, setResultados] = useState(getResultados());
  const [filtroData, setFiltroData] = useState(() => hojeIsoDate());

  useEffect(() => {
    const auth = localStorage.getItem("premiacoes_cliente");
    if (!auth) {
      router.replace("/cliente");
      return;
    }
    setResultados(getResultados());
  }, [router]);

  useVisibilityRefresh(() => setResultados(getResultados()));

  const filtrar = resultados.filter((r) => {
    return isSameIsoInputDate(r.data, filtroData);
  });

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white p-4 pb-28 dark:from-slate-950 dark:to-slate-900">
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
        <h1 className="text-lg font-bold text-slate-800 dark:text-slate-100">Resultados</h1>
      </div>

      <div className="mb-4">
        <input
          type="date"
          value={filtroData}
          onChange={(e) => setFiltroData(e.target.value)}
          className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
        />
      </div>

      <div className="space-y-3">
        {filtrar.length === 0 ? (
          <p className="py-8 text-center text-slate-600 dark:text-slate-400">Nenhum resultado encontrado para esta data.</p>
        ) : (
          [...filtrar].reverse().map((r) => {
            const premios = premiosDoResultado(r);
            return (
              <div
                key={r.id}
                className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800"
              >
                <p className="text-sm text-slate-500 dark:text-slate-400">{formatarDataBr(r.data)}</p>
                <p className="mt-1 font-bold text-slate-900 dark:text-slate-100">{r.extracaoNome}</p>
                <div className="mt-3 space-y-2">
                  {premios.map((p) => (
                    <div
                      key={p.premio}
                      className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2 dark:bg-slate-900/60"
                    >
                      <span className="text-sm font-semibold text-slate-600 dark:text-slate-300">
                        {p.premio}º prêmio
                      </span>
                      <span className="font-mono text-lg font-bold text-green-700 dark:text-green-400">
                        {p.grupos}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
