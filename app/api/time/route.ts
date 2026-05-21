import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/time
 *
 * Retorna a hora atual do SERVIDOR em milissegundos epoch.
 *
 * O cliente usa este endpoint para calcular o offset entre o relógio
 * local e o do servidor. Assim, validações de horário (ex.: encerramento
 * de extração) ficam imunes a celulares com clock errado.
 *
 * `nowMs` é UTC absoluto (independe de fuso). O cliente mistura com seu
 * `Date.now()` para descobrir o delta e aplica em `nowServer()`.
 */
export async function GET() {
  const nowMs = Date.now();

  // Componentes em BRT, úteis para diagnóstico/ logs.
  const fmt = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const parts: Record<string, string> = {};
  for (const p of fmt.formatToParts(new Date(nowMs))) {
    if (p.type !== "literal") parts[p.type] = p.value;
  }
  const brt = `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second}`;

  return NextResponse.json(
    {
      ok: true,
      nowMs,
      iso: new Date(nowMs).toISOString(),
      brt,
      tz: "America/Sao_Paulo",
    },
    {
      headers: {
        // Cache off — qualquer staleness derrota o propósito do endpoint.
        "Cache-Control": "no-store, max-age=0",
      },
    },
  );
}
