"use client";

import { useState, useEffect, useMemo } from "react";
import {
  getCambistasPorCodigo,
  getGerentesPorCodigo,
  getConfig,
  getCotacaoEfetiva,
  addCambista,
  updateCambista,
  deleteCambista,
  prestarContasCambista,
} from "@/lib/store";
import { addLog } from "@/lib/auditoria";
import { getAdminCodigo } from "@/lib/auth";
import { normalizeLoginKey } from "@/lib/login-normalize";
import { useVisibilityRefresh } from "@/lib/use-config-refresh";
import {
  mapearAlertasCambistas,
  type AnaliseCambista,
  type SeveridadeAlerta,
} from "@/lib/analise-cambistas";
import type { Cambista } from "@/lib/types";
import ImportarCambistasCsv from "@/app/components/ImportarCambistasCsv";
import { exportarCsv } from "@/lib/export-csv";
import { useToast } from "@/app/components/Toast";

function formatarMoeda(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function cambistaInicial(gerenteId: string, codigo: string): Omit<Cambista, "id"> {
  const padrao = getConfig().comissoesPadrao ?? {
    comissaoMilhar: 20,
    comissaoCentena: 20,
    comissaoDezena: 17,
    comissaoGrupo: 17,
  };
  return {
    gerenteId,
    codigo,
    tipo: "cambista" as const,
    login: "",
    senha: "",
    saldo: 0,
    comissaoMilhar: padrao.comissaoMilhar,
    comissaoCentena: padrao.comissaoCentena,
    comissaoDezena: padrao.comissaoDezena,
    comissaoGrupo: padrao.comissaoGrupo,
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
  const toast = useToast();
  const codigo = getAdminCodigo();
  const [cambistas, setCambistasState] = useState<Cambista[]>([]);
  const gerentes = useMemo(() => getGerentesPorCodigo(codigo ?? ""), [codigo]);
  const [filtroNome, setFiltroNome] = useState("");
  const [filtroGerente, setFiltroGerente] = useState("todos");
  const [filtroRisco, setFiltroRisco] = useState("todos");
  const [filtroStatus, setFiltroStatus] = useState<"todos" | "ativo" | "inativo">("todos");
  const [editando, setEditando] = useState<Cambista | null>(null);
  const [novo, setNovo] = useState(false);
  const [form, setForm] = useState(cambistaInicial(gerentes[0]?.id ?? "", codigo ?? "default"));

  useEffect(() => {
    if (codigo) setCambistasState(getCambistasPorCodigo(codigo));
  }, [codigo]);

  // Re-puxa a lista quando o sync com Supabase completa ou o usuário volta à aba.
  // Sem isso a tela ficaria “congelada” com dados antigos até o admin recarregar.
  useVisibilityRefresh(() => {
    if (codigo) setCambistasState(getCambistasPorCodigo(codigo));
  });

  // Lock scroll body quando modal de edição/criação está aberto.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const aberto = !!(editando || novo);
    if (!aberto) return;
    const orig = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = orig;
    };
  }, [editando, novo]);

  // Mapa de alertas de prejuízo (últimos 30 dias). Recarrega quando a lista de
  // cambistas muda para refletir adições/remoções e novos bilhetes.
  const alertas = useMemo<Map<string, AnaliseCambista>>(() => {
    if (!codigo) return new Map();
    try {
      return mapearAlertasCambistas({ codigo, dias: 30, minBilhetes: 5 });
    } catch {
      return new Map();
    }
  }, [codigo, cambistas.length]);

  const filtrar = cambistas.filter((c) => {
    const okNome = normalizeLoginKey(c.login).includes(normalizeLoginKey(filtroNome));
    const okGerente = filtroGerente === "todos" || c.gerenteId === filtroGerente;
    const riscoNorm = (c.risco ?? "").toUpperCase().replace("É", "E");
    const filtroNorm = filtroRisco.toUpperCase().replace("É", "E");
    const okRisco = filtroRisco === "todos" || riscoNorm === filtroNorm;
    const okStatus = filtroStatus === "todos" || c.status === filtroStatus;
    return okNome && okGerente && okRisco && okStatus;
  });

  const abrirEditar = (c: Cambista) => {
    setEditando(c);
    setNovo(false);
    const tipoVal = c.tipo === "cliente" ? "cliente" : "cambista";
    const riscoNorm = (c.risco ?? "").toUpperCase();
    const riscoVal = riscoNorm === "MÉDIO" ? "MEDIO" : riscoNorm || "RUIM";
    setForm({ ...c, tipo: tipoVal, risco: ["BOM", "MEDIO", "RUIM"].includes(riscoVal) ? riscoVal : c.risco ?? "RUIM" });
  };

  const abrirNovo = () => {
    setEditando(null);
    setNovo(true);
    setForm(cambistaInicial(gerentes[0]?.id ?? "", codigo ?? "default"));
  };

  const salvar = () => {
    if (novo) {
      const gerenteCodigo = gerentes.find((g) => g.id === form.gerenteId)?.codigo ?? codigo ?? "default";
      addCambista({ ...form, codigo: gerenteCodigo });
      addLog("Criou cambista", form.login);
      toast.success(`Cambista ${form.login} criado!`);
    } else if (editando) {
      updateCambista(editando.id, form);
      addLog("Atualizou cambista", form.login);
      toast.success(`Cambista ${form.login} atualizado!`);
    }
    setCambistasState(getCambistasPorCodigo(codigo ?? ""));
    setEditando(null);
    setNovo(false);
  };

  const apagar = (id: string) => {
    if (confirm("Apagar este cambista?")) {
      const c = cambistas.find((x) => x.id === id);
      deleteCambista(id);
      addLog("Apagou cambista", c?.login ?? id);
      setCambistasState(getCambistasPorCodigo(codigo ?? ""));
      setEditando(null);
      toast.success(`Cambista ${c?.login ?? "—"} apagado.`);
    }
  };

  /**
   * Presta contas em massa: zera entrada/saída/comissão/lançamentos dos
   * cambistas atualmente filtrados. Útil no fim do dia/turno para fechar
   * tudo de uma vez. Apenas com confirmação explícita.
   */
  const prestarContasTodos = async () => {
    if (filtrar.length === 0) {
      toast.info("Nenhum cambista listado para prestar contas.");
      return;
    }
    const ok = confirm(
      `Prestar contas de ${filtrar.length} cambista(s) listado(s)?\n\n` +
        "Isso vai zerar Entrada, Saídas, Comissão e Lançamentos de todos eles.\n" +
        "Essa ação não pode ser desfeita.",
    );
    if (!ok) return;
    for (const c of filtrar) await prestarContasCambista(c.id);
    addLog("Prestou contas em massa", `${filtrar.length} cambista(s)`);
    setCambistasState(getCambistasPorCodigo(codigo ?? ""));
    toast.success(`Prestação de contas realizada para ${filtrar.length} cambista(s).`);
  };

  /**
   * Apaga em massa todos os cambistas filtrados. Operação destrutiva —
   * exige confirmação dupla, com nome dos primeiros para revisão.
   */
  const apagarTodos = () => {
    if (filtrar.length === 0) {
      toast.info("Nenhum cambista listado para apagar.");
      return;
    }
    const exemplos = filtrar.slice(0, 5).map((c) => c.login).join(", ");
    const sufixo = filtrar.length > 5 ? `, ...` : "";
    if (
      !confirm(
        `APAGAR ${filtrar.length} cambista(s) listado(s)?\n\n` +
          `Inclui: ${exemplos}${sufixo}\n\n` +
          "Todas as apostas desses cambistas também serão apagadas.\n" +
          "Essa ação não pode ser desfeita.",
      )
    )
      return;
    if (!confirm(`Tem certeza absoluta? Apagar ${filtrar.length} cambista(s)?`))
      return;
    const qtd = filtrar.length;
    for (const c of filtrar) deleteCambista(c.id);
    addLog("Apagou cambistas em massa", `${qtd} cambista(s)`);
    setCambistasState(getCambistasPorCodigo(codigo ?? ""));
    setEditando(null);
    toast.success(`${qtd} cambista(s) apagado(s).`);
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
        <select
          value={filtroRisco}
          onChange={(e) => setFiltroRisco(e.target.value)}
          className="w-full rounded border border-gray-300 px-4 py-2 sm:w-40 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
        >
          <option value="todos">Todos (Risco)</option>
          <option value="BOM">Bom</option>
          <option value="MEDIO">Médio</option>
          <option value="RUIM">Ruim</option>
        </select>
        <select
          value={filtroStatus}
          onChange={(e) => setFiltroStatus(e.target.value as "todos" | "ativo" | "inativo")}
          className="w-full rounded border border-gray-300 px-4 py-2 sm:w-40 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
        >
          <option value="todos">Todos</option>
          <option value="ativo">Ativo</option>
          <option value="inativo">Inativo</option>
        </select>
        <button
          onClick={abrirNovo}
          className="w-full rounded bg-orange-500 px-4 py-2 font-medium text-white hover:bg-orange-600 sm:w-auto"
        >
          Novo Cambista
        </button>
        <button
          type="button"
          onClick={() => {
            const linhas = filtrar.map((c) => ({
              login: c.login,
              tipo: c.tipo ?? "cambista",
              status: c.status,
              saldo: c.saldo,
              entrada: c.entrada,
              saidas: c.saidas,
              comissao: c.comissao,
              lancamentos: c.lancamentos,
              telefone: c.telefone,
              endereco: c.endereco,
              risco: c.risco,
            }));
            exportarCsv(`cambistas-${new Date().toISOString().slice(0, 10)}.csv`, linhas);
          }}
          className="w-full rounded border border-gray-300 bg-white px-4 py-2 font-medium text-gray-700 hover:bg-gray-50 sm:w-auto"
        >
          Exportar CSV
        </button>
        <button
          type="button"
          onClick={prestarContasTodos}
          className="w-full rounded bg-emerald-600 px-4 py-2 font-medium text-white hover:bg-emerald-700 sm:w-auto"
          title="Zera entrada/saída/comissão/lançamentos de todos os cambistas listados"
        >
          Prestar contas de todos
        </button>
        <button
          type="button"
          onClick={apagarTodos}
          className="w-full rounded bg-red-600 px-4 py-2 font-medium text-white hover:bg-red-700 sm:w-auto"
          title="Apaga TODOS os cambistas listados (e suas apostas) — operação destrutiva"
        >
          Apagar todos listados
        </button>
      </div>

      <ImportarCambistasCsv
        codigo={codigo ?? "default"}
        gerenteIdPadrao={gerentes[0]?.id ?? ""}
        onImportado={() => setCambistasState(getCambistasPorCodigo(codigo ?? ""))}
      />

      <p className="mb-4 mt-4 flex flex-wrap items-center gap-2 text-sm text-gray-600">
        <span>{filtrar.length} vendedor(es) encontrado(s)</span>
        {alertas.size > 0 && (
          <span className="rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-xs font-semibold text-rose-700">
            {alertas.size} em prejuízo (30d)
          </span>
        )}
        <span className="rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-700">
          Comissão e cotação são individuais por cambista
        </span>
      </p>

      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white shadow">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-600">
                Login
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-600">
                Tipo
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
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="font-medium text-gray-900">{c.login}</span>
                    {alertas.get(c.id) ? (
                      <AlertaBadge analise={alertas.get(c.id)!} />
                    ) : null}
                  </div>
                  <div className="text-xs text-gray-500">
                    Gerente: {getGerenteNome(c.gerenteId)}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-2 py-1 text-xs ${(c.tipo ?? "cambista") === "cliente" ? "bg-blue-100 text-blue-700" : "bg-amber-100 text-amber-700"}`}>
                    {(c.tipo ?? "cambista") === "cliente" ? "Cliente" : "Cambista"}
                  </span>
                </td>
                <td className="px-4 py-3 text-xs text-gray-600">
                  <div>
                    M: {getCotacaoEfetiva(c, "milhar")} / C: {getCotacaoEfetiva(c, "centena")} / D: {getCotacaoEfetiva(c, "dezena")} / G: {getCotacaoEfetiva(c, "grupo")}
                  </div>
                  <div>M: {c.comissaoMilhar}% | C: {c.comissaoCentena}% | D: {c.comissaoDezena}% | G: {c.comissaoGrupo}%</div>
                  {c.cotacoes && Object.keys(c.cotacoes).length > 0 && (
                    <div className="mt-1 text-[11px] font-semibold text-blue-700">
                      Cotações especiais configuradas
                    </div>
                  )}
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
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg bg-white p-6 shadow-xl [color:#171717]">
            <h2 className="mb-4 text-xl font-bold [color:#171717]">
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
                <label className="text-sm text-gray-600">Tipo:</label>
                <select
                  value={form.tipo ?? "cambista"}
                  onChange={(e) =>
                    setForm({ ...form, tipo: e.target.value as "cambista" | "cliente" })
                  }
                  className="mt-1 w-full rounded border px-3 py-2"
                >
                  <option value="cambista">Cambista</option>
                  <option value="cliente">Cliente</option>
                </select>
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
              <div className="rounded border border-blue-100 bg-blue-50 px-3 py-2 text-xs text-blue-800">
                As comissões e cotações abaixo valem apenas para este cambista. Se o admin
                configurar cotações especiais em <strong>Loterias &gt; Cotações</strong>, elas
                sobrescrevem os valores principais deste cadastro.
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
                <label className="text-sm text-gray-600">Risco:</label>
                <select
                  value={form.risco}
                  onChange={(e) => setForm({ ...form, risco: e.target.value })}
                  className="mt-1 w-full rounded border px-3 py-2"
                >
                  <option value="BOM">Bom</option>
                  <option value="MEDIO">Médio</option>
                  <option value="RUIM">Ruim</option>
                </select>
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

const SEVER_BADGE: Record<SeveridadeAlerta, { label: string; classes: string }> = {
  critico: {
    label: "Prejuízo crítico",
    classes: "bg-rose-100 text-rose-700 border-rose-300",
  },
  alto: {
    label: "Prejuízo alto",
    classes: "bg-orange-100 text-orange-700 border-orange-300",
  },
  medio: {
    label: "Prejuízo médio",
    classes: "bg-amber-100 text-amber-700 border-amber-300",
  },
  baixo: {
    label: "Em prejuízo",
    classes: "bg-slate-100 text-slate-700 border-slate-300",
  },
};

function AlertaBadge({ analise }: { analise: AnaliseCambista }) {
  const sev = SEVER_BADGE[analise.severidade];
  const titulo = `${sev.label} · ${analise.lucro.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} (${analise.qtdBilhetes} bilhete(s) nos últimos 30 dias)`;
  return (
    <span
      title={titulo}
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${sev.classes}`}
    >
      <span className="text-[8px] leading-none">●</span>
      {sev.label}
    </span>
  );
}
