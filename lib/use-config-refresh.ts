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
 */
export function useConfigRefresh(onConfig: (cfg: ReturnType<typeof getConfig>) => void) {
  const ref = useRef(onConfig);
  ref.current = onConfig;
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
 * Executa callback quando o usuário retorna à aba
 * ou quando a sincronização automática termina.
 */
export function useVisibilityRefresh(callback: () => void) {
  const ref = useRef(callback);
  ref.current = callback;
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
