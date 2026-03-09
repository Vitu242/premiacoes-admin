"use client";

import { useState, useEffect } from "react";
import { getSorteios, addSorteio, updateSorteio, deleteSorteio } from "@/lib/store";
import { addLog } from "@/lib/auditoria";
import type { Sorteio as SorteioType } from "@/lib/types";

export default function SorteioPage() {
  const [sorteios, setSorteios] = useState<SorteioType[]>(getSorteios());
  const [editando, setEditando] = useState<SorteioType | null>(null);
  const [novo, setNovo] = useState(false);
  const [form, setForm] = useState<Partial<SorteioType>>({
    nome: "",
    data: new Date().toISOString().slice(0, 10),
    descricao: "",
    ativo: true,
  });

  useEffect(() => {
    setSorteios(getSorteios());
  }, []);

  const dataFormToBr = (iso: string) => {
    if (!iso) return "";
    const [y, m, d] = iso.split("-");
    return `${d}/${m}/${y}`;
  };

  const dataBrToForm = (br: string) => {
    if (!br) return "";
    const m = br.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
    if (!m) return "";
    const [, d, M, y] = m;
    const ano = (y ?? "").length === 2 ? `20${y}` : y;
    return `${ano}-${String(M).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  };

  const salvar = () => {
    if (!form.nome?.trim()) {
      alert("Informe o nome do sorteio.");
      return;
    }
    const dataStr = form.data?.includes("/")
      ? form.data
      : dataFormToBr(form.data || new Date().toISOString().slice(0, 10));

    if (novo) {
      addSorteio({
        nome: form.nome.trim(),
        data: dataStr,
        descricao: form.descricao?.trim() || undefined,
        ativo: form.ativo ?? true,
      });
      addLog("Criou sorteio", form.nome.trim());
    } else if (editando) {
      updateSorteio(editando.id, {
        nome: form.nome.trim(),
        data: dataStr,
        descricao: form.descricao?.trim() || undefined,
        ativo: form.ativo ?? true,
      });
      addLog("Atualizou sorteio", form.nome.trim());
    }
    setSorteios(getSorteios());
    setEditando(null);
    setNovo(false);
    setForm({ nome: "", data: new Date().toISOString().slice(0, 10), descricao: "", ativo: true });
  };

  const apagar = (s: SorteioType) => {
    if (!confirm(`Excluir o sorteio "${s.nome}"?`)) return;
    deleteSorteio(s.id);
    addLog("Excluiu sorteio", s.nome);
    setSorteios(getSorteios());
    if (editando?.id === s.id) setEditando(null);
  };

  const abrirEditar = (s: SorteioType) => {
    setEditando(s);
    setNovo(false);
    setForm({
      nome: s.nome,
      data: dataBrToForm(s.data) || new Date().toISOString().slice(0, 10),
      descricao: s.descricao ?? "",
      ativo: s.ativo,
    });
  };

  const abrirNovo = () => {
    setEditando(null);
    setNovo(true);
    setForm({
      nome: "",
      data: new Date().toISOString().slice(0, 10),
      descricao: "",
      ativo: true,
    });
  };

  return (
    <div>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold text-gray-800">Sorteio</h1>
        <button
          onClick={abrirNovo}
          className="rounded bg-orange-500 px-4 py-2 text-sm font-medium text-white hover:bg-orange-600"
        >
          Novo Sorteio
        </button>
      </div>

      <p className="mb-4 text-sm text-gray-600">
        Cadastre e gerencie sorteios (eventos, promoções). Os dados ficam disponíveis no sistema para consulta.
      </p>

      {sorteios.length === 0 && !novo && !editando ? (
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-8 text-center text-gray-600">
          <p className="mb-4">Nenhum sorteio encontrado.</p>
          <button
            onClick={abrirNovo}
            className="rounded bg-orange-500 px-4 py-2 text-sm font-medium text-white hover:bg-orange-600"
          >
            Novo Sorteio
          </button>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white shadow">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-600">Nome</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-600">Data</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-600">Status</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-600">Criado em</th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase text-gray-600">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {sorteios.map((s) => (
                <tr key={s.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-800">{s.nome}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{s.data}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-1 text-xs font-medium ${
                        s.ativo ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"
                      }`}
                    >
                      {s.ativo ? "Ativo" : "Inativo"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500">{s.criadoEm}</td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => abrirEditar(s)}
                      className="mr-2 rounded bg-orange-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-orange-600"
                    >
                      Editar
                    </button>
                    <button
                      onClick={() => apagar(s)}
                      className="rounded bg-red-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-600"
                    >
                      Excluir
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {(editando || novo) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl [color:#171717]">
            <h2 className="mb-4 text-xl font-bold [color:#171717]">
              {novo ? "Novo Sorteio" : "Editar Sorteio"}
            </h2>
            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-sm text-gray-600">Nome</label>
                <input
                  type="text"
                  value={form.nome ?? ""}
                  onChange={(e) => setForm({ ...form, nome: e.target.value })}
                  placeholder="Ex: Sorteio de Natal"
                  className="w-full rounded border border-gray-300 px-4 py-2 [color:#171717]"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm text-gray-600">Data</label>
                <input
                  type="date"
                  value={form.data?.includes("-") ? form.data : dataBrToForm(form.data ?? "")}
                  onChange={(e) => setForm({ ...form, data: e.target.value })}
                  className="w-full rounded border border-gray-300 px-4 py-2 [color:#171717]"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm text-gray-600">Descrição / Regras / Prêmios</label>
                <textarea
                  value={form.descricao ?? ""}
                  onChange={(e) => setForm({ ...form, descricao: e.target.value })}
                  placeholder="Regras, prêmios ou observações"
                  rows={3}
                  className="w-full rounded border border-gray-300 px-4 py-2 [color:#171717]"
                />
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="sorteio-ativo"
                  checked={form.ativo ?? true}
                  onChange={(e) => setForm({ ...form, ativo: e.target.checked })}
                />
                <label htmlFor="sorteio-ativo" className="text-sm text-gray-700">
                  Ativo
                </label>
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
                onClick={() => {
                  setEditando(null);
                  setNovo(false);
                }}
                className="rounded border border-gray-300 px-4 py-2 hover:bg-gray-50 [color:#171717]"
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
