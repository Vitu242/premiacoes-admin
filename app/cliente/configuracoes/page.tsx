"use client";

import Link from "next/link";

export default function ClienteConfiguracoesPage() {
  return (
    <div className="min-h-screen bg-white p-4">
      <Link href="/cliente" className="mb-4 inline-flex items-center text-orange-600 hover:underline">
        ← Voltar
      </Link>
      <h1 className="text-2xl font-bold text-gray-800">Configurações</h1>
      <p className="mt-4 text-gray-600">Em desenvolvimento.</p>
    </div>
  );
}
