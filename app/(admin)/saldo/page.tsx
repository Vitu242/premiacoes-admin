"use client";

import { useState, useEffect } from "react";
import { getCambistas, updateCambista } from "@/lib/store";

function formatarMoeda(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default function SaldoPage() {
  const [cambistas, setCambistas] = useState(getCambistas());
  const [selecionado, setSelecionado] = useState("");
  const [ajuste, setAjuste] = useState(0);

  useEffect(() => {
    setCambistas(getCambistas());
  }, []);

  const cambista = selecionado ? cambistas.find((c) => c.id === selecionado) : null;

  const handleAjustar = (delta: number) => {
    if (!cambista) return;
    const novoSaldo = Math.max(0, cambista.saldo + delta);
    updateCambista(cambista.id, { saldo: novoSaldo });
    setCambistas(getCambistas());
    setAjuste(0);
  };

  const handleAjusteManual = () => {
    if (!cambista || ajuste === 0) return;
    const novoSaldo = Math.max(0, cambista.saldo + ajuste);
    updateCambista(cambista.id, { saldo: novoSaldo });
    setCambistas(getCambistas());
    setAjuste(0);
  };

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-gray-800">Saldo</h1>

      <div className="mb-6">
        <label className="mb-2 block text-sm font-medium text-gray-600">Selecione o cambista</label>
        <select
          value={selecionado}
          onChange={(e) => {
            setSelecionado(e.target.value);
            setAjuste(0);
          }}
          className="w-full max-w-xs rounded border border-gray-300 px-4 py-2 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
        >
          <option value="">Selecione...</option>
          {cambistas.map((c) => (
            <option key={c.id} value={c.id}>{c.login}</option>
          ))}
        </select>
      </div>

      {cambista && (
        <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          <p className="text-sm text-gray-500">Saldo atual</p>
          <p className="text-3xl font-bold text-gray-800">{formatarMoeda(cambista.saldo)}</p>
          <div className="mt-6 flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <button
                onClick={() => handleAjustar(-10)}
                className="rounded bg-gray-200 px-4 py-2 font-medium text-gray-700 hover:bg-gray-300"
              >
                −10
              </button>
              <button
                onClick={() => handleAjustar(-1)}
                className="rounded bg-gray-200 px-4 py-2 font-medium text-gray-700 hover:bg-gray-300"
              >
                −1
              </button>
              <button
                onClick={() => handleAjustar(1)}
                className="rounded bg-green-200 px-4 py-2 font-medium text-green-700 hover:bg-green-300"
              >
                +1
              </button>
              <button
                onClick={() => handleAjustar(10)}
                className="rounded bg-green-200 px-4 py-2 font-medium text-green-700 hover:bg-green-300"
              >
                +10
              </button>
              <button
                onClick={() => handleAjustar(100)}
                className="rounded bg-green-300 px-4 py-2 font-medium text-green-800 hover:bg-green-400"
              >
                +100
              </button>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="number"
                value={ajuste || ""}
                onChange={(e) => setAjuste(Number(e.target.value) || 0)}
                placeholder="Valor manual"
                className="w-24 rounded border border-gray-300 px-3 py-2"
              />
              <button
                onClick={handleAjusteManual}
                disabled={ajuste === 0}
                className="rounded bg-orange-500 px-4 py-2 font-medium text-white hover:bg-orange-600 disabled:opacity-50"
              >
                Aplicar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
