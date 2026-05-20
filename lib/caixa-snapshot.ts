/**
 * Snapshot/restauração do caixa dos cambistas.
 *
 * Server-only: usa service_role do Supabase. Não importar de client components.
 */
import { promises as fs } from "fs";
import path from "path";
import crypto from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

export const FAILSAFE_DIR = "/var/backups/premiacoes/caixa";

export interface CambistaCaixa {
  id: string;
  login: string;
  codigo: string;
  saldo: number;
  entrada: number;
  saidas: number;
  comissao: number;
  lancamentos: number;
  ultima_prestacao: string | null;
}

export interface CaixaSnapshotRow {
  id: string;
  codigo: string | null;
  criado_em: string;
  motivo: string | null;
  total_cambistas: number;
  total_caixa: number;
  hash: string | null;
  snapshot: CambistaCaixa[];
}

const COLS = [
  "id",
  "login",
  "codigo",
  "saldo",
  "entrada",
  "saidas",
  "comissao",
  "lancamentos",
  "ultima_prestacao",
].join(",");

function calcTotal(cs: CambistaCaixa[]): number {
  return cs.reduce(
    (s, c) =>
      s +
      Number(c.entrada || 0) -
      Number(c.saidas || 0) -
      Number(c.comissao || 0) +
      Number(c.lancamentos || 0),
    0,
  );
}

function calcHash(cs: CambistaCaixa[]): string {
  const norm = cs
    .map((c) => `${c.id}|${c.entrada}|${c.saidas}|${c.comissao}|${c.lancamentos}|${c.saldo}|${c.ultima_prestacao ?? ""}`)
    .sort()
    .join("\n");
  return crypto.createHash("sha256").update(norm).digest("hex");
}

async function gravarFailsafe(snapshot: CaixaSnapshotRow): Promise<void> {
  try {
    const dt = new Date(snapshot.criado_em);
    const dia = dt.toISOString().slice(0, 10);
    const dir = path.join(FAILSAFE_DIR, snapshot.codigo || "default", dia);
    await fs.mkdir(dir, { recursive: true });
    const file = path.join(dir, `${snapshot.id}.json`);
    await fs.writeFile(file, JSON.stringify(snapshot, null, 2), "utf8");
  } catch (e) {
    // Failsafe não pode derrubar o snapshot principal.
    console.warn("[caixa-snapshot] failsafe falhou:", (e as Error).message);
  }
}

/**
 * Cria um snapshot do caixa de TODOS os cambistas (ou de uma banca/codigo).
 * Aplica retenção tiered ao terminar.
 */
export async function criarSnapshotCaixa(
  sb: SupabaseClient,
  opts: { codigo?: string | null; motivo?: string } = {},
): Promise<{
  ok: boolean;
  id?: string;
  total_cambistas?: number;
  total_caixa?: number;
  erro?: string;
}> {
  const codigo = (opts.codigo ?? "").trim() || null;
  const motivo = (opts.motivo ?? "auto").slice(0, 100);

  let q = sb.from("cambistas").select(COLS).neq("status", "excluido");
  if (codigo) q = q.eq("codigo", codigo);
  const resp = (await q) as { data: unknown; error: { message: string } | null };
  if (resp.error) return { ok: false, erro: resp.error.message };

  const cambistas = ((Array.isArray(resp.data) ? resp.data : []) as Record<string, unknown>[]).map((r) => ({
    id: String(r.id ?? ""),
    login: String(r.login ?? ""),
    codigo: String(r.codigo ?? "default"),
    saldo: Number(r.saldo ?? 0),
    entrada: Number(r.entrada ?? 0),
    saidas: Number(r.saidas ?? 0),
    comissao: Number(r.comissao ?? 0),
    lancamentos: Number(r.lancamentos ?? 0),
    ultima_prestacao: r.ultima_prestacao ? String(r.ultima_prestacao) : null,
  })) as CambistaCaixa[];

  if (cambistas.length === 0) {
    return { ok: false, erro: "Nenhum cambista encontrado para snapshot" };
  }

  // ID não-previsível (impede enumeração).
  const id = `snap-${crypto.randomUUID()}`;
  const criadoEm = new Date().toISOString();
  const total_cambistas = cambistas.length;
  const total_caixa = Math.round(calcTotal(cambistas) * 100) / 100;
  const hash = calcHash(cambistas);

  const row: CaixaSnapshotRow = {
    id,
    codigo,
    criado_em: criadoEm,
    motivo,
    total_cambistas,
    total_caixa,
    hash,
    snapshot: cambistas,
  };

  const respIns = (await sb.from("caixa_snapshots").insert(row as never)) as {
    error: { message: string } | null;
  };
  if (respIns.error) return { ok: false, erro: respIns.error.message };

  await gravarFailsafe(row);

  // Retenção tiered (não bloqueia retorno em caso de erro)
  void aplicarRetencao(sb, codigo).catch(() => {});

  return { ok: true, id, total_cambistas, total_caixa };
}

