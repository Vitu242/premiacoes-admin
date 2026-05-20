/**
 * Scraping de resultados em `loterianacional.com.br`.
 *
 * Esta é a fonte PRIMÁRIA para a maioria das bancas. Vantagens:
 *  - Páginas estáveis, HTML simples, todas com a mesma estrutura.
 *  - Várias bancas têm a versão "1º ao 10º prêmio" (URLs `/.../1-ao-10/...`)
 *    que entregam 10 prêmios — exatamente o que precisamos.
 *  - Não exige autenticação.
 *
 * Estrutura HTML usada (todas as páginas):
 *   <h3>NOME DA BANCA</h3>
 *   <h4>Sorteio HH<h|h>MM[min] [1º ao 10º]</h4>
 *   <p>DDS DD/MM/YYYY</p>
 *   <div class="bicho-individual">
 *     <span class="numero-individual">Nº</span>
 *     <span class="milhar">XXXX</span>
 *     <span class="bola-numero">G</span>
 *   </div>
 *   (até 10 blocos)
 *
 * NÃO usar em código de browser.
 */

import type { ResultadoExterno } from "./buscar-resultados-externos";

const BASE = "https://www.loterianacional.com.br";

/**
 * Slug (caminho) por família. Quando existe a versão "1-ao-10" preferimos ela.
 *
 * Famílias internas usadas em `identificarFamiliaLotNac`:
 *   - "AVAL_PE"      → Aval Pernambuco
 *   - "LOOK"         → Look Loterias (GO)
 *   - "NACIONAL"     → Loteria Nacional (Rio)
 *   - "POPULAR_PE"   → Loteria Popular Recife
 *   - "POSTE"        → Deu no Poste (PT Rio variantes)
 *   - "LOTEP"        → Lotep + Paratodos PB
 *   - "LOTECE"       → Lotece / Loteria dos Sonhos (CE)
 *   - "CE_PARATODOS" → Ceará Paratodos
 *   - "BOA_SORTE_GO" → Boa Sorte Goiás
 *   - "PAULISTA"     → Loteria Paulista
 *   - "TRADICIONAL"  → Bilhete Tradicional
 *   - "SORTE_RS"     → Loteria da Sorte RS
 *   - "MONTE_CARLOS" → Nordeste Monte Carlos
 *   - "ABAESE"       → Abaese
 *   - "ALIANCA"      → Aliança
 *   - "CAMINHO"      → Caminho da Sorte
 */
type FamiliaLN =
  | "AVAL_PE"
  | "LOOK"
  | "NACIONAL"
  | "POPULAR_PE"
  | "POSTE"
  | "LOTEP"
  | "LOTECE"
  | "CE_PARATODOS"
  | "BOA_SORTE_GO"
  | "PAULISTA"
  | "TRADICIONAL"
  | "SORTE_RS"
  | "MONTE_CARLOS"
  | "ABAESE"
  | "ALIANCA"
  | "CAMINHO";

const PATHS: Record<FamiliaLN, string> = {
  AVAL_PE: "/resultado-aval-1-ao-10-premio/",
  LOOK: "/look-loterias-1-ao-10-premio/",
  NACIONAL: "/resultado-nacional-do-1-ao-10-premio/",
  POPULAR_PE: "/resultado-da-popular-do-1-ao-10-premio/",
  POSTE: "/deu-no-poste-1-ao-10/",
  LOTEP: "/lotep/",
  LOTECE: "/loteria-dos-sonhos/",
  CE_PARATODOS: "/resultado-ce-paratodos/",
  BOA_SORTE_GO: "/boa-sorte-loterias-goias/",
  PAULISTA: "/loteria-paulista/",
  TRADICIONAL: "/bilhete-tradicional/",
  SORTE_RS: "/loteria-da-sorte-rs/",
  MONTE_CARLOS: "/resultado-monte-carlos/",
  ABAESE: "/abaese/",
  ALIANCA: "/resultado-alianca/",
  CAMINHO: "/caminho-da-sorte/",
};

