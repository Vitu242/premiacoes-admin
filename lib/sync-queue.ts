"use client";

/**
 * Fila offline-first.
 * - Toda escrita que precisa sair para o servidor passa por aqui.
 * - Persiste no localStorage; tenta enviar imediatamente.
 * - Em caso de falha (offline, 5xx, fetch failed), guarda e re-tenta:
 *      • ao detectar reconexão (window.online)
 *      • a cada 30s enquanto houver itens
 *      • ao voltar para a aba (visibilitychange)
 *
 * Usado para refletir bilhetes do cambista no painel admin assim que a
 * conectividade voltar — mesmo que o cambista esteja em rede ruim na hora.
 */

import { supabase, useSupabase } from "./supabase";
import { executeSyncOp, type SyncOp } from "./sync-op";
import {
  getTuning,
  isCircuitOpen,
  isErroSobrecarga,
  registrarFalha,
  registrarSucesso,
} from "./sync-tuning";

export type { SyncOp };

const Q_KEY = "premiacoes_sync_queue";
const DLQ_KEY = "premiacoes_sync_dead_letter";
const STORE_KEYS = [
  "premiacoes_gerentes",
  "premiacoes_cambistas",
  "premiacoes_extracoes",
  "premiacoes_bilhetes",
  "premiacoes_lancamentos",
  "premiacoes_resultados",
  "premiacoes_config",
] as const;
const MAX_RETRIES = 50;
const RETRY_INTERVAL_MIN = 10_000;

function isUpstreamTimeout(msg: string): boolean {
  return isErroSobrecarga(msg);
}

interface QueueItem {
  id: string;
  op: SyncOp;
  tries: number;
  enqueuedAt: number;
  lastError?: string;
}

function loadQueue(): QueueItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(Q_KEY);
    return raw ? (JSON.parse(raw) as QueueItem[]) : [];
  } catch {
    return [];
  }
}

/** Limite máximo de itens na fila ativa. Excedentes vão pra dead-letter
 *  para o admin investigar — NUNCA descartar sem aviso. */
const QUEUE_MAX = 500;

function saveQueue(q: QueueItem[]) {
  if (typeof window === "undefined") return;
  try {
    if (q.length > QUEUE_MAX) {
      // Move o excesso para a DLQ (em vez de truncar silenciosamente).
      const ativos = q.slice(0, QUEUE_MAX);
      const excesso = q.slice(QUEUE_MAX);
      pushDeadLetter(excesso);
      localStorage.setItem(Q_KEY, JSON.stringify(ativos));
      return;
    }
    localStorage.setItem(Q_KEY, JSON.stringify(q));
  } catch {
    /* ignore */
  }
}

/** Itens que esgotaram MAX_RETRIES vão para o "dead letter" — preservados
 *  no localStorage para o admin baixar e investigar. NUNCA descartados. */
function pushDeadLetter(items: QueueItem[]): void {
  if (typeof window === "undefined" || items.length === 0) return;
  try {
    const raw = localStorage.getItem(DLQ_KEY);
    const atual = raw ? (JSON.parse(raw) as QueueItem[]) : [];
    const merged = [...atual, ...items].slice(-1000);
    localStorage.setItem(DLQ_KEY, JSON.stringify(merged));
  } catch {
    /* sem espaço — não derruba a fila ativa */
  }
}

export function getDeadLetterSize(): number {
  if (typeof window === "undefined") return 0;
  try {
    const raw = localStorage.getItem(DLQ_KEY);
    return raw ? (JSON.parse(raw) as QueueItem[]).length : 0;
  } catch {
    return 0;
  }
}

export function getDeadLetterItems(): QueueItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(DLQ_KEY);
    return raw ? (JSON.parse(raw) as QueueItem[]) : [];
  } catch {
    return [];
  }
}

/** Move itens da DLQ de volta para a fila ativa (para retentar manualmente). */
export function reenfileirarDeadLetter(): number {
  if (typeof window === "undefined") return 0;
  const dlq = getDeadLetterItems();
  if (!dlq.length) return 0;
  const fila = loadQueue();
  const novaFila = [...fila, ...dlq.map((x) => ({ ...x, tries: 0, lastError: undefined }))];
  saveQueue(novaFila);
  try {
    localStorage.removeItem(DLQ_KEY);
  } catch {}
  return dlq.length;
}

