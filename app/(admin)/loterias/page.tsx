"use client";

import { useState, useEffect } from "react";
import { getExtracoes } from "@/lib/store";

export default function LoteriasPage() {
  const [extracoes, setExtracoes] = useState(getExtracoes());

  useEffect(() => {
    setExtracoes(getExtracoes());
  }, []);

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-gray-800">Loterias</h1>

      <div className="mb-6 rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold text-gray-700">Extrações</h2>
        <p className="mb-4 text-sm text-gray-500">
          As extrações e horários de encerramento são configurados aqui. As modalidades (Grupo, Dezena, Centena, Milhar) e as cotações são definidas por cambista em Cambistas.
        </p>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-600">Nome</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-600">Encerra</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-600">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {extracoes.map((e) => (
                <tr key={e.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-800">{e.nome}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{e.encerra}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-1 text-xs font-medium ${e.ativa ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"}`}>
                      {e.ativa ? "Ativa" : "Inativa"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold text-gray-700">Modalidades</h2>
        <p className="text-sm text-gray-500">
          Grupo, Dezena, Centena e Milhar. Milhar Brinde é opcional em qualquer aposta, configurável por cambista em Cambistas.
        </p>
      </div>

      <div className="mt-6 rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold text-gray-700">Cotações</h2>
        <p className="text-sm text-gray-500">
          As cotações (M, C, D, G) são definidas por cambista na tela de Cambistas, ao editar ou criar um cambista.
        </p>
      </div>
    </div>
  );
}
