"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getSorteios } from "@/lib/store";

export default function ClienteSorteiosPage() {
  const router = useRouter();
  const [sorteios, setSorteios] = useState(getSorteios().filter((s) => s.ativo));

  useEffect(() => {
    const auth = localStorage.getItem("premiacoes_cliente");
    if (!auth) {
      router.replace("/cliente/login");
      return;
    }
    setSorteios(getSorteios().filter((s) => s.ativo));
  }, [router]);

  return (
    <div className="min-h-screen bg-white pb-24">
      <header className="sticky top-0 z-10 border-b border-gray-100 bg-white px-4 py-4">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => router.back()}
            className="rounded p-2 text-gray-600 hover:bg-gray-100"
            aria-label="Voltar"
          >
            <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h1 className="text-lg font-bold text-gray-800">Sorteios</h1>
        </div>
      </header>

      <div className="mx-4 mt-4">
        <p className="mb-4 text-sm text-gray-600">
          Sorteios e eventos ativos cadastrados pela banca.
        </p>

        {sorteios.length === 0 ? (
          <div className="rounded-xl bg-gray-50 p-8 text-center text-gray-500">
            <p className="mb-2">Nenhum sorteio ativo no momento.</p>
            <Link href="/cliente" className="text-sm text-orange-600 hover:underline">
              Voltar ao início
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {sorteios.map((s) => (
              <div
                key={s.id}
                className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm"
              >
                <h2 className="font-semibold text-gray-800">{s.nome}</h2>
                <p className="mt-1 text-sm text-gray-500">Data: {s.data}</p>
                {s.descricao && (
                  <p className="mt-2 text-sm text-gray-600 whitespace-pre-wrap">{s.descricao}</p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
