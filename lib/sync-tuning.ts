"use client";

/**
 * Auto-regulação da sincronização.
 *
 * Mede saúde do banco em tempo real e ajusta chunks/delays automaticamente.
 *
 *  - "normal":  banco saudável → lotes grandes, delays pequenos.
 *  - "lento":   detectado timeout/sharelock/connection pool → cai para
 *               valores conservadores até estabilizar.
 *  - "fora":    3+ falhas seguidas → circuit breaker, espera mais antes
 *               de tentar de novo.
 *
 * Ao plano "Pro" do Supabase com compute >=Small, "normal" é seguro.
 * No NANO, qualquer dor faz o sistema cair para "lento" automaticamente.
 */

type Modo = "normal" | "lento" | "fora";

interface Tuning {
  bilheteChunk: number;
  upsertChunk: number;
  flushDelayMs: number;
  flushMaxPerRun: number;
  serverBatch: number;
  retryIntervalMs: number;
}

const TUNING_NORMAL: Tuning = {
  bilheteChunk: 8,
  upsertChunk: 25,
  flushDelayMs: 80,
  flushMaxPerRun: 60,
  serverBatch: 12,
  retryIntervalMs: 15_000,
};

const TUNING_LENTO: Tuning = {
  bilheteChunk: 2,
  upsertChunk: 8,
  flushDelayMs: 300,
  flushMaxPerRun: 20,
  serverBatch: 4,
  retryIntervalMs: 45_000,
};

const TUNING_FORA: Tuning = {
  bilheteChunk: 1,
  upsertChunk: 3,
  flushDelayMs: 600,
  flushMaxPerRun: 8,
  serverBatch: 2,
  retryIntervalMs: 90_000,
};

interface Estado {
  modo: Modo;
  falhasSeguidas: number;
  ultimaFalha: number;
  ultimoSucesso: number;
}

const estado: Estado = {
  modo: "normal",
  falhasSeguidas: 0,
  ultimaFalha: 0,
  ultimoSucesso: Date.now(),
};

export function getTuning(): Tuning {
  if (estado.modo === "fora") return TUNING_FORA;
  if (estado.modo === "lento") return TUNING_LENTO;
  return TUNING_NORMAL;
}

export function getModoSync(): Modo {
  return estado.modo;
}

export function isCircuitOpen(): boolean {
  if (estado.modo !== "fora") return false;
  // Após 60s da última falha, libera tentativa única (half-open)
  return Date.now() - estado.ultimaFalha < 60_000;
}

/**
 * Detecta erros de sobrecarga real do Postgres (statement timeout,
 * connection pool, sharelock). NÃO inclui erros de validação/RLS — esses
 * são erros do payload, não do banco.
 */
export function isErroSobrecarga(msg: string): boolean {
  const m = (msg ?? "").toLowerCase();
  return (
    m.includes("upstream connect") ||
    m.includes("connection timeout") ||
    m.includes("fetch failed") ||
    m.includes("failed to fetch") ||
    m.includes("networkerror") ||
    m.includes("statement timeout") ||
    m.includes("sharelock") ||
    m.includes("connection pool") ||
    m.includes("503") ||
    m.includes("502") ||
    m.includes("504")
  );
}

export function registrarSucesso(): void {
  estado.ultimoSucesso = Date.now();
  estado.falhasSeguidas = 0;
  if (estado.modo === "fora") {
    estado.modo = "lento";
    return;
  }
  if (estado.modo === "lento") {
    // Volta para normal após 30s sem falha
    if (Date.now() - estado.ultimaFalha > 30_000) {
      estado.modo = "normal";
    }
  }
}

export function registrarFalha(msg: string): void {
  if (!isErroSobrecarga(msg)) return;
  estado.ultimaFalha = Date.now();
  estado.falhasSeguidas += 1;
  if (estado.falhasSeguidas >= 3) {
    estado.modo = "fora";
    return;
  }
  if (estado.modo === "normal") {
    estado.modo = "lento";
  }
}

/** Limpa estado (para testes / reset manual). */
export function resetTuning(): void {
  estado.modo = "normal";
  estado.falhasSeguidas = 0;
  estado.ultimaFalha = 0;
  estado.ultimoSucesso = Date.now();
}
