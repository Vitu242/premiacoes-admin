"use client";

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  getExtracoes,
  setExtracoes,
  updateExtracao,
  addExtracao,
  deleteExtracao,
  getConfig,
  setConfig,
  getCotacoesPadroes,
  setCotacoesPadroes,
  getCotacaoEfetiva,
  getCambistasPorCodigo,
  updateCambista,
} from "@/lib/store";
import { addLog } from "@/lib/auditoria";
import { getAdminCodigo } from "@/lib/auth";
import { getExtracoesPadrao } from "@/lib/extracoes-padrao";
import {
  COTACOES_KEYS_ORDER,
  COTACOES_LABELS,
  type CotacaoKey,
  type CotacoesPadroes,
} from "@/lib/cotacoes";
import type { Extracao, DiaSemana } from "@/lib/types";

const DIAS_SEMANA: DiaSemana[] = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sab"];

type TabId = "extracoes" | "modalidades" | "cotacoes";

/** Status da modalidade conforme SAE (Tela 17). */
type StatusModalidade = "ativa" | "desbloqueado" | "bloqueada";

interface ModalidadeLinha {
  key: CotacaoKey;
  label: string;
  minValor: string;
  maxValor: string;
  status: StatusModalidade;
}

export default function LoteriasUnificadaPage() {
  const searchParams = useSearchParams();
  const tabParam = (searchParams.get("tab") || "extracoes") as TabId;
  const tab: TabId = ["extracoes", "modalidades", "cotacoes"].includes(tabParam) ? tabParam : "extracoes";

  const codigo = getAdminCodigo();
  const cambistas = getCambistasPorCodigo(codigo ?? "");

  // Extrações
  const [extracoes, setExtracoesState] = useState<Extracao[]>(getExtracoes());
  const [filtroNome, setFiltroNome] = useState("");
  const [editando, setEditando] = useState<Extracao | null>(null);
  const [novo, setNovo] = useState(false);
  const [form, setForm] = useState<Partial<Extracao>>({ nome: "", encerra: "12:00", ativa: true, tipo: "Tradicional", dias: [...DIAS_SEMANA] });

  // Modalidades
  const [linhas, setLinhas] = useState<ModalidadeLinha[]>([]);
  const [salvando, setSalvando] = useState(false);
  const [msgModalidades, setMsgModalidades] = useState<string | null>(null);

  // Cotações
  const [alvo, setAlvo] = useState<"padrao" | string>("padrao");
  const [valores, setValores] = useState<CotacoesPadroes>(getCotacoesPadroes());
  const [salvo, setSalvo] = useState(false);

  const cambista = alvo === "padrao" ? null : cambistas.find((c) => c.id === alvo);

  const filtrarExtracoes = extracoes.filter((e) =>
    !filtroNome.trim() || e.nome.toLowerCase().includes(filtroNome.toLowerCase())
  );

  useEffect(() => {
    setExtracoesState(getExtracoes());
  }, []);

  useEffect(() => {
    if (tab === "modalidades") {
      const cfg = getConfig();
      const base = (cfg as unknown as { modalidades?: Record<string, { minValor: number; maxValor: number; ativa?: boolean; status?: StatusModalidade }> }).modalidades ?? {};
      const inicial: ModalidadeLinha[] = COTACOES_KEYS_ORDER.map((key) => {
        const atual = base[key as string];
        const statusVal = atual?.status ?? (atual?.ativa === false ? "bloqueada" : "ativa");
        return {
          key,
          label: COTACOES_LABELS[key],
          minValor: atual?.minValor != null ? String(atual.minValor) : "",
          maxValor: atual?.maxValor != null ? String(atual.maxValor) : "",
          status: statusVal as StatusModalidade,
        };
      });
      setLinhas(inicial);
    }
  }, [tab]);

  useEffect(() => {
    if (tab === "cotacoes") {
      if (alvo === "padrao") {
        setValores(getCotacoesPadroes());
      } else if (cambista) {
        const padroes = getCotacoesPadroes();
        const next: CotacoesPadroes = { ...padroes };
        (COTACOES_KEYS_ORDER as CotacaoKey[]).forEach((key) => {
          next[key] = getCotacaoEfetiva(cambista, key);
        });
        setValores(next);
      }
    }
  }, [tab, alvo, cambista?.id]);

  const salvarExtracao = () => {
    if (novo) {
      if (!form.nome?.trim()) {
        alert("Informe o nome da extração.");
        return;
      }
      addExtracao({
        nome: form.nome.trim(),
        encerra: form.encerra ?? "12:00",
        ativa: form.ativa ?? true,
        tipo: form.tipo?.trim() || undefined,
        dias: form.dias && form.dias.length > 0 ? form.dias : undefined,
      });
      addLog("Criou loteria", form.nome.trim());
    } else if (editando) {
      if (!form.nome?.trim()) {
        alert("Informe o nome da extração.");
        return;
      }
      updateExtracao(editando.id, {
        nome: form.nome.trim(),
        encerra: form.encerra ?? editando.encerra,
        ativa: form.ativa ?? editando.ativa,
        tipo: form.tipo?.trim() || undefined,
        dias: form.dias && form.dias.length > 0 ? form.dias : undefined,
      });
      addLog("Atualizou loteria", form.nome.trim());
    }
    setExtracoesState(getExtracoes());
    setEditando(null);
    setNovo(false);
    setForm({ nome: "", encerra: "12:00", ativa: true, tipo: "Tradicional", dias: [...DIAS_SEMANA] });
  };

  const restaurarPadrao = () => {
    if (!confirm("Substituir a lista atual pela lista padrão de 55 loterias? As alterações manuais serão perdidas.")) return;
    setExtracoes(getExtracoesPadrao());
    setExtracoesState(getExtracoes());
    addLog("Loterias", "Restaurou lista padrão");
    setEditando(null);
    setNovo(false);
  };

  const apagarExtracao = (e: Extracao) => {
    if (!confirm(`Remover a extração "${e.nome}"?`)) return;
    deleteExtracao(e.id);
    addLog("Apagou loteria", e.nome);
    setExtracoesState(getExtracoes());
    if (editando?.id === e.id) setEditando(null);
  };

  const atualizarLinha = (idx: number, patch: Partial<ModalidadeLinha>) => {
    setLinhas((prev) =>
      prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)),
    );
  };

  const salvarModalidades = () => {
    setSalvando(true);
    setMsgModalidades(null);
    const modalidades: Record<string, { minValor: number; maxValor: number; status: StatusModalidade }> = {};
    for (const l of linhas) {
      const min = l.minValor.trim() === "" ? 0 : Number(l.minValor.replace(",", "."));
      const max = l.maxValor.trim() === "" ? 0 : Number(l.maxValor.replace(",", "."));
      modalidades[l.key] = {
        minValor: Number.isFinite(min) && min >= 0 ? min : 0,
        maxValor: Number.isFinite(max) && max >= 0 ? max : 0,
        status: l.status,
      };
    }
    setConfig({ modalidades } as Parameters<typeof setConfig>[0]);
    addLog("Modalidades", "Min/máx/ativa atualizados");
    setSalvando(false);
    setMsgModalidades("Modalidades atualizadas com sucesso.");
  };

  const handleChangeCotacao = (key: CotacaoKey, value: number) => {
    setValores((prev) => ({ ...prev, [key]: value }));
    setSalvo(false);
  };

  const handleSalvarCotacoes = () => {
    if (alvo === "padrao") {
      setCotacoesPadroes(valores);
      addLog("Cotações", "Cotações padrão atualizadas");
    } else if (cambista) {
      updateCambista(cambista.id, { cotacoes: { ...valores } });
      addLog("Cotações", `Override para ${cambista.login}`);
    }
    setSalvo(true);
  };

  const tabs: { id: TabId; label: string }[] = [
    { id: "extracoes", label: "Extrações" },
    { id: "modalidades", label: "Modalidades" },
    { id: "cotacoes", label: "Cotações" },
  ];

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-gray-800">Loterias</h1>

      <div className="mb-6 flex gap-1 border-b border-gray-200">
        {tabs.map((t) => (
          <Link
            key={t.id}
            href={`/loterias?tab=${t.id}`}
            className={`rounded-t px-4 py-3 text-sm font-medium transition-colors ${
              tab === t.id
                ? "border-b-2 border-orange-500 bg-white text-orange-600 shadow-sm"
                : "text-gray-600 hover:bg-gray-50 hover:text-gray-800"
            }`}
          >
            {t.label}
          </Link>
        ))}
      </div>

      {/* Aba Extrações */}
      {tab === "extracoes" && (
        <>
          <p className="mb-6 text-sm text-gray-600">
            Edite as extrações que seus clientes podem apostar. Nome e horário de encerramento definem quando as apostas são encerradas. Ative ou desative cada uma.
          </p>
          <div className="mb-4 flex flex-wrap gap-3">
            <input
              type="text"
              placeholder="Filtrar por nome"
              value={filtroNome}
              onChange={(e) => setFiltroNome(e.target.value)}
              className="rounded border border-gray-300 px-4 py-2 text-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
            />
            <button
              onClick={() => { setEditando(null); setNovo(true); setForm({ nome: "", encerra: "12:00", ativa: true, tipo: "Tradicional", dias: [...DIAS_SEMANA] }); }}
              className="rounded bg-orange-500 px-4 py-2 text-sm font-medium text-white hover:bg-orange-600"
            >
              Nova extração
            </button>
            <button
              onClick={restaurarPadrao}
              className="rounded border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Restaurar lista padrão (55 loterias)
            </button>
          </div>
          <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white shadow">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-600">Nome</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-600">Tipo</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-600">Dias</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-600">Encerra</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-600">Status</th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase text-gray-600">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {filtrarExtracoes.map((e) => (
                  <tr key={e.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-800">{e.nome}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{e.tipo ?? "—"}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {e.dias?.length ? e.dias.join(", ") : "Todos"}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">{e.encerra}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2 py-1 text-xs font-medium ${e.ativa ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"}`}>
                        {e.ativa ? "Ativa" : "Inativa"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => { setEditando(e); setNovo(false); setForm({ nome: e.nome, encerra: e.encerra, ativa: e.ativa, tipo: e.tipo ?? "Tradicional", dias: e.dias?.length ? e.dias : DIAS_SEMANA }); }}
                        className="mr-2 rounded bg-orange-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-orange-600"
                      >
                        Editar
                      </button>
                      <button
                        onClick={() => apagarExtracao(e)}
                        className="rounded bg-red-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-600"
                      >
                        Apagar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {(editando || novo) && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
              <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl [color:#171717]">
                <h2 className="mb-4 text-xl font-bold [color:#171717]">
                  {novo ? "Nova extração" : "Editar extração"}
                </h2>
                <div className="space-y-4">
                  <div>
                    <label className="mb-1 block text-sm text-gray-600">Nome</label>
                    <input
                      type="text"
                      value={form.nome ?? ""}
                      onChange={(e) => setForm({ ...form, nome: e.target.value })}
                      placeholder="Ex: NACIONAL 10:00"
                      className="w-full rounded border border-gray-300 px-4 py-2 [color:#171717]"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm text-gray-600">Tipo</label>
                    <input
                      type="text"
                      value={form.tipo ?? ""}
                      onChange={(e) => setForm({ ...form, tipo: e.target.value })}
                      placeholder="Ex: Tradicional, Federal"
                      className="w-full rounded border border-gray-300 px-4 py-2 [color:#171717]"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm text-gray-600">Dias da semana</label>
                    <div className="flex flex-wrap gap-3">
                      {DIAS_SEMANA.map((d) => {
                        const sel = form.dias ?? DIAS_SEMANA;
                        const checked = sel.includes(d);
                        return (
                          <label key={d} className="flex items-center gap-1 text-sm">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => {
                                const next = checked ? sel.filter((x) => x !== d) : [...sel, d];
                                setForm({ ...form, dias: next.length > 0 ? next : DIAS_SEMANA });
                              }}
                            />
                            {d}
                          </label>
                        );
                      })}
                    </div>
                    <p className="mt-1 text-xs text-gray-500">Vazio = todos os dias. O cliente só vê extrações que rodam hoje.</p>
                  </div>
                  <div>
                    <label className="mb-1 block text-sm text-gray-600">Encerra (HH:mm)</label>
                    <input
                      type="text"
                      value={form.encerra ?? ""}
                      onChange={(e) => setForm({ ...form, encerra: e.target.value })}
                      placeholder="21:20"
                      className="w-full rounded border border-gray-300 px-4 py-2 [color:#171717]"
                    />
                    <p className="mt-1 text-xs text-gray-500">Horário limite para apostas nesta extração.</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="ativa"
                      checked={form.ativa ?? true}
                      onChange={(e) => setForm({ ...form, ativa: e.target.checked })}
                    />
                    <label htmlFor="ativa" className="text-sm text-gray-700">Ativa (cliente pode apostar)</label>
                  </div>
                </div>
                <div className="mt-6 flex gap-3">
                  <button
                    onClick={salvarExtracao}
                    className="rounded bg-orange-500 px-4 py-2 font-medium text-white hover:bg-orange-600"
                  >
                    Salvar
                  </button>
                  <button
                    onClick={() => { setEditando(null); setNovo(false); }}
                    className="rounded border border-gray-300 px-4 py-2 hover:bg-gray-50 [color:#171717]"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* Aba Modalidades */}
      {tab === "modalidades" && (
        <>
          <p className="mb-4 text-sm text-gray-600">
            Defina valor mínimo, máximo e status de cada modalidade. Estes limites serão usados na venda do cliente.
          </p>
          <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white shadow">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-600">Modalidade</th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase text-gray-600">Valor mínimo (R$)</th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase text-gray-600">Valor máximo (R$)</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-600">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {linhas.map((l, idx) => (
                  <tr key={l.key} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm font-medium text-gray-800">{l.label}</td>
                    <td className="px-4 py-3 text-right text-sm">
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        value={l.minValor}
                        onChange={(e) => atualizarLinha(idx, { minValor: e.target.value })}
                        className="w-28 rounded border border-gray-300 px-2 py-1 text-right text-sm"
                      />
                    </td>
                    <td className="px-4 py-3 text-right text-sm">
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        value={l.maxValor}
                        onChange={(e) => atualizarLinha(idx, { maxValor: e.target.value })}
                        className="w-28 rounded border border-gray-300 px-2 py-1 text-right text-sm"
                      />
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <select
                        value={l.status}
                        onChange={(e) => atualizarLinha(idx, { status: e.target.value as StatusModalidade })}
                        className={`rounded border px-3 py-1.5 text-sm font-medium ${
                          l.status === "ativa" ? "border-green-300 bg-green-50 text-green-800" :
                          l.status === "desbloqueado" ? "border-amber-300 bg-amber-50 text-amber-800" :
                          "border-gray-300 bg-gray-100 text-gray-700"
                        }`}
                      >
                        <option value="ativa">Ativa</option>
                        <option value="desbloqueado">Desbloqueado</option>
                        <option value="bloqueada">Bloqueada</option>
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-4 flex items-center gap-3">
            <button
              type="button"
              onClick={salvarModalidades}
              disabled={salvando}
              className="rounded bg-orange-500 px-4 py-2 text-sm font-medium text-white hover:bg-orange-600 disabled:opacity-50"
            >
              {salvando ? "Salvando..." : "Salvar alterações"}
            </button>
            {msgModalidades && (
              <span className="text-sm text-green-700">{msgModalidades}</span>
            )}
          </div>
        </>
      )}

      {/* Aba Cotações */}
      {tab === "cotacoes" && (
        <>
          <p className="mb-6 text-sm text-gray-600">
            Altere as cotações padrão (valem para todos os clientes) ou escolha um cliente para definir cotações específicas. O cliente usa sempre a cotação efetiva (override dele ou padrão).
          </p>
          <div className="mb-6 flex flex-wrap items-center gap-4">
            <label className="text-sm font-medium text-gray-700">Editar:</label>
            <select
              value={alvo}
              onChange={(e) => setAlvo(e.target.value)}
              className="rounded border border-gray-300 px-4 py-2 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
            >
              <option value="padrao">Cotações padrão (todos os clientes)</option>
              {cambistas.map((c) => (
                <option key={c.id} value={c.id}>{c.login}</option>
              ))}
            </select>
            <button
              onClick={handleSalvarCotacoes}
              className="rounded bg-orange-500 px-4 py-2 font-medium text-white hover:bg-orange-600"
            >
              Salvar alterações
            </button>
            {salvo && <span className="text-sm text-green-600">Salvo.</span>}
          </div>
          <div className="rounded-lg border border-gray-200 bg-white shadow">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-600">Tipo</th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase text-gray-600">Valor (R$)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {(COTACOES_KEYS_ORDER as CotacaoKey[]).map((key) => (
                  <tr key={key} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm font-medium text-gray-900">{COTACOES_LABELS[key]}</td>
                    <td className="px-4 py-3 text-right">
                      <input
                        type="number"
                        min={0}
                        step={0.01}
                        value={valores[key]}
                        onChange={(e) => handleChangeCotacao(key, Number(e.target.value) || 0)}
                        className="w-32 rounded border border-gray-300 px-2 py-1.5 text-right text-sm [color:#171717]"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
