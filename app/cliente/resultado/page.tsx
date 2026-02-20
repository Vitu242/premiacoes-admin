"use client";

import Link from "next/link";

export default function ClienteResultadoPage() {
  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <Link href="/cliente" className="mb-4 inline-block text-orange-600 hover:underline">
        ← Voltar
      </Link>
      <h1 className="text-2xl font-bold text-gray-800">Resultado</h1>
      <p className="mt-4 text-gray-600">Em desenvolvimento.</p>
    </div>
  );
}
