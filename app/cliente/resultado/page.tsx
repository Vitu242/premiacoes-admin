"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getResultados } from "@/lib/store";

export default function ClienteResultadoPage() {
  const router = useRouter();
  const [resultados, setResultados] = useState(getResultados());
  const [filtroData, setFiltroData] = useState("");

  useEffect(() => {
    const auth = localStorage.getItem("premiacoes_cliente");
    if (!auth) {
      router.replace("/cliente/login");
      return;
    }
    setResultados(getResultados());
  }, [router]);

  const filtrar = resultados.filter((r) => {
    if (!filtroData) return true;
    const [y, m, d] = filtroData.split("-");
    const busca = `${d}/${m}/${y.slice(2)}`;
    return r.data.includes(busca);
  });

  return (
    <div className="min-h-screen bg-white p-4 pb-24">
      <div className="mb-4 flex items-center gap-2">
        <Link href="/cliente" className="rounded p-2 text-gray-600 hover:bg-gray-100">
          <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </Link>
        <h1 className="text-lg font-bold text-gray-800">Resultados</h1>
      </div>

      <div className="mb-4">
        <input
          type="date"
          value={filtroData}
          onChange={(e) => setFiltroData(e.target.value)}
          className="w-full rounded-xl border border-gray-300 px-4 py-3"
        />
      </div>

      <div className="space-y-3">
        {filtrar.length === 0 ? (
          <p className="py-8 text-center text-gray-500">Nenhum resultado encontrado para esta data.</p>
        ) : (
          [...filtrar].reverse().map((r) => (
            <div
              key={r.id}
              className="rounded-xl border border-gray-200 bg-gray-50 p-4"
            >
              <p className="text-sm text-gray-500">{r.data}</p>
              <p className="mt-1 font-bold text-gray-800">{r.extracaoNome}</p>
              <p className="mt-2 font-mono text-lg font-bold text-green-700">{r.grupos}</p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
