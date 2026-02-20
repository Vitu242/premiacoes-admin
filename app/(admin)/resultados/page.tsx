"use client";

import { useState, useEffect } from "react";
import { getResultados, getExtracoes, addResultado } from "@/lib/store";

export default function ResultadosAdminPage() {
  const [resultados, setResultados] = useState(getResultados());
  const [filtroData, setFiltroData] = useState("");
  const [extracaoId, setExtracaoId] = useState("");
  const [grupos, setGrupos] = useState("");
  const [showForm, setShowForm] = useState(false);

  const extracoes = getExtracoes();

  useEffect(() => {
    setResultados(getResultados());
  }, []);

  const filtrar = resultados.filter((r) => {
    if (!filtroData) return true;
    const [y, m, d] = filtroData.split("-");
    const busca = `${d}/${m}/${y.slice(2)}`;
    return r.data.includes(busca);
  });

  const handleSalvar = (e: React.FormEvent) => {
    e.preventDefault();
    const ext = extracoes.find((e) => e.id === extracaoId);
    if (!ext || !grupos.trim()) return;
    addResultado({
      extracaoId: ext.id,
      extracaoNome: ext.nome,
      data: new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" }),
      grupos: grupos.trim(),
    });
    setResultados(getResultados());
    setExtracaoId("");
    setGrupos("");
    setShowForm(false);
  };

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-gray-800">Resultados</h1>

      <div className="mb-4 flex flex-wrap gap-3">
        <input
          type="date"
          value={filtroData}
          onChange={(e) => setFiltroData(e.target.value)}
          className="rounded border border-gray-300 px-3 py-2 text-sm"
        />
        <button
          onClick={() => setShowForm(!showForm)}
          className="rounded bg-orange-500 px-4 py-2 text-sm font-medium text-white hover:bg-orange-600"
        >
          {showForm ? "Cancelar" : "Adicionar resultado"}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSalvar} className="mb-6 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <h2 className="mb-4 font-semibold text-gray-700">Novo resultado</h2>
          <div className="flex flex-wrap gap-4">
            <div>
              <label className="mb-1 block text-sm text-gray-600">Extração</label>
              <select
                value={extracaoId}
                onChange={(e) => setExtracaoId(e.target.value)}
                className="rounded border border-gray-300 px-4 py-2"
                required
              >
                <option value="">Selecione</option>
                {extracoes.map((e) => (
                  <option key={e.id} value={e.id}>{e.nome}</option>
                ))}
              </select>
            </div>
            <div className="flex-1 min-w-[200px]">
              <label className="mb-1 block text-sm text-gray-600">Grupos (ex: 01-02-03-04-05)</label>
              <input
                type="text"
                value={grupos}
                onChange={(e) => setGrupos(e.target.value)}
                placeholder="01-02-03-04-05"
                className="w-full rounded border border-gray-300 px-4 py-2"
                required
              />
            </div>
            <div className="flex items-end">
              <button
                type="submit"
                className="rounded bg-orange-500 px-4 py-2 font-medium text-white hover:bg-orange-600"
              >
                Salvar
              </button>
            </div>
          </div>
        </form>
      )}

      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white shadow">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-600">Data</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-600">Extração</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-600">Grupos</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {filtrar.length === 0 ? (
              <tr>
                <td colSpan={3} className="px-4 py-8 text-center text-gray-500">
                  Nenhum resultado encontrado.
                </td>
              </tr>
            ) : (
              [...filtrar].reverse().map((r) => (
                <tr key={r.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm text-gray-600">{r.data}</td>
                  <td className="px-4 py-3 font-medium text-gray-800">{r.extracaoNome}</td>
                  <td className="px-4 py-3 font-mono text-sm text-gray-700">{r.grupos}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
