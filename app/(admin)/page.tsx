"use client";

import { useState, useEffect } from "react";
import {
  getCambistas,
  getGerentes,
  prestarContasCambista,
} from "@/lib/store";
import type { Cambista } from "@/lib/types";

function calcularTotal(c: Cambista): number {
  return c.entrada - c.saidas - c.comissao + c.lancamentos;
}

function formatarMoeda(valor: number) {
  return valor.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

export default function PrestarContasPage() {
  const [cambistas, setCambistasState] = useState<Cambista[]>([]);
  const [gerentes] = useState(getGerentes());
  const [filtroGerente, setFiltroGerente] = useState("todos");
  const [detalhe, setDetalhe] = useState<Cambista | null>(null);

  useEffect(() => {
    setCambistasState(getCambistas());
  }, []);

  const filtrar = cambistas.filter((c) =>
    filtroGerente === "todos" ? true : c.gerenteId === filtroGerente
  );

  const handlePrestarContas = (id: string) => {
    prestarContasCambista(id);
    setCambistasState(getCambistas());
    setDetalhe(null);
  };

  const handlePrestarTodos = () => {
    if (
      confirm(
        "Prestar conta com todos os cambistas listados? O caixa de cada um será zerado."
      )
    ) {
      filtrar.forEach((c) => prestarContasCambista(c.id));
      setCambistasState(getCambistas());
      setDetalhe(null);
    }
  };

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-800">Prestar Contas</h1>
      </div>

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:gap-4">
        <select
          value={filtroGerente}
          onChange={(e) => setFiltroGerente(e.target.value)}
          className="w-full rounded border border-gray-300 px-4 py-2 sm:w-auto focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
        >
          <option value="todos">Todos os Gerentes</option>
          {gerentes.map((g) => (
            <option key={g.id} value={g.id}>
              {g.login}
            </option>
          ))}
        </select>
        <button
          onClick={handlePrestarTodos}
          disabled={filtrar.length === 0}
          className="w-full rounded bg-orange-500 px-4 py-2 font-medium text-white hover:bg-orange-600 disabled:opacity-50 sm:w-auto"
        >
          Prestar conta com todos
        </button>
      </div>

      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white shadow">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-600">
                Cambista
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-600">
                Entrada
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-600">
                Saídas
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-600">
                Comissão
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-600">
                Lançamentos
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-600">
                Total
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-600">
                Última Prestação
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-600">
                Prestação
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 bg-white">
            {filtrar.map((c) => {
              const total = calcularTotal(c);
              return (
                <tr key={c.id} className="hover:bg-gray-50">
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-900">
                    {c.login}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-600">
                    {formatarMoeda(c.entrada)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-600">
                    {formatarMoeda(c.saidas)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-600">
                    {formatarMoeda(c.comissao)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-600">
                    {formatarMoeda(c.lancamentos)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <span
                      className={`font-semibold ${
                        total > 0
                          ? "text-green-600"
                          : total < 0
                            ? "text-red-600"
                            : "text-gray-900"
                      }`}
                    >
                      {formatarMoeda(total)}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-600">
                    {c.ultimaPrestacao ?? "Nunca"}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <button
                      onClick={() => setDetalhe(c)}
                      className="rounded bg-orange-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-orange-600"
                    >
                      Prestar contas
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Modal Prestar Contas - detalhe */}
      {detalhe && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
            <h2 className="mb-4 text-lg font-bold">
              Prestar contas com {detalhe.login}
            </h2>
            <div className="space-y-2 rounded border border-gray-200 bg-gray-50 p-4">
              <div className="flex justify-between">
                <span className="text-gray-600">Entrada:</span>
                <span>{formatarMoeda(detalhe.entrada)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Saídas:</span>
                <span>{formatarMoeda(detalhe.saidas)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Comissão:</span>
                <span>{formatarMoeda(detalhe.comissao)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Lançamentos:</span>
                <span>{formatarMoeda(detalhe.lancamentos)}</span>
              </div>
              <div className="flex justify-between border-t pt-2 font-semibold">
                <span>Total:</span>
                <span
                  className={
                    calcularTotal(detalhe) > 0
                      ? "text-green-600"
                      : calcularTotal(detalhe) < 0
                        ? "text-red-600"
                        : ""
                  }
                >
                  {formatarMoeda(calcularTotal(detalhe))}
                </span>
              </div>
            </div>
            <p className="mt-3 text-sm text-gray-600">
              Ao confirmar, o caixa deste cliente será zerado.
            </p>
            <div className="mt-4 flex gap-3">
              <button
                onClick={() => handlePrestarContas(detalhe.id)}
                className="rounded bg-orange-500 px-4 py-2 font-medium text-white hover:bg-orange-600"
              >
                Prestar contas
              </button>
              <button
                onClick={() => setDetalhe(null)}
                className="rounded border border-gray-300 px-4 py-2 hover:bg-gray-50"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
