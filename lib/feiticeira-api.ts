/**
 * Cliente para a API privada do "feiticeira.club" (plataforma Trivo/Dashapp).
 *
 * Por que existe: a fonte pública (playbicho.com / jogodobicho.inf.br) entrega
 * só 1º ao 5º prêmio para a maioria das bancas e atualiza com atraso. A banca
 * online publica os 10 prêmios em tempo real. Como o usuário já tem um login
 * nessa banca, fazemos as chamadas autenticadas em nome dele.
 *
 * Tudo é server-side (precisa do `crypto` do Node). NÃO importar no browser.
 *
 * Pipeline:
 *   1) POST /online/auth/v2/login                  → JWT (1h) + UUID (TOKEN)
 *   2) GET  /online/getBancaData?TOKEN=...         → catálogo de SLOTERIAS
 *   3) GET  /online/getResultadoNew2?loteria[]=... → resultados (10 prêmios)
 *
 * Toda resposta vem como `base64({iv,value})` cifrada em AES-256-CBC. A chave
 * é a mesma usada pelo bundle JS deles (publica no código frontend).
 *
 * O JWT é cacheado em /tmp/feiticeira-jwt.json para sobreviver entre invocações
 * sem precisar logar a cada chamada do cron.
 */

import crypto from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

const API_BASE = "https://api.dashapp.app/api";
const APP_HEADERS = {
  Authorization: "Bearer a432f8536d4dadef32e9795bef1c2aefb2eb3e72",
  Accept: "application/json",
  "Content-Type": "application/json",
  "User-Agent":
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
  Origin: "https://app.feiticeira.club",
  Referer: "https://app.feiticeira.club/",
} as const;

// Chave AES-256-CBC extraída do bundle JS público em https://app.feiticeira.club
// (cryptoUtils.getKey() = Base64 -> 32 bytes).
const AES_KEY = Buffer.from(
  "Ua0J7B6eGCjF8SQD2wSleFmtI3LJlDY3+Wgy+ATaL14=",
  "base64",
);

const TOKEN_CACHE_FILE = "/tmp/feiticeira-jwt.json";
// Margem de segurança: renova o token 5 min antes de expirar.
const TOKEN_REFRESH_MARGIN_MS = 5 * 60 * 1000;

/** Resultado decifrado de uma extração da banca. */
export interface FeiticeiraResultado {
  /** idLoteria do feiticeira (ex.: 85 = BAHIA 10HS). */
  idLoteria: number;
  /** Mapa pos→milhar4 (1..10). */
  premios: Record<number, string>;
  /** Grupo (2 dígitos) por posição (1..10). */
  grupos: Record<number, string>;
}

interface CachedToken {
  jwt: string;
  uuid: string;
  exp: number; // epoch ms
}

interface SLoteria {
  id: number;
  codigo_loteria: string;
  alias: string;
  id_jogotipo?: number;
}

interface CachedCatalogo {
  loterias: SLoteria[];
  expira: number;
}

let catalogoMem: CachedCatalogo | null = null;

/** Decifra payload `base64({iv,value})` AES-256-CBC com a chave do bundle. */
function decryptPayload(payload: string): string {
  const raw = Buffer.from(payload.trim().replace(/^"|"$/g, ""), "base64");
  const obj = JSON.parse(raw.toString("utf8")) as { iv: string; value: string };
  const iv = Buffer.from(obj.iv, "base64");
  const ciphertext = Buffer.from(obj.value, "base64");
  const decipher = crypto.createDecipheriv("aes-256-cbc", AES_KEY, iv);
  const plain = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plain.toString("utf8");
}

/**
 * O backend deles serializa a resposta como PHP-serialize antes de criptografar.
 * Para o nosso uso, todas as respostas relevantes vêm como uma string PHP
 * `s:N:"<JSON>";` — basta extrair o JSON interno.
 */
function parsePhpString(plain: string): unknown {
  // Casos: i:0; (erro), N; (null), s:N:"..."; (string)
  const t = plain.trim();
  if (t === "i:0;" || t === "N;" || t === "b:0;") return null;
  const m = t.match(/^s:\d+:"([\s\S]*)";\s*$/);
  if (m) {
    const inner = m[1] ?? "";
    try {
      return JSON.parse(inner);
    } catch {
      return inner;
    }
  }
  return null;
}