function normalizar(s: string): string {
  return (s ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Mapeia o NOME de uma extração do nosso sistema → família do
 * loterianacional.com.br.
 *
 * IMPORTANTE: a função retorna null para:
 *  - Paratodos Bahia (deve ir pelo feiticeira, decidido pelo dono)
 *  - Federal (deve ir pelo feiticeira)
 *  - Bancas que não existem nessa fonte (PT Rio "puro" → cai na fallback)
 */
function identificarFamilia(nome: string): FamiliaLN | null {
  const n = normalizar(nome);
  if (!n) return null;

  // EXCEÇÕES — devem cair na fallback (feiticeira)
  if (/\bPARATODOS.*BAHIA\b|\bPARATODOS.*BA\b|^\s*BAHIA\b/.test(n)) return null;
  if (/\bFEDERAL\b/.test(n)) return null;
  // "Maluca BA" também é só do feiticeira (não tem em loterianacional)
  if (/\bMALUCA\b|\bBA[\s-]*MALUCA\b/.test(n)) return null;
  // LBR / Capital → só feiticeira
  if (/\bLBR\b|\bCAPITAL\b|\bBRASILIA\b/.test(n)) return null;
  // PT SP → só feiticeira
  if (/\bPT\s*SP\b|\bPTSP\b/.test(n)) return null;
  // Bandeirantes/Boa Sorte/Maluqueta Rio/etc — só feiticeira
  if (/\bMALUQ\b|\bBOA[\s-]*SORTE\b|\bBOASORTE\b/.test(n) && !/GOIAS\b/.test(n))
    return null;
  if (/\bBANDEIRANT|^BAND\b/.test(n)) return null;
  if (/\bSORTE\b/.test(n) && !/RS\b/.test(n) && !/CAMINHO/.test(n)) {
    // "LT SORTE" do feiticeira — fica com o feiticeira; mas "LOTERIA DA SORTE RS" e
    // "CAMINHO DA SORTE" estão tratados acima/abaixo.
    return null;
  }
  if (/\bURUGUAI\b/.test(n)) return null;
  if (/\bMINAS\b|\bALVORADA\b|\bSALVA\b|\bPREFERIDA\b/.test(n)) return null;

  // FAMÍLIAS DO LOTERIANACIONAL
  // Deu no Poste / PT Rio (PTM, PT, PTV, PTN, Coruja)
  if (
    /\bPT\s*RIO\b|\bPTV\b|\bPTM\b|\bPTN\b|\bCORUJA\b|\bCORUJINHA\b|\bPOSTE\b|\bDEU\s*NO\s*POSTE\b|^\s*PT\b|\bPPT\b/.test(
      n,
    )
  )
    return "POSTE";

  if (/\bAVAL\b|\bPERNAMBUCO\b|^\s*PE\b/.test(n)) return "AVAL_PE";
  if (/\bLOOK\b|\bGOIAS\b|^\s*GO\b/.test(n)) {
    // Boa Sorte GO existe como página separada
    if (/\bBOA[\s-]*SORTE\b|\bBOASORTE\b/.test(n)) return "BOA_SORTE_GO";
    return "LOOK";
  }
  if (/\bNACIONAL\b|^\s*NAC\b/.test(n)) return "NACIONAL";
  if (/\bPOPULAR\b/.test(n)) return "POPULAR_PE";
  if (/\bLOTEP\b|\bPARATODOS.*PB\b|\bPB.*PARATODOS\b|\bPB\s*LOTEP\b/.test(n)) return "LOTEP";
  if (/\bLOTECE\b|\bSONHOS\b|^\s*CE\b/.test(n) && !/PARATODOS/.test(n)) return "LOTECE";
  if (/\bCEARA.*PARATODOS\b|\bCE.*PARATODOS\b|\bPARATODOS.*CE\b/.test(n))
    return "CE_PARATODOS";
  if (/\bPAULISTA\b/.test(n)) return "PAULISTA";
  if (/\bTRADICIONAL\b/.test(n)) return "TRADICIONAL";
  if (/\bSORTE\s*RS\b|\bRS\s*SORTE\b|\bRIO\s*GRANDE\b/.test(n)) return "SORTE_RS";
  if (/\bMONTE\s*CARLOS\b|\bMONTECLAROS\b|\bNORDESTE\b/.test(n)) return "MONTE_CARLOS";
  if (/\bABAESE\b|\bITABAIANA\b/.test(n)) return "ABAESE";
  if (/\bALIANCA\b|\bALIAN[CÇ]A\b/.test(n)) return "ALIANCA";
  if (/\bCAMINHO\b/.test(n)) return "CAMINHO";

  return null;
}

/**
 * Converte um texto de horário ("9h20min", "11 horas", "15h45") em "HH:MM".
 * Retorna null se não conseguir.
 */
function parseHoraMin(s: string): string | null {
  // Tenta primeiro o formato HHhMM/HHhMMmin
  const m1 = s.match(/(\d{1,2})\s*h\s*(\d{2})/i);
  if (m1) {
    const h = parseInt(m1[1] ?? "0", 10);
    const mi = parseInt(m1[2] ?? "0", 10);
    return `${String(h).padStart(2, "0")}:${String(mi).padStart(2, "0")}`;
  }
  // Depois "NN horas" (sem minutos)
  const m2 = s.match(/(\d{1,2})\s*horas?/i);
  if (m2) {
    const h = parseInt(m2[1] ?? "0", 10);
    return `${String(h).padStart(2, "0")}:00`;
  }
  // Apenas "NNhMM" sem o "min" — quando o "h" é o separador
  const m3 = s.match(/(\d{1,2})\s*[hH]\s*(\d{1,2})/);
  if (m3) {
    const h = parseInt(m3[1] ?? "0", 10);
    const mi = parseInt(m3[2] ?? "0", 10);
    return `${String(h).padStart(2, "0")}:${String(mi).padStart(2, "0")}`;
  }
  return null;
}

/** Bicho → milhar (4) + grupo (2). Retorna null se inválido. */
function lerBicho(html: string): { milhar: string; grupo: string } | null {
  const m1 = html.match(/<span\s+class="milhar">\s*(\d{1,4})\s*</i);
  const m2 = html.match(/<span\s+class="bola-numero">\s*(\d{1,2})\s*</i);
  if (!m1 || !m2) return null;
  const milhar = (m1[1] ?? "").padStart(4, "0");
  const grupo = (m2[1] ?? "").padStart(2, "0");
  if (!/^\d{4}$/.test(milhar) || !/^\d{2}$/.test(grupo)) return null;
  const g = parseInt(grupo, 10);
  if (g < 1 || g > 25) return null;
  return { milhar, grupo };
}

/** Lê o `<p>...DD/MM/YYYY</p>` que aparece dentro do bloco da extração. */
function lerDataDoBloco(blocoHtml: string): string | null {
  const m = blocoHtml.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (!m) return null;
  const d = (m[1] ?? "").padStart(2, "0");
  const mm = (m[2] ?? "").padStart(2, "0");
  let y = m[3] ?? "";
  if (y.length === 2) y = `20${y}`;
  return `${d}/${mm}/${y}`;
}

const cacheHtml = new Map<string, { html: string; ts: number }>();
const HTML_TTL_MS = 30 * 1000; // 30s — fonte atualiza rápido após sorteio

async function fetchHtml(path: string): Promise<string> {
  const url = `${BASE}${path}`;
  const cached = cacheHtml.get(path);
  if (cached && Date.now() - cached.ts < HTML_TTL_MS) return cached.html;
  const r = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
      Accept: "text/html",
    },
    cache: "no-store",
  });
  if (!r.ok) throw new Error(`loterianacional HTTP ${r.status} em ${path}`);
  const html = await r.text();
  cacheHtml.set(path, { html, ts: Date.now() });
  return html;
}

