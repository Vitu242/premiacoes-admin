"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getCambistas } from "@/lib/store";

function formatarMoeda(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default function ClienteCaixaPage() {
  const router = useRouter();
  const [cambista, setCambista] = useState<{
    entrada: number;
    saidas: number;
    comissao: number;
    lancamentos: number;
  } | null>(null);

  useEffect(() => {
    const auth = localStorage.getItem("premiacoes_cliente");
    if (!auth) {
      router.replace("/cliente/login");
      return;
    }
    const { cambistaId } = JSON.parse(auth);
    const cam = getCambistas().find((c) => c.id === cambistaId);
    if (cam) {
      setCambista({
        entrada: cam.entrada,
        saidas: cam.saidas,
        comissao: cam.comissao,
        lancamentos: cam.lancamentos,
      });
    }
  }, [router]);

  if (!cambista) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white">
        <p className="text-gray-500">Carregando...</p>
      </div>
    );
  }

  const total = cambista.entrada - cambista.saidas - cambista.comissao + cambista.lancamentos;

  return (
    <div className="min-h-screen bg-white p-4 pb-24">
      <div className="mb-4 flex items-center gap-2">
        <Link href="/cliente" className="rounded p-2 text-gray-600 hover:bg-gray-100">
          <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </Link>
        <h1 className="text-lg font-bold text-gray-800">Caixa</h1>
      </div>

      <div className="space-y-3">
        <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
          <p className="text-sm text-gray-500">Entrada</p>
          <p className="text-xl font-bold text-green-700">{formatarMoeda(cambista.entrada)}</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
          <p className="text-sm text-gray-500">Saídas</p>
          <p className="text-xl font-bold text-red-700">{formatarMoeda(cambista.saidas)}</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
          <p className="text-sm text-gray-500">Comissão</p>
          <p className="text-xl font-bold text-orange-600">{formatarMoeda(cambista.comissao)}</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
          <p className="text-sm text-gray-500">Lançamentos</p>
          <p className={`text-xl font-bold ${cambista.lancamentos >= 0 ? "text-green-700" : "text-red-700"}`}>
            {formatarMoeda(cambista.lancamentos)}
          </p>
        </div>
        <div className="rounded-xl border-2 border-orange-200 bg-orange-50 p-4">
          <p className="text-sm text-gray-600">Total a prestar</p>
          <p className="text-2xl font-bold text-orange-700">{formatarMoeda(total)}</p>
        </div>
      </div>
    </div>
  );
}
