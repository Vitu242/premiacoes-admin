import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase-server";
import { buscarResultadoExtracao } from "@/lib/buscar-resultados-externos";
import { autorizarCronInterno, autorizarSyncRequest } from "@/lib/auth-server";
import { registrarAlertaServidor } from "@/lib/alertas-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function autorizado(req: Request): Promise<boolean> {
  if (autorizarCronInterno(req)) return true;
  const auth = await autorizarSyncRequest(req);
  return auth.ok && auth.tipo === "admin";
}

/**
 * GET (e POST) /api/resultados/auto?janela=20
 *
 * Varre todas as extrações ativas. Para cada uma cuja janela de
 *   [encerrou, encerrou + N min]
 * (default 20 min) está aberta E que ainda NÃO tem resultado de hoje,
 * tenta buscar o resultado em fonte externa e salvar na tabela `resultados`.
 *
 * Roda em CRON do servidor — usuário não precisa apertar nada.
 *
 * Resposta: { ok: true, processados: [...], salvos: number }
 */
export async function GET(req: Request) {
  return processar(req);
}
export async function POST(req: Request) {
  return processar(req);
}

interface ExtracaoRow {
  id: string;
  nome: string;
  encerra: string;
  ativa: boolean;
  tipo?: string | null;
  dias?: string[] | null;
}

interface ResultadoRow {
  id: string;
  extracao_id: string;
  data: string;
  premios?: Record<string, string> | null;
}

interface RegistroProcessamento {
  extracaoId: string;
  nome: string;
  encerra: string;
  status:
    | "salvo"
    | "completado"
    | "ja_existe"
    | "fora_da_janela"
    | "nao_roda_hoje"
    | "inativa"
    | "sem_resultado_na_fonte"
    | "sem_slug_mapeado"
    | "erro_fonte";
  premios?: number;
  erro?: string;
}

/**
 * Lê data/hora atuais no fuso de Brasília (America/Sao_Paulo).
 * O servidor pode estar em UTC, mas todas as extrações e horários do
 * sistema são em BRT — usar getHours()/getDate() direto causa erro grave
 * na janela de busca e na data salva.
 */
function agoraBrt(): { dia: number; mes: number; ano: number; hora: number; minuto: number; dow: number } {
  const d = new Date();
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    weekday: "short",
  });
  const parts: Record<string, string> = {};
  for (const p of fmt.formatToParts(d)) {
    if (p.type !== "literal") parts[p.type] = p.value;
  }
  const wkMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return {
    dia: parseInt(parts.day ?? "1", 10),
    mes: parseInt(parts.month ?? "1", 10),
    ano: parseInt(parts.year ?? "2000", 10),
    hora: parseInt(parts.hour ?? "0", 10),
    minuto: parseInt(parts.minute ?? "0", 10),
    dow: wkMap[parts.weekday ?? "Sun"] ?? 0,
  };
}

function ddmmaaBrt(): string {
  const a = agoraBrt();
  const dd = String(a.dia).padStart(2, "0");
  const mm = String(a.mes).padStart(2, "0");
  return `${dd}/${mm}/${a.ano}`;
}

function minutosDoDia(hhmm: string): number | null {
  const m = String(hhmm ?? "").match(/(\d{1,2}):(\d{2})/);
  if (!m) return null;
  return parseInt(m[1] ?? "0", 10) * 60 + parseInt(m[2] ?? "0", 10);
}

const DIA_SEMANA_KEYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sab"] as const;

function extracaoRodaHoje(dias?: string[] | null): boolean {
  if (!dias || dias.length === 0) return true;
  return dias.includes(DIA_SEMANA_KEYS[agoraBrt().dow] ?? "");
}

