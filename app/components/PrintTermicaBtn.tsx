"use client";

import { useState } from "react";
import { connectPrinter, type BilheteImprimivel } from "@/lib/escpos";

interface Props {
  bilhete: BilheteImprimivel;
  label?: string;
  className?: string;
}

export default function PrintTermicaBtn({ bilhete, label = "Imprimir térmica", className = "" }: Props) {
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const onClick = async () => {
    setErro(null);
    setLoading(true);
    try {
      const p = await connectPrinter();
      await p.printBilhete(bilhete);
      await p.disconnect();
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={`inline-flex flex-col items-start ${className}`}>
      <button
        type="button"
        onClick={onClick}
        disabled={loading}
        className="no-print inline-flex items-center gap-2 rounded-md bg-slate-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
      >
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 9V2h12v7M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2M6 14h12v8H6z" />
        </svg>
        {loading ? "Conectando..." : label}
      </button>
      {erro && <p className="mt-1 text-xs text-red-600">{erro}</p>}
    </div>
  );
}
