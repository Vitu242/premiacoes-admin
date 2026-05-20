import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase-server";
import { autorizarChefe } from "@/lib/auth-server";
import { restaurarCaixa } from "@/lib/caixa-snapshot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 90;

/**
 * POST /api/caixa/restore
 * body: {
 *   snapshotId: string,
 *   cambistaIds: string[],
 *   confirmacao: "RESTAURAR",  // anti-acidente
 *   senhaLotobrasil: string,
 *   codigo?: string             // banca (opcional, audit)
 * }
 *
 * Restaura SOMENTE os campos de caixa dos cambistas selecionados.
 * Antes da restauração, cria um snapshot "pre-restore" para desfazer
 * caso necessário.
 */
export async function POST(req: Request) {
  let body: {
    snapshotId?: string;
    cambistaIds?: string[];
    confirmacao?: string;
    senhaLotobrasil?: string;
    codigo?: string;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, erro: "Body inválido" }, { status: 400 });
  }

  if (body.confirmacao !== "RESTAURAR") {
    return NextResponse.json(
      { ok: false, erro: "Confirmação obrigatória: digite RESTAURAR no campo de confirmação." },
      { status: 400 },
    );
  }

  const auth = await autorizarChefe(body.senhaLotobrasil ?? "", req);
  if (!auth.ok) return NextResponse.json({ ok: false, erro: auth.erro }, { status: 401 });

  const snapshotId = String(body.snapshotId ?? "");
  const cambistaIds = Array.isArray(body.cambistaIds)
    ? body.cambistaIds.map(String).filter(Boolean)
    : [];
  if (!snapshotId || cambistaIds.length === 0) {
    return NextResponse.json(
      { ok: false, erro: "Informe snapshotId e ao menos um cambistaIds." },
      { status: 400 },
    );
  }

  const sb = getServerSupabase();
  if (!sb) return NextResponse.json({ ok: false, erro: "DB indisponível" }, { status: 503 });

  const r = await restaurarCaixa(sb, {
    snapshotId,
    cambistaIds,
    codigo: body.codigo ?? null,
    motivoBackupPre: `pre-restore por chefe`,
  });

  if (!r.ok && r.erro) {
    return NextResponse.json(r, { status: 500 });
  }

  return NextResponse.json(r);
}