function chunkSizeForTable(table: string): number {
  const t = getTuning();
  return table === "bilhetes" ? t.bilheteChunk : t.upsertChunk;
}

/**
 * Deduplica a fila por (tabela, id) sempre mantendo a versão MAIS RECENTE.
 * Garante que itens antigos (de antes de uma alteração nova) não
 * "ressuscitem" o estado obsoleto no Supabase quando processarem.
 *
 * Regras:
 *  - Para upserts de qualquer tabela, fica só a última versão por id.
 *  - Para deletes, ele descarta upserts pendentes do mesmo id (já apagado)
 *    e mantém somente o delete mais recente.
 *  - Updates por match.id também invalidam upserts antigos do mesmo id.
 *  - Se um upsert vem DEPOIS de um delete (re-cadastro), os dois sobrevivem
 *    em ordem.
 */
function compactQueue(): void {
  const q = loadQueue();
  if (!q.length) return;

  type Slot = { kind: "upsert" | "update" | "delete"; pos: number; row?: Record<string, unknown>; item: QueueItem };
  // Para cada (tabela, id), guardamos só o último estado relevante.
  const ultimaPorId = new Map<string, Slot>();
  const semId: QueueItem[] = [];

  q.forEach((item, pos) => {
    const op = item.op;
    if (op.kind === "upsert") {
      if (!Array.isArray(op.payload)) {
        semId.push(item);
        return;
      }
      // Cada linha do payload vira um slot individual — assim fica fácil
      // dividir em sub-itens depois e deduplicar por id.
      for (const row of op.payload) {
        const id = String((row as { id?: unknown } | null | undefined)?.id ?? "");
        if (!id) {
          semId.push({
            ...item,
            id: `${item.id}-noid-${pos}`,
            op: { ...op, payload: [row as Record<string, unknown>] },
          });
          continue;
        }
        const chave = `${op.table}:${id}`;
        ultimaPorId.set(chave, {
          kind: "upsert",
          pos,
          row: row as Record<string, unknown>,
          item,
        });
      }
      return;
    }
    if (op.kind === "update") {
      const id = String((op.match as { id?: unknown } | undefined)?.id ?? "");
      if (!id) {
        semId.push(item);
        return;
      }
      const chave = `${op.table}:${id}`;
      const anterior = ultimaPorId.get(chave);
      // Update sobre upsert recente: mescla os campos no upsert (mantém
      // como upsert por simplicidade — execução final fica idêntica).
      if (anterior?.kind === "upsert" && anterior.row) {
        ultimaPorId.set(chave, {
          kind: "upsert",
          pos,
          row: { ...anterior.row, ...op.payload, id },
          item,
        });
        return;
      }
      ultimaPorId.set(chave, { kind: "update", pos, item });
      return;
    }
    if (op.kind === "delete") {
      const id = String((op.match as { id?: unknown } | undefined)?.id ?? op.id ?? "");
      if (!id) {
        semId.push(item);
        return;
      }
      const chave = `${op.table}:${id}`;
      // Delete invalida qualquer upsert/update pendente do mesmo id.
      ultimaPorId.set(chave, { kind: "delete", pos, item });
      return;
    }
    semId.push(item);
  });

  // Reconstrói a fila preservando a ordem original (pelo `pos`).
  const out: QueueItem[] = [];
  const slotsOrdenados = [...ultimaPorId.values()].sort((a, b) => a.pos - b.pos);
  for (const slot of slotsOrdenados) {
    if (slot.kind === "upsert" && slot.row) {
      const op = slot.item.op as Extract<SyncOp, { kind: "upsert" }>;
      out.push({
        ...slot.item,
        id: `${op.table}:${String((slot.row as { id?: unknown }).id ?? "")}`,
        op: { kind: "upsert", table: op.table, payload: [slot.row], onConflict: op.onConflict ?? "id" },
        tries: slot.item.tries,
      });
    } else {
      out.push(slot.item);
    }
  }
  out.push(...semId);

  // Aplica chunk size por tabela para upserts (NANO: bilhetes = 1).
  const final: QueueItem[] = [];
  for (const item of out) {
    const op = item.op;
    if (op.kind !== "upsert" || !Array.isArray(op.payload)) {
      final.push(item);
      continue;
    }
    const chunk = chunkSizeForTable(op.table);
    if (op.payload.length > chunk) {
      for (let i = 0; i < op.payload.length; i += chunk) {
        final.push({
          ...item,
          id: `${item.id}-p${i}`,
          op: { ...op, payload: op.payload.slice(i, i + chunk) },
        });
      }
    } else {
      final.push(item);
    }
  }

  if (final.length !== q.length || final.some((x, i) => x.id !== q[i]?.id)) {
    saveQueue(final.slice(0, 500));
  }
}

