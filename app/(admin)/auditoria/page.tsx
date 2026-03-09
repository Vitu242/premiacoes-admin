"use client";

import { useMemo, useState } from "react";
import { getLogs } from "@/lib/auditoria";
import { getAdminCodigo } from "@/lib/auth";

function formatarData(iso: string) {
  try {
    const d = new Date(iso);
    return d.toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return iso;
  }
}

export default function AuditoriaPage() {
  const codigo = getAdminCodigo();
  const [filtroAcao, setFiltroAcao] = useState("");
  const [filtroTexto, setFiltroTexto] = useState("");
  const [filtroUsuario, setFiltroUsuario] = useState("");
  const [dataInicio, setDataInicio] = useState("");
  const [dataFim, setDataFim] = useState("");
  const [ordenarPor, setOrdenarPor] = useState<"data" | "tipo" | "id">("data");

  const logs = useMemo(() => getLogs(), []);
  const logsFiltrados = useMemo(() => {
    let r = codigo ? logs.filter((l) => l.codigo === codigo) : logs;
    if (filtroAcao) {
      r = r.filter((l) =>
        l.acao.toLowerCase().includes(filtroAcao.toLowerCase())
      );
    }
    if (filtroTexto.trim()) {
      const t = filtroTexto.toLowerCase();
      r = r.filter(
        (l) =>
          l.detalhes.toLowerCase().includes(t) ||
          l.acao.toLowerCase().includes(t) ||
          (l.admin ?? "").toLowerCase().includes(t)
      );
    }
    if (filtroUsuario.trim()) {
      const u = filtroUsuario.toLowerCase();
      r = r.filter(
        (l) =>
          (l.admin ?? "").toLowerCase().includes(u) ||
          (l.codigo ?? "").toLowerCase().includes(u)
      );
    }
    if (dataInicio || dataFim) {
      r = r.filter((l) => {
        try {
          const d = new Date(l.data);
          if (dataInicio) {
            const di = new Date(dataInicio + "T00:00:00");
            if (d < di) return false;
          }
          if (dataFim) {
            const df = new Date(dataFim + "T23:59:59");
            if (d > df) return false;
          }
          return true;
        } catch {
          return true;
        }
      });
    }
    if (ordenarPor === "data") {
      r = [...r].sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime());
    } else if (ordenarPor === "tipo") {
      r = [...r].sort((a, b) => a.acao.localeCompare(b.acao) || new Date(b.data).getTime() - new Date(a.data).getTime());
    } else {
      r = [...r].sort((a, b) => (b.id ?? "").localeCompare(a.id ?? ""));
    }
    return r;
  }, [logs, codigo, filtroAcao, filtroTexto, filtroUsuario, dataInicio, dataFim, ordenarPor]);

  const acoesUnicas = useMemo(() => {
    const set = new Set(logs.map((l) => l.acao));
    return [...set].sort();
  }, [logs]);

  const usuariosUnicos = useMemo(() => {
    const set = new Set(logs.map((l) => l.admin || l.codigo || "-").filter(Boolean));
    return [...set].sort();
  }, [logs]);

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-gray-800">Auditoria</h1>
      <p className="mb-4 text-sm text-gray-600">
        Registro das ações realizadas no painel. Últimas {logsFiltrados.length}{" "}
        ações.
      </p>

      <div className="mb-4 flex flex-wrap gap-3">
        <input
          type="text"
          placeholder="Buscar em ação/detalhes..."
          value={filtroTexto}
          onChange={(e) => setFiltroTexto(e.target.value)}
          className="rounded border border-gray-300 px-3 py-2 text-sm text-black sm:w-48"
        />
        <select
          value={filtroAcao}
          onChange={(e) => setFiltroAcao(e.target.value)}
          className="rounded border border-gray-300 px-3 py-2 text-sm text-black"
        >
          <option value="">Tipo: Todas</option>
          {acoesUnicas.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
        <select
          value={filtroUsuario}
          onChange={(e) => setFiltroUsuario(e.target.value)}
          className="rounded border border-gray-300 px-3 py-2 text-sm text-black"
        >
          <option value="">Usuário: Todos</option>
          {usuariosUnicos.map((u) => (
            <option key={u} value={u}>
              {u}
            </option>
          ))}
        </select>
        <input
          type="date"
          value={dataInicio}
          onChange={(e) => setDataInicio(e.target.value)}
          className="rounded border border-gray-300 px-3 py-2 text-sm text-black"
        />
        <input
          type="date"
          value={dataFim}
          onChange={(e) => setDataFim(e.target.value)}
          className="rounded border border-gray-300 px-3 py-2 text-sm text-black"
        />
        <select
          value={ordenarPor}
          onChange={(e) => setOrdenarPor(e.target.value as "data" | "tipo" | "id")}
          className="rounded border border-gray-300 px-3 py-2 text-sm text-black"
        >
          <option value="data">Ordenar por: Data</option>
          <option value="tipo">Ordenar por: Tipo</option>
          <option value="id">Ordenar por: ID</option>
        </select>
        <button
          type="button"
          onClick={() => {
            setFiltroAcao("");
            setFiltroTexto("");
            setFiltroUsuario("");
            setDataInicio("");
            setDataFim("");
          }}
          className="rounded border border-gray-300 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50"
        >
          Limpar filtros
        </button>
      </div>

      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white shadow">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-2 text-left text-xs font-medium uppercase text-gray-500">
                Data
              </th>
              <th className="px-4 py-2 text-left text-xs font-medium uppercase text-gray-500">
                Admin
              </th>
              <th className="px-4 py-2 text-left text-xs font-medium uppercase text-gray-500">
                Ação
              </th>
              <th className="px-4 py-2 text-left text-xs font-medium uppercase text-gray-500">
                Detalhes
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {logsFiltrados.length === 0 ? (
              <tr>
                <td
                  colSpan={4}
                  className="px-4 py-8 text-center text-gray-500"
                >
                  Nenhum registro encontrado.
                </td>
              </tr>
            ) : (
              logsFiltrados.map((l) => (
                <tr key={l.id} className="hover:bg-gray-50">
                  <td className="whitespace-nowrap px-4 py-2 text-xs text-gray-600">
                    {formatarData(l.data)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2 text-sm text-gray-700">
                    {l.admin || l.codigo || "-"}
                  </td>
                  <td className="px-4 py-2 text-sm font-medium text-gray-800">
                    {l.acao}
                  </td>
                  <td className="px-4 py-2 text-sm text-gray-600">
                    {l.detalhes}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
