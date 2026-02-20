"use client";

import { useState, useEffect } from "react";
import { supabase, useSupabase } from "@/lib/supabase";
import { initFromSupabase } from "@/lib/sync-supabase";

export function SupabaseStatus() {
  const [status, setStatus] = useState<"checking" | "ok" | "off" | "erro">("checking");
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    if (!useSupabase || !supabase) {
      setStatus("off");
      return;
    }
    supabase
      .from("cambistas")
      .select("*", { count: "exact", head: true })
      .then(({ count: c, error }) => {
        if (error) {
          setStatus("erro");
          return;
        }
        setStatus("ok");
        setCount(c ?? 0);
      })
      .catch(() => setStatus("erro"));
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

  if (status === "off") {
    return (
      <div className="fixed bottom-2 right-2 rounded bg-gray-500 px-3 py-1.5 text-xs text-white shadow">
        Supabase: desligado (sem .env)
      </div>
    );
  }

  if (status === "erro") {
    return (
      <div className="fixed bottom-2 right-2 flex items-center gap-2 rounded bg-red-600 px-3 py-1.5 text-xs text-white shadow">
        <span>Supabase: erro de conexão</span>
        <button onClick={handleSync} className="underline">
          Tentar sincronizar
        </button>
      </div>
    );
  }

  if (status === "ok") {
    return (
      <div className="fixed bottom-2 right-2 flex items-center gap-2 rounded bg-green-600 px-3 py-1.5 text-xs text-white shadow">
        <span>Supabase: conectado{count !== null ? ` (${count} cambistas)` : ""}</span>
        <button onClick={handleSync} className="underline">
          Sincronizar
        </button>
      </div>
    );
  }

  return (
    <div className="fixed bottom-2 right-2 rounded bg-amber-500 px-3 py-1.5 text-xs text-white shadow">
      Supabase: verificando...
    </div>
  );
}
