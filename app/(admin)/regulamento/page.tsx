"use client";

import { useEffect, useState } from "react";
import { getConfig, setConfig } from "@/lib/store";
import { addLog } from "@/lib/auditoria";

export default function RegulamentoAdminPage() {
  const [texto, setTexto] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [mensagem, setMensagem] = useState<string | null>(null);

  useEffect(() => {
    const cfg = getConfig();
    setTexto(cfg.regulamento || "");
  }, []);

  const salvar = () => {
    setSalvando(true);
    setMensagem(null);
    setConfig({ regulamento: texto });
    addLog("Regulamento", "Texto atualizado");
    setSalvando(false);
    setMensagem("Regulamento atualizado com sucesso.");
  };

  return (
    <div>
      <h1 className="mb-4 text-2xl font-bold text-gray-800">Regulamento</h1>
      <p className="mb-4 text-sm text-gray-600">
        Edite o texto do regulamento exibido para o cliente na área de
        configurações. Use este espaço para descrever regras, prazos e outras
        informações importantes.
      </p>
      <div className="space-y-3">
        <textarea
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          rows={12}
          className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
        />
        <button
          type="button"
          onClick={salvar}
          disabled={salvando}
          className="rounded bg-orange-500 px-4 py-2 text-sm font-medium text-white hover:bg-orange-600 disabled:opacity-50"
        >
          {salvando ? "Salvando..." : "Salvar regulamento"}
        </button>
        {mensagem && (
          <p className="text-sm text-green-700">{mensagem}</p>
        )}
      </div>
    </div>
  );
}

