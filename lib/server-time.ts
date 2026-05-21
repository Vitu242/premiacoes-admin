"use client";

/**
 * Sincroniza o relógio do cliente com o servidor.
 *
 * Por que existe: validações sensíveis a horário (ex.: encerramento de
 * extração) NÃO podem confiar no `Date.now()` do navegador — o cliente
 * pode ter o relógio do celular adiantado/atrasado em horas. A fonte
 * canônica é o servidor.
 *
 * Estratégia:
 *   1) Logo no boot do app, busca `/api/time` e calcula `offset = serverMs - localMs`.
 *   2) Toda vez que o código precisar saber "que horas são", usa `nowServer()`
 *      em vez de `Date.now()`. Aplica o offset.
 *   3) Re-sincroniza a cada 10 minutos (cobre clock drift e DST).
 *   4) Re-sincroniza ao voltar pra aba (visibilitychange) e ao reconectar (online).
 *
 * Falhas: se o servidor não responder, o offset fica em 0 (= mesmo
 * comportamento de antes). Não derruba o app — o servidor sempre tem a
 * última palavra na validação final (defesa em profundidade nas APIs
 * /api/bilhetes e /api/sync/push).
 */

let offsetMs = 0;
let inicializado = false;

const SYNC_INTERVAL_MS = 10 * 60 * 1000;

async function fetchServerNow(): Promise<number | null> {
  try {
    const t0 = Date.now();
    const r = await fetch("/api/time", { cache: "no-store" });
    const t1 = Date.now();
    if (!r.ok) return null;
    const data = (await r.json()) as { nowMs?: number };
    if (typeof data.nowMs !== "number") return null;
    // Half-RTT correction: estima quanto tempo a resposta demorou na rede
    // e ajusta. Sem isso, em redes lentas, ficaríamos sempre atrasados em
    // relação ao servidor.
    const halfRtt = Math.floor((t1 - t0) / 2);
    return data.nowMs + halfRtt;
  } catch {
    return null;
  }
}

async function sincronizar(): Promise<void> {
  const serverMs = await fetchServerNow();
  if (serverMs == null) return;
  offsetMs = serverMs - Date.now();
}

/** Hora atual em ms epoch, ajustada para o relógio do servidor. */
export function nowServerMs(): number {
  return Date.now() + offsetMs;
}

/** Date com a hora do servidor. Use isto em validações de encerra/horário. */
export function nowServer(): Date {
  return new Date(nowServerMs());
}

/** Diferença em ms entre relógio do servidor e o local. Útil para debug. */
export function getClockOffsetMs(): number {
  return offsetMs;
}

/** Inicializa a sincronização. Idempotente — pode ser chamado várias vezes. */
export function startServerTimeSync(): void {
  if (typeof window === "undefined") return;
  if (inicializado) return;
  inicializado = true;

  void sincronizar();

  setInterval(() => {
    void sincronizar();
  }, SYNC_INTERVAL_MS);

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      void sincronizar();
    }
  });

  window.addEventListener("online", () => {
    void sincronizar();
  });
}