function isDbOverload(msg: string): boolean {
  return isErroSobrecarga(msg);
}

/** Lê do localStorage as credenciais da sessão atual (admin ou cambista)
 *  e devolve o header X-Sync-Auth no formato esperado pelo servidor. */
function syncAuthHeader(): Record<string, string> {
  if (typeof window === "undefined") return {};
  try {
    const adminRaw = localStorage.getItem("premiacoes_admin");
    if (adminRaw) {
      const admin = JSON.parse(adminRaw) as { codigo?: string; senha?: string };
      if (admin.codigo && admin.senha) {
        const tok = btoa(`admin:${admin.codigo}:${admin.senha}`);
        return { "X-Sync-Auth": tok };
      }
    }
    const camRaw = localStorage.getItem("premiacoes_cliente");
    if (camRaw) {
      const cam = JSON.parse(camRaw) as { cambistaId?: string; senha?: string };
      if (cam.cambistaId && cam.senha) {
        const tok = btoa(`cambista:${cam.cambistaId}:${cam.senha}`);
        return { "X-Sync-Auth": tok };
      }
    }
  } catch {
    /* sem auth — servidor recusa */
  }
  return {};
}

async function executarViaServidor(op: SyncOp): Promise<void> {
  const res = await fetch("/api/sync/push", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...syncAuthHeader() },
    body: JSON.stringify({ ops: [op] }),
  });
  const data = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    results?: Array<{ ok: boolean; error?: string }>;
    erro?: string;
  };
  if (!res.ok) {
    throw new Error(data.erro || `Servidor ${res.status}`);
  }
  const r0 = data.results?.[0];
  if (!r0?.ok) throw new Error(r0?.error || "Falha no envio via servidor");
}

async function limparTombstoneSeDelete(op: SyncOp, removed: boolean | undefined): Promise<void> {
  if (op.kind !== "delete" || !op.id || !removed) return;
  try {
    const { removeTombstone } = await import("./tombstones");
    removeTombstone(op.table as never, op.id);
  } catch {
    /* ignore */
  }
}

/** Decide se a op deve passar pelo /api/sync/push (proxy server-side com
 *  service_role) em vez do caminho direto via cliente Supabase.
 *
 *  Com a auto-regulação (chunk=1 no NANO, chunk=8+ no Pro) o caminho direto
 *  resolve quase tudo. O servidor é usado APENAS para lotes muito grandes
 *  ou após falhas inline (fallback dentro de `executar`).
 */
function deveUsarServidor(op: SyncOp): boolean {
  if (op.kind !== "upsert") return false;
  const n = Array.isArray(op.payload) ? op.payload.length : 1;
  return n > 5; // bilhetes <=5 e demais <=5 vão direto
}

function isAuthError(msg: string): boolean {
  const m = (msg ?? "").toLowerCase();
  return (
    m.includes("auth obrigat") ||
    m.includes("n\u00e3o autorizado") ||
    m.includes("nao autorizado") ||
    m.includes("401") ||
    m.includes("credenciais inv\u00e1lidas")
  );
}

