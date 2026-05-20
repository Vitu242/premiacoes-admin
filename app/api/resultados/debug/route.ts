import { NextResponse } from "next/server";
import {
  obterCatalogoLoterias,
  obterResultadosFeiticeira,
  resolverLoteriaFeiticeira,
} from "@/lib/feiticeira-api";
import {
  buscarPorLoteriaNacional,
  resolverFamiliaLotNac,
} from "@/lib/loteria-nacional";
import { buscarResultadoExtracao } from "@/lib/buscar-resultados-externos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/resultados/debug?nome=LBR%20BRASILIA%2010:00&encerra=10:00
 *
 * Endpoint de diagnóstico. Mostra:
 *  - se o mapeamento p/ feiticeira resolve a extração para alguma loteria
 *  - o que a API do feiticeira retorna para aquela loteria HOJE
 *  - o que o buscador combinado (feiticeira → playbicho) devolve
 *
 * NÃO grava nada. Útil só para investigar fontes; pode ser removido depois.
 */
export async function GET(req: Request): Promise<NextResponse> {
  // Endpoint de diagnóstico — só liberado em desenvolvimento ou via cron token.
  if (process.env.NODE_ENV === "production") {
    const tokenEnv = process.env.CAIXA_BACKUP_TOKEN;
    const auth = req.headers.get("authorization") ?? "";
    if (!tokenEnv || auth !== `Bearer ${tokenEnv}`) {
      return NextResponse.json({ ok: false, erro: "Não disponível em produção" }, { status: 404 });
    }
  }
  const url = new URL(req.url);
  const nome = url.searchParams.get("nome") ?? "";
  const encerra = url.searchParams.get("encerra") ?? "";
  if (!nome || !encerra) {
    return NextResponse.json(
      { ok: false, erro: "passe ?nome=...&encerra=HH:MM" },
      { status: 400 },
    );
  }

  const out: Record<string, unknown> = { nome, encerra };

  // 1) Loterianacional
  try {
    const fam = resolverFamiliaLotNac(nome, encerra);
    out.loteriaNacionalFamilia = fam;
    if (fam) {
      const r = await buscarPorLoteriaNacional(nome, encerra);
      out.loteriaNacionalResultado = r
        ? {
            premiosCount: Object.keys(r.premios).length,
            premios: r.premios,
            fonte: r.fonte,
          }
        : null;
    }
  } catch (e) {
    out.loteriaNacionalErro = (e as Error).message;
  }

  try {
    const cat = await obterCatalogoLoterias();
    out.catalogoTamanho = cat.length;
    const lot = await resolverLoteriaFeiticeira(nome, encerra);
    out.loteriaResolvida = lot
      ? { id: lot.id, codigo: lot.codigo_loteria, alias: lot.alias }
      : null;
    if (lot) {
      const fmt = new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/Sao_Paulo",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      });
      const parts: Record<string, string> = {};
      for (const p of fmt.formatToParts(new Date())) {
        if (p.type !== "literal") parts[p.type] = p.value;
      }
      const ymd = `${parts.year}-${parts.month}-${parts.day}`;
      out.dataConsultada = ymd;
      const rmap = await obterResultadosFeiticeira([lot.id], ymd);
      const r = rmap.get(lot.id);
      out.feiticeiraResultado = r
        ? {
            premiosCount: Object.keys(r.premios).length,
            premios: r.premios,
            grupos: r.grupos,
          }
        : null;
    }
  } catch (e) {
    out.feiticeiraErro = (e as Error).message;
  }

  try {
    const r = await buscarResultadoExtracao(nome, encerra);
    out.buscadorCombinado = r
      ? {
          premiosCount: Object.keys(r.premios).length,
          premios: r.premios,
          fonte: r.fonte,
        }
      : null;
  } catch (e) {
    out.buscadorErro = (e as Error).message;
  }

  return NextResponse.json({ ok: true, ...out });
}
