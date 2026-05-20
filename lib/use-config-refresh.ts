"use client";

import { useEffect, useRef } from "react";
import { getConfig } from "./store";

export const SYNC_COMPLETE_EVENT = "premiacoes:sync-complete";

const runOnVisible = (fn: () => void) => {
  if (document.visibilityState === "visible") fn();
};

/**
 * Reaplica as configurações do painel quando o usuário retorna à aba
 * ou quando a sincronização automática termina.
 *
 * Usa uma ref atualizada via efeito (sem mutação durante o render) para que o
 * callback mais recente seja sempre executado pelos listeners.
 */
export function useConfigRefresh(onConfig: (cfg: ReturnType<typeof getConfig>) => void) {
  const ref = useRef(onConfig);

  useEffect(() => {
    ref.current = onConfig;
  }, [onConfig]);

  useEffect(() => {
    const refresh = () => ref.current(getConfig());
    const handleVisibility = () => runOnVisible(refresh);
    const handleSync = () => refresh();
    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener(SYNC_COMPLETE_EVENT, handleSync);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener(SYNC_COMPLETE_EVENT, handleSync);
    };
  }, []);
}

/**
 * Executa um callback quando o usuário retorna à aba ou quando a
 * sincronização automática (`SYNC_COMPLETE_EVENT`) é disparada.
 */
export function useVisibilityRefresh(callback: () => void) {
  const ref = useRef(callback);

  useEffect(() => {
    ref.current = callback;
  }, [callback]);

  useEffect(() => {
    const refresh = () => ref.current();
    const handleVisibility = () => runOnVisible(refresh);
    const handleSync = () => refresh();
    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener(SYNC_COMPLETE_EVENT, handleSync);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener(SYNC_COMPLETE_EVENT, handleSync);
    };
  }, []);
}
