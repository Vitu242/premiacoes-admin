"use client";

import { supabase, useSupabase } from "./supabase";
import { addTombstone, type TombstoneTable } from "./tombstones";

/**
 * Tombstones REMOTAS: lista de IDs apagados, armazenada na tabela `config`
 * do Supabase (id="tombstones") como JSON.
 *
 * Por que existir, além das tombstones locais (lib/tombstones.ts):
 *   - A tombstone local vive só no localStorage do dispositivo que apagou.
 *   - Outro dispositivo NÃO sabe que o registro foi apagado e, em qualquer
 *     `save*` que envie a lista inteira (upsert), ressuscita o registro.
 *   - Com a tombstone remota, todos os dispositivos baixam a "lista de IDs
 *     proibidos" e filtram antes de upsertar, e também adotam tombstones
 *     locais correspondentes.
 *
 * Formato:
 *   {
 *     "cambistas":   { "<id>": <ts_ms> },
 *     "gerentes":    { "<id>": <ts_ms> },
 *     "lancamentos": { "<id>": <ts_ms> },
 *     ...
 *   }
 */

const CONFIG_ID = "tombstones";

type Mapa = Record<string, number>;
type RemoteShape = Partial<Record<TombstoneTable, Mapa>>;

let cache: RemoteShape = {};

function normalizar(raw: unknown): RemoteShape {
  if (!raw || typeof raw !== "object") return {};
  const out: RemoteShape = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!v || typeof v !== "object") continue;
    const m: Mapa = {};
    for (const [id, ts] of Object.entries(v as Record<string, unknown>)) {
      if (id) m[String(id)] = Number(ts ?? Date.now());
    }
    out[k as TombstoneTable] = m;
  }
  return out;
}

/** Atualiza o cache local com o conteúdo vindo do Supabase. */
export function setCacheTombstonesRemotas(raw: unknown): void {
  cache = normalizar(raw);
  // Propaga para as tombstones locais para reforçar o filtro em loadX().
  for (const [tabela, mapa] of Object.entries(cache)) {
    if (!mapa) continue;
    for (const id of Object.keys(mapa)) {
      try {
        addTombstone(tabela as TombstoneTable, id);
      } catch {
        /* ignore */
      }
    }
  }
}

/** Conjunto de IDs proibidos (apagados remotamente) para uma tabela. */
export function getTombstoneSetRemoto(table: TombstoneTable): Set<string> {
  const mapa = cache[table];
  return mapa ? new Set(Object.keys(mapa)) : new Set();
}

/** Adiciona um id às tombstones remotas e persiste no Supabase. */
export async function addRemoteTombstone(table: TombstoneTable, id: string): Promise<void> {
  if (!id) return;
  // Garante presença local imediata mesmo se a rede falhar.
  try {
    addTombstone(table, id);
  } catch {
    /* ignore */
  }
  if (!useSupabase || !supabase) return;
  if (!cache[table]) cache[table] = {};
  cache[table]![String(id)] = Date.now();
  // Upsert na tabela config (id="tombstones"). Importante: a tabela `config`
  // tem um único id por chave, então sobrescrevemos a entrada toda.
  try {
    await supabase
      .from("config")
      .upsert([{ id: CONFIG_ID, value: cache as unknown as Record<string, unknown> }], {
        onConflict: "id",
      });
  } catch {
    /* ignore */
  }
}
