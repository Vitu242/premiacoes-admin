"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getBilhetes } from "@/lib/store";

export default function ClienteRepetirPage() {
  const router = useRouter();
  const [cambistaId, setCambistaId] = useState<string | null>(null);
  const [bilhetes, setBilhetes] = useState(getBilhetes().filter((b) => b.situacao !== "cancelado"));

  useEffect(() => {
    const auth = localStorage.getItem("premiacoes_cliente");
    if (!auth) {
      router.replace("/cliente/login");
      return;
    }
    const { cambistaId: cid } = JSON.parse(auth);
    setCambistaId(cid);
  }, [router]);

  useEffect(() => {
    if (!cambistaId) return;
    setBilhetes(
      getBilhetes()
        .filter((b) => b.cambistaId === cambistaId && b.situacao !== "cancelado")
        .sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime())
        .slice(0, 10)
    );
  }, [cambistaId]);

  return (
    <div className="min-h-screen bg-white p-4 pb-24">
      <div className="mb-4 flex items-center gap-2">
        <Link href="/cliente" className="rounded p-2 text-gray-600 hover:bg-gray-100">
          <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </Link>
        <h1 className="text-lg font-bold text-gray-800">Repetir</h1>
      </div>

      <p className="mb-4 text-sm text-gray-500">
        Seus últimos bilhetes. Para repetir, faça uma nova venda em Vender com os mesmos números.
      </p>

      <div className="space-y-3">
        {bilhetes.length === 0 ? (
          <p className="py-8 text-center text-gray-500">Nenhum bilhete para repetir.</p>
        ) : (
          bilhetes.map((b) => (
            <Link
              key={b.id}
              href="/cliente/vender"
              className="block rounded-xl border border-gray-200 bg-gray-50 p-4 hover:bg-gray-100"
            >
              <p className="font-mono font-bold text-gray-800">{b.codigo}</p>
              <p className="text-sm text-gray-500">{b.extracaoNome} • {b.data}</p>
              <p className="mt-1 text-sm text-gray-600">
                {b.itens.map((i) => `${i.modalidade} ${i.numeros}`).join(" | ")} — R$ {b.total.toFixed(2).replace(".", ",")}
              </p>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
