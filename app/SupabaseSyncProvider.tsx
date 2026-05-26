"use client";

import { useEffect, useRef } from "react";
import { useSupabase, initFromSupabase } from "@/lib/sync-supabase";
import { SYNC_COMPLETE_EVENT } from "@/lib/use-config-refresh";
import { startRealtime } from "@/lib/realtime";
import { startSyncQueueLoop, flushSyncQueue } from "@/lib/sync-queue";
import { startServerTimeSync } from "@/lib/server-time";
import { carregarAlertasDoSupabase } from "@/lib/alertas";

const REALTIME_DEBOUNCE_MS = 800;

async function syncFromSupabase(): Promise<void> {
  // Tenta esvaziar a fila offline-first ANTES de ler o canônico do servidor.
  // Sem isso, um registro criado/atualizado offline poderia ser removido por
  // engano quando o init considerar o Supabase como fonte da verdade.
  try { await flushSyncQueue(); } catch {}
  await initFromSupabase();
  // Sincroniza alertas (pendências que o admin precisa ver) com o servidor.
  try { await carregarAlertasDoSupabase(); } catch {}
  // Não recalcula caixa/bilhetes automaticamente no F5 — isso fazia prestação de contas
  // e cancelamentos "voltarem". Use os botões em Prestar Contas / Bilhetes se precisar.
  try { window.dispatchEvent(new CustomEvent(SYNC_COMPLETE_EVENT)); } catch {}
}

export function SupabaseSyncProvider({ children }: { children: React.ReactNode }) {
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // Sincroniza o relógio com o servidor o mais cedo possível. Validações
    // de horário (ex.: encerramento de extração) passam a usar nowServer().
    startServerTimeSync();
    // Inicia o loop de reenvio offline → online sempre, mesmo sem realtime ativo
    startSyncQueueLoop();
    if (!useSupabase) return;
    // CRÍTICO: NÃO bloqueia a renderização esperando o sync. O app é
    // offline-first — todos os dados que o cliente precisa estão no
    // localStorage. O sync acontece em background e os componentes que
    // ouvem `SYNC_COMPLETE_EVENT` revalidam quando termina.
    //
    // Antes, esse provider segurava o app inteiro atrás de "Sincronizando
    // dados..." por até 8 segundos — péssimo em rede ruim.
    syncFromSupabase().catch(() => {});
  }, []);

  // Re-sync ao voltar para a aba
  useEffect(() => {
    if (!useSupabase) return;
    const onVis = () => {
      if (document.visibilityState === "visible") {
        syncFromSupabase().catch(() => {});
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  // Realtime: debouce para evitar re-sync excessivo
  useEffect(() => {
    if (!useSupabase) return;
    const stop = startRealtime(() => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        syncFromSupabase().catch(() => {});
      }, REALTIME_DEBOUNCE_MS);
    });
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      stop?.();
    };
  }, []);

  // Sync entre abas: quando outra aba do mesmo usuário altera o storage
  // (venda, prestação, cancelamento), dispara o evento de sync nesta aba
  // para que componentes que ouvem SYNC_COMPLETE_EVENT revalidem.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const ALVOS = new Set([
      "premiacoes_cambistas",
      "premiacoes_bilhetes",
      "premiacoes_lancamentos",
      "premiacoes_resultados",
      "premiacoes_extracoes",
      "premiacoes_gerentes",
      "premiacoes_config",
    ]);
    const onStorage = (e: StorageEvent) => {
      if (!e.key || !ALVOS.has(e.key)) return;
      try {
        window.dispatchEvent(new CustomEvent(SYNC_COMPLETE_EVENT));
      } catch {
        /* ignore */
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  return <>{children}</>;
}
