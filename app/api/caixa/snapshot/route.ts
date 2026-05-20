import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase-server";
import { autorizarChefe, autorizarCronInterno } from "@/lib/auth-server";
import { criarSnapshotCaixa } from "@/lib/caixa-snapshot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/caixa/snapshot
 * Body opcional: { codigo?: string, motivo?: string, senhaLotobrasil?: string }
 *
 * Modos de autorização:
 *  - cron interno: header Authorization: Bearer <CAIXA_BACKUP_TOKEN>
 *  - admin: precisa da senha do Lotobrasil no body (operação sensível)
 *
 * Sem `codigo`: snapshota todos. Com `codigo`: snapshota só os daquela banca.
 */
export async function POST(req: Request) {
  let body: { codigo?: string; motivo?: string; senhaLotobrasil?: string } = {};
  try {
    body = (await req.clone().json()) as typeof body;
  } catch {
    /* sem body é OK para o cron */
  }

  const cronOk = autorizarCronInterno(req);
  if (!cronOk) {
    const auth = await autorizarChefe(body.senhaLotobrasil ?? "");
    if (!auth.ok) return NextResponse.json({ ok: false, erro: auth.erro }, { status: 401 });
  }

  const sb = getServerSupabase();
  if (!sb) return NextResponse.json({ ok: false, erro: "DB indisponível" }, { status: 503 });

  const codigo = (body.codigo ?? "").trim() || null;
  const motivo = (body.motivo ?? (cronOk ? "auto" : "manual")).slice(0, 100);

  // Sem codigo: cria UM snapshot global. Para o cron diário poderíamos
  // iterar por código, mas global é mais simples e o restore filtra depois.
  const r = await criarSnapshotCaixa(sb, { codigo, motivo });
  if (!r.ok) return NextResponse.json({ ok: false, erro: r.erro }, { status: 500 });

  return NextResponse.json({
    ok: true,
    id: r.id,
    total_cambistas: r.total_cambistas,
    total_caixa: r.total_caixa,
  });
}
