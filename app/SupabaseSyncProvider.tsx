"use client";

import { useEffect, useState } from "react";
import { useSupabase, initFromSupabase } from "@/lib/sync-supabase";

export function SupabaseSyncProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(!useSupabase);

  useEffect(() => {
    if (!useSupabase) {
      setReady(true);
      return;
    }
    initFromSupabase()
      .then(() => setReady(true))
      .catch(() => setReady(true)); // em erro, segue com localStorage local
  }, []);

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="text-center">
          <p className="text-gray-600">Sincronizando dados...</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
