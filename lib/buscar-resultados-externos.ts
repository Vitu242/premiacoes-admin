/**
 * Buscador automático de resultados do Jogo do Bicho.
 *
 * Estratégia em cascata (decidida pelo dono do sistema):
 *   1) `loterianacional.com.br` — fonte PRIMÁRIA da maioria das bancas. Tem
 *      páginas dedicadas "1º ao 10º prêmio" e entrega resultados completos
 *      poucos minutos após o sorteio. NÃO precisa de credenciais.
 *
 *   2) `feiticeira.club` (API privada, autenticada) — usado para bancas que
 *      NÃO existem no loterianacional ou que o dono optou por deixar
 *      explicitamente nessa fonte:
 *        - Paratodos Bahia, Federal, Maluca BA, LBR/Capital, PT SP,
 *          Bandeirantes, MaluquetaRio, Uruguai, Minas (todas variantes),
 *          Sorte (banca, não a RS), Boa Sorte (banca, não a GO).
 *
 *   3) `playbicho.com` — último fallback. HTML público com payload Next.js
 *      hidratado. Entrega só 1º ao 5º para a maioria — fica como rede de
 *      segurança caso as duas primárias falhem.
 *
 * NÃO usar em código de browser — depende de `fetch` server-side e roda em
 * `app/api/.../route.ts`.
 */

import {
  obterResultadosFeiticeira,
  resolverLoteriaFeiticeira,
} from "@/lib/feiticeira-api";
import { buscarPorLoteriaNacional } from "@/lib/loteria-nacional";

export interface ResultadoExterno {
  /**
   * Mapa de prêmio (1..10) -> MILHAR do prêmio (4 dígitos, ex.: "4742").
   *
   * Salvamos a milhar (e não o grupo) porque o conferidor (`lib/conferencia.ts`)
   * usa `getWinningData(...)` que, ao receber 4 dígitos, deriva sozinho:
   *   - milhar4 = "4742"
   *   - centena3 = "742"
   *   - dezena2  = "42"
   *   - grupo    = "11" (Cavalo)
   * Isso cobre apostas de milhar, centena, dezena, grupo e variantes.
   */
  premios: Record<number, string>;
  /** Milhar do 1º prêmio (idêntica a `premios[1]`). Mantido por retrocompatibilidade. */
  milhar1?: string;
  fonte: string;
}

/**
 * Mapa heurístico: nome da extração no sistema -> slug da banca no PlayBicho.
 *
 * Lista atualizada a partir do sitemap oficial do PlayBicho
 * (https://playbicho.com/api/resultado-jogo-do-bicho/sitemap.xml).
 *
 * IMPORTANTE: a ordem importa. PT Rio e PT SP NÃO ficam aqui porque eles
 * dependem do horário (PTM/PT/PTV/PTN/COR têm slugs diferentes) — esses são
 * tratados separadamente em `resolveSlug` usando a hora da extração.
 */
const SLUG_MAP: Array<{ pattern: RegExp; slug: string }> = [
  // Bahia
  { pattern: /paratodos.*bahia|paratodos.*ba\b|\bpb\s*ba\b/i, slug: "paratodos-bahia" },
  { pattern: /maluca/i, slug: "maluca-bahia" },
  // Loterias Brasil / LBR / Brasília
  { pattern: /\blbr\b|loterias.*brasil|brasilia/i, slug: "loterias-br-lbr" },
  // Look (Goiás)
  { pattern: /\blook\b|look.*goias|loto.*goias/i, slug: "look-loterias" },
  // Nacional
  { pattern: /nacional/i, slug: "nacional" },
  // Federal
  { pattern: /federal/i, slug: "federal-do-brasil" },
  // Paraíba: LOTEP (popular) ≠ PARATODOS PB
  { pattern: /paratodos.*pb|\bpb\s*paratodos\b/i, slug: "paratodos-pb" },
  { pattern: /lotep|\bpb\s*lotep\b/i, slug: "lotep" },
  { pattern: /campina/i, slug: "campina-grande" },
  // Pernambuco
  { pattern: /aval.*pe|aval.*pernam/i, slug: "aval-pernambuco" },
  // Minas Gerais
  { pattern: /minas.*alvorada|^alvorada/i, slug: "minas-alvorada" },
  { pattern: /minas.*noite/i, slug: "minas-noite" },
  { pattern: /minas.*dia|^minas\b/i, slug: "minas-dia" },
  { pattern: /preferida|minas.*preferida/i, slug: "minas-preferida" },
  { pattern: /salva|minas.*salv/i, slug: "minas-salvacao" },
  // Outras
  { pattern: /coruja/i, slug: "coruja" },
  { pattern: /bandeirante/i, slug: "bandeirantes-sp" },
  { pattern: /lotece|loteria.*sonhos/i, slug: "lotece-loteria-dos-sonhos" },
  { pattern: /deu.*poste/i, slug: "deu-no-poste" },
  { pattern: /caminho.*sorte/i, slug: "caminho-da-sorte" },
  { pattern: /monte.*claros|nordeste.*monte|nordeste/i, slug: "nordeste-montes-claros" },
  { pattern: /loteria.*popular|popular/i, slug: "loteria-popular" },
  { pattern: /tradicional/i, slug: "tradicional" },
  { pattern: /bicho.*rs|rio.*grande.*sul/i, slug: "bicho-rs" },
  { pattern: /abaese|itabaiana/i, slug: "abaese-itabaiana-paratodos" },
];

