"use client";

import { useEffect, useState } from "react";
import { useSupabase, initFromSupabase } from "@/lib/sync-supabase";

const SYNC_TIMEOUT_MS = 8000;

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
    initFromSupabase()
      .then(() => { if (!cancelled) setReady(true); })
      .catch(() => { if (!cancelled) setReady(true); })
      .finally(() => clearTimeout(timeout));
    return () => { cancelled = true; clearTimeout(timeout); };
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
