"use client";

/**
 * Tombstones (lápides): controla IDs apagados localmente para que NÃO ressuscitem
 * quando o Supabase ainda tem o registro antigo (caso clássico: deleto um cambista,
 * a fila offline-first ainda não chegou a remover no Supabase e o Realtime envia
 * um snapshot com o cambista, então `initFromSupabase` o reinsere localmente).
 *
 * Estratégia:
 *  - Toda operação de delete em store.ts grava uma tombstone (tabela + id).
 *  - `initFromSupabase` filtra a resposta do Supabase usando essas tombstones.
 *  - Quando a fila confirma o DELETE no Supabase, a tombstone é removida.
 */

const KEY = "premiacoes_tombstones";
const MAX = 1000;
/** TTL: tombstones expiram após 30 dias. Sem expiração, registros legitimamente
 *  recriados pelo admin (mesmo id, novo cadastro) seriam bloqueados para sempre.
 *  30 dias é tempo mais que suficiente para o DELETE confirmar entre
 *  dispositivos. Após isso, qualquer registro real prevalece. */
const TTL_MS = 30 * 24 * 60 * 60 * 1000;

export type TombstoneTable =
  | "gerentes"
  | "cambistas"
  | "extracoes"
  | "bilhetes"
  | "lancamentos"
  | "resultados";

interface Tombstone {
  table: TombstoneTable;
  id: string;
  ts: number;
}

function load(): Tombstone[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const all = JSON.parse(raw) as Tombstone[];
    // Filtra tombstones expiradas (mantém só as de até TTL_MS).
    const cutoff = Date.now() - TTL_MS;
    const validas = all.filter((t) => Number(t.ts ?? 0) > cutoff);
    if (validas.length !== all.length) {
      try {
        localStorage.setItem(KEY, JSON.stringify(validas.slice(-MAX)));
      } catch {
        /* ignore */
      }
    }
    return validas;
  } catch {
    return [];
  }
}

function save(list: Tombstone[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(KEY, JSON.stringify(list.slice(-MAX)));
  } catch {
    /* ignore */
  }
}

export function addTombstone(table: TombstoneTable, id: string): void {
  if (!id) return;
  const list = load();
  if (list.some((t) => t.table === table && t.id === String(id))) return;
  list.push({ table, id: String(id), ts: Date.now() });
  save(list);
}

export function removeTombstone(table: TombstoneTable, id: string): void {
  if (!id) return;
  const list = load();
  const filtered = list.filter((t) => !(t.table === table && t.id === String(id)));
  if (filtered.length !== list.length) save(filtered);
}

export function getTombstoneSet(table: TombstoneTable): Set<string> {
  return new Set(load().filter((t) => t.table === table).map((t) => t.id));
}

export function clearTombstones(table?: TombstoneTable): void {
  if (!table) {
    save([]);
    return;
  }
  save(load().filter((t) => t.table !== table));
}
