"use client";

import { useState, useEffect, useMemo } from "react";
import { getCambistasPorCodigo, getLancamentos, addLancamento, deleteLancamento } from "@/lib/store";
import { getAdminCodigo } from "@/lib/auth";
import { addLog } from "@/lib/auditoria";
import { hojeIsoDate, isSameIsoInputDate, parseDataPtBrOuIso, formatarDataHoraBr } from "@/lib/date-utils";
import { useVisibilityRefresh } from "@/lib/use-config-refresh";
import { useToast } from "@/app/components/Toast";

function formatarMoeda(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default function LancamentosPage() {
  const toast = useToast();
  const codigo = getAdminCodigo();
  const cambistas = useMemo(() => getCambistasPorCodigo(codigo ?? ""), [codigo]);
  const [lancamentos, setLancamentos] = useState(getLancamentos());
  const [cambistaId, setCambistaId] = useState("");
  const [dataLanc, setDataLanc] = useState<string>(() => hojeIsoDate());
  const [tipo, setTipo] = useState<"adiantar" | "retirar">("adiantar");
  const [valor, setValor] = useState("");
  const [observacao, setObservacao] = useState("");
  const [filtroData, setFiltroData] = useState<string>(() => hojeIsoDate());
  /** Filtro independente do select do formulário — sem isso, escolher cambista
   *  para um novo lançamento "sumia" o histórico dos demais. */
  const [filtroCambistaId, setFiltroCambistaId] = useState("");
  const [salvando, setSalvando] = useState(false);

  const recarregar = () => setLancamentos(getLancamentos());

  useEffect(() => {
    recarregar();
  }, []);
  useVisibilityRefresh(recarregar);

  const handleSalvar = (e: React.FormEvent) => {
    e.preventDefault();
    if (salvando) return;
    if (!cambistaId) {
      toast.error("Selecione um cambista.");
      return;
    }
    if (!valor) {
      toast.error("Informe o valor do lançamento.");
      return;
    }
    const v = parseFloat(valor.replace(",", "."));
    if (!Number.isFinite(v) || v <= 0 || v > 1_000_000) {
      toast.error("Valor inválido.");
      return;
    }
    setSalvando(true);
    try {
      const cam = cambistas.find((c) => c.id === cambistaId);
      const [y, m, d] = dataLanc.split("-");
      const dataStr = `${d}/${m}/${y}, ${new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}`;
      addLancamento({
        cambistaId,
        tipo,
        valor: v,
        data: dataStr,
        observacao: observacao.trim() || undefined,
      });
      addLog("Lançamento", `${tipo}: ${formatarMoeda(v)} para ${cam?.login ?? cambistaId}`);
      setLancamentos(getLancamentos());
      setValor("");
      setObservacao("");
      toast.success(`Lançamento ${tipo === "adiantar" ? "+" : "-"} ${formatarMoeda(v)} (${cam?.login ?? "—"}) salvo!`);
    } catch (e) {
      toast.error(`Erro: ${(e as Error).message}`);
    } finally {
      setSalvando(false);
    }
  };

  const isFechadoNaPrestacao = (l: (typeof lancamentos)[number]) => {
    const cam = cambistas.find((c) => c.id === l.cambistaId);
    if (!cam?.ultimaPrestacao) return false;
    const dataLancamento = parseDataPtBrOuIso(l.data);
    const dataPrestacao = parseDataPtBrOuIso(cam.ultimaPrestacao);
    if (!dataLancamento || !dataPrestacao) return false;
    return dataLancamento.getTime() <= dataPrestacao.getTime();
  };

  const filtrar = lancamentos.filter((l) => {
    if (filtroCambistaId && l.cambistaId !== filtroCambistaId) return false;
    if (filtroData) return isSameIsoInputDate(l.data, filtroData);
    // Sem consulta por data, mostra apenas lançamentos ainda em aberto.
    return !isFechadoNaPrestacao(l);
  });

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-gray-800">Lançamentos</h1>

      <form
        onSubmit={handleSalvar}
        className="mb-6 rounded-lg border border-gray-200 bg-white p-4 shadow-sm"
      >
        <h2 className="mb-3 text-lg font-semibold text-gray-700">Novo lançamento</h2>
        {/* MOBILE: campos empilham, full-width. DESKTOP: lado a lado. */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 lg:items-end">
          <div className="lg:col-span-1">
            <label className="mb-1 block text-xs font-medium text-gray-600">Cambista</label>
            <select
              value={cambistaId}
              onChange={(e) => setCambistaId(e.target.value)}
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
              required
            >
              <option value="">Selecione</option>
              {cambistas.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.login}
                </option>
              ))}
            </select>
          </div>
          <div className="lg:col-span-1">
            <label className="mb-1 block text-xs font-medium text-gray-600">Data</label>
            <input
              type="date"
              value={dataLanc}
              onChange={(e) => setDataLanc(e.target.value)}
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
              required
            />
          </div>
          <div className="lg:col-span-1">
            <label className="mb-1 block text-xs font-medium text-gray-600">Tipo</label>
            <select
              value={tipo}
              onChange={(e) => setTipo(e.target.value as "adiantar" | "retirar")}
              className={`w-full rounded border px-3 py-2 text-sm font-medium ${
                tipo === "adiantar"
                  ? "border-green-400 bg-green-50 text-green-800"
                  : "border-red-400 bg-red-50 text-red-800"
              }`}
            >
              <option value="adiantar">Adiantar (+)</option>
              <option value="retirar">Retirar (−)</option>
            </select>
          </div>
          <div className="lg:col-span-1">
            <label className="mb-1 block text-xs font-medium text-gray-600">Valor (R$)</label>
            <input
              type="text"
              inputMode="decimal"
              value={valor}
              onChange={(e) => setValor(e.target.value.replace(/[^0-9,]/g, ""))}
              placeholder="0,00"
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
              required
            />
          </div>
          <div className="sm:col-span-2 md:col-span-3 lg:col-span-2">
            <label className="mb-1 block text-xs font-medium text-gray-600">Observação</label>
            <input
              type="text"
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              placeholder="Opcional"
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <div className="sm:col-span-2 md:col-span-3 lg:col-span-6">
            <button
              type="submit"
              disabled={salvando}
              className="w-full rounded bg-orange-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-50 lg:w-auto"
            >
              {salvando ? "Lançando…" : "Lançar"}
            </button>
          </div>
        </div>
      </form>

      <div className="rounded-lg border border-gray-200 bg-white shadow">
        <div className="flex flex-col gap-3 border-b border-gray-200 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-700">
              Histórico ({filtrar.length})
            </h2>
            <p className="mt-1 text-xs text-gray-500">
              Por padrão aparecem somente lançamentos em aberto. Lançamentos já prestados aparecem ao consultar por data.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-xs font-medium uppercase text-gray-500">Filtrar cambista</label>
            <select
              value={filtroCambistaId}
              onChange={(e) => setFiltroCambistaId(e.target.value)}
              className="rounded border border-gray-300 px-3 py-2 text-sm"
            >
              <option value="">Todos</option>
              {cambistas.map((c) => (
                <option key={c.id} value={c.id}>{c.login}</option>
              ))}
            </select>
            <label className="text-xs font-medium uppercase text-gray-500">Consultar data</label>
            <input
              type="date"
              value={filtroData}
              onChange={(e) => setFiltroData(e.target.value)}
              className="rounded border border-gray-300 px-3 py-2 text-sm"
            />
            {filtroData && (
              <button
                type="button"
                onClick={() => setFiltroData("")}
                className="rounded border border-gray-300 bg-white px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50"
              >
                Ver abertos
              </button>
            )}
          </div>
        </div>
        {/* MOBILE: cards. */}
        <div className="space-y-2 p-3 md:hidden">
          {filtrar.length === 0 && (
            <div className="rounded-lg border-2 border-dashed border-gray-300 bg-white p-6 text-center text-sm text-gray-500">
              Nenhum lançamento encontrado.
            </div>
          )}
          {[...filtrar].reverse().map((l) => {
            const cam = cambistas.find((c) => c.id === l.cambistaId);
            const fechado = isFechadoNaPrestacao(l);
            return (
              <div
                key={l.id}
                className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm"
              >
                <div className="flex items-start justify-between gap-2 px-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-gray-900">
                      {cam?.login ?? "-"}
                    </p>
                    <p className="text-[11px] text-gray-500">
                      {formatarDataHoraBr(l.data)}
                    </p>
                    {l.observacao && (
                      <p className="mt-0.5 line-clamp-2 text-[11px] italic text-gray-600">
                        {l.observacao}
                      </p>
                    )}
                  </div>
                  <div className="text-right">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                        l.tipo === "adiantar"
                          ? "bg-green-100 text-green-700"
                          : "bg-red-100 text-red-700"
                      }`}
                    >
                      {l.tipo === "adiantar" ? "Adiantar" : "Retirar"}
                    </span>
                    <p
                      className={`mt-1 text-base font-bold tabular-nums ${
                        l.tipo === "adiantar" ? "text-green-700" : "text-red-700"
                      }`}
                    >
                      {l.tipo === "adiantar" ? "+" : "−"} {formatarMoeda(l.valor)}
                    </p>
                  </div>
                </div>
                <div className="border-t border-gray-100">
                  {fechado ? (
                    <div className="bg-gray-50 px-3 py-2 text-center text-[11px] font-medium text-gray-500">
                      Prestado (não pode excluir)
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        if (
                          confirm(
                            `Excluir lançamento de ${formatarMoeda(l.valor)} (${l.tipo})?`,
                          )
                        ) {
                          deleteLancamento(l.id);
                          addLog(
                            "Excluiu lançamento",
                            `${l.tipo} ${formatarMoeda(l.valor)}`,
                          );
                          setLancamentos(getLancamentos());
                          toast.success(
                            `Lançamento de ${formatarMoeda(l.valor)} excluído.`,
                          );
                        }
                      }}
                      className="w-full bg-red-50 py-2 text-xs font-semibold text-red-700 active:bg-red-100"
                    >
                      Excluir
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* DESKTOP: tabela. */}
        <div className="hidden overflow-x-auto md:block">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-600">Data</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-600">Cambista</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-600">Tipo</th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase text-gray-600">Valor</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-600">Obs</th>
                <th className="px-4 py-3 text-center text-xs font-medium uppercase text-gray-600">Excluir</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filtrar.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                    Nenhum lançamento encontrado.
                  </td>
                </tr>
              ) : (
                [...filtrar].reverse().map((l) => {
                  const cam = cambistas.find((c) => c.id === l.cambistaId);
                  const fechado = isFechadoNaPrestacao(l);
                  return (
                    <tr key={l.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm text-gray-600">{formatarDataHoraBr(l.data)}</td>
                      <td className="px-4 py-3 text-sm font-medium text-gray-800">{cam?.login ?? "-"}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`rounded-full px-2 py-1 text-xs font-medium ${
                            l.tipo === "adiantar" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
                          }`}
                        >
                          {l.tipo === "adiantar" ? "Adiantar" : "Retirar"}
                        </span>
                      </td>
                      <td className={`px-4 py-3 text-right text-sm font-medium ${
                        l.tipo === "adiantar" ? "text-green-700" : "text-red-700"
                      }`}>
                        {l.tipo === "adiantar" ? "+" : "-"} {formatarMoeda(l.valor)}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500">{l.observacao ?? "-"}</td>
                      <td className="px-4 py-3 text-center">
                        {fechado ? (
                          <span className="rounded bg-gray-100 px-2 py-1 text-xs font-medium text-gray-500">
                            Prestado
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              if (confirm(`Excluir lançamento de ${formatarMoeda(l.valor)} (${l.tipo})?`)) {
                                deleteLancamento(l.id);
                                addLog("Excluiu lançamento", `${l.tipo} ${formatarMoeda(l.valor)}`);
                                setLancamentos(getLancamentos());
                                toast.success(`Lançamento de ${formatarMoeda(l.valor)} excluído.`);
                              }
                            }}
                            className="rounded bg-red-100 px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-200"
                          >
                            Excluir
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
