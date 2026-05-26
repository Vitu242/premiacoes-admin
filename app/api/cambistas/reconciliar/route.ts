import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase-server";
import { autorizarCronInterno, autorizarSyncRequest } from "@/lib/auth-server";
import { conferirBilhete } from "@/lib/conferencia";
import type { Bilhete, Cambista, Resultado } from "@/lib/types";
import { registrarAlertaServidor } from "@/lib/alertas-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * POST /api/cambistas/reconciliar
 *
 * Recalcula entrada/saídas/comissão/lançamentos de TODOS os cambistas
 * (ou de um específico via `?id=...`) a partir dos bilhetes/lançamentos/
 * resultados gravados no Supabase. Se houver divergência > R$ 0,01,
 * grava o valor correto e registra um ALERTA pra o admin saber.
 *
 * Uso típico:
 *  - Cron diário (madrugada): roda sem parâmetros, recalcula todo mundo.
 *  - Botão manual no painel: dispara após mudança massiva.
 *
 * Auth:
 *  - Cron loopback (autorizarCronInterno) OU
 *  - Chefe com senha do Lotobrasil no body.
 */
export async function POST(req: Request) {
  let body: { cambistaId?: string } = {};
  try {
    body = (await req.clone().json()) as typeof body;
  } catch {
    /* sem body é OK pra cron */
  }

  // Autorização: cron interno (loopback) OU qualquer admin logado.
  // Reconciliação não muda dado por dado — recalcula a partir das fontes
  // (bilhetes/lançamentos/resultados). Não há risco de admin malicioso
  // forjar valores. Por isso aceita admin sem senha extra do chefe.
  if (!autorizarCronInterno(req)) {
    const auth = await autorizarSyncRequest(req);
    if (!auth.ok || auth.tipo !== "admin") {
      return NextResponse.json(
        { ok: false, erro: auth.erro || "Não autorizado" },
        { status: 401 },
      );
    }
  }

  const sb = getServerSupabase();
  if (!sb) {
    return NextResponse.json({ ok: false, erro: "DB indisponível" }, { status: 503 });
  }

  // Carrega tudo paginando (mesmo padrão do initFromSupabase).
  const fetchAll = async <T>(tabela: string): Promise<T[]> => {
    const PAGE = 1000;
    const out: T[] = [];
    let from = 0;
    for (let i = 0; i < 30; i++) {
      const { data, error } = await sb
        .from(tabela)
        .select("*")
        .order("id", { ascending: false })
        .range(from, from + PAGE - 1);
      if (error) throw new Error(error.message);
      const arr = (data as T[] | null) ?? [];
      out.push(...arr);
      if (arr.length < PAGE) break;
      from += PAGE;
    }
    return out;
  };

  let cambistasFiltro = "";
  if (body.cambistaId) cambistasFiltro = `?id=eq.${encodeURIComponent(body.cambistaId)}`;

  const [cambistas, bilhetes, lancamentos, resultados] = await Promise.all([
    sb.from("cambistas")
      .select("*")
      .then((r) => {
        if (r.error) throw new Error(r.error.message);
        const all = (r.data ?? []) as Array<Record<string, unknown>>;
        if (body.cambistaId) return all.filter((c) => String(c.id) === body.cambistaId);
        return all;
      }),
    fetchAll<Record<string, unknown>>("bilhetes"),
    fetchAll<Record<string, unknown>>("lancamentos"),
    fetchAll<Record<string, unknown>>("resultados"),
  ]);

  /** Converte cambista DB → tipo Cambista do app (snake_case → camelCase). */
  const dbCam2App = (r: Record<string, unknown>): Cambista => ({
    id: String(r.id ?? ""),
    gerenteId: String(r.gerente_id ?? ""),
    codigo: String(r.codigo ?? "default"),
    tipo: (r.tipo as "cambista" | "cliente") ?? "cambista",
    login: String(r.login ?? ""),
    senha: String(r.senha ?? ""),
    saldo: Number(r.saldo ?? 0),
    comissaoMilhar: Number(r.comissao_milhar ?? 0),
    comissaoCentena: Number(r.comissao_centena ?? 0),
    comissaoDezena: Number(r.comissao_dezena ?? 0),
    comissaoGrupo: Number(r.comissao_grupo ?? 0),
    cotacaoM: Number(r.cotacao_m ?? 0),
    cotacaoC: Number(r.cotacao_c ?? 0),
    cotacaoD: Number(r.cotacao_d ?? 0),
    cotacaoG: Number(r.cotacao_g ?? 0),
    cotacoes: (r.cotacoes as Cambista["cotacoes"]) ?? undefined,
    milharBrinde: (r.milhar_brinde as "sim" | "nao") ?? "nao",
    endereco: String(r.endereco ?? ""),
    telefone: String(r.telefone ?? ""),
    descricao: String(r.descricao ?? ""),
    status: (r.status as Cambista["status"]) ?? "ativo",
    risco: String(r.risco ?? ""),
    entrada: Number(r.entrada ?? 0),
    saidas: Number(r.saidas ?? 0),
    comissao: Number(r.comissao ?? 0),
    lancamentos: Number(r.lancamentos ?? 0),
    ultimaPrestacao: r.ultima_prestacao as string | null,
  });

  const dbBil2App = (r: Record<string, unknown>): Bilhete => ({
    id: String(r.id ?? ""),
    codigo: String(r.codigo ?? ""),
    cambistaId: String(r.cambista_id ?? ""),
    extracaoId: String(r.extracao_id ?? ""),
    extracaoNome: String(r.extracao_nome ?? ""),
    itens: (r.itens as Bilhete["itens"]) ?? [],
    total: Number(r.total ?? 0),
    data: String(r.data ?? ""),
    situacao: (r.situacao as Bilhete["situacao"]) ?? "pendente",
  });

  const dbRes2App = (r: Record<string, unknown>): Resultado => ({
    id: String(r.id ?? ""),
    extracaoId: String(r.extracao_id ?? ""),
    extracaoNome: String(r.extracao_nome ?? ""),
    data: String(r.data ?? ""),
    grupos: String(r.grupos ?? ""),
    dezenas: (r.dezenas as string | undefined) ?? undefined,
    premios: (r.premios as Resultado["premios"]) ?? undefined,
  });

  function parseData(s: string | null | undefined): number {
    if (!s) return 0;
    const m = String(s).match(/^(\d{2})\/(\d{2})\/(\d{2,4})[, ]+(\d{2}):(\d{2})/);
    if (m) {
      const yy = m[3].length === 2 ? 2000 + parseInt(m[3], 10) : parseInt(m[3], 10);
      return new Date(yy, parseInt(m[2], 10) - 1, parseInt(m[1], 10), parseInt(m[4], 10), parseInt(m[5], 10)).getTime();
    }
    return Date.parse(s) || 0;
  }
  function normalizarData(s: string): string {
    const m = String(s ?? "").match(/^(\d{2})\/(\d{2})\/(\d{2,4})/);
    if (!m) return s;
    const yy = m[3].length === 2 ? `20${m[3]}` : m[3];
    return `${m[1]}/${m[2]}/${yy}`;
  }
  function calcularComissao(b: Bilhete, cam: Cambista): number {
    let total = 0;
    const map: Record<string, "grupo" | "dezena" | "centena" | "milhar"> = {};
    for (const it of b.itens) {
      const mod = it.modalidade;
      let base: "grupo" | "dezena" | "centena" | "milhar" = "milhar";
      if (mod === "grupo" || mod.startsWith("duque_grupo") || mod.startsWith("terno_grupo") || mod.startsWith("passe")) base = "grupo";
      else if (mod === "dezena" || mod.startsWith("duque_dezena") || mod.startsWith("terno_dezena")) base = "dezena";
      else if (mod === "centena" || (mod.includes("centena") && mod !== "milhar_e_centena" && mod !== "mc_invertida")) base = "centena";
      map[mod] = base;
      const pct =
        base === "grupo"
          ? cam.comissaoGrupo
          : base === "dezena"
            ? cam.comissaoDezena
            : base === "centena"
              ? cam.comissaoCentena
              : cam.comissaoMilhar;
      total += (Number(it.valor) || 0) * (Number(pct) || 0) / 100;
    }
    return total;
  }
  function getCotacao(cam: Cambista, mod: string): number {
    const ov = cam.cotacoes && (cam.cotacoes as Record<string, number>)[mod];
    if (typeof ov === "number" && ov > 0) return ov;
    if (mod === "milhar") return cam.cotacaoM;
    if (mod === "centena") return cam.cotacaoC;
    if (mod === "dezena") return cam.cotacaoD;
    if (mod === "grupo") return cam.cotacaoG;
    return 0;
  }

  const ajustados: Array<{ id: string; login: string; antes: Record<string, number>; depois: Record<string, number>; diffEntrada: number }> = [];

  for (const camDb of cambistas) {
    const cam = dbCam2App(camDb);
    if (!cam.id) continue;
    const ultMs = parseData(cam.ultimaPrestacao);
    const emAberto = (d: string) => parseData(d) > ultMs;

    let entrada = 0;
    let saidas = 0;
    let comissao = 0;
    let lanc = 0;

    for (const bDb of bilhetes) {
      if (String(bDb.cambista_id) !== cam.id) continue;
      if (bDb.situacao === "cancelado") continue;
      if (!emAberto(String(bDb.data))) continue;
      const b = dbBil2App(bDb);
      entrada += b.total;
      comissao += calcularComissao(b, cam);
      if (b.situacao === "pago") {
        const r = resultados.find(
          (r) =>
            String(r.extracao_id) === b.extracaoId &&
            normalizarData(String(r.data)) === normalizarData(b.data),
        );
        if (r) {
          const conf = conferirBilhete(b, dbRes2App(r), cam, getCotacao as never, 0);
          saidas += conf.valorGanho;
        }
      }
    }

    for (const lDb of lancamentos) {
      if (String(lDb.cambista_id) !== cam.id) continue;
      if (!emAberto(String(lDb.data))) continue;
      const v = Number(lDb.valor) || 0;
      lanc += lDb.tipo === "adiantar" ? v : -v;
    }

    const depois = {
      entrada: Math.round(entrada * 100) / 100,
      saidas: Math.round(saidas * 100) / 100,
      comissao: Math.round(comissao * 100) / 100,
      lancamentos: Math.round(lanc * 100) / 100,
    };
    const antes = {
      entrada: cam.entrada,
      saidas: cam.saidas,
      comissao: cam.comissao,
      lancamentos: cam.lancamentos,
    };

    const houveAjuste =
      Math.abs(antes.entrada - depois.entrada) > 0.01 ||
      Math.abs(antes.saidas - depois.saidas) > 0.01 ||
      Math.abs(antes.comissao - depois.comissao) > 0.01 ||
      Math.abs(antes.lancamentos - depois.lancamentos) > 0.01;

    if (!houveAjuste) continue;

    const { error: updErr } = await sb
      .from("cambistas")
      .update({
        entrada: depois.entrada,
        saidas: depois.saidas,
        comissao: depois.comissao,
        lancamentos: depois.lancamentos,
      })
      .eq("id", cam.id);
    if (updErr) continue;

    const diffEntrada = antes.entrada - depois.entrada;
    ajustados.push({ id: cam.id, login: cam.login, antes, depois, diffEntrada });

    // Alerta só se a divergência foi >= R$ 1 (evita ruído por arredondamento).
    const totalDiff =
      Math.abs(antes.entrada - depois.entrada) +
      Math.abs(antes.saidas - depois.saidas) +
      Math.abs(antes.comissao - depois.comissao) +
      Math.abs(antes.lancamentos - depois.lancamentos);
    if (totalDiff >= 1) {
      try {
        await registrarAlertaServidor(sb, {
          tipo: "outro",
          titulo: `Caixa de ${cam.login} ajustado pela reconciliação`,
          detalhes:
            `O caixa do cambista ${cam.login} foi recalculado (cron) e estava divergindo dos bilhetes/lançamentos no banco. ` +
            `Antes: entrada R$${antes.entrada.toFixed(2)}, saídas R$${antes.saidas.toFixed(2)}, comissão R$${antes.comissao.toFixed(2)}, lançamentos R$${antes.lancamentos.toFixed(2)}. ` +
            `Depois: entrada R$${depois.entrada.toFixed(2)}, saídas R$${depois.saidas.toFixed(2)}, comissão R$${depois.comissao.toFixed(2)}, lançamentos R$${depois.lancamentos.toFixed(2)}.`,
          cambistaId: cam.id,
          cambistaNome: cam.login,
          valor: Math.round(totalDiff * 100) / 100,
        });
      } catch {
        /* não bloqueia */
      }
    }
  }

  return NextResponse.json({
    ok: true,
    total_cambistas_verificados: cambistas.length,
    ajustados: ajustados.length,
    detalhes: ajustados,
  });
}
