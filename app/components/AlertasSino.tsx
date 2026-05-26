"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { contarAlertasPendentes } from "@/lib/alertas";

/**
 * Sino de alertas com badge de quantidade.
 * Aparece no header do admin. Clicar leva pra /alertas.
 */
export function AlertasSino() {
  const [pendentes, setPendentes] = useState(0);

  useEffect(() => {
    const refresh = () => setPendentes(contarAlertasPendentes());
    refresh();
    const onChange = () => refresh();
    window.addEventListener("premiacoes_alertas_changed", onChange);
    // Refresh periódico baixo: backup pra o caso do evento não ser
    // disparado (ex.: alteração via realtime do Supabase em outra aba).
    const id = setInterval(refresh, 15_000);
    return () => {
      window.removeEventListener("premiacoes_alertas_changed", onChange);
      clearInterval(id);
    };
  }, []);

  return (
    <Link
      href="/alertas"
      className="relative inline-flex h-9 w-9 items-center justify-center rounded-full text-slate-300 transition hover:bg-slate-800/50 hover:text-white"
      aria-label={`${pendentes} alerta(s) pendente(s)`}
      title={pendentes > 0 ? `${pendentes} alerta(s) pendente(s)` : "Sem alertas pendentes"}
    >
      <svg
        className="h-5 w-5"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M15 17h5l-1.4-1.4A2 2 0 0118 14.2V11a6 6 0 10-12 0v3.2c0 .5-.2 1-.6 1.4L4 17h5m6 0a3 3 0 11-6 0"
        />
      </svg>
      {pendentes > 0 && (
        <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white shadow-sm ring-2 ring-slate-900">
          {pendentes > 99 ? "99+" : pendentes}
        </span>
      )}
    </Link>
  );
}
