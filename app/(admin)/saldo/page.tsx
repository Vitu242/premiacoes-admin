"use client";

import { useState, useEffect, useMemo } from "react";
import { getCambistasPorCodigo, getGerentesPorCodigo, updateCambista } from "@/lib/store";
import { addLog } from "@/lib/auditoria";
import { getAdminCodigo } from "@/lib/auth";
import { normalizeLoginKey } from "@/lib/login-normalize";
import { useVisibilityRefresh } from "@/lib/use-config-refresh";

function formatarMoeda(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default function SaldoPage() {
  const codigo = getAdminCodigo();
  const gerentes = useMemo(() => getGerentesPorCodigo(codigo ?? ""), [codigo]);
  const [cambistas, setCambistas] = useState(getCambistasPorCodigo(codigo ?? ""));
  const [selecionado, setSelecionado] = useState("");
  const [ajuste, setAjuste] = useState(0);
  const [filtroNome, setFiltroNome] = useState("");
  const [filtroGerente, setFiltroGerente] = useState("todos");
  /** Trava cliques duplos por cambista enquanto a alteração de saldo
   *  está sendo processada (evita race + toques duplos). */
  const [ajustandoId, setAjustandoId] = useState<string | null>(null);

  useEffect(() => {
    if (codigo) setCambistas(getCambistasPorCodigo(codigo));
  }, [codigo]);
  useVisibilityRefresh(() => {
    if (codigo) setCambistas(getCambistasPorCodigo(codigo));
  });

  /** Aplica delta de saldo de forma atômica com proteção contra duplo clique
   *  e confirmação para alterações grandes. */
  const aplicarDelta = (cId: string, delta: number, label: string, login: string, saldoAtual: number) => {
    if (ajustandoId === cId) return;
    if (Math.abs(delta) >= 100) {
      const novo = Math.max(0, saldoAtual + delta);
      const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
      if (
        !window.confirm(
          `Confirmar alteração de saldo de ${login}?\n\n` +
            `Atual: ${fmt(saldoAtual)}\n` +
            `Novo: ${fmt(novo)}\n` +
            `Diferença: ${delta > 0 ? "+" : ""}${fmt(delta)}`,
        )
      ) {
        return;
      }
    }
    setAjustandoId(cId);
    try {
      const novo = Math.max(0, saldoAtual + delta);
      updateCambista(cId, { saldo: novo });
      addLog(label, `${login}: ${formatarMoeda(novo)}`);
      setCambistas(getCambistasPorCodigo(codigo ?? ""));
    } finally {
      setAjustandoId(null);
    }
  };

  /** DEFINE o saldo direto (sobrescreve, NÃO soma).
   *  Usado pelos campos "Valor manual" / "Definir saldo" — quando o admin
   *  digita 1000 ele quer que o saldo VIRE 1000, não que adicione 1000 ao
   *  valor existente. */
  const definirSaldo = (
    cId: string,
    novoSaldo: number,
    login: string,
    saldoAtual: number,
  ) => {
    if (ajustandoId === cId) return;
    if (!Number.isFinite(novoSaldo) || novoSaldo < 0) {
      alert("Valor inválido. Use um número >= 0.");
      return;
    }
    if (novoSaldo > 10_000_000) {
      alert("Valor fora do limite (máx 10 milhões).");
      return;
    }
    const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
    if (
      !window.confirm(
        `Definir saldo de ${login}?\n\n` +
          `Atual: ${fmt(saldoAtual)}\n` +
          `Novo: ${fmt(novoSaldo)}\n` +
          `Diferença: ${novoSaldo - saldoAtual >= 0 ? "+" : ""}${fmt(novoSaldo - saldoAtual)}`,
      )
    ) {
      return;
    }
    setAjustandoId(cId);
    try {
      updateCambista(cId, { saldo: novoSaldo });
      addLog("Definiu saldo", `${login}: ${formatarMoeda(novoSaldo)}`);
      setCambistas(getCambistasPorCodigo(codigo ?? ""));
    } finally {
      setAjustandoId(null);
    }
  };

  const filtrar = useMemo(() => {
    let r = cambistas;
    if (filtroGerente !== "todos") {
      r = r.filter((c) => c.gerenteId === filtroGerente);
    }
    if (filtroNome.trim()) {
      const t = normalizeLoginKey(filtroNome);
      r = r.filter((c) => normalizeLoginKey(c.login).includes(t));
    }
    return r;
  }, [cambistas, filtroNome, filtroGerente]);

  const cambista = selecionado ? cambistas.find((c) => c.id === selecionado) : null;

  const handleAjustar = (delta: number) => {
    if (!cambista) return;
    aplicarDelta(cambista.id, delta, "Ajustou saldo", cambista.login, cambista.saldo);
    setAjuste(0);
  };

  const handleAjusteManual = () => {
    if (!cambista || !Number.isFinite(ajuste) || ajuste < 0) return;
    if (ajuste > 10_000_000) {
      alert("Valor fora do limite permitido (máx 10 milhões).");
      return;
    }
    // DEFINE o saldo (sobrescreve). Antes esse campo somava ao saldo existente,
    // o que era contra-intuitivo: digitar 1000 e ver o saldo virar 1500 quando
    // já tinha 500. Para somar/subtrair use os botões −10 / −1 / +1 / +10 / +100.
    definirSaldo(cambista.id, ajuste, cambista.login, cambista.saldo);
    setAjuste(0);
  };

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-gray-800">Saldo</h1>

      <div className="mb-4 flex flex-wrap gap-3">
        <select
          value={filtroGerente}
          onChange={(e) => setFiltroGerente(e.target.value)}
          className="rounded border border-gray-300 px-4 py-2 text-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
        >
          <option value="todos">Todos</option>
          {gerentes.map((g) => (
            <option key={g.id} value={g.id}>{g.login}</option>
          ))}
        </select>
        <input
          type="text"
          placeholder="Filtrar por nome"
          value={filtroNome}
          onChange={(e) => setFiltroNome(e.target.value)}
          className="rounded border border-gray-300 px-4 py-2 text-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
        />
        <select
          value={selecionado}
          onChange={(e) => {
            setSelecionado(e.target.value);
            setAjuste(0);
          }}
          className="rounded border border-gray-300 px-4 py-2 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
        >
          <option value="">Selecione o cambista...</option>
          {filtrar.map((c) => (
            <option key={c.id} value={c.id}>{c.login}</option>
          ))}
        </select>
      </div>

      {/* MOBILE: cards com info do saldo + ajustes rápidos + input pra definir. */}
      <div className="mb-6 space-y-2 md:hidden">
        {filtrar.length === 0 && (
          <div className="rounded-lg border-2 border-dashed border-gray-300 bg-white p-6 text-center text-sm text-gray-500">
            Nenhum cambista para este filtro.
          </div>
        )}
        {filtrar.map((c) => {
          const disp = Math.max(0, c.saldo - c.entrada);
          const editandoEsse = selecionado === c.id;
          return (
            <div
              key={c.id}
              className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm"
            >
              <div className="flex items-start justify-between gap-2 px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-gray-900">{c.login}</p>
                  <p className="mt-0.5 text-[11px] text-gray-500">
                    Limite {formatarMoeda(c.saldo)} · Vendido {formatarMoeda(c.entrada)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] uppercase text-gray-500">Disponível</p>
                  <p className="text-base font-bold tabular-nums text-emerald-700">
                    {formatarMoeda(disp)}
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-5 gap-1 border-t border-gray-100 bg-gray-50 px-2 py-2">
                <button
                  onClick={() => aplicarDelta(c.id, -10, "Saldo −10", c.login, c.saldo)}
                  disabled={ajustandoId === c.id}
                  className="rounded bg-red-100 py-2 text-xs font-semibold text-red-700 active:bg-red-200 disabled:opacity-50"
                >
                  −10
                </button>
                <button
                  onClick={() => aplicarDelta(c.id, -1, "Saldo −1", c.login, c.saldo)}
                  disabled={ajustandoId === c.id}
                  className="rounded bg-gray-200 py-2 text-xs font-semibold text-gray-700 active:bg-gray-300 disabled:opacity-50"
                >
                  −1
                </button>
                <button
                  onClick={() => aplicarDelta(c.id, 1, "Saldo +1", c.login, c.saldo)}
                  disabled={ajustandoId === c.id}
                  className="rounded bg-gray-200 py-2 text-xs font-semibold text-gray-700 active:bg-gray-300 disabled:opacity-50"
                >
                  +1
                </button>
                <button
                  onClick={() => aplicarDelta(c.id, 10, "Saldo +10", c.login, c.saldo)}
                  disabled={ajustandoId === c.id}
                  className="rounded bg-green-100 py-2 text-xs font-semibold text-green-700 active:bg-green-200 disabled:opacity-50"
                >
                  +10
                </button>
                <button
                  onClick={() => {
                    setSelecionado(editandoEsse ? "" : c.id);
                    setAjuste(0);
                  }}
                  className={`rounded py-2 text-xs font-semibold ${
                    editandoEsse
                      ? "bg-orange-500 text-white"
                      : "bg-blue-50 text-blue-700 active:bg-blue-100"
                  }`}
                >
                  {editandoEsse ? "Fechar" : "Definir"}
                </button>
              </div>
              {editandoEsse && (
                <div className="border-t border-gray-100 bg-orange-50 px-3 py-3">
                  <label className="mb-1.5 block text-[11px] font-medium text-orange-900">
                    Definir saldo de {c.login} (sobrescreve, não soma):
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      inputMode="decimal"
                      value={ajuste || ""}
                      onChange={(e) => setAjuste(Number(e.target.value) || 0)}
                      placeholder={`Atual: ${formatarMoeda(c.saldo)}`}
                      className="flex-1 rounded border border-orange-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-orange-500 focus:outline-none"
                    />
                    <button
                      onClick={() => {
                        if (ajuste < 0) return;
                        definirSaldo(c.id, ajuste, c.login, c.saldo);
                        setAjuste(0);
                        setSelecionado("");
                      }}
                      disabled={ajustandoId === c.id || ajuste < 0}
                      className="rounded bg-orange-500 px-4 py-2 text-sm font-semibold text-white active:bg-orange-600 disabled:opacity-50"
                    >
                      Salvar
                    </button>
                  </div>
                  <p className="mt-1 text-[10px] text-orange-800">
                    Ex.: digitar 1000 e tocar em Salvar = saldo do cliente vira R$ 1.000,00.
                  </p>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* DESKTOP: tabela. */}
      <div className="mb-6 hidden overflow-x-auto rounded-lg border border-gray-200 bg-white shadow md:block">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-2 text-left text-xs font-medium uppercase text-gray-500">Cambista</th>
              <th className="px-4 py-2 text-right text-xs font-medium uppercase text-gray-500">Saldo (limite)</th>
              <th className="px-4 py-2 text-right text-xs font-medium uppercase text-gray-500">Vendido</th>
              <th className="px-4 py-2 text-right text-xs font-medium uppercase text-gray-500">Disponível</th>
              <th className="px-4 py-2 text-left text-xs font-medium uppercase text-gray-500">Ajustar (+/−)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {filtrar.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-sm text-gray-500">
                  Nenhum cambista para este filtro.
                </td>
              </tr>
            ) : null}
            {filtrar.map((c) => {
              const disp = Math.max(0, c.saldo - c.entrada);
              return (
                <tr key={c.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">{c.login}</td>
                  <td className="px-4 py-3 text-right text-gray-700">{formatarMoeda(c.saldo)}</td>
                  <td className="px-4 py-3 text-right text-gray-700">{formatarMoeda(c.entrada)}</td>
                  <td className="px-4 py-3 text-right font-medium text-gray-800">{formatarMoeda(disp)}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap items-center gap-1">
                      <button
                        onClick={() => aplicarDelta(c.id, -10, "Saldo −10", c.login, c.saldo)}
                        disabled={ajustandoId === c.id}
                        className="rounded bg-red-100 px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-200 disabled:opacity-50"
                      >
                        −10
                      </button>
                      <button
                        onClick={() => aplicarDelta(c.id, -1, "Saldo −1", c.login, c.saldo)}
                        disabled={ajustandoId === c.id}
                        className="rounded bg-gray-200 px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-300 disabled:opacity-50"
                      >
                        −1
                      </button>
                      <button
                        onClick={() => aplicarDelta(c.id, 1, "Saldo +1", c.login, c.saldo)}
                        disabled={ajustandoId === c.id}
                        className="rounded bg-gray-200 px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-300 disabled:opacity-50"
                      >
                        +1
                      </button>
                      <button
                        onClick={() => aplicarDelta(c.id, 10, "Saldo +10", c.login, c.saldo)}
                        disabled={ajustandoId === c.id}
                        className="rounded bg-green-100 px-2 py-1 text-xs font-medium text-green-700 hover:bg-green-200 disabled:opacity-50"
                      >
                        +10
                      </button>
                      <button
                        onClick={() => setSelecionado(selecionado === c.id ? "" : c.id)}
                        className={`ml-1 rounded px-2 py-1 text-xs font-medium ${selecionado === c.id ? "bg-orange-500 text-white" : "bg-gray-200 text-gray-700 hover:bg-gray-300"}`}
                        title="Ajuste manual com valor customizado"
                      >
                        Editar
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {cambista && (
        <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          <p className="text-sm text-gray-500">Limite (saldo) – o que o cambista pode vender</p>
          <p className="text-3xl font-bold text-gray-800">{formatarMoeda(cambista.saldo)}</p>
          <p className="mt-2 text-sm text-gray-500">
            Já vendido: {formatarMoeda(cambista.entrada)} • Disponível: {formatarMoeda(Math.max(0, cambista.saldo - cambista.entrada))}
          </p>
          <div className="mt-6 flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <button
                onClick={() => handleAjustar(-10)}
                className="rounded bg-gray-200 px-4 py-2 font-medium text-gray-700 hover:bg-gray-300"
              >
                −10
              </button>
              <button
                onClick={() => handleAjustar(-1)}
                className="rounded bg-gray-200 px-4 py-2 font-medium text-gray-700 hover:bg-gray-300"
              >
                −1
              </button>
              <button
                onClick={() => handleAjustar(1)}
                className="rounded bg-green-200 px-4 py-2 font-medium text-green-700 hover:bg-green-300"
              >
                +1
              </button>
              <button
                onClick={() => handleAjustar(10)}
                className="rounded bg-green-200 px-4 py-2 font-medium text-green-700 hover:bg-green-300"
              >
                +10
              </button>
              <button
                onClick={() => handleAjustar(100)}
                className="rounded bg-green-300 px-4 py-2 font-medium text-green-800 hover:bg-green-400"
              >
                +100
              </button>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-gray-700">Definir saldo:</span>
              <input
                type="number"
                value={ajuste || ""}
                onChange={(e) => setAjuste(Number(e.target.value) || 0)}
                placeholder={`Atual: ${cambista.saldo.toFixed(2)}`}
                className="w-32 rounded border border-gray-300 px-3 py-2"
              />
              <button
                onClick={handleAjusteManual}
                disabled={ajuste < 0}
                className="rounded bg-orange-500 px-4 py-2 font-medium text-white hover:bg-orange-600 disabled:opacity-50"
                title="Sobrescreve o saldo atual com este valor (não soma)."
              >
                Salvar
              </button>
            </div>
            <p className="basis-full text-xs text-gray-500">
              <strong>Salvar</strong> sobrescreve o saldo. Para somar/subtrair use os
              botões <code>−10 / −1 / +1 / +10 / +100</code>.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