async function processar(req: Request): Promise<NextResponse> {
  if (!(await autorizado(req))) {
    return NextResponse.json({ ok: false, erro: "Não autorizado" }, { status: 401 });
  }
  const sb = getServerSupabase();
  if (!sb) {
    return NextResponse.json({ ok: false, erro: "DB indisponível" }, { status: 503 });
  }

  const url = new URL(req.url);
  // Padrão: 1440 (=24h) → cobre o dia inteiro. Para limitar mais, passar
  // `?janela=20` no querystring. Valor 0 ou negativo = mesmo padrão.
  const janelaParam = parseInt(url.searchParams.get("janela") ?? "1440", 10);
  const janela = Number.isFinite(janelaParam) && janelaParam > 0 ? janelaParam : 1440;
  const codigoBanca = url.searchParams.get("codigo");
  // Quando `?completar=1`, refaz a busca para extrações que já têm
  // resultado mas com menos prêmios do que a fonte oferece. Útil para
  // preencher resultados antigos que vieram só com 5 prêmios e agora
  // podem ter os 10.
  const completar = url.searchParams.get("completar") === "1";

  // 1) Lista todas as extrações ativas.
  const { data: exData, error: exErr } = await sb
    .from("extracoes")
    .select("id,nome,encerra,ativa,tipo,dias");
  if (exErr) {
    return NextResponse.json({ ok: false, erro: exErr.message }, { status: 500 });
  }
  const extracoes = (exData ?? []) as ExtracaoRow[];

  const brt = agoraBrt();
  const minutosAgora = brt.hora * 60 + brt.minuto;
  const dataHoje = ddmmaaBrt();

  // 2) Resultados já lançados HOJE — evita reprocessar, exceto quando
  //    `completar=1` E o resultado existente tem menos prêmios do que
  //    a fonte oferece.
  const { data: resData } = await sb
    .from("resultados")
    .select("id,extracao_id,data,premios")
    .eq("data", dataHoje);
  const existentes = new Map<string, ResultadoRow>();
  for (const r of (resData ?? []) as ResultadoRow[]) {
    existentes.set(r.extracao_id, r);
  }

  const log: RegistroProcessamento[] = [];
  let salvos = 0;

  for (const ext of extracoes) {
    const base: RegistroProcessamento = {
      extracaoId: ext.id,
      nome: ext.nome,
      encerra: ext.encerra,
      status: "fora_da_janela",
    };

    if (!ext.ativa) {
      log.push({ ...base, status: "inativa" });
      continue;
    }
    if (!extracaoRodaHoje(ext.dias)) {
      log.push({ ...base, status: "nao_roda_hoje" });
      continue;
    }
    const existente = existentes.get(ext.id) ?? null;
    if (existente && !completar) {
      log.push({ ...base, status: "ja_existe" });
      continue;
    }
    const encerraMin = minutosDoDia(ext.encerra);
    if (encerraMin == null) {
      log.push({ ...base, status: "sem_slug_mapeado", erro: "horario invalido" });
      continue;
    }
    // Janela = "qualquer extração que JÁ ENCERROU hoje e ainda não tem
    // resultado". O parâmetro `janela` (em minutos) só é usado para o caso
    // raro de querer limitar a busca a um intervalo logo após o
    // encerramento — por padrão deixamos amplo (até o fim do dia) para
    // não perder resultados quando a fonte demora a publicar.
    const aindaNaoEncerrou = minutosAgora < encerraMin;
    const passouDaJanela =
      janela > 0 && janela < 24 * 60 && minutosAgora > encerraMin + janela;
    if (aindaNaoEncerrou || passouDaJanela) {
      log.push({ ...base, status: "fora_da_janela" });
      continue;
    }

    // 3) Tenta puxar da fonte externa.
    try {
      const r = await buscarResultadoExtracao(ext.nome, ext.encerra);
      if (!r) {
        log.push({ ...base, status: "sem_resultado_na_fonte" });
        continue;
      }
      const premios = r.premios ?? {};
      const grupos1 = premios[1] ?? "";
      if (!grupos1) {
        log.push({ ...base, status: "sem_resultado_na_fonte" });
        continue;
      }

      // Em modo `completar`, só atualizamos se a fonte trouxer MAIS prêmios
      // do que o que já está salvo. Assim não desperdiçamos atualizações
      // quando a fonte primária está com a mesma cobertura do existente.
      const nNovos = Object.values(premios).filter((p) => !!p).length;
      const nExistentes = existente?.premios
        ? Object.values(existente.premios).filter((p) => !!p).length
        : 0;
      if (existente && completar && nNovos <= nExistentes) {
        log.push({ ...base, status: "ja_existe", premios: nExistentes });
        continue;
      }

      // ATENÇÃO: se o 1º prêmio MUDOU em relação ao salvo, isso pode
      // reverter bilhetes que já estavam "pago" (cliente já recebeu).
      // Não bloqueamos a atualização — o resultado correto deve prevalecer
      // — mas registramos um ALERTA pra o admin saber e tomar providência.
      let premio1MudouDe: string | null = null;
      if (existente && completar) {
        const premioExistente1 = (
          (existente.premios ?? {}) as Record<string, string>
        )["1"];
        if (premioExistente1 && premioExistente1 !== grupos1) {
          premio1MudouDe = premioExistente1;
        }
      }

      // 4) Salva. Se `codigoBanca` veio na query, herda em `codigo_banca`
      //    (compatível com a migração de tenant). Em modo `completar`,
      //    fazemos UPDATE no registro existente (preserva o ID original
      //    para manter referência em bilhetes já conferidos).
      const row: Record<string, unknown> = {
        extracao_id: ext.id,
        extracao_nome: ext.nome,
        data: dataHoje,
        grupos: grupos1,
        premios,
      };
      if (codigoBanca) row.codigo_banca = codigoBanca;

      let insErr: { message: string } | null = null;
      if (existente && completar) {
        const { error } = await sb
          .from("resultados")
          .update(row)
          .eq("id", existente.id);
        insErr = error ?? null;
      } else {
        const id = `auto-${ext.id}-${Date.now()}`;
        const { error } = await sb
          .from("resultados")
          .upsert({ id, ...row }, { onConflict: "id" });
        insErr = error ?? null;
      }

      if (insErr) {
        log.push({ ...base, status: "erro_fonte", erro: insErr.message });
        continue;
      }
      salvos += 1;
      log.push({
        ...base,
        status: existente ? "completado" : "salvo",
        premios: nNovos,
      });

      // Se o 1º prêmio mudou, registra alerta pra o admin saber. A re-conferência
      // dos bilhetes acontecerá quando o cliente abrir o app (via realtime), e os
      // bilhetes que viraram pago→perdedor vão gerar alertas próprios também.
      if (premio1MudouDe) {
        try {
          await registrarAlertaServidor(sb, {
            tipo: "resultado_corrigido",
            titulo: `Resultado mudou: ${ext.nome}`,
            detalhes: `O 1º prêmio da extração ${ext.nome} (${dataHoje}) foi atualizado de ${premio1MudouDe} para ${grupos1}. Bilhetes pagos com base no resultado anterior podem virar perdedor — verifique a tela de Alertas.`,
            extracaoNome: ext.nome,
            data: dataHoje,
          });
        } catch {
          /* não bloqueia o cron */
        }
      }
    } catch (e) {
      log.push({ ...base, status: "erro_fonte", erro: (e as Error).message });
    }
  }

  return NextResponse.json({ ok: true, janela, completar, processados: log, salvos });
}
