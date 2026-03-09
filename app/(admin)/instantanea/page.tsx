"use client";

import { useState, useEffect } from "react";
import { getConfig, setConfig, getInstantaneaStats, limparInstantaneaStats } from "@/lib/store";
import { addLog } from "@/lib/auditoria";
import { useVisibilityRefresh } from "@/lib/use-config-refresh";

function formatarMoeda(v: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(v);
}

export default function InstantaneaPage() {
  const [lucroPercent, setLucroPercent] = useState(30);
  const [mensagem, setMensagem] = useState<{ tipo: "sucesso" | "erro"; texto: string } | null>(null);

  const carregar = () => {
    const cfg = getConfig();
    setLucroPercent(cfg.lucroBancaInstantaneaPercent ?? 30);
  };

  useEffect(() => carregar(), []);
  useVisibilityRefresh(carregar);

  const stats = getInstantaneaStats();
  const total = stats.venda + stats.premio + stats.comissao;
  const base = stats.venda > 0 ? stats.venda : 1;
  const pctVenda = stats.venda > 0 ? 100 : 0;
  const pctPremio = (stats.premio / base) * 100;
  const pctComissao = (stats.comissao / base) * 100;
  const pctTotal = (total / base) * 100;

  const handleSalvar = () => {
    const v = Math.max(0, Math.min(100, lucroPercent));
    setConfig({ lucroBancaInstantaneaPercent: v });
    addLog("Configuração", `Lucro da banca instantânea alterado para ${v}%`);
    setMensagem({ tipo: "sucesso", texto: "Configuração salva!" });
  };

  const handleLimpar = () => {
    limparInstantaneaStats();
    addLog("Configuração", "Estatísticas da loteria instantânea zeradas");
    setMensagem({ tipo: "sucesso", texto: "Estatísticas limpas." });
  };

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-gray-800">Loteria Instantânea</h1>

      {mensagem && (
        <p
          className={`mb-4 rounded p-2 text-sm ${
            mensagem.tipo === "sucesso" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-600"
          }`}
        >
          {mensagem.texto}
        </p>
      )}

      <div className="mb-8 rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold text-gray-800">Métricas</h2>
        <table className="w-full max-w-md border-collapse">
          <thead>
            <tr className="border-b border-gray-200">
              <th className="px-4 py-2 text-left text-sm font-medium text-gray-600">Item</th>
              <th className="px-4 py-2 text-right text-sm font-medium text-gray-600">Valor (R$)</th>
              <th className="px-4 py-2 text-right text-sm font-medium text-gray-600">%</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-gray-100">
              <td className="px-4 py-2 text-gray-700">Venda</td>
              <td className="px-4 py-2 text-right">{formatarMoeda(stats.venda)}</td>
              <td className="px-4 py-2 text-right text-gray-600">{pctVenda.toFixed(1)}%</td>
            </tr>
            <tr className="border-b border-gray-100">
              <td className="px-4 py-2 text-gray-700">Prêmio</td>
              <td className="px-4 py-2 text-right">{formatarMoeda(stats.premio)}</td>
              <td className="px-4 py-2 text-right text-gray-600">{pctPremio.toFixed(1)}%</td>
            </tr>
            <tr className="border-b border-gray-100">
              <td className="px-4 py-2 text-gray-700">Comissão</td>
              <td className="px-4 py-2 text-right">{formatarMoeda(stats.comissao)}</td>
              <td className="px-4 py-2 text-right text-gray-600">{pctComissao.toFixed(1)}%</td>
            </tr>
            <tr className="font-medium">
              <td className="px-4 py-2 text-gray-800">Total</td>
              <td className="px-4 py-2 text-right">{formatarMoeda(total)}</td>
              <td className="px-4 py-2 text-right text-gray-800">{pctTotal.toFixed(1)}%</td>
            </tr>
          </tbody>
        </table>
        <button
          type="button"
          onClick={handleLimpar}
          className="mt-4 rounded bg-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-300"
        >
          Limpar
        </button>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold text-gray-800">Configuração</h2>
        <div className="flex max-w-md flex-wrap items-end gap-4">
          <div>
            <label className="mb-1 block text-sm text-gray-600">Lucro da banca (%)</label>
            <input
              type="number"
              min={0}
              max={100}
              step={1}
              value={lucroPercent}
              onChange={(e) => setLucroPercent(Number(e.target.value) || 0)}
              className="rounded border border-gray-300 px-4 py-2"
            />
          </div>
          <button
            type="button"
            onClick={handleSalvar}
            className="rounded bg-orange-500 px-4 py-2 font-medium text-white hover:bg-orange-600"
          >
            Salvar
          </button>
        </div>
      </div>
    </div>
  );
}
