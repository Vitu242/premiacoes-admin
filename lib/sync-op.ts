import type { SupabaseClient } from "@supabase/supabase-js";

export type SyncOp =
  | {
      kind: "upsert";
      table: string;
      payload: Record<string, unknown> | Record<string, unknown>[];
      onConflict?: string;
    }
  | {
      kind: "update";
      table: string;
      match: Record<string, unknown>;
      payload: Record<string, unknown>;
    }
  | {
      kind: "delete";
      table: string;
      match: Record<string, unknown>;
      id?: string;
    };

export const ALLOWED_SYNC_TABLES = new Set([
  "gerentes",
  "cambistas",
  "extracoes",
  "bilhetes",
  "lancamentos",
  "resultados",
  "config",
]);

export function isAllowedSyncTable(table: string): boolean {
  return ALLOWED_SYNC_TABLES.has(table);
}

export type SyncOpResult = { deleted?: boolean };

export async function executeSyncOp(sb: SupabaseClient, op: SyncOp): Promise<SyncOpResult> {
  if (!isAllowedSyncTable(op.table)) {
    throw new Error(`Tabela não permitida: ${op.table}`);
  }
  if (op.kind === "upsert") {
    const { error } = await sb
      .from(op.table)
      .upsert(op.payload as never, op.onConflict ? { onConflict: op.onConflict } : undefined);
    if (error) throw new Error(error.message);
    return {};
  }
  if (op.kind === "update") {
    let q = sb.from(op.table).update(op.payload as never);
    for (const [k, v] of Object.entries(op.match)) {
      q = (q as unknown as { eq: (k: string, v: unknown) => typeof q }).eq(k, v);
    }
    const { error } = await q;
    if (error) throw new Error(error.message);
    return {};
  }
  if (op.kind === "delete") {
    let q = sb.from(op.table).delete().select("id");
    for (const [k, v] of Object.entries(op.match)) {
      q = (q as unknown as { eq: (k: string, v: unknown) => typeof q }).eq(k, v);
    }
    const { error, data } = (await q) as unknown as {
      error: { message: string } | null;
      data: unknown[] | null;
    };
    if (error) throw new Error(error.message);
    return { deleted: Array.isArray(data) && data.length > 0 };
  }
  return {};
}
