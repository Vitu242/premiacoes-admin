"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  getGerentes,
  setGerentes,
  addGerente,
  updateGerente,
  deleteGerente,
  getCambistas,
} from "@/lib/store";
import type { Gerente } from "@/lib/types";

function gerenteInicial(): Omit<Gerente, "id" | "criadoEm"> {
  return {
    login: "",
    senha: "",
    tipo: "Gerente",
    comissaoBruto: 0,
    comissaoLucro: 0,
    endereco: "",
    telefone: "",
    descricao: "",
    criarCambista: false,
    adicionarSaldo: false,
    status: "ativo",
    socio: "-",
  };
}

export default function GerentesPage() {
  const [gerentes, setGerentesState] = useState<Gerente[]>([]);
  const [filtro, setFiltro] = useState("");
  const [editando, setEditando] = useState<Gerente | null>(null);
  const [novo, setNovo] = useState(false);
  const [form, setForm] = useState(gerenteInicial());

  useEffect(() => {
    setGerentesState(getGerentes());
  }, []);

  const filtrar = gerentes.filter((g) =>
    g.login.toLowerCase().includes(filtro.toLowerCase())
  );

  const abrirEditar = (g: Gerente) => {
    setEditando(g);
    setNovo(false);
    setForm({
      login: g.login,
      senha: g.senha,
      tipo: g.tipo,
      comissaoBruto: g.comissaoBruto,
      comissaoLucro: g.comissaoLucro,
      endereco: g.endereco,
      telefone: g.telefone,
      descricao: g.descricao,
      criarCambista: g.criarCambista,
      adicionarSaldo: g.adicionarSaldo,
      status: g.status,
      socio: g.socio,
    });
  };

  const abrirNovo = () => {
    setEditando(null);
    setNovo(true);
    setForm(gerenteInicial());
  };

  const salvar = () => {
    if (novo) {
      if (!form.login.trim()) {
        alert("Preencha o login.");
        return;
      }
      addGerente(form);
    } else if (editando) {
      if (!form.login.trim()) {
        alert("Preencha o login.");
        return;
      }
      updateGerente(editando.id, form);
    }
    setGerentesState(getGerentes());
    setEditando(null);
    setNovo(false);
  };

  const apagar = (id: string) => {
    if (confirm("Apagar este gerente? Os cambistas vinculados serão removidos.")) {
      deleteGerente(id);
      setGerentesState(getGerentes());
      setEditando(null);
    }
  };

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-gray-800">Gerentes</h1>

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
        <input
          type="text"
          placeholder="Filtrar por nome"
          value={filtro}
          onChange={(e) => setFiltro(e.target.value)}
          className="w-full rounded border border-gray-300 px-4 py-2 sm:w-64 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
        />
        <button
          onClick={abrirNovo}
          className="w-full rounded bg-orange-500 px-4 py-2 font-medium text-white hover:bg-orange-600 sm:w-auto"
        >
          Novo Gerente
        </button>
      </div>

      <p className="mb-4 text-sm text-gray-600">
        {filtrar.length} gerente(s) encontrado(s)
      </p>

      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white shadow">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-600">
                Login
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-600">
                Bruto
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-600">
                Lucro
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-600">
                Sócio
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-600">
                Status
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-600">
                Editar
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {filtrar.map((g) => (
              <tr key={g.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 text-sm text-gray-900">{g.login}</td>
                <td className="px-4 py-3 text-sm text-gray-600">{g.comissaoBruto}%</td>
                <td className="px-4 py-3 text-sm text-gray-600">{g.comissaoLucro}%</td>
                <td className="px-4 py-3 text-sm text-gray-600">{g.socio}</td>
                <td className="px-4 py-3">
                  <span className="rounded-full bg-green-100 px-2 py-1 text-xs text-green-700">
                    {g.status === "ativo" ? "Ativo" : "Inativo"}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <button
                    onClick={() => abrirEditar(g)}
                    className="rounded bg-orange-500 px-3 py-1.5 text-sm text-white hover:bg-orange-600"
                  >
                    Editar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Modal Editar/Novo */}
      {(editando || novo) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg bg-white p-6 shadow-xl [color:#171717]">
            <h2 className="mb-4 text-xl font-bold [color:#171717]">
              {novo ? "Novo Gerente" : "Atualizar Usuário"}
            </h2>
            <div className="space-y-3">
              {!novo && (
                <div>
                  <label className="text-sm text-gray-600">Criado em:</label>
                  <p className="text-sm">{editando?.criadoEm}</p>
                </div>
              )}
              <div>
                <label className="text-sm text-gray-600">Login:</label>
                <input
                  type="text"
                  value={form.login}
                  onChange={(e) => setForm({ ...form, login: e.target.value })}
                  className="mt-1 w-full rounded border px-3 py-2"
                />
              </div>
              <div>
                <label className="text-sm text-gray-600">Senha:</label>
                <input
                  type="password"
                  value={form.senha}
                  onChange={(e) => setForm({ ...form, senha: e.target.value })}
                  placeholder="Deixe em branco para manter"
                  className="mt-1 w-full rounded border px-3 py-2"
                />
              </div>
              <div>
                <label className="text-sm text-gray-600">Tipo:</label>
                <select
                  value={form.tipo}
                  onChange={(e) => setForm({ ...form, tipo: e.target.value })}
                  className="mt-1 w-full rounded border px-3 py-2"
                >
                  <option>Gerente</option>
                </select>
              </div>
              <div>
                <label className="text-sm text-gray-600">Comissão Bruto:</label>
                <input
                  type="number"
                  value={form.comissaoBruto}
                  onChange={(e) =>
                    setForm({ ...form, comissaoBruto: Number(e.target.value) })
                  }
                  className="mt-1 w-full rounded border px-3 py-2"
                />
              </div>
              <div>
                <label className="text-sm text-gray-600">Comissão Lucro:</label>
                <input
                  type="number"
                  value={form.comissaoLucro}
                  onChange={(e) =>
                    setForm({ ...form, comissaoLucro: Number(e.target.value) })
                  }
                  className="mt-1 w-full rounded border px-3 py-2"
                />
              </div>
              <div>
                <label className="text-sm text-gray-600">Endereço:</label>
                <input
                  type="text"
                  value={form.endereco}
                  onChange={(e) => setForm({ ...form, endereco: e.target.value })}
                  className="mt-1 w-full rounded border px-3 py-2"
                />
              </div>
              <div>
                <label className="text-sm text-gray-600">Telefone:</label>
                <input
                  type="text"
                  value={form.telefone}
                  onChange={(e) => setForm({ ...form, telefone: e.target.value })}
                  className="mt-1 w-full rounded border px-3 py-2"
                />
              </div>
              <div>
                <label className="text-sm text-gray-600">Descrição:</label>
                <textarea
                  value={form.descricao}
                  onChange={(e) => setForm({ ...form, descricao: e.target.value })}
                  rows={2}
                  className="mt-1 w-full rounded border px-3 py-2"
                />
              </div>
              <div className="flex gap-4">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={form.criarCambista}
                    onChange={(e) =>
                      setForm({ ...form, criarCambista: e.target.checked })
                    }
                  />
                  Criar Cambista
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={form.adicionarSaldo}
                    onChange={(e) =>
                      setForm({ ...form, adicionarSaldo: e.target.checked })
                    }
                  />
                  Adicionar saldo
                </label>
              </div>
            </div>
            <div className="mt-6 flex flex-wrap gap-3">
              <button
                onClick={salvar}
                className="rounded bg-orange-500 px-4 py-2 font-medium text-white hover:bg-orange-600"
              >
                Salvar
              </button>
              {!novo && editando && (
                <button
                  onClick={() => apagar(editando.id)}
                  className="rounded bg-red-600 px-4 py-2 font-medium text-white hover:bg-red-700"
                >
                  Apagar Gerente
                </button>
              )}
              <button
                onClick={() => {
                  setEditando(null);
                  setNovo(false);
                }}
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
