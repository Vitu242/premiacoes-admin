"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { getBilhetes, getLancamentos } from "@/lib/store";
import { useVisibilityRefresh } from "@/lib/use-config-refresh";

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

export default function ClienteRelatorioPage() {
  const router = useRouter();
  const [cambistaId, setCambistaId] = useState<string | null>(null);
  const [dataInicio, setDataInicio] = useState<string>("");
  const [dataFim, setDataFim] = useState<string>("");
  const [refreshKey, setRefreshKey] = useState(0);

  const bilhetesTodos = useMemo(() => getBilhetes(), [refreshKey]);
  const lancamentosTodos = useMemo(() => getLancamentos(), [refreshKey]);

  const atualizar = () => {
    const auth = localStorage.getItem("premiacoes_cliente");
    if (!auth) return;
    const { cambistaId: cid } = JSON.parse(auth);
    setCambistaId(cid);
    setRefreshKey((k) => k + 1);
  };

  useEffect(() => {
    const auth = localStorage.getItem("premiacoes_cliente");
    if (!auth) {
      router.replace("/cliente/login");
      return;
    }
    const { cambistaId: cid } = JSON.parse(auth);
    setCambistaId(cid);
  }, [router]);

  useVisibilityRefresh(atualizar);

  const dataInicioDate = dataInicio ? new Date(`${dataInicio}T00:00:00`) : null;
  const dataFimDate = dataFim ? new Date(`${dataFim}T23:59:59`) : null;

  const bilhetes = useMemo(() => {
    if (!cambistaId) return [];
    return bilhetesTodos.filter((b) => {
      if (b.cambistaId !== cambistaId) return false;
      if (dataInicioDate || dataFimDate) {
        const dt = parseDataBrasil(b.data);
        if (!dt) return false;
        if (dataInicioDate && dt < dataInicioDate) return false;
        if (dataFimDate && dt > dataFimDate) return false;
      }
      return true;
    });
  }, [bilhetesTodos, cambistaId, dataInicioDate, dataFimDate]);

  const lancamentos = useMemo(() => {
    if (!cambistaId) return [];
    return lancamentosTodos.filter((l) => {
      if (l.cambistaId !== cambistaId) return false;
      if (dataInicioDate || dataFimDate) {
        const dt = parseDataBrasil(l.data);
        if (!dt) return false;
        if (dataInicioDate && dt < dataInicioDate) return false;
        if (dataFimDate && dt > dataFimDate) return false;
      }
      return true;
    });
  }, [lancamentosTodos, cambistaId, dataInicioDate, dataFimDate]);

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

  const handleImprimir = () => {
    window.print();
  };

  if (!cambistaId) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white">
        <p className="text-gray-500">Carregando...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white p-4 pb-24 print:max-w-none">
      <div className="mb-4 flex items-center gap-2">
        <button
          type="button"
          onClick={() => router.back()}
          className="rounded p-2 text-gray-600 hover:bg-gray-100 print:hidden"
          aria-label="Voltar"
        >
          <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h1 className="flex-1 text-lg font-bold text-gray-800 print:text-xl">Relatório</h1>
        <button
          onClick={handleImprimir}
          className="rounded bg-orange-500 px-4 py-2 text-sm font-medium text-white hover:bg-orange-600 print:hidden"
        >
          Imprimir / PDF
        </button>
      </div>

      <div className="mb-6 flex flex-wrap gap-3 rounded-lg border border-gray-200 bg-gray-50 p-4 print:mb-2">
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

      <div className="mb-6 grid gap-4 grid-cols-2 lg:grid-cols-4 print:mb-2">
        <div className="rounded-lg border border-gray-200 bg-white p-4 shadow">
          <p className="text-sm text-gray-500">Bilhetes</p>
          <p className="text-xl font-bold text-gray-800">{bilhetes.length}</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4 shadow">
          <p className="text-sm text-gray-500">Total vendido</p>
          <p className="text-xl font-bold text-gray-800">{formatarMoeda(totalVendido)}</p>
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
            {(["pendente", "pago", "perdedor", "cancelado"] as const).map((sit) => (
              <tr key={sit}>
                <td className="px-4 py-2 text-sm text-gray-700 capitalize">{sit}</td>
                <td className="px-4 py-2 text-right text-sm text-gray-700">
                  {porSituacao[sit].qtd}
                </td>
                <td className="px-4 py-2 text-right text-sm font-medium text-gray-700">
                  {formatarMoeda(porSituacao[sit].valor)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
