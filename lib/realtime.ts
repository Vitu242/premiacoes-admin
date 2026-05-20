"use client";

import { supabase, useSupabase } from "./supabase";
import { SYNC_COMPLETE_EVENT } from "./use-config-refresh";

/**
 * Inicia as subscriptions Realtime do Supabase para bilhetes/resultados/cambistas.
 * Quando algo muda no servidor, dispara o evento SYNC_COMPLETE_EVENT no window
 * (mesmo usado pelo SupabaseSyncProvider) para que as telas refaçam o estado.
 */
let started = false;

export function startRealtime(onChange?: () => void) {
  if (!useSupabase || !supabase || started || typeof window === "undefined") return;
  started = true;

  const trigger = () => {
    try { window.dispatchEvent(new CustomEvent(SYNC_COMPLETE_EVENT)); } catch {}
    onChange?.();
  };

  const ch = supabase
    .channel("premiacoes-realtime")
    .on("postgres_changes", { event: "*", schema: "public", table: "bilhetes" }, trigger)
    .on("postgres_changes", { event: "*", schema: "public", table: "resultados" }, trigger)
    .on("postgres_changes", { event: "*", schema: "public", table: "cambistas" }, trigger)
    .on("postgres_changes", { event: "*", schema: "public", table: "config" }, trigger)
    .subscribe();

  return () => {
    try { supabase?.removeChannel(ch); } catch {}
    started = false;
  };
}
