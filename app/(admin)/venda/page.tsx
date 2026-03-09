"use client";

import { useMemo, useState } from "react";
import {
  getBilhetes,
  getCambistasPorCodigo,
  getGerentesPorCodigo,
} from "@/lib/store";
import { getAdminCodigo } from "@/lib/auth";

function formatarMoeda(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function parseDataBrasil(dataStr: string): Date | null {
  const m = dataStr.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (!m) return null;
  const [, d, M, y] = m;
  const ano = (y ?? "").length === 2 ? `20${y}` : y;
  const dia = String(d ?? "").padStart(2, "0");
  const mes = String(M ?? "").padStart(2, "0");
  const iso = `${ano}-${mes}-${dia}T00:00:00`;
  const dt = new Date(iso);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

export default function VendasAdminPage() {
  const codigo = getAdminCodigo();
  const gerentes = useMemo(
    () => getGerentesPorCodigo(codigo ?? ""),
    [codigo],
  );
  const cambistas = useMemo(
    () => getCambistasPorCodigo(codigo ?? ""),
    [codigo],
  );
  const [tipoFiltro, setTipoFiltro] = useState<"todos" | "gerente">("todos");
  const [gerenteId, setGerenteId] = useState<string>("todos");
  const [dataInicio, setDataInicio] = useState<string>("");
  const [dataFim, setDataFim] = useState<string>("");
  const [refreshKey, setRefreshKey] = useState(0);
  const bilhetesTodos = useMemo(() => getBilhetes(), [refreshKey]);

  const cambistasDoGerente = useMemo(() => {
    if (tipoFiltro !== "gerente" || gerenteId === "todos") return cambistas;
    return cambistas.filter((c) => c.gerenteId === gerenteId);
  }, [cambistas, tipoFiltro, gerenteId]);

  const idsCambistasFiltro = useMemo(
    () => new Set(cambistasDoGerente.map((c) => c.id)),
    [cambistasDoGerente],
  );

  const dataInicioDate = dataInicio ? new Date(`${dataInicio}T00:00:00`) : null;
  const dataFimDate = dataFim ? new Date(`${dataFim}T23:59:59`) : null;

  const bilhetes = bilhetesTodos.filter((b) => {
    if (!idsCambistasFiltro.has(b.cambistaId)) return false;
    if (dataInicioDate || dataFimDate) {
      const dt = parseDataBrasil(b.data);
      if (!dt) return false;
      if (dataInicioDate && dt < dataInicioDate) return false;
      if (dataFimDate && dt > dataFimDate) return false;
    }
    return true;
  });

  const totalVendido = bilhetes.reduce((s, b) => s + b.total, 0);

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-gray-800">Venda</h1>

      <div className="mb-4 flex flex-wrap gap-3">
        <select
          value={tipoFiltro}
          onChange={(e) =>
            setTipoFiltro(e.target.value as "todos" | "gerente")
          }
          className="rounded border border-gray-300 px-3 py-2 text-sm text-black"
        >
          <option value="todos">Todos</option>
          <option value="gerente">Por gerente</option>
        </select>

        {tipoFiltro === "gerente" && (
          <select
            value={gerenteId}
            onChange={(e) => setGerenteId(e.target.value)}
            className="rounded border border-gray-300 px-3 py-2 text-sm text-black"
          >
            <option value="todos">Todos gerentes</option>
            {gerentes.map((g) => (
              <option key={g.id} value={g.id}>
                {g.login}
              </option>
            ))}
          </select>
        )}

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
        <button
          type="button"
          onClick={() => setRefreshKey((k) => k + 1)}
          className="rounded bg-orange-500 px-4 py-2 text-sm font-medium text-white hover:bg-orange-600"
        >
          Buscar
        </button>
      </div>

      <p className="mb-4 text-sm text-black">
        {bilhetes.length} bilhete(s) encontrado(s) — Total vendido:{" "}
        <strong>{formatarMoeda(totalVendido)}</strong>
      </p>

      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white shadow">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase text-black">
                Data
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase text-black">
                Cambista
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase text-black">
                Extração
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium uppercase text-black">
                Total
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase text-black">
                Situação
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {bilhetes.length === 0 ? (
              <tr>
                <td
                  colSpan={5}
                  className="px-4 py-8 text-center text-black"
                >
                  Nenhuma venda encontrada para o filtro selecionado.
                </td>
              </tr>
            ) : (
              [...bilhetes]
                .sort(
                  (a, b) =>
                    parseDataBrasil(b.data)?.getTime() ?? 0 -
                    (parseDataBrasil(a.data)?.getTime() ?? 0),
                )
                .map((b) => {
                  const cambistaNome =
                    cambistasDoGerente.find((c) => c.id === b.cambistaId)
                      ?.login ?? "-";
                  return (
                    <tr key={b.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm text-black">
                        {b.data.replace(",", " ")}
                      </td>
                      <td className="px-4 py-3 text-sm text-black">
                        {cambistaNome}
                      </td>
                      <td className="px-4 py-3 text-sm text-black">
                        {b.extracaoNome}
                      </td>
                      <td className="px-4 py-3 text-right text-sm font-medium text-black">
                        {formatarMoeda(b.total)}
                      </td>
                      <td className="px-4 py-3 text-sm text-black">
                        {b.situacao}
                      </td>
                    </tr>
                  );
                })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

