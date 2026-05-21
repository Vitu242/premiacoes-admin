import { NextResponse } from "next/server";
import crypto from "crypto";
import { getServerSupabase } from "@/lib/supabase-server";
import { agoraBrtFormatado } from "@/lib/date-utils";

export const runtime = "nodejs";

/**
 * POST /api/bilhetes
 * body: {
 *   cambistaId, codigo, extracaoId, extracaoNome,
 *   itens: [{ modalidade, numeros, valor, premio?, milharBrinde? }],
 *   total, data
 * }
 *
 * Cria bilhete server-side, valida saldo do cambista no DB e atualiza
 * entrada+comissão. Evita que clientes forjem bilhetes pelo console do navegador.
 */
export async function POST(req: Request) {
  const sb = getServerSupabase();
  if (!sb) return NextResponse.json({ ok: false, erro: "DB indisponível" }, { status: 503 });

  interface ItemBody {
    modalidade: string;
    numeros: string;
    valor: number;
    premio?: string;
    milharBrinde?: unknown;
  }
  interface BilheteBody {
    cambistaId?: string;
    codigo?: string;
    extracaoId?: string;
    extracaoNome?: string;
    itens?: ItemBody[];
    total?: number;
    data?: string;
  }
  let body: BilheteBody;
  try {
    body = (await req.json()) as BilheteBody;
  } catch {
    return NextResponse.json({ ok: false, erro: "Body inválido" }, { status: 400 });
  }

  const cambistaId = String(body.cambistaId ?? "");
  const itens = Array.isArray(body.itens) ? body.itens : [];

  // Recalcula total a partir dos itens — não confia no `total` enviado pelo
  // cliente (atacante poderia mandar total baixo com itens caros).
  const totalCalc = itens.reduce(
    (s: number, it) => s + (Number.isFinite(Number(it?.valor)) ? Number(it.valor) : 0),
    0,
  );
  const totalEnviado = Number(body.total ?? 0);
  const total = Math.round(totalCalc * 100) / 100;

  if (!cambistaId || !itens.length || !(total > 0) || total > 1_000_000) {
    return NextResponse.json({ ok: false, erro: "Dados inválidos" }, { status: 400 });
  }
  if (Math.abs(total - totalEnviado) > 0.05) {
    return NextResponse.json(
      { ok: false, erro: `Total não confere: enviado ${totalEnviado}, calculado ${total}` },
      { status: 400 },
    );
  }
  // Valida cada item
  for (const it of itens) {
    const v = Number(it?.valor);
    if (!Number.isFinite(v) || v <= 0 || v > 1_000_000) {
      return NextResponse.json({ ok: false, erro: "Valor de item inválido" }, { status: 400 });
    }
    if (typeof it?.modalidade !== "string" || !it.modalidade) {
      return NextResponse.json({ ok: false, erro: "Modalidade obrigatória" }, { status: 400 });
    }
    if (typeof it?.numeros !== "string") {
      return NextResponse.json({ ok: false, erro: "Números inválidos" }, { status: 400 });
    }
  }

  // valida cambista + saldo no DB
  const { data: cam, error: errCam } = await sb
    .from("cambistas")
    .select("id, status, saldo, entrada, comissao, comissao_milhar, comissao_centena, comissao_dezena, comissao_grupo")
    .eq("id", cambistaId)
    .maybeSingle();
  if (errCam || !cam) return NextResponse.json({ ok: false, erro: "Cambista não encontrado" }, { status: 404 });
  if (cam.status === "excluido") return NextResponse.json({ ok: false, erro: "Cambista não encontrado" }, { status: 404 });
  if (cam.status === "inativo") return NextResponse.json({ ok: false, erro: "Cambista inativo" }, { status: 403 });

  const disp = Math.max(0, Number(cam.saldo) - Number(cam.entrada));
  if (total > disp) {
    return NextResponse.json(
      { ok: false, erro: `Saldo insuficiente. Disponível: R$ ${disp.toFixed(2).replace(".", ",")}` },
      { status: 400 }
    );
  }

  // CRÍTICO: validar horário de encerramento da extração no servidor.
  // Cliente pode bypassar a validação local; aqui a fonte da verdade é a
  // tabela `extracoes` + relógio do servidor.
  const extId = String(body.extracaoId ?? "");
  if (extId) {
    const { data: ext } = await sb
      .from("extracoes")
      .select("id, nome, encerra, ativa, dias")
      .eq("id", extId)
      .maybeSingle();
    if (!ext) {
      return NextResponse.json({ ok: false, erro: "Extração não encontrada" }, { status: 404 });
    }
    if (!ext.ativa) {
      return NextResponse.json({ ok: false, erro: `Extração "${ext.nome}" não está ativa` }, { status: 403 });
    }
    // Hora atual em BRT (servidor pode estar em UTC).
    const fmt = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Sao_Paulo",
      hour: "2-digit",
      minute: "2-digit",
      weekday: "short",
      hour12: false,
    });
    const parts: Record<string, string> = {};
    for (const p of fmt.formatToParts(new Date())) {
      if (p.type !== "literal") parts[p.type] = p.value;
    }
    const horaAgora = parseInt(parts.hour ?? "0", 10);
    const minAgora = parseInt(parts.minute ?? "0", 10);
    const wkMap: Record<string, string> = { Sun: "Dom", Mon: "Seg", Tue: "Ter", Wed: "Qua", Thu: "Qui", Fri: "Sex", Sat: "Sab" };
    const hojeKey = wkMap[parts.weekday ?? "Sun"] ?? "Dom";
    const dias = (ext.dias ?? null) as string[] | null;
    if (Array.isArray(dias) && dias.length > 0 && !dias.includes(hojeKey)) {
      return NextResponse.json(
        { ok: false, erro: `A extração "${ext.nome}" não roda hoje` },
        { status: 403 },
      );
    }
    const m = String(ext.encerra ?? "").match(/(\d{1,2}):(\d{2})/);
    if (m) {
      const hEnc = parseInt(m[1] ?? "0", 10);
      const mEnc = parseInt(m[2] ?? "0", 10);
      const minEncerra = hEnc * 60 + mEnc;
      const minAgoraTotal = horaAgora * 60 + minAgora;
      if (minAgoraTotal >= minEncerra) {
        return NextResponse.json(
          {
            ok: false,
            erro: `O horário de encerramento da extração "${ext.nome}" (${ext.encerra}) já passou. Não é mais possível confirmar este bilhete.`,
          },
          { status: 403 },
        );
      }
    }
  }

  const baseComissao = (mod: string): "grupo" | "dezena" | "centena" | "milhar" => {
    if (mod === "grupo" || mod.startsWith("duque_grupo") || mod.startsWith("terno_grupo") || mod.startsWith("passe")) return "grupo";
    if (mod === "dezena" || mod.startsWith("duque_dezena") || mod.startsWith("terno_dezena")) return "dezena";
    if (mod === "centena" || (mod.includes("centena") && mod !== "milhar_e_centena" && mod !== "mc_invertida")) return "centena";
    return "milhar";
  };
  const pct = {
    grupo: Number(cam.comissao_grupo ?? 0),
    dezena: Number(cam.comissao_dezena ?? 0),
    centena: Number(cam.comissao_centena ?? 0),
    milhar: Number(cam.comissao_milhar ?? 0),
  };
  const comissao = itens.reduce(
    (acc: number, it: ItemBody) =>
      acc + Number(it.valor ?? 0) * ((pct[baseComissao(String(it.modalidade))] ?? 0) / 100),
    0,
  );

  // ID não-previsível (UUID v4) e código curto derivado do timestamp.
  const id = `bil-${crypto.randomUUID()}`;
  const codigo = String(body.codigo ?? Date.now()).slice(-11);
  const novo = {
    id,
    codigo,
    cambista_id: cambistaId,
    extracao_id: String(body.extracaoId ?? ""),
    extracao_nome: String(body.extracaoNome ?? ""),
    itens,
    total,
    // Data sempre em BRT explícito (servidor pode estar em UTC).
    data: String(body.data ?? agoraBrtFormatado()),
    situacao: "pendente",
  };

  const { error: errIns } = await sb.from("bilhetes").upsert(novo, { onConflict: "id" });
  if (errIns) return NextResponse.json({ ok: false, erro: errIns.message }, { status: 500 });

  // Atualiza entrada + comissao agregadas (consistente com o cliente).
  const { error: errUpd } = await sb
    .from("cambistas")
    .update({
      entrada: Math.round((Number(cam.entrada ?? 0) + total) * 100) / 100,
      comissao: Math.round((Number(cam.comissao ?? 0) + comissao) * 100) / 100,
    })
    .eq("id", cambistaId);
  if (errUpd) {
    // Não cancela o bilhete, mas avisa o cliente da falha parcial para que
    // ele saiba que precisa rodar reconciliar.
    return NextResponse.json(
      {
        ok: true,
        bilhete: { ...novo, comissao },
        avisoCambista: errUpd.message,
      },
      { status: 200 },
    );
  }

  return NextResponse.json({ ok: true, bilhete: { ...novo, comissao } });
}
