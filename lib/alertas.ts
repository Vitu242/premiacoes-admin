"use client";

/**
 * Sistema de alertas para o admin.
 *
 * Registra eventos importantes que precisam de atenção humana:
 *  - bilhete que estava "pago" virou "perdedor" automaticamente
 *    (resultado da extração foi atualizado depois)
 *  - 1º prêmio de um resultado salvo foi sobrescrito
 *  - inconsistências de caixa, etc.
 *
 * Persistência: armazenado localmente em `localStorage` E sincronizado
 * com Supabase via `config[id="alertas_caixa"]` para que TODOS os
 * dispositivos do admin vejam os mesmos alertas. Resolução é manual
 * (admin clica em "Marcar como resolvido" depois de tomar providência).
 */

import { supabase, useSupabase } from "./supabase";

const KEY = "premiacoes_alertas_caixa";
/** Mantém os 200 alertas mais recentes; suficiente pra histórico operacional. */
const MAX_ALERTAS = 200;

export type TipoAlerta =
  | "bilhete_pago_para_perdedor"
  | "resultado_corrigido"
  | "outro";

export interface AlertaCaixa {
  id: string;
  tipo: TipoAlerta;
  titulo: string;
  detalhes: string;
  cambistaId?: string;
  cambistaNome?: string;
  bilheteId?: string;
  bilheteCodigo?: string;
  extracaoNome?: string;
  data?: string;
  valor?: number;
  criadoEm: string;
  resolvido?: boolean;
  resolvidoEm?: string | null;
}

interface AlertaCacheEntry {
  ts: number;
  data: AlertaCaixa[];
}

let cache: AlertaCacheEntry | null = null;

function read(): AlertaCaixa[] {
  if (typeof window === "undefined") return [];
  // Cache de 1s pra evitar parse a cada chamada do hook React.
  if (cache && Date.now() - cache.ts < 1000) return cache.data;
  try {
    const raw = localStorage.getItem(KEY);
    const arr = raw ? (JSON.parse(raw) as AlertaCaixa[]) : [];
    cache = { ts: Date.now(), data: arr };
    return arr;
  } catch {
    return [];
  }
}

function save(lista: AlertaCaixa[]): void {
  if (typeof window === "undefined") return;
  const ord = [...lista]
    .sort((a, b) => (a.criadoEm < b.criadoEm ? 1 : -1))
    .slice(0, MAX_ALERTAS);
  try {
    localStorage.setItem(KEY, JSON.stringify(ord));
    cache = { ts: Date.now(), data: ord };
  } catch {
    /* sem espaço — não quebra o app */
  }
  // Sincroniza com Supabase em background (config[id="alertas_caixa"]).
  if (useSupabase && supabase) {
    void supabase
      .from("config")
      .upsert({ id: "alertas_caixa", value: ord }, { onConflict: "id" })
      .then(() => undefined);
  }
  // Avisa quem está ouvindo nesta aba (sino, página de alertas).
  try {
    window.dispatchEvent(new CustomEvent("premiacoes_alertas_changed"));
  } catch {
    /* ignore */
  }
}

/** Registra um alerta novo. Idempotente para o mesmo bilheteId+tipo no
 *  mesmo dia: se já existe um aberto, não cria duplicata. */
export function registrarAlerta(
  a: Omit<AlertaCaixa, "id" | "criadoEm" | "resolvido">,
): AlertaCaixa | null {
  const lista = read();
  // Dedup: mesmo bilhete + mesmo tipo + ainda não resolvido = ignora.
  if (a.bilheteId) {
    const dup = lista.find(
      (x) =>
        !x.resolvido &&
        x.tipo === a.tipo &&
        x.bilheteId === a.bilheteId,
    );
    if (dup) return dup;
  }
  const novo: AlertaCaixa = {
    ...a,
    id: `alert-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    criadoEm: new Date().toISOString(),
    resolvido: false,
  };
  save([novo, ...lista]);
  return novo;
}

export function getAlertas(): AlertaCaixa[] {
  return read();
}

export function getAlertasPendentes(): AlertaCaixa[] {
  return read().filter((x) => !x.resolvido);
}

export function contarAlertasPendentes(): number {
  return getAlertasPendentes().length;
}

export function marcarComoResolvido(id: string): void {
  const lista = read().map((x) =>
    x.id === id
      ? { ...x, resolvido: true, resolvidoEm: new Date().toISOString() }
      : x,
  );
  save(lista);
}

export function marcarTodosResolvidos(): void {
  const agora = new Date().toISOString();
  const lista = read().map((x) =>
    x.resolvido ? x : { ...x, resolvido: true, resolvidoEm: agora },
  );
  save(lista);
}

/** Carrega alertas do Supabase (chamado pelo SyncProvider no boot). */
export async function carregarAlertasDoSupabase(): Promise<void> {
  if (typeof window === "undefined") return;
  if (!useSupabase || !supabase) return;
  try {
    const { data } = await supabase
      .from("config")
      .select("value")
      .eq("id", "alertas_caixa")
      .maybeSingle();
    const remoto = (data?.value as AlertaCaixa[] | undefined) ?? [];
    if (!Array.isArray(remoto)) return;
    const local = read();
    const porId = new Map<string, AlertaCaixa>();
    for (const a of remoto) porId.set(a.id, a);
    for (const a of local) {
      const ex = porId.get(a.id);
      // Resolve conflitos: resolvido vence pendente; mais recente criadoEm vence.
      if (!ex) {
        porId.set(a.id, a);
      } else if (a.resolvido && !ex.resolvido) {
        porId.set(a.id, a);
      } else if (!a.resolvido && !ex.resolvido && a.criadoEm > ex.criadoEm) {
        porId.set(a.id, a);
      }
    }
    const merged = [...porId.values()].sort((a, b) =>
      a.criadoEm < b.criadoEm ? 1 : -1,
    );
    try {
      localStorage.setItem(KEY, JSON.stringify(merged.slice(0, MAX_ALERTAS)));
      cache = { ts: Date.now(), data: merged };
      window.dispatchEvent(new CustomEvent("premiacoes_alertas_changed"));
    } catch {
      /* ignore */
    }
  } catch {
    /* ignore */
  }
}
