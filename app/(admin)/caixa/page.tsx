"use client";

import { useState, useEffect } from "react";
import { getCambistas, getGerentes } from "@/lib/store";

function formatarMoeda(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default function CaixaPage() {
  const [cambistas, setCambistas] = useState(getCambistas());
  const [filtroGerente, setFiltroGerente] = useState("todos");
  const gerentes = getGerentes();

  useEffect(() => {
    setCambistas(getCambistas());
  }, []);

  const filtrar = cambistas.filter(
    (c) => filtroGerente === "todos" || c.gerenteId === filtroGerente
  );

  const totalGeral = {
    entrada: filtrar.reduce((a, c) => a + c.entrada, 0),
    saidas: filtrar.reduce((a, c) => a + c.saidas, 0),
    comissao: filtrar.reduce((a, c) => a + c.comissao, 0),
    lancamentos: filtrar.reduce((a, c) => a + c.lancamentos, 0),
    saldo: filtrar.reduce((a, c) => a + c.saldo, 0),
  };
  const totalPrestar = totalGeral.entrada - totalGeral.saidas - totalGeral.comissao + totalGeral.lancamentos;

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-gray-800">Caixa</h1>

      <div className="mb-4">
        <select
          value={filtroGerente}
          onChange={(e) => setFiltroGerente(e.target.value)}
          className="rounded border border-gray-300 px-3 py-2 text-sm"
        >
          <option value="todos">Todos os gerentes</option>
          {gerentes.map((g) => (
            <option key={g.id} value={g.id}>{g.login}</option>
          ))}
        </select>
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <p className="text-sm text-gray-500">Entrada</p>
          <p className="text-xl font-bold text-green-700">{formatarMoeda(totalGeral.entrada)}</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <p className="text-sm text-gray-500">Saídas</p>
          <p className="text-xl font-bold text-red-700">{formatarMoeda(totalGeral.saidas)}</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <p className="text-sm text-gray-500">Comissão</p>
          <p className="text-xl font-bold text-orange-600">{formatarMoeda(totalGeral.comissao)}</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <p className="text-sm text-gray-500">Lançamentos</p>
          <p className={`text-xl font-bold ${totalGeral.lancamentos >= 0 ? "text-green-700" : "text-red-700"}`}>
            {formatarMoeda(totalGeral.lancamentos)}
          </p>
        </div>
        <div className="rounded-lg border-2 border-orange-200 bg-orange-50 p-4 shadow-sm">
          <p className="text-sm text-gray-600">Total a prestar</p>
          <p className="text-2xl font-bold text-orange-700">{formatarMoeda(totalPrestar)}</p>
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white shadow">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-600">Cambista</th>
              <th className="px-4 py-3 text-right text-xs font-medium uppercase text-gray-600">Entrada</th>
              <th className="px-4 py-3 text-right text-xs font-medium uppercase text-gray-600">Saídas</th>
              <th className="px-4 py-3 text-right text-xs font-medium uppercase text-gray-600">Comissão</th>
              <th className="px-4 py-3 text-right text-xs font-medium uppercase text-gray-600">Lançamentos</th>
              <th className="px-4 py-3 text-right text-xs font-medium uppercase text-gray-600">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {filtrar.map((c) => {
              const total = c.entrada - c.saidas - c.comissao + c.lancamentos;
              return (
                <tr key={c.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-800">{c.login}</td>
                  <td className="px-4 py-3 text-right text-sm text-green-700">{formatarMoeda(c.entrada)}</td>
                  <td className="px-4 py-3 text-right text-sm text-red-700">{formatarMoeda(c.saidas)}</td>
                  <td className="px-4 py-3 text-right text-sm text-orange-600">{formatarMoeda(c.comissao)}</td>
                  <td className={`px-4 py-3 text-right text-sm ${c.lancamentos >= 0 ? "text-green-700" : "text-red-700"}`}>
                    {formatarMoeda(c.lancamentos)}
                  </td>
                  <td className="px-4 py-3 text-right font-medium text-gray-800">{formatarMoeda(total)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
