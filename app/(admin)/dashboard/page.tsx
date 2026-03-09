"use client";

import { useMemo, useState } from "react";
import {
  getBilhetes,
  getLancamentos,
  getCambistasPorCodigo,
  getGerentesPorCodigo,
  calcularComissaoBilhete,
  getJogosEmAberto,
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

export default function DashboardPage() {
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
  const [dataInicio, setDataInicio] = useState<string>("");
  const [dataFim, setDataFim] = useState<string>("");

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
  const totalComissao = useMemo(() => {
    return bilhetes.reduce((s, b) => {
      const cam = cambistas.find((c) => c.id === b.cambistaId);
      return cam ? s + calcularComissaoBilhete(b, cam) : s;
    }, 0);
  }, [bilhetes, cambistas]);

  const totalJogosEmAberto = useMemo(() => {
    return cambistas
      .filter((c) => idsCambistasFiltro.has(c.id))
      .reduce((s, c) => s + getJogosEmAberto(c.id), 0);
  }, [cambistas, idsCambistasFiltro]);

  const bilhetesPendentesQtd = bilhetesTodos.filter(
    (b) => idsCambistasFiltro.has(b.cambistaId) && b.situacao === "pendente"
  ).length;

  const totalAdiantar = lancamentos
    .filter((l) => l.tipo === "adiantar")
    .reduce((s, l) => s + l.valor, 0);
  const totalRetirar = lancamentos
    .filter((l) => l.tipo === "retirar")
    .reduce((s, l) => s + l.valor, 0);
  const saldoLancamentos = totalAdiantar - totalRetirar;

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-gray-800">Dashboard</h1>

      <div className="mb-6 flex flex-wrap gap-3 rounded-lg border border-gray-200 bg-gray-50 p-4">
        <select
          value={tipoFiltro}
          onChange={(e) =>
            setTipoFiltro(e.target.value as "todos" | "gerente" | "cambista")
          }
          className="rounded border border-gray-300 px-3 py-2 text-sm text-black"
        >
          <option value="todos">Todos</option>
          <option value="gerente">Por gerente</option>
          <option value="cambista">Por cambista</option>
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

        {tipoFiltro === "cambista" && (
          <select
            value={cambistaId}
            onChange={(e) => setCambistaId(e.target.value)}
            className="rounded border border-gray-300 px-3 py-2 text-sm text-black"
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
          onClick={() => {}}
          className="rounded bg-orange-500 px-4 py-2 text-sm font-medium text-white hover:bg-orange-600"
        >
          Buscar
        </button>
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border border-gray-200 bg-white p-4 shadow">
          <p className="text-sm text-gray-500">Total vendido</p>
          <p className="text-xl font-bold text-gray-800">
            {formatarMoeda(totalVendido)}
          </p>
          <p className="text-xs text-gray-400">
            {bilhetes.length} bilhete(s) no período
          </p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4 shadow">
          <p className="text-sm text-gray-500">Comissão</p>
          <p className="text-xl font-bold text-orange-600">
            {formatarMoeda(totalComissao)}
          </p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4 shadow">
          <p className="text-sm text-gray-500">Bilhetes pendentes</p>
          <p className="text-xl font-bold text-amber-600">
            {bilhetesPendentesQtd}
          </p>
          <p className="text-xs text-gray-400">
            Valor em aberto: {formatarMoeda(totalJogosEmAberto)}
          </p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4 shadow">
          <p className="text-sm text-gray-500">Lançamentos (período)</p>
          <p className="text-sm text-green-600">+ {formatarMoeda(totalAdiantar)}</p>
          <p className="text-sm text-red-600">− {formatarMoeda(totalRetirar)}</p>
          <p className="text-xs font-medium text-gray-700">
            Saldo: {formatarMoeda(saldoLancamentos)}
          </p>
        </div>
      </div>
    </div>
  );
}