async function executar(op: SyncOp): Promise<void> {
  if (!useSupabase || !supabase) throw new Error("Supabase desligado");

  if (deveUsarServidor(op)) {
    try {
      await executarViaServidor(op);
      if (op.kind === "delete" && op.id) await limparTombstoneSeDelete(op, true);
      registrarSucesso();
      return;
    } catch (e) {
      const msg = (e as Error).message;
      // Sem sessão (logout/sessão expirada) o servidor recusa com 401, mas
      // o cliente AINDA pode tentar Supabase direto via anon key. Sem este
      // fallback, fila de cliente deslogado nunca esvazia.
      if (isAuthError(msg)) {
        try {
          const result = await executeSyncOp(supabase, op);
          await limparTombstoneSeDelete(op, result.deleted);
          registrarSucesso();
          return;
        } catch {
          /* fallback falhou — propaga erro original */
        }
      }
      registrarFalha(msg);
      throw e;
    }
  }

  try {
    const result = await executeSyncOp(supabase, op);
    await limparTombstoneSeDelete(op, result.deleted);
    registrarSucesso();
    return;
  } catch (e) {
    const msg = (e as Error).message;
    if (!isUpstreamTimeout(msg) && !isDbOverload(msg)) throw e;
    registrarFalha(msg);
  }

  try {
    await executarViaServidor(op);
    registrarSucesso();
  } catch (e) {
    const msg = (e as Error).message;
    // Mesmo fallback: se 401 no servidor, tenta direto.
    if (isAuthError(msg)) {
      try {
        await executeSyncOp(supabase, op);
        registrarSucesso();
        return;
      } catch {
        /* propaga erro original */
      }
    }
    registrarFalha(msg);
    throw e;
  }
}

// Mutex global de flush — impede execuções concorrentes que duplicariam
// envios e fariam saveQueue corrida (último a salvar perde itens).
let flushInFlight: Promise<{ ok: number; pendentes: number }> | null = null;

async function flush(): Promise<{ ok: number; pendentes: number }> {
  if (flushInFlight) return flushInFlight;
  flushInFlight = (async () => {
    try {
      return await flushUnlocked();
    } finally {
      flushInFlight = null;
    }
  })();
  return flushInFlight;
}

async function flushUnlocked(): Promise<{ ok: number; pendentes: number }> {
  if (typeof window === "undefined") return { ok: 0, pendentes: 0 };
  if (!useSupabase || !supabase) return { ok: 0, pendentes: loadQueue().length };
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return { ok: 0, pendentes: loadQueue().length };
  }
  // Circuit breaker: se há 3+ falhas seguidas recentes, espera ~60s antes
  // de tentar de novo (evita martelar o banco quando ele está degradado).
  if (isCircuitOpen()) {
    return { ok: 0, pendentes: loadQueue().length };
  }

  compactQueue();
  const q = loadQueue();
  if (!q.length) return { ok: 0, pendentes: 0 };

  const tuning = getTuning();
  const limite = q.length > tuning.flushMaxPerRun * 3 ? tuning.flushMaxPerRun : q.length;
  const lote = q.slice(0, limite);
  const sobra = q.slice(limite);

  let ok = 0;
  let lastWasOverload = false;
  const restantes: QueueItem[] = [];
  let i = 0;
  while (i < lote.length) {
    const item = lote[i]!;
    const proximos = lote.slice(i, i + tuning.serverBatch);
    const todosTimeout = proximos.every((x) => x.lastError && isUpstreamTimeout(x.lastError));
    if (todosTimeout && proximos.length > 1 && useSupabase) {
      try {
        const res = await fetch("/api/sync/push", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...syncAuthHeader() },
          body: JSON.stringify({ ops: proximos.map((x) => x.op) }),
        });
        const data = (await res.json().catch(() => ({}))) as {
          results?: Array<{ ok: boolean; error?: string }>;
          erro?: string;
        };
        if (!res.ok) throw new Error(data.erro || `Servidor ${res.status}`);
        const results = data.results ?? [];
        for (let j = 0; j < proximos.length; j++) {
          const it = proximos[j]!;
          const r = results[j];
          if (r?.ok) {
            ok++;
          } else {
            it.tries += 1;
            it.lastError = r?.error || "Falha no lote";
            if (it.tries < MAX_RETRIES) restantes.push(it);
            else pushDeadLetter([it]);
          }
        }
        i += proximos.length;
        continue;
      } catch (e) {
        const msg = (e as Error).message;
        // Se o servidor recusou por auth, tenta direto cada op (sem
        // sessão, fila do cliente deslogado ainda esvazia).
        if (isAuthError(msg) && supabase) {
          for (const it of proximos) {
            try {
              await executeSyncOp(supabase, it.op);
              ok++;
            } catch (e2) {
              it.tries += 1;
              it.lastError = (e2 as Error).message;
              if (it.tries < MAX_RETRIES) restantes.push(it);
              else pushDeadLetter([it]);
            }
          }
          i += proximos.length;
          continue;
        }
        for (const it of proximos) {
          it.tries += 1;
          it.lastError = msg;
          if (it.tries < MAX_RETRIES) restantes.push(it);
          else pushDeadLetter([it]);
        }
        i += proximos.length;
        continue;
      }
    }
    try {
      await executar(item.op);
      ok++;
      lastWasOverload = false;
    } catch (e) {
      item.tries += 1;
      item.lastError = (e as Error).message;
      lastWasOverload = isDbOverload(item.lastError);
      if (item.tries < MAX_RETRIES) {
        restantes.push(item);
      } else {
        // Esgotou tentativas — vai para dead letter, NÃO some silenciosamente.
        pushDeadLetter([item]);
      }
    }
    if (tuning.flushDelayMs > 0) await new Promise((r) => setTimeout(r, tuning.flushDelayMs));
    i++;
  }

  // Merge final: a fila pode ter recebido novos itens durante o processamento
  // (enqueue inline durante user actions). Mesclamos esses novos com os
  // restantes e o sobra (que ficou de fora do lote desta rodada).
  const filaAtual = loadQueue();
  const conhecidos = new Set([...restantes, ...sobra].map((x) => x.id));
  const novosDurante = filaAtual.filter((x) => !conhecidos.has(x.id));
  saveQueue([...restantes, ...sobra, ...novosDurante]);

  if (lastWasOverload && typeof window !== "undefined") {
    (window as unknown as { __premiacoes_sync_slow_until?: number }).__premiacoes_sync_slow_until =
      Date.now() + tuning.retryIntervalMs;
  }
  return { ok, pendentes: restantes.length };
}

