"use client";

import { useEffect, useState } from "react";
import { supabase, useSupabase } from "@/lib/supabase";
import { initFromSupabase } from "@/lib/sync-supabase";
import {
  downloadSyncBackup,
  flushSyncQueue,
  getDeadLetterSize,
  getSyncQueueDiagnostics,
  getSyncQueueSize,
  reenfileirarDeadLetter,
} from "@/lib/sync-queue";
import { getModoSync } from "@/lib/sync-tuning";

type Status = "checking" | "ok" | "off" | "erro";

/**
 * Indicador de sincronização discreto: um ponto colorido no canto.
 * Toque/clique mostra o estado completo e a opção de re-sincronizar.
 */
export function SupabaseStatus() {
  const [status, setStatus] = useState<Status>("checking");
  const [open, setOpen] = useState(false);
  const [pendentes, setPendentes] = useState(0);
  const [lastError, setLastError] = useState<string | null>(null);
  const [dbDown, setDbDown] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [modoSync, setModoSync] = useState<"normal" | "lento" | "fora">("normal");
  const [dlqSize, setDlqSize] = useState(0);

  useEffect(() => {
    const refreshFila = () => {
      setPendentes(getSyncQueueSize());
      const diagnostics = getSyncQueueDiagnostics();
      const erro = diagnostics.find((x) => x.lastError)?.lastError ?? null;
      setLastError(erro);
    };
    refreshFila();
    setModoSync(getModoSync());
    setDlqSize(getDeadLetterSize());
    const id1 = setInterval(() => {
      refreshFila();
      setModoSync(getModoSync());
      setDlqSize(getDeadLetterSize());
    }, 5_000);
    return () => clearInterval(id1);
  }, []);

  useEffect(() => {
    if (!useSupabase || !supabase) {
      setStatus("off");
      return;
    }
    let cancelled = false;
    const ping = async () => {
      try {
        const health = await fetch("/api/health", { cache: "no-store" }).then((r) => r.json()).catch(() => null);
        if (cancelled) return;
        const servidorDb = health?.db === true;
        setDbDown(health?.db === false);
        if (servidorDb) {
          setStatus(getSyncQueueSize() > 0 ? "erro" : "ok");
          return;
        }
        const { error } = await supabase!.from("config").select("id").limit(1).maybeSingle();
        if (cancelled) return;
        setDbDown(!!error);
        setStatus(error ? "erro" : getSyncQueueSize() > 0 ? "erro" : "ok");
      } catch {
        if (!cancelled) {
          setDbDown(true);
          setStatus("erro");
        }
      }
    };
    ping();
    const id = setInterval(ping, 30_000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  const handleSync = async () => {
    if (syncing) return;
    setSyncing(true);
    setStatus("checking");
    try {
      let restantes = getSyncQueueSize();
      let rodadas = 0;
      while (restantes > 0 && rodadas < 30) {
        // `force: true` ignora o circuit breaker — o usuário clicou em
        // "Sincronizar agora", então tentamos enviar mesmo se o sistema
        // tinha desacelerado por falhas anteriores.
        await flushSyncQueue({ force: true });
        restantes = getSyncQueueSize();
        rodadas++;
        if (restantes > 0) await new Promise((r) => setTimeout(r, 500));
      }
      await initFromSupabase();
      setPendentes(getSyncQueueSize());
      const diagnostics = getSyncQueueDiagnostics();
      const erro = diagnostics.find((x) => x.lastError)?.lastError ?? null;
      setLastError(erro);
      setStatus(getSyncQueueSize() > 0 ? "erro" : "ok");
    } catch {
      setStatus("erro");
    } finally {
      setSyncing(false);
    }
  };

  const hasPendencias = pendentes > 0;
  const cor = hasPendencias ? "bg-amber-500" : status === "ok" ? "bg-emerald-500" : status === "erro" ? "bg-rose-500" : status === "off" ? "bg-slate-400" : "bg-amber-400";
  const label =
    hasPendencias ? "Pendência de envio" :
    status === "ok" ? "Sincronizado" :
    status === "erro" ? "Sem conexão com o servidor" :
    status === "off" ? "Modo local" : "Verificando...";

  const copiarErros = async () => {
    const diagnostics = getSyncQueueDiagnostics();
    const texto = JSON.stringify(diagnostics, null, 2);
    try {
      await navigator.clipboard?.writeText(texto);
      alert("Diagnóstico copiado.");
    } catch {
      alert(texto.slice(0, 1200));
    }
  };

  /** Força atualização do app: limpa caches do Service Worker e recarrega.
   *  Útil quando o cliente está em uma versão antiga do bundle (especialmente
   *  PWA instalado, onde o cache pode persistir). */
  const atualizarApp = async () => {
    if (!confirm("Atualizar o app?\nA página vai recarregar — seus dados locais (jogos não enviados) ficam salvos.")) {
      return;
    }
    try {
      if ("caches" in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      }
      if ("serviceWorker" in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map((r) => r.unregister()));
      }
    } catch {
      /* ignore */
    }
    location.reload();
  };

  return (
    <div className="pointer-events-none fixed bottom-[5.5rem] right-3 z-[9999] flex items-end gap-2 sm:bottom-3">
      {open && (
        <div className="pointer-events-auto w-56 rounded-xl border border-gray-200 bg-white p-3 text-xs shadow-2xl dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100">
          <div className="mb-1 flex items-center gap-2 font-medium">
            <span className={`inline-block h-2 w-2 rounded-full ${cor}`} />
            {label}
          </div>
          {pendentes > 0 && (
            <p className="mb-2 rounded bg-amber-50 p-1.5 text-[11px] text-amber-800 dark:bg-amber-900/30 dark:text-amber-200">
              {pendentes} item(ns) aguardando envio
            </p>
          )}
          {dbDown && (
            <p className="mb-2 rounded bg-rose-50 p-1.5 text-[10px] text-rose-800 dark:bg-rose-900/30 dark:text-rose-200">
              O banco Supabase está indisponível (timeout/503). Os jogos continuam salvos neste aparelho.
              Faça backup abaixo e reinicie o projeto em supabase.com → Settings.
            </p>
          )}
          {lastError && (
            <p className="mb-2 max-h-20 overflow-auto rounded bg-rose-50 p-1.5 text-[10px] text-rose-800 dark:bg-rose-900/30 dark:text-rose-200">
              Erro: {lastError}
            </p>
          )}
          <button
            onClick={handleSync}
            disabled={syncing}
            className="w-full rounded bg-emerald-500 px-2 py-1.5 text-[11px] font-medium text-white hover:bg-emerald-600 disabled:opacity-60"
          >
            {syncing ? "Enviando… (não feche)" : "Sincronizar agora"}
          </button>
          {modoSync !== "normal" && (
            <p className="mt-1 text-[10px] text-slate-500 dark:text-slate-400">
              {modoSync === "fora"
                ? "Banco com instabilidade — sistema desacelerou e tenta novamente automaticamente."
                : "Envio em ritmo reduzido — sistema voltará ao normal sozinho."}
            </p>
          )}
          {dlqSize > 0 && (
            <div className="mt-2 rounded border border-rose-300 bg-rose-50 p-2 text-[10px] text-rose-900 dark:border-rose-700 dark:bg-rose-900/30 dark:text-rose-100">
              <p className="font-semibold">{dlqSize} ite(ns) com falha persistente</p>
              <p className="mt-0.5">Essas operações falharam após várias tentativas. Use os botões abaixo para investigar ou reenviar.</p>
              <button
                type="button"
                onClick={() => {
                  const n = reenfileirarDeadLetter();
                  setDlqSize(getDeadLetterSize());
                  setPendentes(getSyncQueueSize());
                  alert(`${n} ite(ns) reenfileirados.`);
                }}
                className="mt-1.5 w-full rounded bg-rose-600 px-2 py-1 text-[11px] font-medium text-white hover:bg-rose-700"
              >
                Reenviar ({dlqSize})
              </button>
            </div>
          )}
          {(pendentes > 0 || dlqSize > 0) && (
            <>
              <button
                type="button"
                onClick={() => downloadSyncBackup()}
                className="mt-2 w-full rounded border border-amber-300 bg-amber-50 px-2 py-1.5 text-[11px] font-medium text-amber-900 hover:bg-amber-100 dark:border-amber-700 dark:bg-amber-900/30 dark:text-amber-100"
              >
                Baixar backup (fila + jogos locais)
              </button>
              <button
                type="button"
                onClick={copiarErros}
                className="mt-2 w-full rounded border border-gray-200 bg-white px-2 py-1.5 text-[11px] font-medium text-gray-700 hover:bg-gray-50 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100"
              >
                Copiar erro técnico
              </button>
            </>
          )}
          <button
            type="button"
            onClick={atualizarApp}
            className="mt-2 w-full rounded border border-blue-300 bg-blue-50 px-2 py-1.5 text-[11px] font-medium text-blue-800 hover:bg-blue-100 dark:border-blue-700 dark:bg-blue-900/30 dark:text-blue-100"
            title="Limpa o cache do app e recarrega para baixar a versão mais recente."
          >
            Atualizar app (limpar cache)
          </button>
        </div>
      )}
      <button
        type="button"
        aria-label={label}
        title={`${label}${pendentes > 0 ? ` · ${pendentes} pendente(s)` : ""}`}
        onClick={() => setOpen((v) => !v)}
        className="pointer-events-auto relative flex h-9 w-9 items-center justify-center rounded-full border border-gray-200 bg-white shadow-md transition-transform hover:scale-110 dark:border-slate-700 dark:bg-slate-800"
      >
        <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${cor}`}>
          {status === "ok" && pendentes === 0 && (
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60"></span>
          )}
        </span>
        {pendentes > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[9px] font-bold text-white">
            {pendentes > 99 ? "99+" : pendentes}
          </span>
        )}
      </button>
    </div>
  );
}
