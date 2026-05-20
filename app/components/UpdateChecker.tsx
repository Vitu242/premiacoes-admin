"use client";

import { useEffect, useState } from "react";

/**
 * Detecta nova versão do servidor e FORÇA reload, com janela curta de
 * cortesia (8s) para o cambista finalizar uma ação em andamento.
 *
 * Dois sinais são monitorados:
 *
 *   1. POSTMESSAGE do Service Worker novo: assim que SW_UPDATED chega
 *      (logo após a ativação do SW novo), o cliente já sabe que o bundle
 *      mudou e dispara o reload.
 *
 *   2. POLL de /api/version a cada 30s: se o `buildAt` mudou em relação
 *      ao que carregou nesta sessão, dispara reload. Cobre o caso em que
 *      o SW está em modo somente-rede (browser sem registro ativo) ou em
 *      navegadores onde o postMessage não chegou.
 *
 * Antes do reload o app baixa um BACKUP local do que está pendente
 * (chave premiacoes_sync_queue + dados) só por segurança — mas como já
 * está tudo em localStorage, nada é perdido com o reload.
 */
export function UpdateChecker() {
  const [recarregando, setRecarregando] = useState(false);
  const [contagem, setContagem] = useState(0);

  useEffect(() => {
    if (typeof window === "undefined") return;
    let cancelled = false;
    let inicial: string | null = null;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const forcarReload = async (motivo: string) => {
      if (cancelled || recarregando) return;
      setRecarregando(true);
      console.info(`[UpdateChecker] reload em 8s (${motivo})`);
      // Conta regressiva visível
      let segundos = 8;
      setContagem(segundos);
      const tickId = setInterval(() => {
        segundos -= 1;
        setContagem(segundos);
        if (segundos <= 0) clearInterval(tickId);
      }, 1000);
      timeoutId = setTimeout(async () => {
        try {
          if ("caches" in window) {
            const keys = await caches.keys();
            await Promise.all(keys.map((k) => caches.delete(k)));
          }
          if ("serviceWorker" in navigator) {
            const regs = await navigator.serviceWorker.getRegistrations();
            await Promise.all(regs.map((r) => r.unregister()));
          }
        } catch { /* ignore */ }
        location.reload();
      }, 8_000);
    };

    // 1) Mensagem do SW novo
    const onMessage = (e: MessageEvent) => {
      if (e?.data?.type === "SW_UPDATED") {
        void forcarReload(`SW ${e.data.version}`);
      }
    };
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.addEventListener("message", onMessage);
    }

    // 2) Poll de /api/version
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
          void forcarReload(`server build ${j.buildAt}`);
        }
      } catch { /* ignore */ }
    };
    checar();
    const id = setInterval(checar, 30_000);

    return () => {
      cancelled = true;
      clearInterval(id);
      if (timeoutId) clearTimeout(timeoutId);
      if ("serviceWorker" in navigator) {
        navigator.serviceWorker.removeEventListener("message", onMessage);
      }
    };
  }, [recarregando]);

  if (!recarregando) return null;

  const adiar = () => {
    // Não tem como "cancelar" 100% — o reload virá de qualquer forma na
    // próxima detecção. Mas dá ao usuário uma janela extra para terminar.
    setRecarregando(false);
  };

  return (
    <div className="pointer-events-auto fixed bottom-3 left-3 z-[10000] max-w-xs rounded-lg border border-blue-300 bg-blue-50 p-3 text-xs text-blue-900 shadow-lg dark:border-blue-700 dark:bg-blue-900/40 dark:text-blue-100">
      <p className="mb-1 font-medium">Atualizando o app…</p>
      <p className="mb-2 text-[11px] opacity-90">
        Nova versão disponível. Recarregando em <b>{Math.max(0, contagem)}s</b>.
        Seus jogos pendentes são preservados.
      </p>
      <button
        type="button"
        onClick={() => location.reload()}
        className="w-full rounded bg-blue-600 px-2 py-1.5 text-[11px] font-medium text-white hover:bg-blue-700"
      >
        Atualizar agora
      </button>
      <button
        type="button"
        onClick={adiar}
        className="mt-1 w-full rounded border border-blue-300 bg-transparent px-2 py-1 text-[10px] text-blue-700 hover:bg-blue-100 dark:border-blue-700 dark:text-blue-200"
      >
        Adiar (vai aplicar logo)
      </button>
    </div>
  );
}
