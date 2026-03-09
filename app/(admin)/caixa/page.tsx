"use client";

import { useState, useEffect, useMemo } from "react";
import {
  getCambistasPorCodigo,
  getGerentesPorCodigo,
  calcularTotalCaixa,
  getJogosEmAberto,
  getBilhetes,
} from "@/lib/store";
import { getAdminCodigo } from "@/lib/auth";

function formatarMoeda(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default function CaixaPage() {
  const codigo = getAdminCodigo();
  const [cambistas, setCambistas] = useState(getCambistasPorCodigo(codigo ?? ""));
  const [filtroGerente, setFiltroGerente] = useState("todos");
  const gerentes = useMemo(() => getGerentesPorCodigo(codigo ?? ""), [codigo]);

  useEffect(() => {
    if (codigo) setCambistas(getCambistasPorCodigo(codigo));
  }, [codigo]);

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
  const totalPrestar = calcularTotalCaixa(totalGeral);

  const idsCambistas = new Set(filtrar.map((c) => c.id));
  const bilhetes = getBilhetes().filter((b) => idsCambistas.has(b.cambistaId));
  const bilhetesPendentes = bilhetes.filter((b) => b.situacao === "pendente").length;
  const jogosEmAbertoGeral = bilhetes
    .filter((b) => b.situacao === "pendente")
    .reduce((s, b) => s + b.total, 0);

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-gray-800">Caixa</h1>

      <div className="mb-4 flex flex-wrap items-center gap-3">
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
        <button
          type="button"
          onClick={() => window.print()}
          className="rounded bg-orange-500 px-4 py-2 text-sm font-medium text-white hover:bg-orange-600 print:hidden"
        >
          Resumo para fechamento
        </button>
      </div>

      <p className="mb-1 text-sm text-gray-600">
        Entrada = vendas; Saídas = prêmios já pagos (após sair resultado). Jogos em aberto = valor apostado ainda sem resultado (só entra no caixa após o resultado).
      </p>
      <p className="mb-4 text-xs text-gray-500">
        Bilhetes pendentes nesta seleção: <strong>{bilhetesPendentes}</strong> — Jogos em aberto (geral):{" "}
        <strong>{formatarMoeda(jogosEmAbertoGeral)}</strong>
      </p>

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <p className="text-sm text-gray-500">Entrada</p>
          <p className="text-xl font-bold text-green-700">{formatarMoeda(totalGeral.entrada)}</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <p className="text-sm text-gray-500">Saídas (prêmios pagos)</p>
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
              <th className="px-4 py-3 text-right text-xs font-medium uppercase text-gray-600">Jogos em aberto</th>
              <th className="px-4 py-3 text-right text-xs font-medium uppercase text-gray-600">Entrada</th>
              <th className="px-4 py-3 text-right text-xs font-medium uppercase text-gray-600">Saídas</th>
              <th className="px-4 py-3 text-right text-xs font-medium uppercase text-gray-600">Comissão</th>
              <th className="px-4 py-3 text-right text-xs font-medium uppercase text-gray-600">Lançamentos</th>
              <th className="px-4 py-3 text-right text-xs font-medium uppercase text-gray-600">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {filtrar.map((c) => {
              const jogosAberto = getJogosEmAberto(c.id);
              const total = calcularTotalCaixa(c);
              return (
                <tr key={c.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-800">{c.login}</td>
                  <td className="px-4 py-3 text-right text-sm text-blue-600" title="Valor apostado ainda sem resultado">
                    {formatarMoeda(jogosAberto)}
                  </td>
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
