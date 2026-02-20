"use client";

import Link from "next/link";

const VERSAO = "1.0.0";

export default function ClienteConfiguracoesPage() {
  return (
    <div className="min-h-screen bg-white p-4 pb-24">
      <Link href="/cliente" className="mb-4 inline-flex items-center text-orange-600 hover:underline">
        ← Voltar
      </Link>
      <h1 className="text-2xl font-bold text-gray-800">Configurações</h1>
      <div className="mt-6 rounded-xl border border-gray-200 bg-gray-50 p-4">
        <p className="text-sm text-gray-500">Versão do app</p>
        <p className="mt-1 text-xl font-semibold text-gray-800">{VERSAO}</p>
      </div>
    </div>
  );
}