/**
 * Política tiered:
 *  - últimas 6h:  mantém todos
 *  - 6h–24h:      mantém 1 por hora
 *  - 24h–7d:      mantém 1 por dia
 *  - 7d–30d:      mantém 1 por semana ISO
 *  - >30d:        apaga
 *
 * Implementação: agrupa por bucket e mantém o snapshot MAIS RECENTE de
 * cada bucket. Apaga o resto.
 */
export async function aplicarRetencao(
  sb: SupabaseClient,
  codigo: string | null,
): Promise<{ apagados: number }> {
  let q = sb
    .from("caixa_snapshots")
    .select("id, criado_em")
    .order("criado_em", { ascending: false })
    .limit(1000);
  if (codigo === null) q = q.is("codigo", null);
  else q = q.eq("codigo", codigo);
  const resp = (await q) as { data: unknown; error: { message: string } | null };
  if (resp.error || !Array.isArray(resp.data)) return { apagados: 0 };
  const data = resp.data as Array<{ id: string; criado_em: string }>;

  const agora = Date.now();
  const H = 60 * 60 * 1000;
  const D = 24 * H;

  const manter = new Set<string>();
  const buckets = new Map<string, { id: string; t: number }>();

  for (const row of data) {
    const t = new Date(row.criado_em).getTime();
    const idade = agora - t;
    let bucket: string;
    if (idade < 0 || idade < 6 * H) {
      // últimas 6h: mantém TODOS
      manter.add(row.id);
      continue;
    }
    if (idade > 30 * D) {
      // > 30 dias: apaga
      continue;
    }
    if (idade < 24 * H) {
      bucket = `h:${Math.floor(t / H)}`;
    } else if (idade < 7 * D) {
      bucket = `d:${Math.floor(t / D)}`;
    } else {
      bucket = `w:${Math.floor(t / (7 * D))}`;
    }
    const atual = buckets.get(bucket);
    if (!atual || t > atual.t) buckets.set(bucket, { id: row.id, t });
  }
  for (const b of buckets.values()) manter.add(b.id);

  const apagar = data
    .map((r) => r.id)
    .filter((id) => !manter.has(id));
  if (apagar.length === 0) return { apagados: 0 };

  // Apaga em chunks de 100
  let apagados = 0;
  for (let i = 0; i < apagar.length; i += 100) {
    const slice = apagar.slice(i, i + 100);
    const resp = (await sb.from("caixa_snapshots").delete().in("id", slice)) as {
      error: { message: string } | null;
    };
    if (!resp.error) apagados += slice.length;
  }
  return { apagados };
}

export async function listarSnapshots(
  sb: SupabaseClient,
  opts: { codigo?: string | null; limit?: number } = {},
): Promise<
  Array<{
    id: string;
    codigo: string | null;
    criado_em: string;
    motivo: string | null;
    total_cambistas: number;
    total_caixa: number;
    hash: string | null;
  }>
