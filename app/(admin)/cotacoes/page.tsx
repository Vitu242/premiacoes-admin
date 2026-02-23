"use client";

import { useState, useEffect } from "react";
import {
  getCotacoesPadroes,
  setCotacoesPadroes,
  getCotacaoEfetiva,
  getCambistasPorCodigo,
  updateCambista,
} from "@/lib/store";
import { getAdminCodigo } from "@/lib/auth";
import {
  COTACOES_KEYS_ORDER,
  COTACOES_LABELS,
  type CotacaoKey,
  type CotacoesPadroes,
} from "@/lib/cotacoes";

export default function CotacoesPage() {
  const codigo = getAdminCodigo();
  const cambistas = getCambistasPorCodigo(codigo ?? "");
  const [alvo, setAlvo] = useState<"padrao" | string>("padrao");
  const [valores, setValores] = useState<CotacoesPadroes>(getCotacoesPadroes());
  const [salvo, setSalvo] = useState(false);

  const cambista = alvo === "padrao" ? null : cambistas.find((c) => c.id === alvo);

  useEffect(() => {
    if (alvo === "padrao") {
      setValores(getCotacoesPadroes());
    } else if (cambista) {
      const padroes = getCotacoesPadroes();
      const next: CotacoesPadroes = { ...padroes };
      (COTACOES_KEYS_ORDER as CotacaoKey[]).forEach((key) => {
        next[key] = getCotacaoEfetiva(cambista, key);
      });
      setValores(next);
    }
  }, [alvo, cambista?.id]);

  const handleChange = (key: CotacaoKey, value: number) => {
    setValores((prev) => ({ ...prev, [key]: value }));
    setSalvo(false);
  };

  const handleSalvar = () => {
    if (alvo === "padrao") {
      setCotacoesPadroes(valores);
    } else if (cambista) {
      updateCambista(cambista.id, { cotacoes: { ...valores } });
    }
    setSalvo(true);
  };

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-gray-800">Cotações</h1>
      <p className="mb-6 text-sm text-gray-600">
        Altere as cotações padrão (valem para todos os clientes) ou escolha um cliente para definir cotações específicas. O cliente usa sempre a cotação efetiva (override dele ou padrão).
      </p>

      <div className="mb-6 flex flex-wrap items-center gap-4">
        <label className="text-sm font-medium text-gray-700">Editar:</label>
        <select
          value={alvo}
          onChange={(e) => setAlvo(e.target.value)}
          className="rounded border border-gray-300 px-4 py-2 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
        >
          <option value="padrao">Cotações padrão (todos os clientes)</option>
          {cambistas.map((c) => (
            <option key={c.id} value={c.id}>{c.login}</option>
          ))}
        </select>
        <button
          onClick={handleSalvar}
          className="rounded bg-orange-500 px-4 py-2 font-medium text-white hover:bg-orange-600"
        >
          Salvar alterações
        </button>
        {salvo && <span className="text-sm text-green-600">Salvo.</span>}
      </div>

      <div className="rounded-lg border border-gray-200 bg-white shadow">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-600">Tipo</th>
              <th className="px-4 py-3 text-right text-xs font-medium uppercase text-gray-600">Valor (R$)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {(COTACOES_KEYS_ORDER as CotacaoKey[]).map((key) => (
              <tr key={key} className="hover:bg-gray-50">
                <td className="px-4 py-3 text-sm font-medium text-gray-900">{COTACOES_LABELS[key]}</td>
                <td className="px-4 py-3 text-right">
                  <input
                    type="number"
                    min={0}
                    step={0.01}
                    value={valores[key]}
                    onChange={(e) => handleChange(key, Number(e.target.value) || 0)}
                    className="w-32 rounded border border-gray-300 px-2 py-1.5 text-right text-sm [color:#171717]"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
