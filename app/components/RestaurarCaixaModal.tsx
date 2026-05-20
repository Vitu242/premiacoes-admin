"use client";

import { useEffect, useMemo, useState } from "react";
import type { Cambista } from "@/lib/types";

interface SnapshotMeta {
  id: string;
  codigo: string | null;
  criado_em: string;
  motivo: string | null;
  total_cambistas: number;
  total_caixa: number;
}

interface CambistaCaixa {
  id: string;
  login: string;
  codigo: string;
  saldo: number;
  entrada: number;
  saidas: number;
  comissao: number;
  lancamentos: number;
  ultima_prestacao: string | null;
}

interface SnapshotFull extends SnapshotMeta {
  snapshot: CambistaCaixa[];
}

function fmt(valor: number) {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function fmtDataHora(s: string) {
  try {
    const d = new Date(s);
    return d.toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return s;
  }
}

function totalCaixa(c: { entrada: number; saidas: number; comissao: number; lancamentos: number }) {
  return Number(c.entrada || 0) - Number(c.saidas || 0) - Number(c.comissao || 0) + Number(c.lancamentos || 0);
}

export interface RestaurarCaixaModalProps {
  open: boolean;
  onClose: () => void;
  codigo: string | null;
  cambistasAtuais: Cambista[];
  /** Recarregar lista de cambistas após restaurar. */
  onRestaurado: () => void;
}

export function RestaurarCaixaModal({
  open,
  onClose,
  codigo,
  cambistasAtuais,
  onRestaurado,
}: RestaurarCaixaModalProps) {
  const [step, setStep] = useState<"senha" | "lista" | "preview" | "confirma">("senha");
  const [snapshots, setSnapshots] = useState<SnapshotMeta[] | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [snapEscolhido, setSnapEscolhido] = useState<SnapshotFull | null>(null);
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [senha, setSenha] = useState("");
  const [confirma, setConfirma] = useState("");
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    if (!open) {
      setStep("senha");
      setSnapEscolhido(null);
      setSnapshots(null);
      setErro(null);
      setSenha("");
      setConfirma("");
      setSelecionados(new Set());
    }
  }, [open]);

  // Lock do scroll do body enquanto o modal está aberto.
  useEffect(() => {
    if (!open) return;
    const orig = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = orig;
    };
  }, [open]);

  const carregarLista = async () => {
    if (!senha.trim()) {
      setErro("Digite a senha do Lotobrasil.");
      return;
    }
    setCarregando(true);
    setErro(null);
    try {
      const url = codigo
        ? `/api/caixa/snapshots?codigo=${encodeURIComponent(codigo)}&limit=80`
        : "/api/caixa/snapshots?limit=80";
      const r = await fetch(url, {
        headers: { "X-Senha-Lotobrasil": senha.trim() },
      });
      const data = await r.json();
      if (!r.ok || !data?.ok) {
        throw new Error(data?.erro || "Falha ao listar backups.");
      }
      setSnapshots(data.snapshots ?? []);
      setStep("lista");
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setCarregando(false);
    }
  };

  const cambistaPorId = useMemo(() => {
    const m = new Map<string, Cambista>();
    for (const c of cambistasAtuais) m.set(String(c.id), c);
    return m;
  }, [cambistasAtuais]);

  const escolherSnapshot = async (id: string) => {
    setCarregando(true);
    setErro(null);
    try {
      const r = await fetch(`/api/caixa/snapshot/${encodeURIComponent(id)}`, {
        headers: { "X-Senha-Lotobrasil": senha.trim() },
      });
      const data = await r.json();
      if (!data?.ok) throw new Error(data?.erro || `HTTP ${r.status}`);
      const snap = data.snapshot as SnapshotFull;
      setSnapEscolhido(snap);
      // Pré-seleciona apenas cambistas com diferença
      const filtrados = snap.snapshot.filter((c) => cambistaPorId.has(String(c.id)));
      const comDiff = filtrados.filter((c) => {
        const atual = cambistaPorId.get(String(c.id))!;
        return (
          Math.abs(Number(atual.entrada || 0) - Number(c.entrada)) > 0.005 ||
          Math.abs(Number(atual.saidas || 0) - Number(c.saidas)) > 0.005 ||
          Math.abs(Number(atual.comissao || 0) - Number(c.comissao)) > 0.005 ||
          Math.abs(Number(atual.lancamentos || 0) - Number(c.lancamentos)) > 0.005 ||
          Math.abs(Number(atual.saldo || 0) - Number(c.saldo)) > 0.005
        );
      });
      setSelecionados(new Set(comDiff.map((c) => String(c.id))));
      setStep("preview");
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setCarregando(false);
    }
  };

  const restaurar = async () => {
    if (!snapEscolhido) return;
    setEnviando(true);
    setErro(null);
    try {
      const r = await fetch("/api/caixa/restore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          snapshotId: snapEscolhido.id,
          cambistaIds: [...selecionados],
          confirmacao: confirma.trim().toUpperCase(),
          senhaLotobrasil: senha,
          codigo: codigo ?? undefined,
        }),
      });
      const data = await r.json();
      if (!r.ok || !data?.ok) {
        throw new Error(data?.erro || `HTTP ${r.status}`);
      }

      // CRÍTICO: limpar da fila offline qualquer upsert pendente dos cambistas
      // restaurados — sem isso, um upsert antigo subiria depois e
      // sobrescreveria a restauração.
      try {
        const Q_KEY = "premiacoes_sync_queue";
        const raw = localStorage.getItem(Q_KEY);
        if (raw) {
          const fila = JSON.parse(raw) as Array<{
            op?: { kind?: string; table?: string; payload?: unknown; match?: { id?: unknown } };
          }>;
          const ids = new Set([...selecionados]);
          const nova = fila.filter((it) => {
            const op = it?.op;
            if (!op || op.table !== "cambistas") return true;
            if (op.kind === "upsert") {
              const arr = Array.isArray(op.payload) ? op.payload : [op.payload];
              return !arr.some((p) =>
                ids.has(String((p as { id?: unknown } | null | undefined)?.id ?? "")),
              );
            }
            if (op.kind === "update" && op.match?.id) {
              return !ids.has(String(op.match.id));
            }
            return true;
          });
          localStorage.setItem(Q_KEY, JSON.stringify(nova));
        }
      } catch {
        /* ignore */
      }

      // Re-sincronizar do servidor para que o local reflita o caixa restaurado
      try {
        const { initFromSupabase } = await import("@/lib/sync-supabase");
        await initFromSupabase();
      } catch {
        /* ignore */
      }

      alert(
        `Restauração concluída.\n` +
          `Restaurados: ${data.restaurados}\n` +
          `Ignorados (cambistas não existem mais): ${data.ignorados?.length ?? 0}\n` +
          `Erros: ${data.erros?.length ?? 0}\n\n` +
          `Snapshot anterior salvo: ${data.snapshotPreRestoreId ?? "-"}`,
      );
      onRestaurado();
      onClose();
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setEnviando(false);
    }
  };

  if (!open) return null;

  const cambistasFiltrados = (snapEscolhido?.snapshot ?? []).filter((c) =>
    cambistaPorId.has(String(c.id)),
  );

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4">
      <div className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-lg bg-white text-slate-900 shadow-2xl dark:bg-slate-800 dark:text-slate-100">
        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-5 py-3 dark:border-slate-700 dark:bg-slate-900">
          <div>
            <h2 className="text-base font-semibold">Restaurar caixa de backup</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Operação sensível. O caixa atual será sobrescrito pelos valores do backup escolhido.
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded p-1 text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700"
            aria-label="Fechar"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-auto p-5">
          {erro && (
            <div className="mb-4 rounded border border-rose-300 bg-rose-50 p-3 text-sm text-rose-700 dark:border-rose-700 dark:bg-rose-900/30 dark:text-rose-200">
              {erro}
            </div>
          )}

          {step === "senha" && (
            <div className="space-y-3">
              <p className="text-sm text-slate-600 dark:text-slate-300">
                Para listar e restaurar backups, digite a senha do <b>Lotobrasil</b>.
              </p>
              <input
                type="password"
                autoComplete="off"
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void carregarLista();
                }}
                placeholder="Senha do Lotobrasil"
                className="w-full rounded border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-700"
              />
              <button
                onClick={() => void carregarLista()}
                disabled={!senha.trim() || carregando}
                className="rounded bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                {carregando ? "Verificando…" : "Listar backups"}
              </button>
            </div>
          )}

          {step === "lista" && (
            <div>
              {carregando && <p className="text-sm text-slate-500">Carregando backups…</p>}
              {!carregando && snapshots?.length === 0 && (
                <p className="text-sm text-slate-500">
                  Nenhum backup encontrado ainda. O sistema cria um a cada 30 min automaticamente.
                </p>
              )}
              {!carregando && (snapshots?.length ?? 0) > 0 && (
                <>
                  <p className="mb-3 text-xs text-slate-500">
                    Clique em um backup para ver as diferenças e escolher quais cambistas restaurar.
                  </p>
                  <div className="overflow-hidden rounded border border-slate-200 dark:border-slate-700">
                    <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-700">
                      <thead className="bg-slate-50 dark:bg-slate-900 text-xs uppercase text-slate-600 dark:text-slate-300">
                        <tr>
                          <th className="px-3 py-2 text-left">Quando</th>
                          <th className="px-3 py-2 text-left">Motivo</th>
                          <th className="px-3 py-2 text-right">Cambistas</th>
                          <th className="px-3 py-2 text-right">Total caixa</th>
                          <th className="px-3 py-2"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200 text-sm dark:divide-slate-700">
                        {snapshots!.map((s) => (
                          <tr key={s.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/40">
                            <td className="px-3 py-2 whitespace-nowrap">{fmtDataHora(s.criado_em)}</td>
                            <td className="px-3 py-2 text-xs text-slate-500">{s.motivo ?? "auto"}</td>
                            <td className="px-3 py-2 text-right">{s.total_cambistas}</td>
                            <td className="px-3 py-2 text-right">{fmt(Number(s.total_caixa))}</td>
                            <td className="px-3 py-2 text-right">
                              <button
                                onClick={() => escolherSnapshot(s.id)}
                                className="rounded bg-emerald-600 px-3 py-1 text-xs font-medium text-white hover:bg-emerald-700"
                              >
                                Ver diferenças
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          )}

          {step === "preview" && snapEscolhido && (
            <div>
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">
                    Backup de {fmtDataHora(snapEscolhido.criado_em)}
                  </p>
                  <p className="text-xs text-slate-500">
                    {cambistasFiltrados.length} cambistas no backup. Marque os que deseja restaurar.
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() =>
                      setSelecionados(new Set(cambistasFiltrados.map((c) => String(c.id))))
                    }
                    className="rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-700"
                  >
                    Marcar todos
                  </button>
                  <button
                    onClick={() => setSelecionados(new Set())}
                    className="rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-700"
                  >
                    Desmarcar todos
                  </button>
                </div>
              </div>

              <div className="overflow-x-auto rounded border border-slate-200 dark:border-slate-700">
                <table className="min-w-full divide-y divide-slate-200 text-xs dark:divide-slate-700">
                  <thead className="bg-slate-50 dark:bg-slate-900 uppercase text-slate-600 dark:text-slate-300">
                    <tr>
                      <th className="w-8 px-2 py-2"></th>
                      <th className="px-2 py-2 text-left">Cambista</th>
                      <th className="px-2 py-2 text-right">Total atual</th>
                      <th className="px-2 py-2 text-right">Total backup</th>
                      <th className="px-2 py-2 text-right">Diferença</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                    {cambistasFiltrados.map((c) => {
                      const atual = cambistaPorId.get(String(c.id))!;
                      const tAtual = totalCaixa({
                        entrada: atual.entrada,
                        saidas: atual.saidas,
                        comissao: atual.comissao,
                        lancamentos: atual.lancamentos,
                      });
                      const tBackup = totalCaixa(c);
                      const diff = tBackup - tAtual;
                      const checked = selecionados.has(String(c.id));
                      return (
                        <tr key={c.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/40">
                          <td className="px-2 py-2 text-center">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={(e) => {
                                const next = new Set(selecionados);
                                if (e.target.checked) next.add(String(c.id));
                                else next.delete(String(c.id));
                                setSelecionados(next);
                              }}
                            />
                          </td>
                          <td className="px-2 py-2">{c.login || atual.login}</td>
                          <td className="px-2 py-2 text-right">{fmt(tAtual)}</td>
                          <td className="px-2 py-2 text-right">{fmt(tBackup)}</td>
                          <td
                            className={`px-2 py-2 text-right font-medium ${
                              Math.abs(diff) < 0.005
                                ? "text-slate-400"
                                : diff > 0
                                ? "text-emerald-600"
                                : "text-rose-600"
                            }`}
                          >
                            {Math.abs(diff) < 0.005 ? "—" : fmt(diff)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  onClick={() => setStep("lista")}
                  className="rounded border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-700"
                >
                  Voltar
                </button>
                <button
                  onClick={() => setStep("confirma")}
                  disabled={selecionados.size === 0}
                  className="rounded bg-amber-600 px-3 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
                >
                  Continuar com {selecionados.size} cambista(s)
                </button>
              </div>
            </div>
          )}

          {step === "confirma" && snapEscolhido && (
            <div className="space-y-3">
              <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-900/30 dark:text-amber-100">
                <p className="font-semibold">Confirmação final</p>
                <p>
                  Vai restaurar o caixa de <b>{selecionados.size}</b> cambista(s) usando o backup
                  de <b>{fmtDataHora(snapEscolhido.criado_em)}</b>.
                </p>
                <p className="mt-1">
                  O sistema cria automaticamente um snapshot de segurança ANTES de aplicar — então
                  é possível reverter se algo der errado.
                </p>
              </div>

              <label className="block text-sm">
                Para confirmar, digite <b>RESTAURAR</b>:
                <input
                  type="text"
                  autoComplete="off"
                  value={confirma}
                  onChange={(e) => setConfirma(e.target.value)}
                  placeholder="RESTAURAR"
                  className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-700"
                />
              </label>

              <div className="flex flex-wrap gap-2 pt-2">
                <button
                  onClick={() => setStep("preview")}
                  className="rounded border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-700"
                >
                  Voltar
                </button>
                <button
                  onClick={restaurar}
                  disabled={
                    enviando ||
                    confirma.trim().toUpperCase() !== "RESTAURAR" ||
                    !senha
                  }
                  className="rounded bg-rose-600 px-3 py-2 text-sm font-medium text-white hover:bg-rose-700 disabled:opacity-50"
                >
                  {enviando ? "Restaurando…" : "Restaurar caixa agora"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