> {
  const codigo = (opts.codigo ?? "").trim() || null;
  const limit = Math.max(1, Math.min(200, opts.limit ?? 60));
  let q = sb
    .from("caixa_snapshots")
    .select("id, codigo, criado_em, motivo, total_cambistas, total_caixa, hash")
    .order("criado_em", { ascending: false })
    .limit(limit);
  if (codigo) q = q.eq("codigo", codigo);
  const resp = (await q) as { data: unknown; error: { message: string } | null };
  if (resp.error || !Array.isArray(resp.data)) return [];
  return resp.data as Array<{
    id: string;
    codigo: string | null;
    criado_em: string;
    motivo: string | null;
    total_cambistas: number;
    total_caixa: number;
    hash: string | null;
  }>;
}

export async function obterSnapshot(
  sb: SupabaseClient,
  id: string,
): Promise<CaixaSnapshotRow | null> {
  const resp = (await sb
    .from("caixa_snapshots")
    .select("*")
    .eq("id", id)
    .maybeSingle()) as { data: unknown; error: { message: string } | null };
  if (resp.error || !resp.data) return null;
  return resp.data as CaixaSnapshotRow;
}

/**
 * Restaura o caixa dos cambistas selecionados a partir de um snapshot.
 * Restaura SOMENTE os campos de caixa (entrada/saidas/comissao/lancamentos/
 * saldo/ultima_prestacao). NÃO mexe em bilhetes ou lançamentos.
 *
 * Não recria cambistas que foram apagados depois do snapshot.
 *
 * Cria um snapshot ANTES de restaurar (motivo="pre-restore") como ponto
 * de retorno se algo der errado.
 */
export async function restaurarCaixa(
  sb: SupabaseClient,
  opts: {
    snapshotId: string;
    cambistaIds: string[];
    codigo?: string | null;
    motivoBackupPre?: string;
  },
): Promise<{
  ok: boolean;
  restaurados: number;
  ignorados: string[];
  erros: Array<{ id: string; erro: string }>;
  snapshotPreRestoreId?: string;
  erro?: string;
}> {
  const snap = await obterSnapshot(sb, opts.snapshotId);
  if (!snap) return { ok: false, restaurados: 0, ignorados: [], erros: [], erro: "Snapshot não encontrado" };

  // 1) Cria snapshot de pré-restore para conseguir desfazer.
  const pre = await criarSnapshotCaixa(sb, {
    codigo: snap.codigo ?? opts.codigo ?? null,
    motivo: opts.motivoBackupPre || "pre-restore",
  });

  const escolhidos = new Set(opts.cambistaIds.map(String));
  const linhas = snap.snapshot.filter((c) => escolhidos.has(String(c.id)));
  if (linhas.length === 0) {
    return {
      ok: false,
      restaurados: 0,
      ignorados: [],
      erros: [],
      snapshotPreRestoreId: pre.id,
      erro: "Nenhum cambista válido para restaurar",
    };
  }

  // 2) Confere quais cambistas ainda existem (não foram apagados depois).
  const ids = linhas.map((c) => c.id);
  const respEx = (await sb
    .from("cambistas")
    .select("id, status")
    .in("id", ids)) as { data: unknown };
  const existentes = Array.isArray(respEx.data)
    ? (respEx.data as Array<{ id?: unknown; status?: unknown }>)
    : [];
  const idsAtivos = new Set(
    existentes
      .filter((r) => String(r.status ?? "") !== "excluido")
      .map((r) => String(r.id)),
  );

  const ignorados: string[] = [];
  const erros: Array<{ id: string; erro: string }> = [];
  let restaurados = 0;

  // 3) Aplica um por um (mais seguro com a auto-regulação da fila).
  for (const c of linhas) {
    if (!idsAtivos.has(String(c.id))) {
      ignorados.push(String(c.id));
      continue;
    }
    const respUp = (await sb
      .from("cambistas")
      .update({
        entrada: c.entrada,
        saidas: c.saidas,
        comissao: c.comissao,
        lancamentos: c.lancamentos,
        saldo: c.saldo,
        ultima_prestacao: c.ultima_prestacao,
      })
      .eq("id", c.id)) as { error: { message: string } | null };
    if (respUp.error) erros.push({ id: c.id, erro: respUp.error.message });
    else restaurados++;
  }

  return {
    ok: erros.length === 0,
    restaurados,
    ignorados,
    erros,
    snapshotPreRestoreId: pre.id,
  };
}
