"use client";

import { useState, useEffect } from "react";
import { getResultados, getExtracoes, addResultado, updateResultado, removeResultado } from "@/lib/store";
import { addLog } from "@/lib/auditoria";
import { hojeIsoDate } from "@/lib/date-utils";
import { useToast } from "@/app/components/Toast";

export default function ResultadosAdminPage() {
  const toast = useToast();
  const [resultados, setResultados] = useState(getResultados());
  const [dataSelecionada, setDataSelecionada] = useState<string>(() => hojeIsoDate());
  const [filtroTipo, setFiltroTipo] = useState("");
  const [extracaoId, setExtracaoId] = useState("");
  const [premios, setPremios] = useState<Record<number, string>>(() => {
    const o: Record<number, string> = {};
    for (let p = 1; p <= 10; p++) o[p] = "";
    return o;
  });
  const [showForm, setShowForm] = useState(false);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [apagandoId, setApagandoId] = useState<string | null>(null);
  const [buscandoAuto, setBuscandoAuto] = useState(false);
  const [verResultado, setVerResultado] = useState<{ id: string; extracaoNome: string; grupos: string; premios: Record<number, string> } | null>(null);

  const extracoesAll = getExtracoes();
  const tiposUnicos = Array.from(new Set(extracoesAll.map((e) => e.nome.split(" ")[0] || e.nome))).sort();
  const extracoes = filtroTipo
    ? extracoesAll.filter((e) => e.nome.toUpperCase().includes(filtroTipo.toUpperCase()))
    : extracoesAll;

  useEffect(() => {
    setResultados(getResultados());
  }, []);

  const dataNorm = dataSelecionada ? (() => {
    const [y, m, d] = dataSelecionada.split("-");
    return `${d}/${m}/${y}`;
  })() : "";

  const handleSalvar = async (e: React.FormEvent) => {
    e.preventDefault();
    const ext = extracoes.find((e) => e.id === extracaoId);
    if (!ext && !editandoId) return;
    const grupos1 = premios[1]?.trim() || "";
    if (!grupos1) {
      toast.error("Informe ao menos o 1º prêmio.");
      return;
    }
    const premiosObj: Record<number, string> = { 1: grupos1 };
    for (let p = 2; p <= 10; p++) if (premios[p]?.trim()) premiosObj[p] = premios[p].trim();
    setSalvando(true);
    let sucesso = false;
    try {
      if (editandoId) {
        await updateResultado(editandoId, { grupos: grupos1, premios: premiosObj });
        addLog("Editou resultado", `${ext?.nome ?? "?"} - ${dataNorm}`);
        toast.success(`Resultado de ${ext?.nome ?? "extração"} atualizado!`);
      } else if (ext) {
        await addResultado({
          extracaoId: ext.id,
          extracaoNome: ext.nome,
          data: dataNorm,
          grupos: grupos1,
          premios: premiosObj,
        });
        addLog("Adicionou resultado", `${ext.nome} - ${dataNorm}`);
        toast.success(`Resultado de ${ext.nome} lançado!`);
      }
      sucesso = true;
    } catch (err) {
      toast.error(`Erro ao salvar: ${(err as Error).message}`);
    } finally {
      setSalvando(false);
    }
    setResultados(getResultados());
    // Só limpa o formulário e fecha se realmente salvou. Em caso de erro,
    // mantém o que o usuário digitou para que ele possa tentar de novo.
    if (sucesso) {
      setExtracaoId("");
      setEditandoId(null);
      setPremios(() => {
        const o: Record<number, string> = {};
        for (let p = 1; p <= 10; p++) o[p] = "";
        return o;
      });
      setShowForm(false);
    }
  };

  const handleEditar = (r: { id: string; extracaoId: string; grupos: string; premios?: Record<number, string> }) => {
    setEditandoId(r.id);
    setExtracaoId(r.extracaoId);
    const novos: Record<number, string> = {};
    for (let p = 1; p <= 10; p++) novos[p] = r.premios?.[p] ?? (p === 1 ? r.grupos : "");
    setPremios(novos);
    setShowForm(true);
    setVerResultado(null);
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  };

  /**
   * Apaga um resultado lançado. Reverte os prêmios já pagos (em cambistas) e
   * marca os bilhetes daquela extração/data como pendentes. Útil quando um
   * resultado entrou errado (fonte adiantou, digitação errada, etc.).
   */
  const handleApagar = async (r: { id: string; extracaoNome: string }) => {
    if (apagandoId === r.id) return;
    const ok = typeof window !== "undefined"
      ? window.confirm(
          `Apagar o resultado de "${r.extracaoNome}" em ${dataNorm}?\n\n` +
            "Os bilhetes desta extração voltarão a ficar PENDENTES " +
            "e os prêmios já pagos serão revertidos automaticamente.\n\n" +
            "Esta ação não pode ser desfeita.",
        )
      : true;
    if (!ok) return;
    setApagandoId(r.id);
    try {
      const removido = await removeResultado(r.id);
      if (!removido) {
        toast.error("Resultado não encontrado.");
        return;
      }
      addLog("Apagou resultado", `${r.extracaoNome} - ${dataNorm}`);
      toast.success(`Resultado de ${r.extracaoNome} apagado.`);
      setResultados(getResultados());
      setVerResultado(null);
    } catch (err) {
      toast.error(`Erro ao apagar: ${(err as Error).message}`);
    } finally {
      setApagandoId(null);
    }
  };

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-gray-800">Resultados</h1>
      <p className="mb-4 text-sm text-gray-600">
        Informe a data e o resultado de cada extração. Ao salvar, os bilhetes daquela extração/data são conferidos e marcados como Pago ou Perdedor. Use grupos no formato 01-02-03-04-05 (5 grupos por prêmio).
      </p>

      <div className="mb-6 flex flex-wrap items-center gap-4">
        <label className="text-sm font-medium text-gray-700">Data:</label>
        <input
          type="date"
          value={dataSelecionada}
          onChange={(e) => setDataSelecionada(e.target.value)}
          className="rounded border border-gray-300 px-3 py-2 text-sm"
        />
        <div>
          <label className="mr-2 text-sm font-medium text-gray-700">Tipo loteria:</label>
          <select
            value={filtroTipo}
            onChange={(e) => setFiltroTipo(e.target.value)}
            className="rounded border border-gray-300 px-3 py-2 text-sm"
          >
            <option value="">Todas</option>
            {tiposUnicos.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>
        <button
          onClick={() => {
            if (showForm) {
              setShowForm(false);
              setEditandoId(null);
            } else {
              setShowForm(true);
            }
          }}
          className="rounded bg-orange-500 px-4 py-2 text-sm font-medium text-white hover:bg-orange-600"
        >
          {showForm ? "Cancelar" : "Lançar resultado"}
        </button>
        <button
          type="button"
          disabled={buscandoAuto}
          onClick={async () => {
            if (buscandoAuto) return;
            setBuscandoAuto(true);
            try {
              // GET sem auth para o cron interno; admin via UI usa header.
              // Como /api/resultados/auto agora exige auth, mandamos X-Sync-Auth.
              let authHeader: Record<string, string> = {};
              try {
                const adminRaw = localStorage.getItem("premiacoes_admin");
                if (adminRaw) {
                  const a = JSON.parse(adminRaw) as { codigo?: string; senha?: string };
                  if (a.codigo && a.senha) {
                    authHeader = { "X-Sync-Auth": btoa(`admin:${a.codigo}:${a.senha}`) };
                  }
                }
              } catch {}
              const r = await fetch("/api/resultados/auto?janela=600", {
                method: "GET",
                headers: authHeader,
              });
              const j = (await r.json()) as { salvos?: number; erro?: string };
              if (!r.ok) throw new Error(j?.erro || `HTTP ${r.status}`);
              const n = j?.salvos ?? 0;
              if (n > 0) toast.success(`Busca automática: ${n} resultado(s) salvo(s).`);
              else toast.info("Busca automática concluída. Nenhum novo resultado.");
              setResultados(getResultados());
            } catch (e) {
              toast.error(`Falha na busca automática: ${(e as Error).message}`);
            } finally {
              setBuscandoAuto(false);
            }
          }}
          className="rounded border border-blue-300 bg-blue-50 px-4 py-2 text-sm font-medium text-blue-700 hover:bg-blue-100 disabled:opacity-60"
          title="Tenta puxar resultados das extrações que já encerraram hoje."
        >
          {buscandoAuto ? "Buscando…" : "Buscar automaticamente"}
        </button>
      </div>

      <p className="mb-4 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-800">
        Resultados são buscados automaticamente a cada minuto na fonte oficial.
        Você pode forçar uma busca clicando em &quot;Buscar automaticamente&quot;.
      </p>

      {showForm && (
        <form onSubmit={handleSalvar} className="mb-8 rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 font-semibold text-gray-800">
            {editandoId ? "Editar resultado" : "Novo resultado"}
          </h2>
          <div className="mb-4">
            <label className="mb-1 block text-sm text-gray-600">Extração</label>
            <select
              value={extracaoId}
              onChange={(e) => setExtracaoId(e.target.value)}
              className="w-full max-w-md rounded border border-gray-300 px-4 py-2 disabled:bg-gray-100"
              required
              disabled={!!editandoId}
            >
              <option value="">Selecione</option>
              {extracoes.map((e) => (
                <option key={e.id} value={e.id}>{e.nome}</option>
              ))}
            </select>
            {editandoId && (
              <p className="mt-1 text-xs text-gray-500">
                Ao salvar, os bilhetes desta extração/data serão reconferidos automaticamente.
              </p>
            )}
          </div>
          <div className="space-y-2">
            <p className="text-sm font-medium text-gray-700">Grupos por prêmio (ex: 01-02-03-04-05)</p>
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((p) => (
              <div key={p} className="flex items-center gap-3">
                <label className="w-16 text-sm text-gray-600">{p}º prêmio</label>
                <input
                  type="text"
                  value={premios[p] ?? ""}
                  onChange={(e) => setPremios((prev) => ({ ...prev, [p]: e.target.value }))}
                  placeholder={p === 1 ? "01-02-03-04-05" : "Opcional"}
                  className="flex-1 max-w-xs rounded border border-gray-300 px-3 py-2 font-mono text-sm"
                />
              </div>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={salvando}
              className="rounded bg-orange-500 px-4 py-2 font-medium text-white hover:bg-orange-600 disabled:opacity-50"
            >
              {salvando
                ? "Salvando..."
                : editandoId
                  ? "Salvar alterações e reconferir"
                  : "Salvar e conferir bilhetes"}
            </button>
            {editandoId && (
              <button
                type="button"
                onClick={() => {
                  setEditandoId(null);
                  setShowForm(false);
                  setExtracaoId("");
                }}
                className="rounded border border-gray-300 bg-white px-4 py-2 font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancelar edição
              </button>
            )}
          </div>
        </form>
      )}

      <div className="rounded-lg border border-gray-200 bg-white shadow">
        <h2 className="border-b border-gray-200 px-4 py-3 font-semibold text-gray-800">
          Extrações – resultado em {dataNorm || "—"}
        </h2>
        <div className="max-h-[60vh] overflow-y-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50 sticky top-0">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-600">Extração</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-600">Status</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-600">1º prêmio</th>
                <th className="px-4 py-3 text-center text-xs font-medium uppercase text-gray-600">Opções</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {extracoes.map((e) => {
                const r = resultados.find((res) => res.extracaoId === e.id && res.data.includes(dataNorm));
                return (
                  <tr key={e.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">{e.nome}</td>
                    <td className="px-4 py-3">
                      {r ? (
                        <span className="rounded bg-green-100 px-2 py-1 text-xs text-green-700">Lançado</span>
                      ) : (
                        <span className="rounded bg-gray-100 px-2 py-1 text-xs text-gray-600">Sem resultado</span>
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono text-sm text-gray-700">{r?.grupos ?? "—"}</td>
                    <td className="px-4 py-3 text-center">
                      {r ? (
                        <div className="flex flex-wrap items-center justify-center gap-2">
                          <button
                            type="button"
                            onClick={() => setVerResultado({
                              id: r.id,
                              extracaoNome: e.nome,
                              grupos: r.grupos,
                              premios: r.premios ?? { 1: r.grupos },
                            })}
                            className="rounded bg-blue-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-600"
                          >
                            Ver
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              handleEditar({
                                id: r.id,
                                extracaoId: r.extracaoId,
                                grupos: r.grupos,
                                premios: r.premios,
                              })
                            }
                            className="rounded bg-amber-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-600"
                          >
                            Editar
                          </button>
                          <button
                            type="button"
                            onClick={() => handleApagar({ id: r.id, extracaoNome: e.nome })}
                            disabled={apagandoId === r.id}
                            className="rounded bg-red-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-600 disabled:opacity-60"
                            title="Apagar resultado lançado (em caso de erro)"
                          >
                            Apagar
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            setExtracaoId(e.id);
                            setShowForm(true);
                          }}
                          className="rounded bg-orange-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-orange-600"
                        >
                          Adicionar
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Ver Resultado */}
      {verResultado && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setVerResultado(null)}
        >
          <div
            className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-800">Resultado — {verResultado.extracaoNome}</h2>
              <button
                type="button"
                onClick={() => setVerResultado(null)}
                className="rounded p-2 text-gray-500 hover:bg-gray-100"
                aria-label="Fechar"
              >
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="space-y-2 text-sm text-gray-700">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((p) => {
                const val = verResultado.premios[p] ?? (p === 1 ? verResultado.grupos : null);
                if (!val) return null;
                return (
                  <p key={p}><strong>{p}º prêmio:</strong> {val}</p>
                );
              })}
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => {
                  const ext = extracoesAll.find((x) => x.nome === verResultado!.extracaoNome);
                  if (!ext) return;
                  handleEditar({
                    id: verResultado!.id,
                    extracaoId: ext.id,
                    grupos: verResultado!.grupos,
                    premios: verResultado!.premios,
                  });
                }}
                className="rounded bg-amber-500 px-4 py-2 text-sm font-medium text-white hover:bg-amber-600"
              >
                Editar resultado
              </button>
              <button
                type="button"
                onClick={() =>
                  handleApagar({
                    id: verResultado!.id,
                    extracaoNome: verResultado!.extracaoNome,
                  })
                }
                disabled={apagandoId === verResultado!.id}
                className="rounded bg-red-500 px-4 py-2 text-sm font-medium text-white hover:bg-red-600 disabled:opacity-60"
              >
                {apagandoId === verResultado!.id ? "Apagando…" : "Apagar resultado"}
              </button>
              <button
                type="button"
                onClick={() => setVerResultado(null)}
                className="rounded bg-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-300"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
