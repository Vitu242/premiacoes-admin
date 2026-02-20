"use client";

import { useState, useEffect } from "react";
import { getCambistas, getLancamentos, addLancamento } from "@/lib/store";

function formatarMoeda(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default function LancamentosPage() {
  const [cambistas] = useState(getCambistas());
  const [lancamentos, setLancamentos] = useState(getLancamentos());
  const [cambistaId, setCambistaId] = useState("");
  const [tipo, setTipo] = useState<"adiantar" | "retirar">("adiantar");
  const [valor, setValor] = useState("");
  const [observacao, setObservacao] = useState("");

  useEffect(() => {
    setLancamentos(getLancamentos());
  }, []);

  const handleSalvar = (e: React.FormEvent) => {
    e.preventDefault();
    if (!cambistaId || !valor) return;
    const v = parseFloat(valor.replace(",", "."));
    if (isNaN(v) || v <= 0) return;
    addLancamento({
      cambistaId,
      tipo,
      valor: v,
      data: new Date().toLocaleString("pt-BR"),
      observacao: observacao.trim() || undefined,
    });
    setLancamentos(getLancamentos());
    setValor("");
    setObservacao("");
  };

  const filtrar = lancamentos.filter(
    (l) => !cambistaId || l.cambistaId === cambistaId
  );

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-gray-800">Lançamentos</h1>

      <form onSubmit={handleSalvar} className="mb-6 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold text-gray-700">Novo lançamento</h2>
        <div className="flex flex-wrap gap-4">
          <div>
            <label className="mb-1 block text-sm text-gray-600">Cambista</label>
            <select
              value={cambistaId}
              onChange={(e) => setCambistaId(e.target.value)}
              className="rounded border border-gray-300 px-4 py-2"
              required
            >
              <option value="">Selecione</option>
              {cambistas.map((c) => (
                <option key={c.id} value={c.id}>{c.login}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm text-gray-600">Tipo</label>
            <select
              value={tipo}
              onChange={(e) => setTipo(e.target.value as "adiantar" | "retirar")}
              className={`rounded border px-4 py-2 ${
                tipo === "adiantar" ? "border-green-400 bg-green-50" : "border-red-400 bg-red-50"
              }`}
            >
              <option value="adiantar">Adiantar (verde)</option>
              <option value="retirar">Retirar (vermelho)</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm text-gray-600">Valor (R$)</label>
            <input
              type="text"
              value={valor}
              onChange={(e) => setValor(e.target.value.replace(/[^0-9,]/g, ""))}
              placeholder="0,00"
              className="rounded border border-gray-300 px-4 py-2"
              required
            />
          </div>
          <div className="flex-1 min-w-[200px]">
            <label className="mb-1 block text-sm text-gray-600">Observação</label>
            <input
              type="text"
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              placeholder="Opcional"
              className="w-full rounded border border-gray-300 px-4 py-2"
            />
          </div>
          <div className="flex items-end">
            <button
              type="submit"
              className="rounded bg-orange-500 px-4 py-2 font-medium text-white hover:bg-orange-600"
            >
              Lançar
            </button>
          </div>
        </div>
      </form>

      <div className="rounded-lg border border-gray-200 bg-white shadow">
        <h2 className="border-b border-gray-200 px-4 py-3 text-lg font-semibold text-gray-700">
          Histórico ({filtrar.length})
        </h2>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-600">Data</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-600">Cambista</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-600">Tipo</th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase text-gray-600">Valor</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-600">Obs</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filtrar.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-gray-500">
                    Nenhum lançamento encontrado.
                  </td>
                </tr>
              ) : (
                [...filtrar].reverse().map((l) => {
                  const cam = cambistas.find((c) => c.id === l.cambistaId);
                  return (
                    <tr key={l.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm text-gray-600">{l.data}</td>
                      <td className="px-4 py-3 text-sm font-medium text-gray-800">{cam?.login ?? "-"}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`rounded-full px-2 py-1 text-xs font-medium ${
                            l.tipo === "adiantar" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
                          }`}
                        >
                          {l.tipo === "adiantar" ? "Adiantar" : "Retirar"}
                        </span>
                      </td>
                      <td className={`px-4 py-3 text-right text-sm font-medium ${
                        l.tipo === "adiantar" ? "text-green-700" : "text-red-700"
                      }`}>
                        {l.tipo === "adiantar" ? "+" : "-"} {formatarMoeda(l.valor)}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500">{l.observacao ?? "-"}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
