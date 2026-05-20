import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase-server";
import { listarSnapshots } from "@/lib/caixa-snapshot";
import { autorizarChefe } from "@/lib/auth-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/caixa/snapshots?codigo=XYZ&limit=60
 *
 * Lista metadata dos snapshots. Exige header `X-Senha-Lotobrasil` —
 * mesmo que sejam só agregados, expor histórico financeiro publicamente
 * é vetor de reconhecimento.
 */
export async function GET(req: Request) {
  const senha = req.headers.get("x-senha-lotobrasil") ?? "";
  const auth = await autorizarChefe(senha);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, erro: auth.erro || "Não autorizado" }, { status: 401 });
  }
  const sb = getServerSupabase();
  if (!sb) return NextResponse.json({ ok: false, erro: "DB indisponível" }, { status: 503 });

  const url = new URL(req.url);
  const codigo = url.searchParams.get("codigo");
  const limit = parseInt(url.searchParams.get("limit") ?? "60", 10);

  // Inclui também os snapshots globais (codigo IS NULL) para que o admin
  // possa restaurar a partir de snapshots criados pelo cron sem código.
  const [doCodigo, globais] = await Promise.all([
    codigo ? listarSnapshots(sb, { codigo, limit }) : Promise.resolve([]),
    listarSnapshots(sb, { codigo: null, limit }),
  ]);

  const todos = [...doCodigo, ...globais].sort(
    (a, b) => new Date(b.criado_em).getTime() - new Date(a.criado_em).getTime(),
  );
  // Dedup por id (caso codigo seja explícito e venha em ambas listas — não
  // deveria, mas defensivo).
  const vistos = new Set<string>();
  const final = todos.filter((s) => {
    if (vistos.has(s.id)) return false;
    vistos.add(s.id);
    return true;
  });

  return NextResponse.json({ ok: true, snapshots: final.slice(0, limit) });
}