/** Decodifica o JWT (sem validar assinatura) só pra ler `exp`. */
function jwtExpMs(jwt: string): number {
  const parts = jwt.split(".");
  if (parts.length < 2) return 0;
  try {
    const body = Buffer.from(
      (parts[1] ?? "").replace(/-/g, "+").replace(/_/g, "/"),
      "base64",
    ).toString("utf8");
    const obj = JSON.parse(body) as { exp?: number };
    return (obj.exp ?? 0) * 1000;
  } catch {
    return 0;
  }
}

async function lerCacheToken(): Promise<CachedToken | null> {
  try {
    const txt = await fs.readFile(TOKEN_CACHE_FILE, "utf8");
    const cached = JSON.parse(txt) as CachedToken;
    if (
      typeof cached.jwt === "string" &&
      typeof cached.uuid === "string" &&
      typeof cached.exp === "number"
    ) {
      return cached;
    }
  } catch {}
  return null;
}

async function escreverCacheToken(t: CachedToken): Promise<void> {
  try {
    await fs.writeFile(TOKEN_CACHE_FILE, JSON.stringify(t), { mode: 0o600 });
  } catch {}
}

/** Garante um token JWT válido. Reutiliza cache em /tmp; renova quando perto de expirar. */
async function obterToken(): Promise<CachedToken> {
  const cached = await lerCacheToken();
  if (cached && cached.exp - Date.now() > TOKEN_REFRESH_MARGIN_MS) {
    return cached;
  }

  const login = (process.env.FEITICEIRA_LOGIN ?? "").trim();
  const senha = process.env.FEITICEIRA_PASSWORD ?? "";
  const slug = (process.env.FEITICEIRA_SLUG ?? "rei-do-bicho").trim();

  if (!login || !senha) {
    throw new Error(
      "Credenciais do feiticeira ausentes (FEITICEIRA_LOGIN/PASSWORD).",
    );
  }

  const body = {
    login: login.replace(/\D/g, ""),
    password: senha,
    slug,
    fingerprint: "premiacoes-admin",
    SERIAL: "web",
    VERSAO: 7.9,
  };
  const resp = await fetch(`${API_BASE}/online/auth/v2/login`, {
    method: "POST",
    headers: APP_HEADERS,
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (!resp.ok) {
    throw new Error(`Login feiticeira falhou: HTTP ${resp.status}`);
  }
  const txt = await resp.text();
  const plain = decryptPayload(txt);
  // Resposta é PHP-serialize de um array. Em vez de parser completo,
  // extraímos via regex os campos críticos — é robusto enquanto a estrutura
  // se mantém estável.
  const jwtMatch = plain.match(/"access_token";s:\d+:"([^"]+)"/);
  const uuidMatch = plain.match(/"uuid";s:\d+:"(\d+)"/);
  if (!jwtMatch || !uuidMatch) {
    throw new Error("Resposta de login inesperada (sem access_token/uuid)");
  }
  const jwt = jwtMatch[1] ?? "";
  const uuid = uuidMatch[1] ?? "";
  const exp = jwtExpMs(jwt) || Date.now() + 50 * 60 * 1000;
  const tok: CachedToken = { jwt, uuid, exp };
  await escreverCacheToken(tok);
  return tok;
}

/**
 * Catálogo SLOTERIAS — id → alias/codigo_loteria.
 * Cacheado em memória por 1 hora (raríssimo mudar; mesmo se mudar, perdemos
 * só uma janela curta de extrações novas).
 */
export async function obterCatalogoLoterias(): Promise<SLoteria[]> {
  if (catalogoMem && catalogoMem.expira > Date.now()) {
    return catalogoMem.loterias;
  }
  const tok = await obterToken();
  const url = new URL(`${API_BASE}/online/getBancaData`);
  url.searchParams.set("TOKEN", tok.uuid);
  url.searchParams.set("VERSAO", "7.9");
  const resp = await fetch(url, {
    headers: { ...APP_HEADERS, Authorization: `Bearer ${tok.jwt}` },
    cache: "no-store",
  });
  if (!resp.ok) throw new Error(`getBancaData HTTP ${resp.status}`);
  const plain = decryptPayload(await resp.text());
  const parsed = parsePhpString(plain) as
    | { SLOTERIAS?: SLoteria[] }
    | null;
  const loterias = parsed?.SLOTERIAS ?? [];
  catalogoMem = { loterias, expira: Date.now() + 60 * 60 * 1000 };
  return loterias;
}

/**
 * Busca os resultados de UMA OU MAIS loterias para uma data.
 *
 * @param ids    IDs das loterias (do catálogo SLOTERIAS).
 * @param dataYmd Data no formato YYYY-MM-DD (fuso BRT).
 * @returns Mapa idLoteria → {premios, grupos}.
 */
export async function obterResultadosFeiticeira(
  ids: number[],
  dataYmd: string,
): Promise<Map<number, FeiticeiraResultado>> {
  const out = new Map<number, FeiticeiraResultado>();
  if (!ids.length) return out;
  const tok = await obterToken();
  const url = new URL(`${API_BASE}/online/getResultadoNew2`);
  url.searchParams.set("TOKEN", tok.uuid);
  url.searchParams.set("VERSAO", "7.9");
  url.searchParams.set("SERIAL", "WEB");
  url.searchParams.set("datam", dataYmd);
  for (const id of ids) {
    // O frontend envia id com zero-padding 2; mas o backend aceita string
    // numérica simples (testado). Mantemos o padding para sermos fiéis.
    url.searchParams.append("loteria[]", String(id).padStart(2, "0"));
  }
  const resp = await fetch(url, {
    headers: { ...APP_HEADERS, Authorization: `Bearer ${tok.jwt}` },
    cache: "no-store",
  });
  if (!resp.ok) throw new Error(`getResultadoNew2 HTTP ${resp.status}`);
  const plain = decryptPayload(await resp.text());
  const parsed = parsePhpString(plain) as
    | { status?: number; DATA?: unknown[] }
    | null;
  if (!parsed || parsed.status !== 1 || !Array.isArray(parsed.DATA)) {
    return out;
  }

  // O array DATA é "achatado" em blocos de 3 elementos:
  //   [indice, idLoteria, "1-MILHAR-GRUPO-2-MILHAR-GRUPO-..."]
  // O frontend usa trivoArray(data, 3) para fatiar. Replicamos isso.
  const data = parsed.DATA;
  for (let i = 0; i + 2 < data.length; i += 3) {
    const idLot = Number(data[i + 1]);
    const tokens = String(data[i + 2] ?? "").split("-");
    // tokens vem como ["1","MILHAR","GRUPO","2","MILHAR","GRUPO",...]
    const premios: Record<number, string> = {};
    const grupos: Record<number, string> = {};
    for (let k = 0; k + 2 < tokens.length; k += 3) {
      const pos = parseInt(tokens[k] ?? "", 10);
      const milharRaw = (tokens[k + 1] ?? "").trim();
      const grupoRaw = (tokens[k + 2] ?? "").trim();
      if (!pos || !milharRaw) continue;
      const milhar = milharRaw.padStart(4, "0");
      const grupo = grupoRaw.padStart(2, "0");
      if (!/^\d{4}$/.test(milhar) || !/^\d{2}$/.test(grupo)) continue;
      premios[pos] = milhar;
      grupos[pos] = grupo;
    }
    if (Object.keys(premios).length === 0) continue;
    if (!Number.isFinite(idLot)) continue;
    out.set(idLot, { idLoteria: idLot, premios, grupos });
  }
  return out;
}

/**
 * Mapeia o NOME de uma extração do nosso sistema (ex.: "PARATODOS BAHIA 21:20",
 * "LBR BRASILIA 20:40") + horário de encerramento para o ID de loteria do
 * feiticeira. Estratégia:
 *
 *   1) Normaliza o nome (remove acentos, caixa baixa) e extrai a HORA cheia.
 *   2) Identifica a "família" (BAHIA, LOOK, PT RIO, PT SP, CAPITAL, MALUCA…)
 *      por palavras-chave.
 *   3) Procura no catálogo a loteria que casa { família, hora }.
 *
 * Notas:
 * - O alias do feiticeira termina em " <HH>HS" — esse HH é a hora cheia da
 *   extração (mesmo que o nome do nosso sistema marque, p.ex., 21:20).
 * - Alguns alias têm uma diferença entre `codigo_loteria` e a hora no alias
 *   (ex.: NAC20 → "LT NACIONAL 21HS"). Confiamos no ALIAS, não no codigo.
 */
type Familia =
  | "PT_RIO"
  | "PT_SP"
  | "PT_SP_NOITE"
  | "BAHIA"
  | "BA_MALUCA"
  | "MALUQ_RIO"
  | "MALUQ_FEDERAL"
  | "NACIONAL"
  | "LOOK"
  | "CAPITAL"
  | "LOTEP"
  | "LOTECE"
  | "URUGUAI"
  | "FEDERAL"
  | "BANDEIRANTES"
  | "BOASORTE"
  | "MINAS_ALVORADA"
  | "MINAS_SALV"
  | "MINAS_DIA"
  | "MINAS_NOITE"
  | "MINAS_PREF"
  | "SORTE";

function normalizarNome(s: string): string {
  return (s ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function identificarFamilia(nomeNorm: string, hora: number): Familia | null {
  // Ordem importa: padrões mais específicos primeiro.
  if (/\bMALUQ.*FEDERAL\b/.test(nomeNorm)) return "MALUQ_FEDERAL";
  if (/\bMALUQ.*RIO\b|\bMQ\b/.test(nomeNorm)) return "MALUQ_RIO";
  if (/\bBA[\s-]*MALUCA\b|\bMALUCA[\s-]*BA\b|\bMALUCA\b/.test(nomeNorm))
    return "BA_MALUCA";
  if (/\bPARATODOS[\s-]*BAHIA\b|\bBAHIA\b|\bPARATODOS[\s-]*BA\b/.test(nomeNorm))
    return "BAHIA";
  if (/\bMINAS.*ALVORADA\b|\bALVORADA\b/.test(nomeNorm)) return "MINAS_ALVORADA";
  if (/\bMINAS.*SALV|^SALVA|MINAS\s*SALV|MINAS\s*SALVA/.test(nomeNorm))
    return "MINAS_SALV";
  if (/\bMINAS.*NOITE\b/.test(nomeNorm)) return "MINAS_NOITE";
  if (/\bMINAS.*PREF|PREFERIDA\b/.test(nomeNorm)) return "MINAS_PREF";
  if (/\bMINAS\b/.test(nomeNorm)) return "MINAS_DIA";
  if (/\bPT\s*SP\b|\bPTSP\b|\bPTN\s*SP\b/.test(nomeNorm)) {
    return hora >= 17 ? "PT_SP_NOITE" : "PT_SP";
  }
  if (
    /\bPT\s*RIO\b|\bPTV\b|\bPTM\b|\bPTN\b|\bCORUJA\b|\bCOR\b|^\s*PT\b/.test(
      nomeNorm,
    )
  )
    return "PT_RIO";
  if (/\bNACIONAL\b|\bNAC\b/.test(nomeNorm)) return "NACIONAL";
  if (/\bLOOK\b|\bGOIAS\b|\bGO\b/.test(nomeNorm)) return "LOOK";
  if (/\bLBR\b|\bBRASILIA\b|\bCAPITAL\b/.test(nomeNorm)) return "CAPITAL";
  if (/\bLOTEP\b|\bPARATODOS.*PB\b|\bPB.*PARATODOS\b/.test(nomeNorm)) return "LOTEP";
  if (/\bLOTECE\b|\bCEARA\b|LOTERIA.*SONHO/.test(nomeNorm)) return "LOTECE";
  if (/\bURUGUAI(A)?\b/.test(nomeNorm)) return "URUGUAI";
  if (/\bFEDERAL\b/.test(nomeNorm)) return "FEDERAL";
  if (/\bBANDEIRA|BANDEIRANTES|\bBAND\b/.test(nomeNorm)) return "BANDEIRANTES";
  if (/\bBOA\s*SORTE\b|\bBOASORTE\b/.test(nomeNorm)) return "BOASORTE";
  if (/\bSORTE\b/.test(nomeNorm)) return "SORTE";
  return null;
}

/** Filtra do catálogo a SLoteria que casa com a família + hora cheia. */
function pickLoteria(
  catalogo: SLoteria[],
  familia: Familia,
  hora: number,
): SLoteria | null {
  // Para cada família, palavras que DEVEM aparecer no alias.
  const aliasRules: Record<Familia, RegExp> = {
    PT_RIO: /^LT\s+PT\s+RIO\b/i,
    PT_SP: /^PT\s+SP\b/i,
    PT_SP_NOITE: /^PT\s+SP\b/i,
    BAHIA: /^LT\s+BAHIA\b/i,
    BA_MALUCA: /^LT\s+BA\s+MALUCA\b/i,
    MALUQ_RIO: /^LT\s+MALUQ\s+RIO\b/i,
    MALUQ_FEDERAL: /^LT\s+MALUQ\s+FEDERAL\b/i,
    NACIONAL: /^LT\s+NACIONAL\b/i,
    LOOK: /^LT\s+LOOK\b/i,
    CAPITAL: /^LT\s+CAPITAL\b/i,
    LOTEP: /^LT\s+LOTEP\b/i,
    LOTECE: /^LT\s+LOTECE\b/i,
    URUGUAI: /^LT\s+URUGUAI\b/i,
    FEDERAL: /^LT\s+FEDERAL\b/i,
    BANDEIRANTES: /^LT\s+BAND\b/i,
    BOASORTE: /^LT\s+BOASORTE\b/i,
    MINAS_ALVORADA: /^LT\s+ALVORADA\b/i,
    MINAS_SALV: /^LT\s+MINAS\s+SALV\b/i,
    MINAS_DIA: /^LT\s+MINAS\s+DIA\b/i,
    MINAS_NOITE: /^LT\s+MINAS\s+NOITE\b/i,
    MINAS_PREF: /^LT\s+MINAS\s+PREF\b/i,
    SORTE: /^LT\s+SORTE\b/i,
  };
  const re = aliasRules[familia];
  const candidatos = catalogo.filter((l) => re.test(l.alias));
  if (!candidatos.length) return null;

  // Extrai o número HH do alias (ex.: "LT BAHIA 10HS" → 10). Pega o que estiver
  // mais próximo da hora pedida (tolera diferença de 1h).
  let melhor: { item: SLoteria; diff: number } | null = null;
  for (const c of candidatos) {
    const m = c.alias.match(/(\d{1,2})\s*HS/i);
    if (!m) continue;
    const h = parseInt(m[1] ?? "", 10);
    if (Number.isNaN(h)) continue;
    const diff = Math.abs(h - hora);
    if (diff > 1) continue;
    if (!melhor || diff < melhor.diff) melhor = { item: c, diff };
  }
  return melhor?.item ?? null;
}

/**
 * Resolve a SLoteria do feiticeira que corresponde a uma extração do nosso
 * sistema. Retorna null se não houver correspondência confiável.
 */
export async function resolverLoteriaFeiticeira(
  nomeExtracao: string,
  encerra: string,
): Promise<SLoteria | null> {
  const nomeNorm = normalizarNome(nomeExtracao);
  if (!nomeNorm) return null;
  const m = String(encerra ?? "").match(/(\d{1,2})\s*[:hH]?\s*(\d{2})?/);
  if (!m) return null;
  const hora = parseInt(m[1] ?? "0", 10);
  const familia = identificarFamilia(nomeNorm, hora);
  if (!familia) return null;
  const catalogo = await obterCatalogoLoterias();
  return pickLoteria(catalogo, familia, hora);
}

/** Limpa cache de token (uso em testes/debug). */
export async function _resetarCacheToken(): Promise<void> {
  try {
    await fs.unlink(TOKEN_CACHE_FILE);
  } catch {}
  catalogoMem = null;
}

/** Útil para o endpoint de status / debug. */
export function _tokenCachePath(): string {
  return path.resolve(TOKEN_CACHE_FILE);
}
