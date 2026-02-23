"use client";

import { useState, useEffect } from "react";
import { supabase, useSupabase } from "@/lib/supabase";
import { initFromSupabase } from "@/lib/sync-supabase";

export function SupabaseStatus() {
  const [status, setStatus] = useState<"checking" | "ok" | "off" | "erro">("checking");

  useEffect(() => {
    if (!useSupabase || !supabase) {
      setStatus("off");
      return;
    }
    void (async () => {
      try {
        const { error } = await supabase.from("cambistas").select("id").limit(1).maybeSingle();
        if (error) {
          setStatus("erro");
          return;
        }
        setStatus("ok");
      } catch {
        setStatus("erro");
      }
    })();
  }, []);

  const handleSync = async () => {
    setStatus("checking");
    try {
      await initFromSupabase();
      setStatus("ok");
      window.location.reload();
    } catch {
      setStatus("erro");
    }
  };

  const baseClass = "fixed bottom-4 right-4 z-[9999] rounded-lg px-4 py-2 text-sm font-medium text-white shadow-lg";

  if (status === "off") {
    return <div className={baseClass + " bg-gray-600"}>Supabase: desligado</div>;
  }

  if (status === "erro") {
    return (
      <div className={baseClass + " bg-red-600 flex items-center gap-2"}>
        <span>Supabase: erro</span>
        <button onClick={handleSync} className="underline">Sincronizar</button>
      </div>
    );
  }

  if (status === "ok") {
    return (
      <div className={baseClass + " bg-green-600 flex items-center gap-2"}>
        <span>Conectado</span>
        <button onClick={handleSync} className="underline">Sincronizar</button>
      </div>
    );
  }

  return <div className={baseClass + " bg-amber-500"}>Verificando...</div>;
}