/**
 * Parseia a página inteira. Devolve um mapa "DD/MM/YYYY|HH:MM" → resultado.
 *
 * Cada bloco "Sorteio" pode aparecer mais de uma vez se a página acumular dias;
 * mantemos somente o mais completo por (data, horário).
 */
function parsePagina(html: string, path: string): Map<string, ResultadoExterno> {
  const out = new Map<string, ResultadoExterno>();
  // Cada bloco começa em um "Sorteio ..." e termina antes do próximo "Sorteio"
  // ou no fim do container. Usamos o `<h4>...</h4>` como âncora e fatiamos
  // até o próximo `<h4>` ou final.
  const partes = html.split(/<h4>/i);
  for (let i = 1; i < partes.length; i++) {
    const bloco = "<h4>" + (partes[i] ?? "");
    const hMatch = bloco.match(/<h4>\s*([^<]*?)\s*<\/h4>/i);
    if (!hMatch) continue;
    const tituloH4 = hMatch[1] ?? "";
    const hora = parseHoraMin(tituloH4);
    if (!hora) continue;
    const data = lerDataDoBloco(bloco);
    if (!data) continue;

    // Extrair todos os bichos do bloco até onde acabar (max 10).
    const premios: Record<number, string> = {};
    let milhar1: string | undefined;
    const bichoRe = /<div\s+class="bicho-individual">[\s\S]*?<\/div>/gi;
    for (const bichoMatch of bloco.matchAll(bichoRe)) {
      const trecho = bichoMatch[0];
      const posM = trecho.match(/<span\s+class="numero-individual">\s*(\d{1,2})/i);
      if (!posM) continue;
      const pos = parseInt(posM[1] ?? "0", 10);
      if (pos < 1 || pos > 10) continue;
      const b = lerBicho(trecho);
      if (!b) continue;
      premios[pos] = b.milhar;
      if (pos === 1) milhar1 = b.milhar;
    }
    if (Object.keys(premios).length === 0) continue;

    const chave = `${data}|${hora}`;
    const atual = out.get(chave);
    if (atual && Object.keys(atual.premios).length >= Object.keys(premios).length) {
      continue;
    }
    out.set(chave, {
      premios,
      milhar1,
      fonte: `loterianacional${path}#${data}:${hora}`,
    });
  }
  return out;
}

