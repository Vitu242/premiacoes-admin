/**
 * Cliente Supabase para uso em Route Handlers e Server Components.
 * Diferente de lib/supabase.ts (client-side), este NÃO tem "use client".
 *
 * Se SUPABASE_SERVICE_ROLE_KEY estiver definida, é usada para escritas
 * privilegiadas (bypass de RLS) — necessário para validar login, criar
 * bilhete server-side, etc. Caso contrário, cai na anon key.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

let _client: SupabaseClient | null = null;

export function getServerSupabase(): SupabaseClient | null {
  if (_client) return _client;
  if (!url) return null;
  const key = serviceKey || anonKey;
  if (!key) return null;
  _client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return _client;
}

export const hasServiceRole = !!serviceKey;

/**
 * Adiciona um id à entrada `config[id="tombstones"]` no Supabase, marcando-o
 * como "globalmente apagado" para que TODOS os dispositivos parem de
 * upsertar/exibir esse registro mesmo quando o `save*` enviar a lista inteira
 * (que pode incluir o id se o cache local de outro dispositivo ainda o tiver).
 *
 * Formato em config:
 *   { id: "tombstones", value: { "<tabela>": { "<id>": <ts_ms>, ... }, ... } }
 */
export async function addRemoteTombstoneServer(
  table: "gerentes" | "cambistas" | "extracoes" | "bilhetes" | "lancamentos" | "resultados",
  id: string,
): Promise<void> {
  const sb = getServerSupabase();
  if (!sb || !id) return;
  try {
    const { data } = await sb.from("config").select("value").eq("id", "tombstones").maybeSingle();
    const valueRaw = (data as { value?: unknown } | null)?.value;
    const value: Record<string, Record<string, number>> =
      valueRaw && typeof valueRaw === "object" ? (valueRaw as Record<string, Record<string, number>>) : {};
    if (!value[table]) value[table] = {};
    value[table][String(id)] = Date.now();
    await sb
      .from("config")
      .upsert([{ id: "tombstones", value }], { onConflict: "id" });
  } catch {
    /* ignore: a tombstone local + tentativa de DELETE ainda funcionam */
  }
}
