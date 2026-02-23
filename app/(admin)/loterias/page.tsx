"use client";

import { useState, useEffect } from "react";
import {
  getExtracoes,
  setExtracoes,
  updateExtracao,
  addExtracao,
  deleteExtracao,
} from "@/lib/store";
import { getExtracoesPadrao } from "@/lib/extracoes-padrao";
import type { Extracao } from "@/lib/types";

export default function LoteriasPage() {
  const [extracoes, setExtracoesState] = useState<Extracao[]>(getExtracoes());
  const [editando, setEditando] = useState<Extracao | null>(null);
  const [novo, setNovo] = useState(false);
  const [form, setForm] = useState<Partial<Extracao>>({ nome: "", encerra: "12:00", ativa: true });

  useEffect(() => {
    setExtracoesState(getExtracoes());
  }, []);

  const salvar = () => {
    if (novo) {
      if (!form.nome?.trim()) {
        alert("Informe o nome da extração.");
        return;
      }
      addExtracao({
        nome: form.nome.trim(),
        encerra: form.encerra ?? "12:00",
        ativa: form.ativa ?? true,
      });
    } else if (editando) {
      if (!form.nome?.trim()) {
        alert("Informe o nome da extração.");
        return;
      }
      updateExtracao(editando.id, {
        nome: form.nome.trim(),
        encerra: form.encerra ?? editando.encerra,
        ativa: form.ativa ?? editando.ativa,
      });
    }
    setExtracoesState(getExtracoes());
    setEditando(null);
    setNovo(false);
    setForm({ nome: "", encerra: "12:00", ativa: true });
  };

  const restaurarPadrao = () => {
    if (!confirm("Substituir a lista atual pela lista padrão de 55 loterias? As alterações manuais serão perdidas.")) return;
    setExtracoes(getExtracoesPadrao());
    setExtracoesState(getExtracoes());
    setEditando(null);
    setNovo(false);
  };

  const apagar = (e: Extracao) => {
    if (!confirm(`Remover a extração "${e.nome}"?`)) return;
    deleteExtracao(e.id);
    setExtracoesState(getExtracoes());
    if (editando?.id === e.id) setEditando(null);
  };

  const abrirEditar = (e: Extracao) => {
    setEditando(e);
    setNovo(false);
    setForm({ nome: e.nome, encerra: e.encerra, ativa: e.ativa });
  };

  const abrirNovo = () => {
    setEditando(null);
    setNovo(true);
    setForm({ nome: "", encerra: "12:00", ativa: true });
  };

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-gray-800">Loterias / Extrações</h1>
      <p className="mb-6 text-sm text-gray-600">
        Edite as extrações que seus clientes podem apostar. Nome e horário de encerramento definem quando as apostas são encerradas. Ative ou desative cada uma. Em Configurações você define se o cliente pode apostar até 1/5 ou até 1/10.
      </p>

      <div className="mb-4 flex flex-wrap gap-3">
        <button
          onClick={abrirNovo}
          className="rounded bg-orange-500 px-4 py-2 text-sm font-medium text-white hover:bg-orange-600"
        >
          Nova extração
        </button>
        <button
          onClick={restaurarPadrao}
          className="rounded border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          Restaurar lista padrão (55 loterias)
        </button>
      </div>

      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white shadow">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-600">Nome</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-600">Encerra</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-600">Status</th>
              <th className="px-4 py-3 text-right text-xs font-medium uppercase text-gray-600">Ações</th>
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
                <td className="px-4 py-3 text-right">
                  <button
                    onClick={() => abrirEditar(e)}
                    className="mr-2 rounded bg-orange-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-orange-600"
                  >
                    Editar
                  </button>
                  <button
                    onClick={() => apagar(e)}
                    className="rounded bg-red-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-600"
                  >
                    Apagar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Modal Editar / Novo */}
      {(editando || novo) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl [color:#171717]">
            <h2 className="mb-4 text-xl font-bold [color:#171717]">
              {novo ? "Nova extração" : "Editar extração"}
            </h2>
            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-sm text-gray-600">Nome</label>
                <input
                  type="text"
                  value={form.nome ?? ""}
                  onChange={(e) => setForm({ ...form, nome: e.target.value })}
                  placeholder="Ex: NACIONAL 10:00"
                  className="w-full rounded border border-gray-300 px-4 py-2 [color:#171717]"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm text-gray-600">Encerra (HH:mm)</label>
                <input
                  type="text"
                  value={form.encerra ?? ""}
                  onChange={(e) => setForm({ ...form, encerra: e.target.value })}
                  placeholder="21:20"
                  className="w-full rounded border border-gray-300 px-4 py-2 [color:#171717]"
                />
                <p className="mt-1 text-xs text-gray-500">Até que horário o cliente pode fazer jogos (apostar e cancelar) para esta extração. Ex.: 21:20 para PARATODOS BAHIA 21:20.</p>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="ativa"
                  checked={form.ativa ?? true}
                  onChange={(e) => setForm({ ...form, ativa: e.target.checked })}
                />
                <label htmlFor="ativa" className="text-sm text-gray-700">Ativa (cliente pode apostar)</label>
              </div>
            </div>
            <div className="mt-6 flex gap-3">
              <button
                onClick={salvar}
                className="rounded bg-orange-500 px-4 py-2 font-medium text-white hover:bg-orange-600"
              >
                Salvar
              </button>
              <button
                onClick={() => { setEditando(null); setNovo(false); }}
                className="rounded border border-gray-300 px-4 py-2 hover:bg-gray-50 [color:#171717]"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="mt-8 rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="mb-2 text-lg font-semibold text-gray-800">Prêmios (1/1 a 1/10 ou só 1/5)</h2>
        <p className="text-sm text-gray-500">
          Em <strong>Configurações</strong> você define se os clientes podem apostar até o 5º prêmio (1/5) ou até o 10º (1/10).
        </p>
      </div>
    </div>
  );
}