/**
 * Mapeia PT do Rio de Janeiro pelo horário aproximado do sorteio:
 *   PTM  (manhã)  ≈ 11h
 *   PT   (tarde)  ≈ 14h
 *   PTV  (tarde)  ≈ 16h
 *   PTN  (noite)  ≈ 18h
 *   COR  (coruja) ≈ 21h
 *
 * Aceita variações de horário próximas (ex.: 16:20 → PTV).
 */
function slugPtRioPorHora(hora: number): string {
  if (hora <= 12) return "ptm";
  if (hora <= 15) return "pt";
  if (hora <= 17) return "ptv";
  if (hora <= 20) return "ptn";
  return "coruja";
}

/**
 * Mapeia PT de São Paulo pelo horário:
 *   PT-SP  (diurno) ≈ 10h, 13h, 15h
 *   PTN-SP (noturno) ≈ 17h, 20h
 */
function slugPtSpPorHora(hora: number): string {
  return hora >= 17 ? "ptn-sp" : "pt-sp";
}

function resolveSlug(nomeExtracao: string, encerra: string): string | null {
  const nome = (nomeExtracao ?? "").trim();
  if (!nome) return null;
  const horario = parseHorario(encerra);
  const hora = horario?.hora ?? 0;

  // PT do Rio (incluindo nomes "PT RIO", "PTM", "PTV", "PTN", "COR/CORUJA")
  if (/ptv/i.test(nome)) return "ptv";
  if (/ptm/i.test(nome)) return "ptm";
  if (/ptn.*sp/i.test(nome)) return "ptn-sp";
  if (/ptn/i.test(nome)) return "ptn";
  if (/coruja/i.test(nome)) return "coruja";
  if (/pt[\s-]*sp/i.test(nome)) return slugPtSpPorHora(hora);
  if (/pt[\s-]*rio/i.test(nome) || /^pt\b/i.test(nome)) {
    return slugPtRioPorHora(hora);
  }

  for (const entry of SLUG_MAP) {
    if (entry.pattern.test(nome)) return entry.slug;
  }
  return null;
}

/** Extrai o horário no formato HH:MM. */
function parseHorario(encerra: string): { hora: number; minuto: number } | null {
  const m = String(encerra ?? "").match(/(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const hora = Math.max(0, Math.min(23, parseInt(m[1] ?? "0", 10)));
  const minuto = Math.max(0, Math.min(59, parseInt(m[2] ?? "0", 10)));
  return { hora, minuto };
}

/** "01-02-03-04-05" a partir de uma lista de grupos numéricos (1..25). */
function gruposToString(grupos: number[]): string {
  return grupos.map((g) => String(g).padStart(2, "0")).join("-");
}

/**
 * Faz o fetch da página da banca e extrai os resultados de cada horário.
 * Retorna um mapa { "HH" -> ResultadoExterno }.
 *
 * O HTML do PlayBicho é renderizado client-side (Next.js), mas o JSON com
 * os dados de cada sorteio fica embutido no payload de hidratação como:
 *   ...,"draws":[
 *     {"position":"1º","number":"4742","group":"11","animal":"Cavalo"},
 *     ...
 *   ],"raffle":{...,"time":"10:00:00","externalTime":"10:20:00",...},...
 *
 * As aspas vêm escapadas (\"); por isso o regex usa `\\\"`.
 */
async function fetchBanca(slug: string): Promise<Map<string, ResultadoExterno>> {
  const url = `https://playbicho.com/resultado-jogo-do-bicho/${slug}-de-hoje`;
  const r = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Linux; PremiacoesAdmin/1.0) AppleWebKit/537.36 (KHTML, like Gecko)",
      Accept: "text/html",
    },
    cache: "no-store",
  });
  if (!r.ok) throw new Error(`fetch falhou: HTTP ${r.status}`);
  const html = await r.text();

  const out = new Map<string, ResultadoExterno>();

  // Cada bloco "sorteio" no HTML tem "draws":[...],"raffle":{...,"time":"HH:..."}
  const blocoRe =
    /\\"draws\\":\[([\s\S]*?)\],\\"raffle\\":\{[\s\S]*?\\"time\\":\\"(\d{1,2}):\d{2}:\d{2}\\"/g;

  const drawsRe =
    /\\"position\\":\\"(\d+)º\\",\\"number\\":\\"(\d{4})\\",\\"group\\":\\"(\d{1,2})\\"/g;

  for (const m of html.matchAll(blocoRe)) {
    const drawsRaw = m[1] ?? "";
    const hora = String(m[2] ?? "").padStart(2, "0");
    const premios: Record<number, string> = {};
    let milhar1: string | undefined;
    for (const dm of drawsRaw.matchAll(drawsRe)) {
      const pos = parseInt(dm[1] ?? "0", 10);
      const num = (dm[2] ?? "").padStart(4, "0");
      const grupoNum = parseInt(dm[3] ?? "0", 10);
      if (!pos || !num || Number.isNaN(grupoNum) || grupoNum < 1 || grupoNum > 25) continue;
      premios[pos] = num; // ← milhar, não grupo
      if (pos === 1) milhar1 = num;
    }
    if (Object.keys(premios).length === 0) continue;
    const atual = out.get(hora);
    if (atual && Object.keys(atual.premios).length >= Object.keys(premios).length) continue;
    out.set(hora, { premios, milhar1, fonte: url });
  }

  return out;
}