/** Backup JSON da fila + dados locais (não apaga nada). */
export function downloadSyncBackup(): void {
  if (typeof window === "undefined") return;
  const payload: Record<string, unknown> = {
    exportedAt: new Date().toISOString(),
    queue: loadQueue(),
  };
  for (const k of STORE_KEYS) {
    try {
      const raw = localStorage.getItem(k);
      if (raw) payload[k] = JSON.parse(raw);
    } catch {
      payload[k] = localStorage.getItem(k);
    }
  }
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `premiacoes-backup-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}

export async function enqueue(op: SyncOp): Promise<{ inline: boolean; pendentes: number }> {
  // tenta executar imediatamente; se falhar, enfileira
  try {
    await executar(op);
    return { inline: true, pendentes: loadQueue().length };
  } catch (e) {
    const q = loadQueue();
    q.push({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      op,
      tries: 1,
      enqueuedAt: Date.now(),
      lastError: (e as Error).message,
    });
    saveQueue(q);
    // Deduplica imediatamente: garante que itens antigos do mesmo (tabela,id)
    // sejam descartados antes de chegar no Supabase, evitando que valores
    // obsoletos "ressuscitem" alterações recentes (cancelamento, prestação,
    // edição de cambista, ajuste de saldo, etc.).
    compactQueue();
    return { inline: false, pendentes: loadQueue().length };
  }
}

export function getSyncQueueSize(): number {
  return loadQueue().length;
}

export function getSyncQueueDiagnostics(): Array<{
  table: string;
  kind: SyncOp["kind"];
  tries: number;
  lastError?: string;
}> {
  return loadQueue().map((item) => ({
    table: item.op.table,
    kind: item.op.kind,
    tries: item.tries,
    lastError: item.lastError,
  }));
}

let started = false;
export function startSyncQueueLoop() {
  if (started || typeof window === "undefined") return;
  started = true;
  compactQueue();
  flush().catch(() => {});
  // Polling adaptativo: usa o intervalo do tuning atual, com mínimo de 10s.
  const tick = () => {
    const slowUntil = (window as unknown as { __premiacoes_sync_slow_until?: number })
      .__premiacoes_sync_slow_until;
    if (slowUntil && Date.now() < slowUntil) {
      schedule();
      return;
    }
    flush()
      .catch(() => {})
      .finally(schedule);
  };
  const schedule = () => {
    const intervalo = Math.max(RETRY_INTERVAL_MIN, getTuning().retryIntervalMs);
    setTimeout(tick, intervalo);
  };
  schedule();
  window.addEventListener("online", () => flush().catch(() => {}));
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") flush().catch(() => {});
  });
}

export { flush as flushSyncQueue };