/**
 * Resolve a página do loterianacional para uma extração + encerra (HH:MM).
 * Retorna `null` se a banca é uma das que devem ir pelo feiticeira (Paratodos
 * Bahia, Federal, Maluca BA, LBR, PT SP, etc.), ou se não conseguimos
 * identificar a família.
 */
export function resolverFamiliaLotNac(
  nome: string,
  _encerra: string,
): { familia: FamiliaLN; path: string } | null {
  const fam = identificarFamilia(nome);
  if (!fam) return null;
  return { familia: fam, path: PATHS[fam] };
}

/**
 * Extrai o horário de uma extração. Prefere o horário que aparece no NOME
 * (ex.: "LOOK GOIAS 07:20" → 07:20), porque alguns cadastros antigos têm
 * `encerra` desalinhado (07:00) em relação ao horário real do sorteio (07:20).
 * Se o nome não tiver horário, cai no `encerra`.
 */
function horarioReal(nome: string, encerra: string): { hh: string; mm: string } | null {
  // No nome: aceita "HH:MM" ou "HHhMM"
  const fromNome = (nome ?? "").match(/(\d{1,2})\s*[:h]\s*(\d{2})/);
  const fromEnc = (encerra ?? "").match(/(\d{1,2}):(\d{2})/);
  const src = fromNome ?? fromEnc;
  if (!src) return null;
  const hh = (src[1] ?? "").padStart(2, "0");
  const mm = (src[2] ?? "").padStart(2, "0");
  if (parseInt(hh, 10) > 23 || parseInt(mm, 10) > 59) return null;
  return { hh, mm };
}

/** Faz a busca completa de uma extração. Devolve null se nada bater. */
export async function buscarPorLoteriaNacional(
  nome: string,
  encerra: string,
): Promise<ResultadoExterno | null> {
  const resolved = resolverFamiliaLotNac(nome, encerra);
  if (!resolved) return null;
  const html = await fetchHtml(resolved.path);
  const mapa = parsePagina(html, resolved.path);
  if (mapa.size === 0) return null;

  const horario = horarioReal(nome, encerra);
  if (!horario) return null;
  const { hh, mm } = horario;

  // Data alvo: HOJE em BRT no formato DD/MM/YYYY
  const dataAlvo = dataBrt();
  const chaveExata = `${dataAlvo}|${hh}:${mm}`;
  const exata = mapa.get(chaveExata);
  if (exata) return exata;

  // Tolerância por família: o site pode publicar com horário levemente
  // diferente do que o sistema chama de "encerra".
  //   - Família POSTE (Deu no Poste / PT Rio): o site usa apenas a hora
  //     cheia (11h, 14h, 16h, 18h, 21h), enquanto nossas extrações são
  //     11:20, 14:20, 16:20… → toleramos 30 minutos.
  //   - Demais: 6 minutos (evita pegar sorteio das 14h pra extração 15:45).
  const tolerancia = resolved.familia === "POSTE" ? 30 : 6;

  const horaMin = parseInt(hh, 10) * 60 + parseInt(mm, 10);
  let melhor: { r: ResultadoExterno; diff: number } | null = null;
  for (const [chave, r] of mapa) {
    const [d, hm] = chave.split("|");
    if (d !== dataAlvo) continue;
    const m = (hm ?? "").match(/(\d{2}):(\d{2})/);
    if (!m) continue;
    const candMin = parseInt(m[1] ?? "0", 10) * 60 + parseInt(m[2] ?? "0", 10);
    const diff = Math.abs(candMin - horaMin);
    if (diff > tolerancia) continue;
    if (!melhor || diff < melhor.diff) melhor = { r, diff };
  }
  return melhor?.r ?? null;
}

function dataBrt(): string {
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
  const parts: Record<string, string> = {};
  for (const p of fmt.formatToParts(new Date())) {
    if (p.type !== "literal") parts[p.type] = p.value;
  }
  return `${parts.day}/${parts.month}/${parts.year}`;
}
