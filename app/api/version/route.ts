import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/version → versão atual do servidor (timestamp do build).
 * Cliente compara com o que tem em memória; se diferir, sugere atualizar.
 *
 * Como `BUILD_ID` é capturado em build-time, ele só muda quando o servidor
 * recompila. PWA com bundle antigo recebe valor diferente do que ele
 * carregou e detecta a defasagem.
 */
const BUILD_AT = process.env.NEXT_PUBLIC_BUILD_TS || String(Date.now());

export async function GET() {
  return NextResponse.json({
    ok: true,
    buildAt: BUILD_AT,
  });
}
