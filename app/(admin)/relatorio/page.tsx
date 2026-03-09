"use client";

import { useMemo, useState } from "react";
import {
  getBilhetes,
  getLancamentos,
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

export default function RelatorioPage() {
  const codigo = getAdminCodigo();
  const gerentes = useMemo(
    () => getGerentesPorCodigo(codigo ?? ""),
    [codigo],
  );
  const cambistas = useMemo(
    () => getCambistasPorCodigo(codigo ?? ""),
    [codigo],
  );
  const bilhetesTodos = useMemo(() => getBilhetes(), []);
  const lancamentosTodos = useMemo(() => getLancamentos(), []);

  const [tipoFiltro, setTipoFiltro] = useState<"todos" | "gerente" | "cambista">("todos");
  const [gerenteId, setGerenteId] = useState<string>("todos");
  const [cambistaId, setCambistaId] = useState<string>("todos");
  const hoje = new Date().toISOString().slice(0, 10);
  const [dataInicio, setDataInicio] = useState<string>("");
  const [dataFim, setDataFim] = useState<string>("");
  const [dataDia, setDataDia] = useState(hoje);

  const idsCambistasFiltro = useMemo(() => {
    let lista = cambistas;
    if (tipoFiltro === "gerente" && gerenteId !== "todos") {
      lista = cambistas.filter((c) => c.gerenteId === gerenteId);
    } else if (tipoFiltro === "cambista" && cambistaId !== "todos") {
      lista = cambistas.filter((c) => c.id === cambistaId);
    }
    return new Set(lista.map((c) => c.id));
  }, [cambistas, tipoFiltro, gerenteId, cambistaId]);

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

  const lancamentos = lancamentosTodos.filter((l) => {
    if (!idsCambistasFiltro.has(l.cambistaId)) return false;
    if (dataInicioDate || dataFimDate) {
      const dt = parseDataBrasil(l.data);
      if (!dt) return false;
      if (dataInicioDate && dt < dataInicioDate) return false;
      if (dataFimDate && dt > dataFimDate) return false;
    }
    return true;
  });

  const totalVendido = bilhetes.reduce((s, b) => s + b.total, 0);
  const porSituacao = useMemo(() => {
    const m: Record<string, { qtd: number; valor: number }> = {
      pendente: { qtd: 0, valor: 0 },
      pago: { qtd: 0, valor: 0 },
      perdedor: { qtd: 0, valor: 0 },
      cancelado: { qtd: 0, valor: 0 },
    };
    for (const b of bilhetes) {
      m[b.situacao].qtd += 1;
      m[b.situacao].valor += b.total;
    }
    return m;
  }, [bilhetes]);

  const totalLancamentosAdiantar = lancamentos
    .filter((l) => l.tipo === "adiantar")
    .reduce((s, l) => s + l.valor, 0);
  const totalLancamentosRetirar = lancamentos
    .filter((l) => l.tipo === "retirar")
    .reduce((s, l) => s + l.valor, 0);

  const porCambista = useMemo(() => {
    const mapa = new Map<
      string,
      { nome: string; qtd: number; vendido: number }
    >();
    for (const b of bilhetes) {
      const cam = cambistas.find((c) => c.id === b.cambistaId);
      const nome = cam?.login ?? "-";
      const atual = mapa.get(b.cambistaId);
      if (atual) {
        atual.qtd += 1;
        atual.vendido += b.total;
      } else {
        mapa.set(b.cambistaId, { nome, qtd: 1, vendido: b.total });
      }
    }
    return [...mapa.entries()].map(([id, v]) => ({ id, ...v }));
  }, [bilhetes, cambistas]);

  const handleImprimir = () => {
    window.print();
  };

  const handleSalvarPDFDia = () => {
    setDataInicio(dataDia);
    setDataFim(dataDia);
    setTimeout(() => window.print(), 250);
  };

  return (
    <div className="print:max-w-none">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between print:mb-2">
        <h1 className="text-2xl font-bold text-gray-800 print:text-xl">
          Relatório
        </h1>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 rounded-lg border border-orange-200 bg-orange-50 px-4 py-2 print:hidden">
            <span className="text-sm font-medium text-gray-700">Relatório do dia:</span>
            <input
              type="date"
              value={dataDia}
              onChange={(e) => setDataDia(e.target.value)}
              className="rounded border border-gray-300 px-3 py-1.5 text-sm"
            />
            <button
              onClick={handleSalvarPDFDia}
              className="rounded bg-orange-500 px-4 py-1.5 font-medium text-white hover:bg-orange-600"
            >
              Salvar PDF
            </button>
          </div>
          <button
            onClick={handleImprimir}
            className="rounded bg-gray-600 px-4 py-2 font-medium text-white hover:bg-gray-700 print:hidden"
          >
            Imprimir / PDF (período)
          </button>
        </div>
      </div>

      <div className="mb-6 flex flex-wrap gap-3 rounded-lg border border-gray-200 bg-gray-50 p-4 print:mb-2">
        <select
          value={tipoFiltro}
          onChange={(e) =>
            setTipoFiltro(e.target.value as "todos" | "gerente" | "cambista")
          }
          className="rounded border border-gray-300 px-3 py-2 text-sm text-black print:hidden"
        >
          <option value="todos">Todos</option>
          <option value="gerente">Por gerente</option>
          <option value="cambista">Por cambista</option>
        </select>

        {tipoFiltro === "gerente" && (
          <select
            value={gerenteId}
            onChange={(e) => setGerenteId(e.target.value)}
            className="rounded border border-gray-300 px-3 py-2 text-sm text-black print:hidden"
          >
            <option value="todos">Todos gerentes</option>
            {gerentes.map((g) => (
              <option key={g.id} value={g.id}>
                {g.login}
              </option>
            ))}
          </select>
        )}

        {tipoFiltro === "cambista" && (
          <select
            value={cambistaId}
            onChange={(e) => setCambistaId(e.target.value)}
            className="rounded border border-gray-300 px-3 py-2 text-sm text-black print:hidden"
          >
            <option value="todos">Todos cambistas</option>
            {cambistas.map((c) => (
              <option key={c.id} value={c.id}>
                {c.login}
              </option>
            ))}
          </select>
        )}

        <input
          type="date"
          value={dataInicio}
          onChange={(e) => setDataInicio(e.target.value)}
          className="rounded border border-gray-300 px-3 py-2 text-sm text-black print:hidden"
        />
        <input
          type="date"
          value={dataFim}
          onChange={(e) => setDataFim(e.target.value)}
          className="rounded border border-gray-300 px-3 py-2 text-sm text-black print:hidden"
        />
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4 print:mb-2">
        <div className="rounded-lg border border-gray-200 bg-white p-4 shadow">
          <p className="text-sm text-gray-500">Bilhetes</p>
          <p className="text-xl font-bold text-gray-800">{bilhetes.length}</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4 shadow">
          <p className="text-sm text-gray-500">Total vendido</p>
          <p className="text-xl font-bold text-gray-800">
            {formatarMoeda(totalVendido)}
          </p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4 shadow">
          <p className="text-sm text-gray-500">Adiantamentos</p>
          <p className="text-xl font-bold text-green-600">
            {formatarMoeda(totalLancamentosAdiantar)}
          </p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4 shadow">
          <p className="text-sm text-gray-500">Retiradas</p>
          <p className="text-xl font-bold text-red-600">
            {formatarMoeda(totalLancamentosRetirar)}
          </p>
        </div>
      </div>

      <div className="mb-6 overflow-x-auto rounded-lg border border-gray-200 bg-white shadow print:break-inside-avoid">
        <h2 className="border-b border-gray-200 bg-gray-50 px-4 py-2 text-sm font-semibold text-gray-700">
          Por situação
        </h2>
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-2 text-left text-xs font-medium uppercase text-gray-500">
                Situação
              </th>
              <th className="px-4 py-2 text-right text-xs font-medium uppercase text-gray-500">
                Qtd
              </th>
              <th className="px-4 py-2 text-right text-xs font-medium uppercase text-gray-500">
                Valor
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {(["pendente", "pago", "perdedor", "cancelado"] as const).map(
              (sit) => (
                <tr key={sit}>
                  <td className="px-4 py-2 text-sm text-gray-700 capitalize">
                    {sit}
                  </td>
                  <td className="px-4 py-2 text-right text-sm text-gray-700">
                    {porSituacao[sit].qtd}
                  </td>
                  <td className="px-4 py-2 text-right text-sm font-medium text-gray-700">
                    {formatarMoeda(porSituacao[sit].valor)}
                  </td>
                </tr>
              )
            )}
          </tbody>
        </table>
      </div>

      {porCambista.length > 0 && (
        <div className="mb-6 overflow-x-auto rounded-lg border border-gray-200 bg-white shadow print:break-inside-avoid">
          <h2 className="border-b border-gray-200 bg-gray-50 px-4 py-2 text-sm font-semibold text-gray-700">
            Por cambista
          </h2>
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-medium uppercase text-gray-500">
                  Cambista
                </th>
                <th className="px-4 py-2 text-right text-xs font-medium uppercase text-gray-500">
                  Bilhetes
                </th>
                <th className="px-4 py-2 text-right text-xs font-medium uppercase text-gray-500">
                  Vendido
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {porCambista.map((c) => (
                <tr key={c.id}>
                  <td className="px-4 py-2 text-sm text-gray-700">{c.nome}</td>
                  <td className="px-4 py-2 text-right text-sm text-gray-700">
                    {c.qtd}
                  </td>
                  <td className="px-4 py-2 text-right text-sm font-medium text-gray-700">
                    {formatarMoeda(c.vendido)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

    </div>
  );
}
