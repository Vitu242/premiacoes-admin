"use client";

import { useState, useEffect } from "react";
import {
  getCambistas,
  getGerentes,
  addCambista,
  updateCambista,
  deleteCambista,
} from "@/lib/store";
import type { Cambista } from "@/lib/types";

function formatarMoeda(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function cambistaInicial(gerenteId: string): Omit<Cambista, "id"> {
  return {
    gerenteId,
    login: "",
    senha: "",
    saldo: 0,
    comissaoMilhar: 20,
    comissaoCentena: 20,
    comissaoDezena: 17,
    comissaoGrupo: 17,
    cotacaoM: 6000,
    cotacaoC: 800,
    cotacaoD: 80,
    cotacaoG: 20,
    milharBrinde: "sim",
    endereco: "",
    telefone: "",
    descricao: "",
    status: "ativo",
    risco: "RUIM",
    entrada: 0,
    saidas: 0,
    comissao: 0,
    lancamentos: 0,
    ultimaPrestacao: null,
  };
}

export default function CambistasPage() {
  const [cambistas, setCambistasState] = useState<Cambista[]>([]);
  const [gerentes] = useState(getGerentes());
  const [filtroNome, setFiltroNome] = useState("");
  const [filtroGerente, setFiltroGerente] = useState("todos");
  const [editando, setEditando] = useState<Cambista | null>(null);
  const [novo, setNovo] = useState(false);
  const [form, setForm] = useState(cambistaInicial(gerentes[0]?.id ?? ""));

  useEffect(() => {
    setCambistasState(getCambistas());
  }, []);

  const filtrar = cambistas.filter((c) => {
    const okNome = c.login.toLowerCase().includes(filtroNome.toLowerCase());
    const okGerente =
      filtroGerente === "todos" || c.gerenteId === filtroGerente;
    return okNome && okGerente;
  });

  const abrirEditar = (c: Cambista) => {
    setEditando(c);
    setNovo(false);
    setForm({ ...c });
  };

  const abrirNovo = () => {
    setEditando(null);
    setNovo(true);
    setForm(cambistaInicial(gerentes[0]?.id ?? ""));
  };

  const salvar = () => {
    if (novo) {
      addCambista(form);
    } else if (editando) {
      updateCambista(editando.id, form);
    }
    setCambistasState(getCambistas());
    setEditando(null);
    setNovo(false);
  };

  const apagar = (id: string) => {
    if (confirm("Apagar este cambista?")) {
      deleteCambista(id);
      setCambistasState(getCambistas());
      setEditando(null);
    }
  };

  const getGerenteNome = (id: string) =>
    gerentes.find((g) => g.id === id)?.login ?? "-";

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-gray-800">Cambistas</h1>

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:gap-4">
        <select
          value={filtroGerente}
          onChange={(e) => setFiltroGerente(e.target.value)}
          className="w-full rounded border border-gray-300 px-4 py-2 sm:w-40 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
        >
          <option value="todos">Todos</option>
          {gerentes.map((g) => (
            <option key={g.id} value={g.id}>
              {g.login}
            </option>
          ))}
        </select>
        <input
          type="text"
          placeholder="Filtrar por nome"
          value={filtroNome}
          onChange={(e) => setFiltroNome(e.target.value)}
          className="w-full rounded border border-gray-300 px-4 py-2 sm:w-48 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
        />
        <button
          onClick={abrirNovo}
          className="w-full rounded bg-orange-500 px-4 py-2 font-medium text-white hover:bg-orange-600 sm:w-auto"
        >
          Novo Cambista
        </button>
      </div>

      <p className="mb-4 text-sm text-gray-600">
        {filtrar.length} vendedor(es) encontrado(s)
      </p>

      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white shadow">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-600">
                Login
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-600">
                Cotação / Comissão
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-600">
                Risco
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-600">
                Saldo
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-600">
                Status
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-600">
                Editar
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-600">
                Apagar
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {filtrar.map((c) => (
              <tr key={c.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 text-sm">
                  <div className="font-medium text-gray-900">{c.login}</div>
                  <div className="text-xs text-gray-500">
                    Gerente: {getGerenteNome(c.gerenteId)}
                  </div>
                </td>
                <td className="px-4 py-3 text-xs text-gray-600">
                  <div>M: {c.cotacaoM} / C: {c.cotacaoC} / D: {c.cotacaoD} / G: {c.cotacaoG}</div>
                  <div>M: {c.comissaoMilhar}% | C: {c.comissaoCentena}% | D: {c.comissaoDezena}% | G: {c.comissaoGrupo}%</div>
                </td>
                <td className="px-4 py-3">
                  <span className="rounded-full bg-red-100 px-2 py-1 text-xs text-red-700">
                    {c.risco}
                  </span>
                </td>
                <td className="px-4 py-3 text-sm text-gray-600">
                  {formatarMoeda(c.saldo)}
                </td>
                <td className="px-4 py-3">
                  <span className="rounded-full bg-green-100 px-2 py-1 text-xs text-green-700">
                    {c.status === "ativo" ? "Ativo" : "Inativo"}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <button
                    onClick={() => abrirEditar(c)}
                    className="rounded bg-orange-500 px-3 py-1.5 text-sm text-white hover:bg-orange-600"
                  >
                    Editar
                  </button>
                </td>
                <td className="px-4 py-3">
                  <button
                    onClick={() => apagar(c.id)}
                    className="rounded bg-red-500 px-3 py-1.5 text-sm text-white hover:bg-red-600"
                  >
                    Apagar
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
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg bg-white p-6 shadow-xl">
            <h2 className="mb-4 text-xl font-bold">
              {novo ? "Novo Cambista" : "Atualizar Cambista"}
            </h2>
            <div className="space-y-3">
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
                  className="mt-1 w-full rounded border px-3 py-2"
                />
              </div>
              <div>
                <label className="text-sm text-gray-600">Gerente:</label>
                <select
                  value={form.gerenteId}
                  onChange={(e) =>
                    setForm({ ...form, gerenteId: e.target.value })
                  }
                  className="mt-1 w-full rounded border px-3 py-2"
                >
                  {gerentes.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.login}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-sm text-gray-600">Saldo:</label>
                <input
                  type="number"
                  value={form.saldo}
                  onChange={(e) =>
                    setForm({ ...form, saldo: Number(e.target.value) })
                  }
                  className="mt-1 w-full rounded border px-3 py-2"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-sm text-gray-600">Comissão Milhar %:</label>
                  <input
                    type="number"
                    value={form.comissaoMilhar}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        comissaoMilhar: Number(e.target.value),
                      })
                    }
                    className="mt-1 w-full rounded border px-3 py-2"
                  />
                </div>
                <div>
                  <label className="text-sm text-gray-600">Comissão Centena %:</label>
                  <input
                    type="number"
                    value={form.comissaoCentena}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        comissaoCentena: Number(e.target.value),
                      })
                    }
                    className="mt-1 w-full rounded border px-3 py-2"
                  />
                </div>
                <div>
                  <label className="text-sm text-gray-600">Comissão Dezena %:</label>
                  <input
                    type="number"
                    value={form.comissaoDezena}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        comissaoDezena: Number(e.target.value),
                      })
                    }
                    className="mt-1 w-full rounded border px-3 py-2"
                  />
                </div>
                <div>
                  <label className="text-sm text-gray-600">Comissão Grupo %:</label>
                  <input
                    type="number"
                    value={form.comissaoGrupo}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        comissaoGrupo: Number(e.target.value),
                      })
                    }
                    className="mt-1 w-full rounded border px-3 py-2"
                  />
                </div>
              </div>
              <div>
                <label className="text-sm text-gray-600">Cotações (M/C/D/G):</label>
                <div className="mt-1 grid grid-cols-4 gap-2">
                  <input
                    type="number"
                    value={form.cotacaoM}
                    onChange={(e) =>
                      setForm({ ...form, cotacaoM: Number(e.target.value) })
                    }
                    placeholder="M"
                    className="rounded border px-3 py-2"
                  />
                  <input
                    type="number"
                    value={form.cotacaoC}
                    onChange={(e) =>
                      setForm({ ...form, cotacaoC: Number(e.target.value) })
                    }
                    placeholder="C"
                    className="rounded border px-3 py-2"
                  />
                  <input
                    type="number"
                    value={form.cotacaoD}
                    onChange={(e) =>
                      setForm({ ...form, cotacaoD: Number(e.target.value) })
                    }
                    placeholder="D"
                    className="rounded border px-3 py-2"
                  />
                  <input
                    type="number"
                    value={form.cotacaoG}
                    onChange={(e) =>
                      setForm({ ...form, cotacaoG: Number(e.target.value) })
                    }
                    placeholder="G"
                    className="rounded border px-3 py-2"
                  />
                </div>
              </div>
              <div>
                <label className="text-sm text-gray-600">Milhar brinde:</label>
                <select
                  value={form.milharBrinde}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      milharBrinde: e.target.value as "sim" | "nao",
                    })
                  }
                  className="mt-1 w-full rounded border px-3 py-2"
                >
                  <option value="sim">Sim</option>
                  <option value="nao">Não</option>
                </select>
              </div>
              <div>
                <label className="text-sm text-gray-600">Endereço:</label>
                <input
                  type="text"
                  value={form.endereco}
                  onChange={(e) =>
                    setForm({ ...form, endereco: e.target.value })
                  }
                  className="mt-1 w-full rounded border px-3 py-2"
                />
              </div>
              <div>
                <label className="text-sm text-gray-600">Telefone:</label>
                <input
                  type="text"
                  value={form.telefone}
                  onChange={(e) =>
                    setForm({ ...form, telefone: e.target.value })
                  }
                  className="mt-1 w-full rounded border px-3 py-2"
                />
              </div>
              <div>
                <label className="text-sm text-gray-600">Descrição:</label>
                <textarea
                  value={form.descricao}
                  onChange={(e) =>
                    setForm({ ...form, descricao: e.target.value })
                  }
                  rows={2}
                  className="mt-1 w-full rounded border px-3 py-2"
                />
              </div>
            </div>
            <div className="mt-6 flex gap-3">
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
                  Apagar
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
