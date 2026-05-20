"use client";

import { useEffect, useState } from "react";

/**
 * Verifica periodicamente se o servidor tem uma versão diferente da que
 * foi carregada nesta janela. Se sim, mostra um banner discreto sugerindo
 * atualizar o app — o usuário NÃO é forçado, apenas avisado.
 *
 * O hash inicial vem da primeira chamada à API; chamadas seguintes comparam.
 * Sem build determinístico, isso muda toda vez que o servidor reinicia,
 * mas é um sinal suficiente de que houve deploy.
 */
export function UpdateChecker() {
  const [novaVersao, setNovaVersao] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    let cancelled = false;
    let inicial: string | null = null;

    const checar = async () => {
      try {
        const r = await fetch("/api/version", { cache: "no-store" });
        const j = (await r.json()) as { buildAt?: string };
        if (cancelled) return;
        if (!inicial) {
          inicial = j.buildAt ?? null;
          return;
        }
        if (j.buildAt && inicial && j.buildAt !== inicial) {
          setNovaVersao(true);
        }
      } catch {
        /* ignore */
      }
    };

    checar();
    const id = setInterval(checar, 60_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  if (!novaVersao) return null;

  const atualizar = async () => {
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
    <div className="pointer-events-auto fixed bottom-3 left-3 z-[10000] max-w-xs rounded-lg border border-blue-300 bg-blue-50 p-3 text-xs text-blue-900 shadow-lg dark:border-blue-700 dark:bg-blue-900/40 dark:text-blue-100">
      <p className="mb-2 font-medium">Nova versão disponível</p>
      <p className="mb-2 text-[11px] opacity-90">
        O administrador atualizou o sistema. Recarregue para receber as melhorias.
      </p>
      <button
        type="button"
        onClick={atualizar}
        className="w-full rounded bg-blue-600 px-2 py-1.5 text-[11px] font-medium text-white hover:bg-blue-700"
      >
        Atualizar agora
      </button>
      <button
        type="button"
        onClick={() => setNovaVersao(false)}
        className="mt-1 w-full rounded border border-blue-300 bg-transparent px-2 py-1 text-[10px] text-blue-700 hover:bg-blue-100 dark:border-blue-700 dark:text-blue-200"
      >
        Mais tarde
      </button>
    </div>
  );
}