/**
 * Busca o resultado de uma extração específica.
 * - `nome`: nome da extração no sistema (ex.: "PARATODOS BAHIA 10:20").
 * - `encerra`: horário de encerramento no formato "HH:MM".
 *
 * A função tenta combinar pela HORA cheia: o bloco "Resultado ... 10h" cobre
 * extrações como 10:20, 10:00, etc.
 */
export async function buscarResultadoExtracao(
  nome: string,
  encerra: string,
): Promise<ResultadoExterno | null> {
  // 1) Fonte primária: loterianacional.com.br (HTML, 10 prêmios).
  //    Retorna null silenciosamente para Paratodos BA, Federal e bancas
  //    não cobertas — essas caem direto pro feiticeira no passo 2.
  try {
    const r = await buscarPorLoteriaNacional(nome, encerra);
    if (r) return r;
  } catch (e) {
    console.warn(
      "[resultados] loterianacional falhou:",
      (e as Error).message,
    );
  }

  // 2) Feiticeira.club (API privada). Usado para Paratodos BA, Federal,
  //    Maluca BA, LBR, PT SP, Bandeirantes, etc.
  try {
    const r = await buscarPorFeiticeira(nome, encerra);
    if (r) return r;
  } catch (e) {
    console.warn(
      "[resultados] feiticeira falhou:",
      (e as Error).message,
    );
  }

  // 3) Último fallback: playbicho.com (1º ao 5º).
  const slug = resolveSlug(nome, encerra);
  if (!slug) return null;
  const horario = parseHorario(encerra);
  if (!horario) return null;
  let mapa: Map<string, ResultadoExterno>;
  try {
    mapa = await fetchBanca(slug);
  } catch {
    return null;
  }
  const chave = String(horario.hora).padStart(2, "0");
  // CRÍTICO: match EXATO da hora. NÃO usamos mais "hora mais próxima" —
  // isso colava o resultado de outro horário em extrações que ainda não
  // tinham saído (ex.: 21:20 pegando o resultado das 19h). Se a fonte
  // não tiver o horário exato, devolvemos null e o cron tenta de novo
  // mais tarde, quando o sorteio do horário correto sair de fato.
  return mapa.get(chave) ?? null;
}

/**
 * Busca usando a API privada do feiticeira.club. Devolve até o 10º prêmio.
 * Retorna null silenciosamente se não houver mapeamento ou credenciais.
 */
async function buscarPorFeiticeira(
  nome: string,
  encerra: string,
): Promise<ResultadoExterno | null> {
  // Sem credenciais configuradas → pula direto pro fallback.
  if (!process.env.FEITICEIRA_LOGIN || !process.env.FEITICEIRA_PASSWORD) {
    return null;
  }
  const loteria = await resolverLoteriaFeiticeira(nome, encerra);
  if (!loteria) return null;

  // Data em fuso BRT no formato YYYY-MM-DD (a API espera esse formato).
  const dataYmd = dataBrtYmd();
  const resultados = await obterResultadosFeiticeira([loteria.id], dataYmd);
  const item = resultados.get(loteria.id);
  if (!item) return null;
  const premios = item.premios;
  if (!premios || !premios[1]) return null;
  return {
    premios,
    milhar1: premios[1],
    fonte: `feiticeira:${loteria.codigo_loteria}:${dataYmd}`,
  };
}

/** Data atual no fuso de Brasília no formato YYYY-MM-DD. */
function dataBrtYmd(): string {
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
  return `${parts.year ?? "2000"}-${parts.month ?? "01"}-${parts.day ?? "01"}`;
}

/** Expor o resolver pra teste/diagnóstico. */
export function _internoResolveSlug(nome: string, encerra = ""): string | null {
  return resolveSlug(nome, encerra);
}
