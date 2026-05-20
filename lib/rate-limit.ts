/**
 * Rate-limit simples em memória por chave (ex.: IP+login).
 * Bom o suficiente para um único nó com PM2 sem cluster mode.
 *
 * Estratégia: token bucket por chave com janela deslizante.
 */

interface Bucket {
  count: number;
  resetAt: number;
  lockedUntil: number;
}

const buckets = new Map<string, Bucket>();

export interface RateLimitConfig {
  /** Tentativas permitidas dentro da janela */
  max: number;
  /** Janela em ms */
  windowMs: number;
  /** Tempo de lock após exceder o máximo (ms) */
  lockMs: number;
}

export interface RateLimitResult {
  ok: boolean;
  remaining: number;
  retryAfterMs: number;
}

export function rateLimit(
  key: string,
  cfg: RateLimitConfig
): RateLimitResult {
  const now = Date.now();
  const b = buckets.get(key);

  if (b && b.lockedUntil > now) {
    return { ok: false, remaining: 0, retryAfterMs: b.lockedUntil - now };
  }

  if (!b || b.resetAt <= now) {
    buckets.set(key, {
      count: 1,
      resetAt: now + cfg.windowMs,
      lockedUntil: 0,
    });
    return { ok: true, remaining: cfg.max - 1, retryAfterMs: 0 };
  }

  if (b.count + 1 > cfg.max) {
    b.lockedUntil = now + cfg.lockMs;
    buckets.set(key, b);
    return { ok: false, remaining: 0, retryAfterMs: cfg.lockMs };
  }

  b.count += 1;
  buckets.set(key, b);
  return {
    ok: true,
    remaining: Math.max(0, cfg.max - b.count),
    retryAfterMs: 0,
  };
}

/** Limpa lock manualmente em caso de login bem-sucedido */
export function clearRateLimit(key: string): void {
  buckets.delete(key);
}

/** Periodicamente limpa entradas antigas (chamado a cada hit, simples). */
function _gc() {
  const now = Date.now();
  for (const [k, b] of buckets.entries()) {
    if (b.resetAt < now && b.lockedUntil < now) buckets.delete(k);
  }
}

setInterval(_gc, 5 * 60 * 1000).unref?.();
