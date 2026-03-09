"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getConfig } from "@/lib/store";
import { useConfigRefresh } from "@/lib/use-config-refresh";

const REGULAMENTO_DEFAULT = [
  "Confira seu bilhete. A banca não se responsabiliza por qualquer erro do cambista.",
  "Os bilhetes só podem ser cancelados dentro do prazo configurado e antes do horário de encerramento da extração.",
  "O Jogo do Bicho utiliza grupos de 1 a 25, dezenas (2 dígitos), centenas (3 dígitos) e milhares (4 dígitos).",
  "O Milhar Brinde é opcional e pode ser adicionado a qualquer aposta, quando habilitado para o cambista.",
].join("\n\n");

export default function ClienteRegulamentoPage() {
  const router = useRouter();
  const [texto, setTexto] = useState<string | null>(null);

  useEffect(() => {
    const cfg = getConfig();
    const t = cfg.regulamento?.trim();
    setTexto(t && t.length > 0 ? t : REGULAMENTO_DEFAULT);
  }, []);

  useConfigRefresh((cfg) => {
    const t = cfg.regulamento?.trim();
    setTexto(t && t.length > 0 ? t : REGULAMENTO_DEFAULT);
  });

  const paragrafos = (texto ?? REGULAMENTO_DEFAULT).split(/\n{2,}/g);

  return (
    <div className="min-h-screen bg-white p-4 pb-24">
      <div className="mb-4 flex items-center gap-2">
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
        <h1 className="text-lg font-bold text-gray-800">Regulamento</h1>
      </div>

      <div className="space-y-4 text-sm text-gray-600">
        {paragrafos.map((p, idx) => (
          <p key={idx}>{p}</p>
        ))}
      </div>
    </div>
  );
}
