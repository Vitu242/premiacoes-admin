"use client";

import { useState, useEffect, useMemo } from "react";
import { getCambistasPorCodigo, getGerentesPorCodigo, updateCambista } from "@/lib/store";
import { addLog } from "@/lib/auditoria";
import { getAdminCodigo } from "@/lib/auth";

function formatarMoeda(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default function SaldoPage() {
  const codigo = getAdminCodigo();
  const gerentes = useMemo(() => getGerentesPorCodigo(codigo ?? ""), [codigo]);
  const [cambistas, setCambistas] = useState(getCambistasPorCodigo(codigo ?? ""));
  const [selecionado, setSelecionado] = useState("");
  const [ajuste, setAjuste] = useState(0);
  const [filtroNome, setFiltroNome] = useState("");
  const [filtroGerente, setFiltroGerente] = useState("todos");

  useEffect(() => {
    if (codigo) setCambistas(getCambistasPorCodigo(codigo));
  }, [codigo]);

  const filtrar = useMemo(() => {
    let r = cambistas;
    if (filtroGerente !== "todos") {
      r = r.filter((c) => c.gerenteId === filtroGerente);
    }
    if (filtroNome.trim()) {
      const t = filtroNome.toLowerCase();
      r = r.filter((c) => c.login.toLowerCase().includes(t));
    }
    return r;
  }, [cambistas, filtroNome, filtroGerente]);

  const cambista = selecionado ? cambistas.find((c) => c.id === selecionado) : null;

  const handleAjustar = (delta: number) => {
    if (!cambista) return;
    const novoSaldo = Math.max(0, cambista.saldo + delta);
    updateCambista(cambista.id, { saldo: novoSaldo });
    addLog("Ajustou saldo", `${cambista.login}: ${delta > 0 ? "+" : ""}${delta} → ${novoSaldo}`);
    setCambistas(getCambistasPorCodigo(codigo ?? ""));
    setAjuste(0);
  };

  const handleAjusteManual = () => {
    if (!cambista || ajuste === 0) return;
    const novoSaldo = Math.max(0, cambista.saldo + ajuste);
    updateCambista(cambista.id, { saldo: novoSaldo });
    addLog("Ajustou saldo", `${cambista.login}: ${ajuste > 0 ? "+" : ""}${ajuste} → ${novoSaldo}`);
    setCambistas(getCambistasPorCodigo(codigo ?? ""));
    setAjuste(0);
  };

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-gray-800">Saldo</h1>

      <div className="mb-4 flex flex-wrap gap-3">
        <select
          value={filtroGerente}
          onChange={(e) => setFiltroGerente(e.target.value)}
          className="rounded border border-gray-300 px-4 py-2 text-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
        >
          <option value="todos">Todos</option>
          {gerentes.map((g) => (
            <option key={g.id} value={g.id}>{g.login}</option>
          ))}
        </select>
        <input
          type="text"
          placeholder="Filtrar por nome"
          value={filtroNome}
          onChange={(e) => setFiltroNome(e.target.value)}
          className="rounded border border-gray-300 px-4 py-2 text-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
        />
        <select
          value={selecionado}
          onChange={(e) => {
            setSelecionado(e.target.value);
            setAjuste(0);
          }}
          className="rounded border border-gray-300 px-4 py-2 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
        >
          <option value="">Selecione o cambista...</option>
          {filtrar.map((c) => (
            <option key={c.id} value={c.id}>{c.login}</option>
          ))}
        </select>
      </div>

      <div className="mb-6 overflow-x-auto rounded-lg border border-gray-200 bg-white shadow">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-2 text-left text-xs font-medium uppercase text-gray-500">Cambista</th>
              <th className="px-4 py-2 text-right text-xs font-medium uppercase text-gray-500">Saldo (limite)</th>
              <th className="px-4 py-2 text-right text-xs font-medium uppercase text-gray-500">Vendido</th>
              <th className="px-4 py-2 text-right text-xs font-medium uppercase text-gray-500">Disponível</th>
              <th className="px-4 py-2 text-left text-xs font-medium uppercase text-gray-500">Ajustar (+/−)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {filtrar.map((c) => {
              const disp = Math.max(0, c.saldo - c.entrada);
              return (
                <tr key={c.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">{c.login}</td>
                  <td className="px-4 py-3 text-right text-gray-700">{formatarMoeda(c.saldo)}</td>
                  <td className="px-4 py-3 text-right text-gray-700">{formatarMoeda(c.entrada)}</td>
                  <td className="px-4 py-3 text-right font-medium text-gray-800">{formatarMoeda(disp)}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap items-center gap-1">
                      <button
                        onClick={() => {
                          const novo = Math.max(0, c.saldo - 10);
                          updateCambista(c.id, { saldo: novo });
                          addLog("Saldo −10", `${c.login}: ${formatarMoeda(novo)}`);
                          setCambistas(getCambistasPorCodigo(codigo ?? ""));
                        }}
                        className="rounded bg-red-100 px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-200"
                      >
                        −10
                      </button>
                      <button
                        onClick={() => {
                          const novo = Math.max(0, c.saldo - 1);
                          updateCambista(c.id, { saldo: novo });
                          addLog("Saldo −1", `${c.login}: ${formatarMoeda(novo)}`);
                          setCambistas(getCambistasPorCodigo(codigo ?? ""));
                        }}
                        className="rounded bg-gray-200 px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-300"
                      >
                        −1
                      </button>
                      <button
                        onClick={() => {
                          const novo = c.saldo + 1;
                          updateCambista(c.id, { saldo: novo });
                          addLog("Saldo +1", `${c.login}: ${formatarMoeda(novo)}`);
                          setCambistas(getCambistasPorCodigo(codigo ?? ""));
                        }}
                        className="rounded bg-gray-200 px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-300"
                      >
                        +1
                      </button>
                      <button
                        onClick={() => {
                          const novo = c.saldo + 10;
                          updateCambista(c.id, { saldo: novo });
                          addLog("Saldo +10", `${c.login}: ${formatarMoeda(novo)}`);
                          setCambistas(getCambistasPorCodigo(codigo ?? ""));
                        }}
                        className="rounded bg-green-100 px-2 py-1 text-xs font-medium text-green-700 hover:bg-green-200"
                      >
                        +10
                      </button>
                      <button
                        onClick={() => setSelecionado(selecionado === c.id ? "" : c.id)}
                        className={`ml-1 rounded px-2 py-1 text-xs font-medium ${selecionado === c.id ? "bg-orange-500 text-white" : "bg-gray-200 text-gray-700 hover:bg-gray-300"}`}
                        title="Ajuste manual com valor customizado"
                      >
                        Editar
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {cambista && (
        <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          <p className="text-sm text-gray-500">Limite (saldo) – o que o cambista pode vender</p>
          <p className="text-3xl font-bold text-gray-800">{formatarMoeda(cambista.saldo)}</p>
          <p className="mt-2 text-sm text-gray-500">
            Já vendido: {formatarMoeda(cambista.entrada)} • Disponível: {formatarMoeda(Math.max(0, cambista.saldo - cambista.entrada))}
          </p>
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
