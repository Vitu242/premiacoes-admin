"use client";

import { useState, useEffect } from "react";
import { getResultados, getExtracoes, addResultado } from "@/lib/store";

function normalizarData(d: Date): string {
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

export default function ResultadosAdminPage() {
  const [resultados, setResultados] = useState(getResultados());
  const [dataSelecionada, setDataSelecionada] = useState(() => normalizarData(new Date()).replace(/\//g, "-").split("-").reverse().join("-"));
  const [extracaoId, setExtracaoId] = useState("");
  const [premios, setPremios] = useState<Record<number, string>>(() => {
    const o: Record<number, string> = {};
    for (let p = 1; p <= 10; p++) o[p] = "";
    return o;
  });
  const [showForm, setShowForm] = useState(false);

  const extracoes = getExtracoes();

  useEffect(() => {
    setResultados(getResultados());
  }, []);

  const dataNorm = dataSelecionada ? (() => {
    const [y, m, d] = dataSelecionada.split("-");
    return `${d}/${m}/${y.slice(2)}`;
  })() : "";

  const temResultado = (extId: string) =>
    resultados.some((r) => r.extracaoId === extId && r.data.includes(dataNorm));

  const handleSalvar = async (e: React.FormEvent) => {
    e.preventDefault();
    const ext = extracoes.find((e) => e.id === extracaoId);
    if (!ext) return;
    const grupos1 = premios[1]?.trim() || "";
    if (!grupos1) {
      alert("Informe ao menos o 1º prêmio (grupos).");
      return;
    }
    const premiosObj: Record<number, string> = { 1: grupos1 };
    for (let p = 2; p <= 10; p++) if (premios[p]?.trim()) premiosObj[p] = premios[p].trim();
    await addResultado({
      extracaoId: ext.id,
      extracaoNome: ext.nome,
      data: dataNorm,
      grupos: grupos1,
      premios: premiosObj,
    });
    setResultados(getResultados());
    setExtracaoId("");
    setPremios(() => {
      const o: Record<number, string> = {};
      for (let p = 1; p <= 10; p++) o[p] = "";
      return o;
    });
    setShowForm(false);
  };

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-gray-800">Resultados</h1>
      <p className="mb-4 text-sm text-gray-600">
        Informe a data e o resultado de cada extração. Ao salvar, os bilhetes daquela extração/data são conferidos e marcados como Pago ou Perdedor. Use grupos no formato 01-02-03-04-05 (5 grupos por prêmio).
      </p>

      <div className="mb-6 flex flex-wrap items-center gap-4">
        <label className="text-sm font-medium text-gray-700">Data:</label>
        <input
          type="date"
          value={dataSelecionada}
          onChange={(e) => setDataSelecionada(e.target.value)}
          className="rounded border border-gray-300 px-3 py-2 text-sm"
        />
        <button
          onClick={() => setShowForm(!showForm)}
          className="rounded bg-orange-500 px-4 py-2 text-sm font-medium text-white hover:bg-orange-600"
        >
          {showForm ? "Cancelar" : "Lançar resultado"}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSalvar} className="mb-8 rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 font-semibold text-gray-800">Novo resultado</h2>
          <div className="mb-4">
            <label className="mb-1 block text-sm text-gray-600">Extração</label>
            <select
              value={extracaoId}
              onChange={(e) => setExtracaoId(e.target.value)}
              className="w-full max-w-md rounded border border-gray-300 px-4 py-2"
              required
            >
              <option value="">Selecione</option>
              {extracoes.map((e) => (
                <option key={e.id} value={e.id}>{e.nome}</option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <p className="text-sm font-medium text-gray-700">Grupos por prêmio (ex: 01-02-03-04-05)</p>
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((p) => (
              <div key={p} className="flex items-center gap-3">
                <label className="w-16 text-sm text-gray-600">{p}º prêmio</label>
                <input
                  type="text"
                  value={premios[p] ?? ""}
                  onChange={(e) => setPremios((prev) => ({ ...prev, [p]: e.target.value }))}
                  placeholder={p === 1 ? "01-02-03-04-05" : "Opcional"}
                  className="flex-1 max-w-xs rounded border border-gray-300 px-3 py-2 font-mono text-sm"
                />
              </div>
            ))}
          </div>
          <div className="mt-4">
            <button type="submit" className="rounded bg-orange-500 px-4 py-2 font-medium text-white hover:bg-orange-600">
              Salvar e conferir bilhetes
            </button>
          </div>
        </form>
      )}

      <div className="rounded-lg border border-gray-200 bg-white shadow">
        <h2 className="border-b border-gray-200 px-4 py-3 font-semibold text-gray-800">
          Extrações – resultado em {dataNorm || "—"}
        </h2>
        <div className="max-h-[60vh] overflow-y-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50 sticky top-0">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-600">Extração</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-600">Status</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-600">1º prêmio</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {extracoes.map((e) => {
                const r = resultados.find((res) => res.extracaoId === e.id && res.data.includes(dataNorm));
                return (
                  <tr key={e.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">{e.nome}</td>
                    <td className="px-4 py-3">
                      {r ? (
                        <span className="rounded bg-green-100 px-2 py-1 text-xs text-green-700">Lançado</span>
                      ) : (
                        <span className="rounded bg-gray-100 px-2 py-1 text-xs text-gray-600">Sem resultado</span>
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono text-sm text-gray-700">{r?.grupos ?? "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
