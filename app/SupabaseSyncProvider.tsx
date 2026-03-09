"use client";

import { useEffect, useState } from "react";
import { useSupabase, initFromSupabase } from "@/lib/sync-supabase";
import { reconferirBilhetesComResultados, recalculateComissaoFromBilhetes } from "@/lib/store";
import { SYNC_COMPLETE_EVENT } from "@/lib/use-config-refresh";

const SYNC_TIMEOUT_MS = 8000;

async function syncFromSupabase() {
  await initFromSupabase();
  reconferirBilhetesComResultados();
  recalculateComissaoFromBilhetes();
  window.dispatchEvent(new CustomEvent(SYNC_COMPLETE_EVENT));
}

export function SupabaseSyncProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(!useSupabase);

  useEffect(() => {
    if (!useSupabase) {
      setReady(true);
      return;
    }
    let cancelled = false;
    const timeout = setTimeout(() => {
      if (!cancelled) setReady(true);
    }, SYNC_TIMEOUT_MS);
    syncFromSupabase()
      .then(() => { if (!cancelled) setReady(true); })
      .catch(() => { if (!cancelled) setReady(true); })
      .finally(() => clearTimeout(timeout));
    return () => { cancelled = true; clearTimeout(timeout); };
  }, []);

  useEffect(() => {
    if (!useSupabase) return;
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        syncFromSupabase().catch(() => {});
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, []);

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="text-center">
          <p className="text-gray-600">Sincronizando dados...</p>
          <p className="mt-2 text-sm text-gray-400">Se demorar, a página abrirá em instantes.</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
