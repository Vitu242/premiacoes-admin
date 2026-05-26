"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { contarAlertasPendentes } from "@/lib/alertas";

/** Versão do sino para o MobileHeader (cores adaptadas ao header claro/escuro). */
export function AlertasSinoMobile() {
  const [pendentes, setPendentes] = useState(0);

  useEffect(() => {
    const refresh = () => setPendentes(contarAlertasPendentes());
    refresh();
    const onChange = () => refresh();
    window.addEventListener("premiacoes_alertas_changed", onChange);
    const id = setInterval(refresh, 15_000);
    return () => {
      window.removeEventListener("premiacoes_alertas_changed", onChange);
      clearInterval(id);
    };
  }, []);

  return (
    <Link
      href="/alertas"
      className="relative inline-flex h-10 w-10 items-center justify-center rounded p-2 text-gray-600 hover:bg-gray-100 dark:text-slate-300 dark:hover:bg-slate-800"
      aria-label={`${pendentes} alerta(s) pendente(s)`}
      title={pendentes > 0 ? `${pendentes} alerta(s) pendente(s)` : "Sem alertas pendentes"}
    >
      <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M15 17h5l-1.4-1.4A2 2 0 0118 14.2V11a6 6 0 10-12 0v3.2c0 .5-.2 1-.6 1.4L4 17h5m6 0a3 3 0 11-6 0"
        />
      </svg>
      {pendentes > 0 && (
        <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[9px] font-bold text-white">
          {pendentes > 99 ? "99+" : pendentes}
        </span>
      )}
    </Link>
  );
}
