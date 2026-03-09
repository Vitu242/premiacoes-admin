"use client";

import { useState, useEffect } from "react";
import { getResultados, getExtracoes, addResultado } from "@/lib/store";
import { addLog } from "@/lib/auditoria";

function normalizarData(d: Date): string {
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

export default function ResultadosAdminPage() {
  const [resultados, setResultados] = useState(getResultados());
  const [dataSelecionada, setDataSelecionada] = useState(() => normalizarData(new Date()).replace(/\//g, "-").split("-").reverse().join("-"));
  const [filtroTipo, setFiltroTipo] = useState("");
  const [extracaoId, setExtracaoId] = useState("");
  const [premios, setPremios] = useState<Record<number, string>>(() => {
    const o: Record<number, string> = {};
    for (let p = 1; p <= 10; p++) o[p] = "";
    return o;
  });
  const [showForm, setShowForm] = useState(false);
  const [verResultado, setVerResultado] = useState<{ extracaoNome: string; grupos: string; premios: Record<number, string> } | null>(null);

  const extracoesAll = getExtracoes();
  const tiposUnicos = Array.from(new Set(extracoesAll.map((e) => e.nome.split(" ")[0] || e.nome))).sort();
  const extracoes = filtroTipo
    ? extracoesAll.filter((e) => e.nome.toUpperCase().includes(filtroTipo.toUpperCase()))
    : extracoesAll;

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
    addLog("Adicionou resultado", `${ext.nome} - ${dataNorm}`);
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
        <div>
          <label className="mr-2 text-sm font-medium text-gray-700">Tipo loteria:</label>
          <select
            value={filtroTipo}
            onChange={(e) => setFiltroTipo(e.target.value)}
            className="rounded border border-gray-300 px-3 py-2 text-sm"
          >
            <option value="">Todas</option>
            {tiposUnicos.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>
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
                <th className="px-4 py-3 text-center text-xs font-medium uppercase text-gray-600">Opções</th>
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
                    <td className="px-4 py-3 text-center">
                      {r ? (
                        <button
                          type="button"
                          onClick={() => setVerResultado({
                            extracaoNome: e.nome,
                            grupos: r.grupos,
                            premios: r.premios ?? { 1: r.grupos },
                          })}
                          className="rounded bg-blue-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-600"
                        >
                          Ver Resultado
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            setExtracaoId(e.id);
                            setShowForm(true);
                          }}
                          className="rounded bg-orange-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-orange-600"
                        >
                          Adicionar
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Ver Resultado */}
      {verResultado && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setVerResultado(null)}
        >
          <div
            className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-800">Resultado — {verResultado.extracaoNome}</h2>
              <button
                type="button"
                onClick={() => setVerResultado(null)}
                className="rounded p-2 text-gray-500 hover:bg-gray-100"
                aria-label="Fechar"
              >
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="space-y-2 text-sm text-gray-700">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((p) => {
                const val = verResultado.premios[p] ?? (p === 1 ? verResultado.grupos : null);
                if (!val) return null;
                return (
                  <p key={p}><strong>{p}º prêmio:</strong> {val}</p>
                );
              })}
            </div>
            <div className="mt-4">
              <button
                type="button"
                onClick={() => setVerResultado(null)}
                className="rounded bg-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-300"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
