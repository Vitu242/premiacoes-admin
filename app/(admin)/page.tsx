"use client";

import { useState, useEffect, useMemo } from "react";
import {
  getCambistasPorCodigo,
  getGerentesPorCodigo,
  prestarContasCambista,
  calcularTotalCaixa,
  reconciliarCaixaCambistas,
} from "@/lib/store";
import { addLog } from "@/lib/auditoria";
import { getAdminCodigo } from "@/lib/auth";
import type { Cambista } from "@/lib/types";
import { formatarDataHoraBr } from "@/lib/date-utils";
import { useToast } from "@/app/components/Toast";
import { RestaurarCaixaModal } from "@/app/components/RestaurarCaixaModal";

function formatarMoeda(valor: number) {
  return valor.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

export default function PrestarContasPage() {
  const toast = useToast();
  const codigo = getAdminCodigo();
  const [cambistas, setCambistasState] = useState<Cambista[]>([]);
  const gerentes = useMemo(() => getGerentesPorCodigo(codigo ?? ""), [codigo]);
  const [filtroGerente, setFiltroGerente] = useState("todos");
  const [detalhe, setDetalhe] = useState<Cambista | null>(null);
  const [restaurarOpen, setRestaurarOpen] = useState(false);
  const [acaoEmAndamento, setAcaoEmAndamento] = useState(false);

  useEffect(() => {
    if (codigo) setCambistasState(getCambistasPorCodigo(codigo));
  }, [codigo]);

  const filtrar = cambistas.filter((c) =>
    filtroGerente === "todos" ? true : c.gerenteId === filtroGerente
  );

  const handlePrestarContas = async (id: string) => {
    if (acaoEmAndamento) return;
    setAcaoEmAndamento(true);
    try {
      const c = cambistas.find((x) => x.id === id);
      await prestarContasCambista(id);
      addLog("Prestou contas", c?.login ?? id);
      if (codigo) setCambistasState(getCambistasPorCodigo(codigo));
      setDetalhe(null);
      toast.success(`Conta prestada com ${c?.login ?? "—"}.`);
    } catch (e) {
      toast.error(`Erro ao prestar contas: ${(e as Error).message}`);
    } finally {
      setAcaoEmAndamento(false);
    }
  };

  /** Cria snapshot automático ANTES de operações que mudam o caixa em massa. */
  const snapshotAntesDe = async (motivo: string) => {
    try {
      await fetch("/api/caixa/snapshot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ codigo, motivo }),
      });
    } catch {
      /* não bloqueia a operação */
    }
  };

  const handlePrestarTodos = async () => {
    if (acaoEmAndamento) return;
    if (
      !confirm(
        "Prestar conta com todos os cambistas listados? O caixa de cada um será zerado."
      )
    ) {
      return;
    }
    setAcaoEmAndamento(true);
    try {
      const qtd = filtrar.length;
      await snapshotAntesDe("pre-prestar-todos");
      for (const c of filtrar) {
        await prestarContasCambista(c.id);
        addLog("Prestou contas", c.login);
      }
      if (codigo) setCambistasState(getCambistasPorCodigo(codigo));
      setDetalhe(null);
      toast.success(`Conta prestada com ${qtd} cambista(s).`);
    } catch (e) {
      toast.error(`Erro: ${(e as Error).message}`);
    } finally {
      setAcaoEmAndamento(false);
    }
  };

  /**
   * Recalcula o caixa de todos os cambistas a partir dos bilhetes e
   * lançamentos. Útil se houve uma queda do servidor e o saldo ficou
   * dessincronizado — esse botão restaura o valor correto sem perder nada.
   */
  const handleReconciliar = async () => {
    if (acaoEmAndamento) return;
    setAcaoEmAndamento(true);
    try {
      // Snapshot antes — se reconciliar zerar algo errado, dá pra voltar.
      await snapshotAntesDe("pre-reconciliar");
      const r = reconciliarCaixaCambistas();
      if (codigo) setCambistasState(getCambistasPorCodigo(codigo));
      addLog("Reconciliou caixa", `${r.ajustados} ajuste(s)`);
      if (r.ajustados === 0) {
        toast.info("Caixa de todos os cambistas já está correto.");
      } else {
        toast.success(`${r.ajustados} cambista(s) tiveram o caixa corrigido.`);
      }
    } catch (e) {
      toast.error(`Falha ao reconciliar: ${(e as Error).message}`);
    } finally {
      setAcaoEmAndamento(false);
    }
  };

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-800">Prestar Contas</h1>
      </div>

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:gap-4">
        <select
          value={filtroGerente}
          onChange={(e) => setFiltroGerente(e.target.value)}
          className="w-full rounded border border-gray-300 px-4 py-2 sm:w-auto focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
        >
          <option value="todos">Todos os Gerentes</option>
          {gerentes.map((g) => (
            <option key={g.id} value={g.id}>
              {g.login}
            </option>
          ))}
        </select>
        <button
          onClick={handlePrestarTodos}
          disabled={filtrar.length === 0 || acaoEmAndamento}
          className="w-full rounded bg-orange-500 px-4 py-2 font-medium text-white hover:bg-orange-600 disabled:opacity-50 sm:w-auto"
        >
          {acaoEmAndamento ? "Processando…" : "Prestar conta com todos"}
        </button>
        <button
          type="button"
          onClick={handleReconciliar}
          disabled={acaoEmAndamento}
          className="w-full rounded border border-emerald-500 bg-white px-4 py-2 font-medium text-emerald-700 hover:bg-emerald-50 disabled:opacity-50 sm:w-auto"
          title="Recalcula entrada/saída/comissão/lançamentos a partir dos bilhetes e lançamentos. Útil após o site ficar fora do ar."
        >
          Reconciliar caixa
        </button>
        {/* Botão pequeno e discreto: restaurar caixa de backup. Só admin do
            chefe (com senha) consegue confirmar a operação. */}
        <button
          type="button"
          onClick={() => setRestaurarOpen(true)}
          className="ml-auto text-xs text-slate-400 underline-offset-2 hover:text-slate-600 hover:underline dark:text-slate-500 dark:hover:text-slate-300"
          title="Restaura o caixa a partir de um backup automático (snapshot a cada 30 min). Pede senha do Lotobrasil."
        >
          backups…
        </button>
      </div>

      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white shadow">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-600">
                Cambista
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-600">
                Entrada
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-600">
                Saídas
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-600">
                Comissão
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-600">
                Lançamentos
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-600">
                Total
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-600">
                Última Prestação
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-600">
                Prestação
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 bg-white">
            {filtrar.map((c) => {
              const total = calcularTotalCaixa(c);
              return (
                <tr key={c.id} className="hover:bg-gray-50">
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-900">
                    {c.login}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-600">
                    {formatarMoeda(c.entrada)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-600">
                    {formatarMoeda(c.saidas)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-600">
                    {formatarMoeda(c.comissao)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-600">
                    {formatarMoeda(c.lancamentos)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <span
                      className={`font-semibold ${
                        total > 0
                          ? "text-green-600"
                          : total < 0
                            ? "text-red-600"
                            : "text-gray-900"
                      }`}
                    >
                      {formatarMoeda(total)}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-600">
                    {c.ultimaPrestacao ? formatarDataHoraBr(c.ultimaPrestacao) : "Nunca"}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <button
                      onClick={() => setDetalhe(c)}
                      disabled={acaoEmAndamento}
                      className="rounded bg-orange-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-orange-600 disabled:opacity-50"
                    >
                      Prestar contas
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <RestaurarCaixaModal
        open={restaurarOpen}
        onClose={() => setRestaurarOpen(false)}
        codigo={codigo}
        cambistasAtuais={cambistas}
        onRestaurado={() => {
          if (codigo) setCambistasState(getCambistasPorCodigo(codigo));
          addLog("Restaurou caixa de backup", `${codigo ?? "-"}`);
          toast.success("Caixa restaurado a partir do backup.");
        }}
      />

      {/* Modal Prestar Contas - detalhe */}
      {detalhe && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md overflow-hidden rounded-lg bg-white text-slate-900 shadow-xl dark:bg-slate-800 dark:text-slate-100">
            <div className="bg-green-600 px-6 py-4">
              <h2 className="text-lg font-bold text-white">
                Prestar contas com {detalhe.login}
              </h2>
            </div>
            <div className="space-y-2 p-6">
              <div className="flex justify-between">
                <span>Entrada</span>
                <span>{formatarMoeda(detalhe.entrada)}</span>
              </div>
              <div className="flex justify-between">
                <span>Saídas</span>
                <span>{formatarMoeda(detalhe.saidas)}</span>
              </div>
              <div className="flex justify-between">
                <span>Comissão</span>
                <span>{formatarMoeda(detalhe.comissao)}</span>
              </div>
              <div className="flex justify-between">
                <span>Lançamentos</span>
                <span>{formatarMoeda(detalhe.lancamentos)}</span>
              </div>
              <div className="flex justify-between border-t border-gray-200 pt-2 font-semibold dark:border-slate-600">
                <span>Total</span>
                <span
                  style={{
                    color:
                      calcularTotalCaixa(detalhe) > 0
                        ? "#16a34a"
                        : calcularTotalCaixa(detalhe) < 0
                          ? "#dc2626"
                          : "currentColor",
                  }}
                >
                  {formatarMoeda(calcularTotalCaixa(detalhe))}
                </span>
              </div>
            </div>
            <p className="mt-3 px-6 text-sm text-slate-600 dark:text-slate-300">
              Ao confirmar, o caixa deste cliente será zerado.
            </p>
            <div className="mt-4 px-6 pb-6">
              <button
                onClick={() => handlePrestarContas(detalhe.id)}
                disabled={acaoEmAndamento}
                className="w-full rounded-lg bg-green-600 px-4 py-3 font-medium text-white hover:bg-green-700 disabled:opacity-60"
              >
                {acaoEmAndamento ? "Prestando…" : "Prestar contas"}
              </button>
              <button
                onClick={() => setDetalhe(null)}
                disabled={acaoEmAndamento}
                className="mt-2 w-full rounded border border-gray-300 px-4 py-2 text-slate-900 hover:bg-gray-50 disabled:opacity-50 dark:border-slate-500 dark:text-slate-100 dark:hover:bg-slate-700"
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
