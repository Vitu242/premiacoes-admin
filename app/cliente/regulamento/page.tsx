"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

export default function ClienteRegulamentoPage() {
  return (
    <div className="min-h-screen bg-white p-4 pb-24">
      <div className="mb-4 flex items-center gap-2">
        <Link href="/cliente" className="rounded p-2 text-gray-600 hover:bg-gray-100">
          <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </Link>
        <h1 className="text-lg font-bold text-gray-800">Regulamento</h1>
      </div>

      <div className="space-y-4 text-sm text-gray-600">
        <p>
          Confira seu bilhete. A banca não se responsabiliza por qualquer erro do cambista.
        </p>
        <p>
          Os bilhetes só podem ser cancelados dentro do prazo configurado e antes do horário de encerramento da extração.
        </p>
        <p>
          O Jogo do Bicho utiliza grupos de 1 a 25, dezenas (2 dígitos), centenas (3 dígitos) e milhares (4 dígitos).
        </p>
        <p>
          O Milhar Brinde é opcional e pode ser adicionado a qualquer aposta, quando habilitado para o cambista.
        </p>
      </div>
    </div>
  );
}
