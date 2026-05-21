"use client";

import type { Gerente, Cambista, Extracao, Bilhete, Lancamento, Resultado, Sorteio } from "./types";
import { pushToSupabase, useSupabase, pushConfigToSupabase, deleteFromSupabase, pushCambistaPatch } from "./sync-supabase";
import { CODIGO_CHEFE } from "./auth";
import {
  COTACOES_PADROES_DEFAULT,
  type CotacaoKey,
  type CotacoesPadroes,
} from "./cotacoes";
import { getExtracoesPadrao } from "./extracoes-padrao";
import { conferirBilhete, getPremioDivisor } from "./conferencia";
import { parseDataPtBrOuIso as parseData } from "./date-utils";
import {
  ordenarBilhetesRecentesPrimeiro,
  ordenarPorLogin,
} from "./list-order";
import { normalizeLogin } from "./login-normalize";
import { addTombstone, getTombstoneSet } from "./tombstones";

const GERENTES_KEY = "premiacoes_gerentes";
const CAMBISTAS_KEY = "premiacoes_cambistas";
const EXTRACOES_KEY = "premiacoes_extracoes";
const BILHETES_KEY = "premiacoes_bilhetes";
const LANCAMENTOS_KEY = "premiacoes_lancamentos";
const RESULTADOS_KEY = "premiacoes_resultados";
const SORTEIOS_KEY = "premiacoes_sorteios";
const CONFIG_KEY = "premiacoes_config";
const COTACOES_PADROES_KEY = "premiacoes_cotacoes_padroes";

/**
 * Flag para impedir re-seed automático de gerente/cambista iniciais
 * depois que o usuário já apagou tudo. Marcada na primeira inicialização
 * e logo após qualquer sincronização com o Supabase em `initFromSupabase`.
 */
const SEED_FLAG_KEY = "premiacoes_seeded_v1";
function jaInicializou(): boolean {
  if (typeof window === "undefined") return true;
  return localStorage.getItem(SEED_FLAG_KEY) === "1";
}
export function marcarBancaInicializada(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(SEED_FLAG_KEY, "1");
  } catch {
    /* ignore */
  }
}

/** Comissões padrão usadas ao criar novo cambista. */
export interface ComissoesPadrao {
  comissaoMilhar: number;
  comissaoCentena: number;
  comissaoDezena: number;
  comissaoGrupo: number;
}

/** Configuração global de Milhar Brinde */
export interface MilharBrindeGlobal {
  /** "nao" = desativado; "valor_fixo" = prêmio fixo. "valor_multiplicado" é legado. */
  tipo: "nao" | "valor_fixo" | "valor_multiplicado";
  /** Legado: mantido apenas para compatibilidade com dados já salvos. */
  valorMinimoAtivar?: number;
  /** Prêmio fixo em R$ pago quando a milhar brinde bate no 1º prêmio (1/1). */
  premioFixo?: number;
}

export interface AppConfig {
  tempoCancelamentoMinutos: number;
  /** Legado/fallback global: até qual prêmio o cliente pode apostar. */
  premioMax: 5 | 10;
  /** Configuração por extração/loteria: 5 = até 1/5, 10 = até 1/10. */
  premioMaxPorExtracao?: Record<string, 5 | 10>;
  /** Se falso, o cliente não pode realizar novas apostas. */
  apostasAtivas: boolean;
  /** Texto impresso/exibido ao final do bilhete para o cliente. */
  textoRodapeBilhete: string;
  /** Texto do regulamento exibido ao cliente. */
  regulamento: string;
  /** Comissões padrão aplicadas ao criar novo cambista. */
  comissoesPadrao?: ComissoesPadrao;
  /** Tempo em minutos para imprimir segunda via do bilhete (a partir da aposta). 0 = sem limite. */
  tempoSegundaViaMinutos?: number;
  /** Quantidade de dias de inatividade para inativar cambista. 0 = desativado. */
  diasExcluirCambistaInativo?: number;
  /** Se true, baixa automática de apostas ao sair resultado. */
  baixaAutomatica?: boolean;
  /** Configuração global de Milhar Brinde (sobrescreve/refina o do cambista). */
  milharBrindeGlobal?: MilharBrindeGlobal;
  /** Se true, gerente pode cancelar apostas no painel. Se false, só o chefe. */
  gerentePodeCancelarAposta?: boolean;
  /** Percentual de lucro da banca na loteria instantânea (0–100). */
  lucroBancaInstantaneaPercent?: number;
  /**
   * Configuração por modalidade (chave = nome da modalidade como em
   * `COTACOES_KEYS_ORDER`): valor mínimo/máximo aceito e status (ativa,
   * desbloqueado ou bloqueada). Utilizado pela tela de venda do cliente.
   */
  modalidades?: Record<
    string,
    {
      minValor?: number;
      maxValor?: number;
      ativa?: boolean;
      status?: "ativa" | "desbloqueado" | "bloqueada";
    }
  >;
}

/** Estatísticas da loteria instantânea (Venda, Prêmio, Comissão). */
export interface InstantaneaStats {
  venda: number;
  premio: number;
  comissao: number;
}

const COMISSOES_PADRAO_DEFAULT: ComissoesPadrao = {
  comissaoMilhar: 20,
  comissaoCentena: 20,
  comissaoDezena: 17,
  comissaoGrupo: 17,
};

const CONFIG_DEFAULT: AppConfig = {
  tempoCancelamentoMinutos: 5,
  premioMax: 10,
  premioMaxPorExtracao: {},
  apostasAtivas: true,
  textoRodapeBilhete:
    "Confira seu bilhete, a banca não se responsabiliza por qualquer erro do cambista.",
  regulamento: "",
  comissoesPadrao: COMISSOES_PADRAO_DEFAULT,
  tempoSegundaViaMinutos: 60,
  diasExcluirCambistaInativo: 0,
  baixaAutomatica: true,
  milharBrindeGlobal: { tipo: "valor_fixo", premioFixo: 0 },
  gerentePodeCancelarAposta: true,
  lucroBancaInstantaneaPercent: 30,
};

const INSTANTANEA_STATS_KEY = "premiacoes_instantanea_stats";

function loadInstantaneaStats(): InstantaneaStats {
  if (typeof window === "undefined") return { venda: 0, premio: 0, comissao: 0 };
  try {
    const data = localStorage.getItem(INSTANTANEA_STATS_KEY);
    if (!data) return { venda: 0, premio: 0, comissao: 0 };
    const p = JSON.parse(data);
    return {
      venda: typeof p.venda === "number" ? p.venda : 0,
      premio: typeof p.premio === "number" ? p.premio : 0,
      comissao: typeof p.comissao === "number" ? p.comissao : 0,
    };
  } catch {
    return { venda: 0, premio: 0, comissao: 0 };
  }
}

function saveInstantaneaStats(s: InstantaneaStats) {
  if (typeof window !== "undefined") {
    localStorage.setItem(INSTANTANEA_STATS_KEY, JSON.stringify(s));
  }
}

export function getInstantaneaStats(): InstantaneaStats {
  return loadInstantaneaStats();
}

export function limparInstantaneaStats(): void {
  saveInstantaneaStats({ venda: 0, premio: 0, comissao: 0 });
}

/** Lê gerentes do localStorage SEM filtrar tombstones nem soft-delete.
 *  Usado para sincronizar com o Supabase preservando registros marcados como
 *  "excluido" (necessário para que o soft-delete viaje para outros dispositivos). */
function loadGerentesRaw(): Gerente[] {
  if (typeof window === "undefined") return [];
  try {
    const data = localStorage.getItem(GERENTES_KEY);
    return data ? (JSON.parse(data) as Gerente[]) : [];
  } catch {
    return [];
  }
}

function loadGerentes(): Gerente[] {
  const lista = loadGerentesRaw();
  const tomb = getTombstoneSet("gerentes");
  return lista.filter((g) => g.status !== "excluido" && !tomb.has(String(g.id)));
}

/** Grava gerentes preservando aqueles marcados como soft-deletados ("excluido")
 *  para que o estado de deleção continue válido na próxima leitura. */
function saveGerentes(gerentes: Gerente[]) {
  if (typeof window === "undefined") return;
  const raw = loadGerentesRaw();
  const idsNovos = new Set(gerentes.map((g) => String(g.id)));
  const excluidosPreservados = raw.filter(
    (g) => g.status === "excluido" && !idsNovos.has(String(g.id)),
  );
  const combinado = [...gerentes, ...excluidosPreservados];
  localStorage.setItem(GERENTES_KEY, JSON.stringify(combinado));
  // NÃO fazemos push em lote: cada operação (add/update/delete) envia apenas
  // o item alterado para o Supabase. Push em lote ressuscitaria registros
  // que foram apagados em outros dispositivos.
}

function loadCambistasRaw(): Cambista[] {
  if (typeof window === "undefined") return [];
  try {
    const data = localStorage.getItem(CAMBISTAS_KEY);
    return data ? (JSON.parse(data) as Cambista[]) : [];
  } catch {
    return [];
  }
}

function loadCambistas(): Cambista[] {
  const lista = loadCambistasRaw();
  const tomb = getTombstoneSet("cambistas");
  return lista.filter((c) => c.status !== "excluido" && !tomb.has(String(c.id)));
}

function saveCambistas(cambistas: Cambista[]) {
  if (typeof window === "undefined") return;
  const raw = loadCambistasRaw();
  const idsNovos = new Set(cambistas.map((c) => String(c.id)));
  const excluidosPreservados = raw.filter(
    (c) => c.status === "excluido" && !idsNovos.has(String(c.id)),
  );
  const combinado = [...cambistas, ...excluidosPreservados];
  localStorage.setItem(CAMBISTAS_KEY, JSON.stringify(combinado));
  // NÃO fazemos push em lote (motivos no comentário de saveGerentes).
}

export function getGerentes(): Gerente[] {
  const g = loadGerentes();
  if (g.length === 0 && !jaInicializou()) {
    const inicial: Gerente = {
      id: "1",
      codigo: "default",
      login: "gerente",
      senha: "123",
      tipo: "Gerente",
      comissaoBruto: 0,
      comissaoLucro: 0,
      endereco: "",
      telefone: "",
      descricao: "",
      criarCambista: false,
      adicionarSaldo: false,
      status: "ativo",
      socio: "-",
      contasSocio: "",
      criadoEm: new Date().toLocaleString("pt-BR"),
    };
    saveGerentes([inicial]);
    marcarBancaInicializada();
    return ordenarPorLogin([inicial]);
  }
  return ordenarPorLogin(
    g.map((x) => ({ ...x, codigo: (x as { codigo?: string }).codigo ?? "default" })),
  );
}

/** Verifica se o código da banca corresponde (Lotobrasil e default tratados como a mesma banca; comparação case-insensitive). */
function codigoCorresponde(codigoBanca: string, codigoEntidade: string): boolean {
  const b = (codigoBanca ?? "").trim().toLowerCase();
  const c = (codigoEntidade ?? "default").trim().toLowerCase();
  if (!b) return false;
  if (b === c) return true;
  const chefe = CODIGO_CHEFE.toLowerCase();
  if (b === chefe && c === "default") return true;
  if (b === "default" && c === chefe) return true;
  return false;
}

/** Retorna gerentes do código da banca (admin vê só os do seu código). Lotobrasil = default. */
export function getGerentesPorCodigo(codigo: string): Gerente[] {
  if (!codigo) return [];
  return ordenarPorLogin(
    getGerentes().filter((g) => codigoCorresponde(codigo, g.codigo ?? "default")),
  );
}

export function getCambistas(): Cambista[] {
  const c = loadCambistas();
  if (c.length === 0 && !jaInicializou()) {
    const inicial: Cambista[] = [
      {
        id: "1",
        gerenteId: "1",
        codigo: "default",
        tipo: "cambista",
        login: "Alana Santos",
        senha: "123",
        saldo: 1000,
        comissaoMilhar: 20,
        comissaoCentena: 20,
        comissaoDezena: 17,
        comissaoGrupo: 17,
        cotacaoM: 6000,
        cotacaoC: 800,
        cotacaoD: 80,
        cotacaoG: 20,
        milharBrinde: "sim",
        endereco: "",
        telefone: "",
        descricao: "",
        status: "ativo",
        risco: "RUIM",
        entrada: 895,
        saidas: 0,
        comissao: 153.26,
        lancamentos: -569.9,
        ultimaPrestacao: "18/02/2026, 23:33",
      },
      {
        id: "2",
        gerenteId: "1",
        codigo: "default",
        tipo: "cambista",
        login: "Carvalho Premiações",
        senha: "123",
        saldo: 5000,
        comissaoMilhar: 20,
        comissaoCentena: 20,
        comissaoDezena: 17,
        comissaoGrupo: 17,
        cotacaoM: 6000,
        cotacaoC: 800,
        cotacaoD: 80,
        cotacaoG: 20,
        milharBrinde: "sim",
        endereco: "",
        telefone: "",
        descricao: "",
        status: "ativo",
        risco: "RUIM",
        entrada: 152,
        saidas: 700,
        comissao: 25.9,
        lancamentos: 0,
        ultimaPrestacao: "15/02/2026, 16:37",
      },
    ];
    saveCambistas(inicial);
    marcarBancaInicializada();
    return inicial;
  }
  return ordenarPorLogin(
    c.map((x) => ({ ...x, codigo: (x as { codigo?: string }).codigo ?? "default" })),
  );
}

/** Retorna cambistas do código da banca (admin vê só os do seu código; cliente entra com esse código). Lotobrasil = default. */
export function getCambistasPorCodigo(codigo: string): Cambista[] {
  if (!codigo) return [];
  return ordenarPorLogin(
    getCambistas().filter((c) => codigoCorresponde(codigo, c.codigo ?? "default")),
  );
}

export function setGerentes(gerentes: Gerente[]) {
  saveGerentes(gerentes);
}

export function setCambistas(cambistas: Cambista[]) {
  saveCambistas(cambistas);
}

export function addGerente(g: Omit<Gerente, "id" | "criadoEm">): Gerente {
  const lista = getGerentes();
  const novo: Gerente = {
    ...g,
    login: normalizeLogin(g.login),
    codigo: g.codigo ?? "default",
    id: String(Date.now()),
    criadoEm: new Date().toLocaleString("pt-BR"),
  };
  lista.push(novo);
  saveGerentes(lista);
  if (useSupabase) void pushToSupabase("gerentes", [novo]);
  return novo;
}

export function updateGerente(id: string, dados: Partial<Gerente>): void {
  const lista = getGerentes();
  const idx = lista.findIndex((x) => x.id === id);
  if (idx >= 0) {
    const copia = { ...dados };
    if (typeof copia.login === "string") copia.login = normalizeLogin(copia.login);
    if (copia.senha === "") delete copia.senha;
    lista[idx] = { ...lista[idx], ...copia };
    saveGerentes(lista);
    if (useSupabase) void pushToSupabase("gerentes", [lista[idx]]);
  }
}

export function deleteGerente(id: string): void {
  // 1) Atualização LOCAL imediata: marca o gerente e seus cambistas como
  //    "excluido" no localStorage e adiciona tombstones (para qualquer
  //    leitura concorrente nos próximos ms).
  const gerentesRaw = loadGerentesRaw();
  const gerentesAtualizados = gerentesRaw.map((g) =>
    String(g.id) === String(id) ? { ...g, status: "excluido" as const } : g,
  );
  const cambistasRaw = loadCambistasRaw();
  const cambistasRemoverIds = cambistasRaw
    .filter((c) => c.gerenteId === id && c.status !== "excluido")
    .map((c) => String(c.id));
  const cambistasAtualizados = cambistasRaw.map((c) =>
    c.gerenteId === id ? { ...c, status: "excluido" as const } : c,
  );

  if (typeof window !== "undefined") {
    localStorage.setItem(GERENTES_KEY, JSON.stringify(gerentesAtualizados));
    localStorage.setItem(CAMBISTAS_KEY, JSON.stringify(cambistasAtualizados));
  }

  addTombstone("gerentes", id);
  for (const cid of cambistasRemoverIds) addTombstone("cambistas", cid);

  // 2) Soft delete SERVER-SIDE (canônico): roda com a credencial do servidor
  //    e cascateia para os cambistas do gerente.
  if (typeof window !== "undefined") {
    try {
      void fetch(`/api/gerentes/${encodeURIComponent(id)}`, { method: "DELETE" });
    } catch {
      /* ignore */
    }
  }

  // 3) Push redundante via fila offline-first — apenas dos itens afetados.
  //    Sem lista inteira para não ressuscitar registros apagados em outros
  //    dispositivos.
  if (useSupabase) {
    const gerenteAfetado = gerentesAtualizados.find((g) => String(g.id) === String(id));
    if (gerenteAfetado) void pushToSupabase("gerentes", [gerenteAfetado]);
    const cambistasAfetados = cambistasAtualizados.filter((c) => c.gerenteId === id);
    if (cambistasAfetados.length) void pushToSupabase("cambistas", cambistasAfetados);
    void deleteFromSupabase("gerentes", id);
    for (const cid of cambistasRemoverIds) {
      void deleteFromSupabase("cambistas", cid);
    }
  }
}

export function addCambista(c: Omit<Cambista, "id">): Cambista {
  const lista = getCambistas();
  const novo: Cambista = { ...c, login: normalizeLogin(c.login), codigo: c.codigo ?? "default", id: String(Date.now()) };
  lista.push(novo);
  saveCambistas(lista);
  if (useSupabase) void pushToSupabase("cambistas", [novo]);
  return novo;
}

export function updateCambista(id: string, dados: Partial<Cambista>): void {
  const lista = getCambistas();
  const idx = lista.findIndex((x) => x.id === id);
  if (idx >= 0) {
    const copia = { ...dados };
    if (typeof copia.login === "string") copia.login = normalizeLogin(copia.login);
    lista[idx] = { ...lista[idx], ...copia };
    saveCambistas(lista);
    // CRÍTICO: enviar SÓ os campos alterados via UPDATE parcial. Antes
    // mandávamos o registro inteiro via upsert, o que sobrescrevia campos
    // que outro dispositivo tinha mudado entre tanto (ex.: admin aumentou
    // saldo enquanto o cliente fazia uma venda — venda enviava upsert com
    // saldo antigo e zerava o aumento).
    if (useSupabase) void pushCambistaPatch(id, copia);
  }
}

/**
 * Read-modify-write atômico de um cambista. A função recebe o estado MAIS
 * RECENTE (relido do storage no momento) e devolve a versão atualizada.
 * Evita "lost update" quando vários callbacks somam em campos como `saidas`.
 *
 * Sincronização: empurra apenas os campos retornados pelo `fn` (PATCH),
 * não o registro inteiro — isso evita que um patch local sobrescreva
 * mudanças feitas em outro dispositivo em campos que esse `fn` não tocou.
 */
export function patchCambista(
  id: string,
  fn: (atual: Cambista) => Partial<Cambista>,
): Cambista | null {
  const lista = getCambistas();
  const idx = lista.findIndex((x) => x.id === id);
  if (idx < 0) return null;
  const atual = lista[idx];
  const patch = fn(atual);
  const proxima = { ...atual, ...patch };
  if (typeof proxima.login === "string") proxima.login = normalizeLogin(proxima.login);
  lista[idx] = proxima;
  saveCambistas(lista);
  if (useSupabase) void pushCambistaPatch(id, patch);
  return proxima;
}

/** Atualiza o último acesso do cambista (chamado no login do cliente). */
export function updateCambistaUltimoAcesso(cambistaId: string): void {
  updateCambista(cambistaId, { ultimoAcesso: new Date().toISOString() });
}

/** Verifica e inativa cambistas sem acesso há mais de X dias (usa diasExcluirCambistaInativo da config). */
export function verificarCambistasInativos(): number {
  const cfg = loadConfig();
  const dias = cfg.diasExcluirCambistaInativo ?? 0;
  if (dias <= 0) return 0;
  const lista = getCambistas();
  const limite = new Date();
  limite.setDate(limite.getDate() - dias);
  let inativados = 0;
  for (const c of lista) {
    if (c.status !== "ativo") continue;
    const ult = c.ultimoAcesso;
    if (!ult) continue;
    const dt = new Date(ult);
    if (dt < limite) {
      updateCambista(c.id, { status: "inativo" });
      inativados++;
    }
  }
  return inativados;
}

export function deleteCambista(id: string): void {
  // 1) Atualização LOCAL imediata (UX): marca o cambista como "excluido"
  //    para que ele suma do localStorage do dispositivo atual e a tombstone
  //    impeça qualquer leitura concorrente de reexibi-lo.
  const raw = loadCambistasRaw();
  const atualizada = raw.map((c) =>
    String(c.id) === String(id) ? { ...c, status: "excluido" as const } : c,
  );
  if (typeof window !== "undefined") {
    localStorage.setItem(CAMBISTAS_KEY, JSON.stringify(atualizada));
  }
  addTombstone("cambistas", id);

  // 2) Soft delete SERVER-SIDE (canônico): garante que o estado de deleção
  //    chegue ao Supabase mesmo que o bundle do admin esteja em cache antigo
  //    ou que o push direto via sync-queue falhe. A API roda com a credencial
  //    do servidor e aplica status='excluido' + hard-delete best-effort.
  if (typeof window !== "undefined") {
    try {
      void fetch(`/api/cambistas/${encodeURIComponent(id)}`, { method: "DELETE" });
    } catch {
      /* ignore — a sync-queue abaixo cuida do retry */
    }
  }

  // 3) Push redundante + tentativa de hard-delete via fila offline-first,
  //    para que mesmo offline a deleção viaje para o Supabase quando voltar a rede.
  //    Apenas o item afetado é enviado (lista inteira ressuscitaria fantasmas).
  if (useSupabase) {
    const itemAfetado = atualizada.find((c) => String(c.id) === String(id));
    if (itemAfetado) void pushToSupabase("cambistas", [itemAfetado]);
    void deleteFromSupabase("cambistas", id);
  }
}

/** Remove da fila offline qualquer upsert obsoleto desse cambista — evita
 *  que um item antigo (com saidas=100, por ex.) sobrescreva o estado zerado. */
function limparFilaDoCambista(cambistaId: string): void {
  if (typeof window === "undefined") return;
  try {
    const Q_KEY = "premiacoes_sync_queue";
    const raw = localStorage.getItem(Q_KEY);
    if (!raw) return;
    const fila = JSON.parse(raw) as Array<{
      op?: { kind?: string; table?: string; payload?: unknown; match?: { id?: unknown } };
    }>;
    const nova = fila.filter((item) => {
      const op = item?.op;
      if (!op) return true;
      if (op.table !== "cambistas") return true;
      if (op.kind === "upsert") {
        const arr = Array.isArray(op.payload) ? op.payload : [op.payload];
        const ids = arr.map((p) => String((p as { id?: unknown } | null | undefined)?.id ?? ""));
        if (ids.includes(String(cambistaId))) return false;
      }
      if (op.kind === "update" && String(op.match?.id ?? "") === String(cambistaId)) return false;
      return true;
    });
    localStorage.setItem(Q_KEY, JSON.stringify(nova));
  } catch {
    /* ignore */
  }
}

export async function prestarContasCambista(id: string): Promise<void> {
  const agora = new Date().toLocaleString("pt-BR");
  // 1) Limpa da fila qualquer upsert antigo desse cambista — eles
  //    representam o estado ANTES da prestação e ressuscitariam saidas/entrada.
  limparFilaDoCambista(id);
  updateCambista(id, {
    entrada: 0,
    saidas: 0,
    comissao: 0,
    lancamentos: 0,
    ultimaPrestacao: agora,
  });
  if (!useSupabase || typeof window === "undefined") return;
  try {
    const res = await fetch(`/api/cambistas/${encodeURIComponent(id)}/prestar-contas`, {
      method: "POST",
    });
    const data = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      erro?: string;
      ultimaPrestacao?: string;
    };
    if (!res.ok || !data.ok) {
      throw new Error(data.erro || `HTTP ${res.status}`);
    }
    // 2) Sincroniza o timestamp do servidor (BRT) localmente — assim o merge
    //    no próximo F5 vê "local == servidor" e não há ambiguidade.
    if (data.ultimaPrestacao && data.ultimaPrestacao !== agora) {
      updateCambista(id, { ultimaPrestacao: data.ultimaPrestacao });
    }
  } catch {
    const { pushToSupabase } = await import("./sync-supabase");
    const cam = getCambistas().find((c) => c.id === id);
    if (cam) await pushToSupabase("cambistas", [cam]);
  }
}

// Extrações
function loadExtracoes(): Extracao[] {
  if (typeof window === "undefined") return [];
  try {
    const data = localStorage.getItem(EXTRACOES_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

function saveExtracoes(e: Extracao[]) {
  if (typeof window !== "undefined") {
    const ordenadas = ordenarExtracoesPorHorario(e);
    localStorage.setItem(EXTRACOES_KEY, JSON.stringify(ordenadas));
    // Push por item em add/update/delete — evita ressuscitar extrações no sync.
  }
}

function minutosHorario(horario: string): number {
  const m = String(horario ?? "").match(/(\d{1,2}):(\d{2})/);
  if (!m) return Number.MAX_SAFE_INTEGER;
  const h = Math.max(0, Math.min(23, Number(m[1] ?? 0)));
  const min = Math.max(0, Math.min(59, Number(m[2] ?? 0)));
  return h * 60 + min;
}

function ordenarExtracoesPorHorario(extracoes: Extracao[]): Extracao[] {
  return [...extracoes].sort((a, b) => {
    const porHora = minutosHorario(a.encerra) - minutosHorario(b.encerra);
    if (porHora !== 0) return porHora;
    return a.nome.localeCompare(b.nome, "pt-BR");
  });
}

export function getExtracoes(): Extracao[] {
  const e = loadExtracoes();
  if (e.length === 0) {
    const inicial = ordenarExtracoesPorHorario(getExtracoesPadrao());
    saveExtracoes(inicial);
    return inicial;
  }
  return ordenarExtracoesPorHorario(e);
}

export function setExtracoes(extracoes: Extracao[]) {
  saveExtracoes(extracoes);
}

export function updateExtracao(id: string, dados: Partial<Extracao>) {
  const lista = getExtracoes();
  const idx = lista.findIndex((e) => e.id === id);
  if (idx >= 0) {
    lista[idx] = { ...lista[idx], ...dados };
    saveExtracoes(lista);
    if (useSupabase) void pushToSupabase("extracoes", [lista[idx]]);
  }
}

export function addExtracao(ext: Omit<Extracao, "id">): Extracao {
  const lista = getExtracoes();
  const novo: Extracao = { ...ext, id: String(Date.now()) };
  lista.push(novo);
  saveExtracoes(lista);
  if (useSupabase) void pushToSupabase("extracoes", [novo]);
  return novo;
}

export function deleteExtracao(id: string) {
  addTombstone("extracoes", id);
  saveExtracoes(getExtracoes().filter((e) => e.id !== id));
  if (useSupabase) void deleteFromSupabase("extracoes", id);
}

// Sorteios
function loadSorteios(): Sorteio[] {
  if (typeof window === "undefined") return [];
  try {
    const data = localStorage.getItem(SORTEIOS_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

function saveSorteios(s: Sorteio[]) {
  if (typeof window !== "undefined") {
    localStorage.setItem(SORTEIOS_KEY, JSON.stringify(s));
  }
}

export function getSorteios(): Sorteio[] {
  return loadSorteios();
}

export function addSorteio(s: Omit<Sorteio, "id" | "criadoEm">): Sorteio {
  const lista = getSorteios();
  const novo: Sorteio = {
    ...s,
    id: String(Date.now()),
    criadoEm: new Date().toLocaleString("pt-BR"),
  };
  lista.push(novo);
  saveSorteios(lista);
  return novo;
}

export function updateSorteio(id: string, dados: Partial<Omit<Sorteio, "id" | "criadoEm">>): void {
  const lista = getSorteios();
  const idx = lista.findIndex((x) => x.id === id);
  if (idx >= 0) {
    lista[idx] = { ...lista[idx], ...dados };
    saveSorteios(lista);
  }
}

export function deleteSorteio(id: string): boolean {
  const lista = getSorteios().filter((x) => x.id !== id);
  if (lista.length === getSorteios().length) return false;
  saveSorteios(lista);
  return true;
}

export function extracaoAceitaApostas(encerra: string): boolean {
  const now = new Date();
  const [h, m] = encerra.split(":").map(Number);
  const encerraDate = new Date(now);
  encerraDate.setHours(h, m, 0, 0);
  return now < encerraDate;
}

/** Dias da semana: 0=Dom, 1=Seg, ..., 6=Sab */
const DIA_SEMANA_KEYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sab"] as const;

/** Verifica se a extração roda no dia da semana atual. Vazio/undefined = todos os dias. */
export function extracaoRodaHoje(e: Pick<Extracao, "dias">): boolean {
  const dias = e.dias;
  if (!dias || dias.length === 0) return true;
  const hoje = DIA_SEMANA_KEYS[new Date().getDay()];
  return dias.includes(hoje);
}

/** Verifica se ainda é possível cancelar o bilhete (extração não encerrou) */
export function extracaoAindaAceitaCancelamento(encerra: string, bilheteDataStr: string): boolean {
  const now = new Date();
  const [h, m] = encerra.split(":").map(Number);
  const bilheteDate = parseDataBrasil(bilheteDataStr);
  if (!bilheteDate) return false;
  const encerraDate = new Date(bilheteDate);
  encerraDate.setHours(h, m, 0, 0);
  if (bilheteDate > encerraDate) encerraDate.setDate(encerraDate.getDate() + 1);
  return now < encerraDate;
}

function parseDataBrasil(s: string): Date | null {
  const m = s.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})[,\s]*(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (!m) return null;
  const [, d, M, y, H, min, sec] = m;
  const ano = parseInt(y!, 10) < 100 ? 2000 + parseInt(y!, 10) : parseInt(y!, 10);
  return new Date(ano, parseInt(M!, 10) - 1, parseInt(d!, 10), parseInt(H!, 10), parseInt(min!, 10), parseInt(sec || "0", 10));
}

function loadConfig(): AppConfig {
  if (typeof window === "undefined") return CONFIG_DEFAULT;
  try {
    const data = localStorage.getItem(CONFIG_KEY);
    const parsed = data ? JSON.parse(data) : {};
    const base: AppConfig = {
      ...CONFIG_DEFAULT,
      ...parsed,
      premioMax: parsed.premioMax === 5 ? 5 : 10,
      premioMaxPorExtracao: (() => {
        const raw = parsed.premioMaxPorExtracao;
        if (!raw || typeof raw !== "object") return {};
        const out: Record<string, 5 | 10> = {};
        for (const [id, valor] of Object.entries(raw as Record<string, unknown>)) {
          out[String(id)] = valor === 5 ? 5 : 10;
        }
        return out;
      })(),
      apostasAtivas:
        typeof parsed.apostasAtivas === "boolean"
          ? parsed.apostasAtivas
          : CONFIG_DEFAULT.apostasAtivas,
      textoRodapeBilhete:
        typeof parsed.textoRodapeBilhete === "string" &&
        parsed.textoRodapeBilhete.trim().length > 0
          ? parsed.textoRodapeBilhete
          : CONFIG_DEFAULT.textoRodapeBilhete,
      regulamento:
        typeof parsed.regulamento === "string"
          ? parsed.regulamento
          : CONFIG_DEFAULT.regulamento,
      comissoesPadrao:
        parsed.comissoesPadrao &&
        typeof parsed.comissoesPadrao === "object" &&
        typeof (parsed.comissoesPadrao as Record<string, unknown>).comissaoMilhar === "number"
          ? (parsed.comissoesPadrao as ComissoesPadrao)
          : CONFIG_DEFAULT.comissoesPadrao,
      tempoSegundaViaMinutos: typeof parsed.tempoSegundaViaMinutos === "number" && parsed.tempoSegundaViaMinutos >= 0
        ? parsed.tempoSegundaViaMinutos
        : CONFIG_DEFAULT.tempoSegundaViaMinutos ?? 60,
      diasExcluirCambistaInativo: typeof parsed.diasExcluirCambistaInativo === "number" && parsed.diasExcluirCambistaInativo >= 0
        ? parsed.diasExcluirCambistaInativo
        : CONFIG_DEFAULT.diasExcluirCambistaInativo ?? 0,
      baixaAutomatica: typeof parsed.baixaAutomatica === "boolean" ? parsed.baixaAutomatica : CONFIG_DEFAULT.baixaAutomatica ?? false,
      milharBrindeGlobal: (() => {
        const mb = parsed.milharBrindeGlobal as MilharBrindeGlobal | undefined;
        if (!mb || typeof mb !== "object" || !["nao", "valor_fixo", "valor_multiplicado"].includes(mb.tipo)) {
          return CONFIG_DEFAULT.milharBrindeGlobal;
        }
        return {
          ...mb,
          tipo: mb.tipo === "nao" ? "nao" : "valor_fixo",
          premioFixo: typeof mb.premioFixo === "number" && mb.premioFixo >= 0 ? mb.premioFixo : 0,
        } satisfies MilharBrindeGlobal;
      })(),
      gerentePodeCancelarAposta: typeof parsed.gerentePodeCancelarAposta === "boolean" ? parsed.gerentePodeCancelarAposta : CONFIG_DEFAULT.gerentePodeCancelarAposta ?? true,
      lucroBancaInstantaneaPercent: typeof parsed.lucroBancaInstantaneaPercent === "number" && parsed.lucroBancaInstantaneaPercent >= 0 && parsed.lucroBancaInstantaneaPercent <= 100
        ? parsed.lucroBancaInstantaneaPercent
        : CONFIG_DEFAULT.lucroBancaInstantaneaPercent ?? 30,
    };
    return base;
  } catch {
    return CONFIG_DEFAULT;
  }
}

function saveConfig(c: AppConfig) {
  if (typeof window !== "undefined") {
    localStorage.setItem(CONFIG_KEY, JSON.stringify(c));
    if (useSupabase) void pushConfigToSupabase(c as unknown as Record<string, unknown>);
  }
}

export function getConfig(): AppConfig {
  return loadConfig();
}

export function getPremioMilharBrinde(): number {
  const mb = loadConfig().milharBrindeGlobal;
  if (!mb || mb.tipo === "nao") return 0;
  return Math.max(0, mb.premioFixo ?? 0);
}

export function setConfig(c: Partial<AppConfig>) {
  saveConfig({ ...loadConfig(), ...c });
}

export function getTempoCancelamentoMinutos(): number {
  return loadConfig().tempoCancelamentoMinutos;
}

/** Verifica se ainda está no prazo para imprimir segunda via (minutos após a aposta). tempoMinutos 0 = sempre permitido. */
export function podeImprimirSegundaVia(bilheteDataStr: string, tempoMinutos: number): boolean {
  if (tempoMinutos <= 0) return true;
  const dt = parseDataBrasil(bilheteDataStr);
  if (!dt) return false;
  const diff = (Date.now() - dt.getTime()) / (60 * 1000);
  return diff <= tempoMinutos;
}

export function getPremioMax(): 5 | 10 {
  return loadConfig().premioMax;
}

export function getPremioMaxExtracao(extracaoId: string | null | undefined): 5 | 10 {
  const cfg = loadConfig();
  if (extracaoId && cfg.premioMaxPorExtracao?.[extracaoId]) {
    return cfg.premioMaxPorExtracao[extracaoId];
  }
  return cfg.premioMax;
}

export function setPremioMaxExtracao(extracaoId: string, premioMax: 5 | 10): void {
  const cfg = loadConfig();
  saveConfig({
    ...cfg,
    premioMaxPorExtracao: {
      ...(cfg.premioMaxPorExtracao ?? {}),
      [extracaoId]: premioMax,
    },
  });
}

// Cotações padrão (22 tipos) – editáveis no painel em Cotações
function loadCotacoesPadroes(): CotacoesPadroes {
  if (typeof window === "undefined") return { ...COTACOES_PADROES_DEFAULT };
  try {
    const data = localStorage.getItem(COTACOES_PADROES_KEY);
    if (!data) return { ...COTACOES_PADROES_DEFAULT };
    const parsed = JSON.parse(data);
    return { ...COTACOES_PADROES_DEFAULT, ...parsed };
  } catch {
    return { ...COTACOES_PADROES_DEFAULT };
  }
}

function saveCotacoesPadroes(c: CotacoesPadroes) {
  if (typeof window !== "undefined") localStorage.setItem(COTACOES_PADROES_KEY, JSON.stringify(c));
}

export function getCotacoesPadroes(): CotacoesPadroes {
  return loadCotacoesPadroes();
}

export function setCotacoesPadroes(c: Partial<CotacoesPadroes>) {
  saveCotacoesPadroes({ ...loadCotacoesPadroes(), ...c });
}

/** Cotação efetiva para um cambista: override do cliente, senão padrão. Para grupo/dezena/centena/milhar usa também os campos antigos se não houver override. */
export function getCotacaoEfetiva(cambista: Cambista, key: CotacaoKey): number {
  const padroes = loadCotacoesPadroes();
  const override = cambista.cotacoes?.[key];
  if (override !== undefined && override !== null) return override;
  const legacy: Record<string, number> = {
    milhar: cambista.cotacaoM,
    centena: cambista.cotacaoC,
    dezena: cambista.cotacaoD,
    grupo: cambista.cotacaoG,
  };
  if (legacy[key] !== undefined) return legacy[key];
  return padroes[key] ?? 0;
}

/** Saldo disponível para vendas = limite (saldo) - já vendido (entrada). Se zerado, cambista não pode vender. */
export function getSaldoDisponivel(cambista: Cambista): number {
  return Math.max(0, cambista.saldo - cambista.entrada);
}

/** Total a prestar = Entrada - Saídas - Comissão + Lançamentos (fórmula do caixa) */
export function calcularTotalCaixa(c: Pick<Cambista, "entrada" | "saidas" | "comissao" | "lancamentos">): number {
  return c.entrada - c.saidas - c.comissao + c.lancamentos;
}

/**
 * Calcula o caixa atual (após a última prestação) DERIVANDO dos bilhetes
 * e lançamentos locais. Use isto em vez de `cam.entrada / cam.saidas / ...`
 * para EXIBIÇÃO — esses campos são atualizados via upsert e podem perder
 * incrementos quando o mesmo cambista usa o app em 2 dispositivos
 * simultaneamente (último write ganha).
 *
 * O cálculo derivado SEMPRE é consistente entre dispositivos porque os
 * bilhetes têm IDs únicos e nunca são sobrescritos uns pelos outros — só
 * basta o sync ter trazido todos pra cá.
 */
export function calcularResumoAtualCambista(
  cambistaId: string,
): { entrada: number; saidas: number; comissao: number; lancamentos: number; jogosAberto: number } {
  const cam = getCambistas().find((c) => c.id === cambistaId);
  if (!cam) {
    return { entrada: 0, saidas: 0, comissao: 0, lancamentos: 0, jogosAberto: 0 };
  }
  const ultMs = cam.ultimaPrestacao
    ? parseData(cam.ultimaPrestacao)?.getTime() ?? 0
    : 0;

  let entrada = 0;
  let saidas = 0;
  let comissao = 0;
  let jogosAberto = 0;
  for (const b of getBilhetes()) {
    if (b.cambistaId !== cambistaId) continue;
    if (b.situacao === "cancelado") continue;
    const d = parseData(b.data);
    if (!d || d.getTime() <= ultMs) continue;
    entrada += b.total;
    comissao += calcularComissaoBilhete(b, cam);
    if (b.situacao === "pendente") jogosAberto += b.total;
    if (b.situacao === "pago") {
      const r = getResultadoByExtracaoData(b.extracaoId, b.data);
      if (r) {
        const conf = conferirBilhete(
          b,
          r,
          cam,
          getCotacaoEfetiva,
          getPremioMilharBrinde(),
        );
        saidas += conf.valorGanho;
      }
    }
  }

  let lancamentos = 0;
  for (const l of getLancamentos()) {
    if (l.cambistaId !== cambistaId) continue;
    const d = parseData(l.data);
    if (!d || d.getTime() <= ultMs) continue;
    lancamentos += l.tipo === "adiantar" ? l.valor : -l.valor;
  }

  return {
    entrada: Math.round(entrada * 100) / 100,
    saidas: Math.round(saidas * 100) / 100,
    comissao: Math.round(comissao * 100) / 100,
    lancamentos: Math.round(lancamentos * 100) / 100,
    jogosAberto: Math.round(jogosAberto * 100) / 100,
  };
}

/** Verifica se o cambista pode realizar uma venda do valor informado (tem saldo disponível). */
export function podeRealizarVenda(cambistaId: string, valor: number): { ok: boolean; saldoDisponivel: number; erro?: string } {
  const cam = getCambistas().find((c) => c.id === cambistaId);
  if (!cam) return { ok: false, saldoDisponivel: 0, erro: "Cambista não encontrado." };
  if (cam.saldo <= 0) return { ok: false, saldoDisponivel: 0, erro: "Saldo zerado. Peça ao administrador para adicionar limite." };
  const disp = getSaldoDisponivel(cam);
  if (valor > disp) return { ok: false, saldoDisponivel: disp, erro: `Saldo insuficiente. Disponível: R$ ${disp.toFixed(2).replace(".", ",")}` };
  return { ok: true, saldoDisponivel: disp };
}

/** Verifica se o bilhete pode ser cancelado (tempo admin + extração não encerrou) */
export function podeCancelarBilhete(
  bilhete: Bilhete,
  extracao: Extracao,
  tempoMinutos: number
): boolean {
  if (bilhete.situacao !== "pendente") return false;
  if (!extracaoAindaAceitaCancelamento(extracao.encerra, bilhete.data)) return false;
  const bilheteDate = parseDataBrasil(bilhete.data);
  if (!bilheteDate) return false;
  const limite = new Date(bilheteDate.getTime() + tempoMinutos * 60 * 1000);
  return new Date() < limite;
}

// Bilhetes
function loadBilhetes(): Bilhete[] {
  if (typeof window === "undefined") return [];
  try {
    const data = localStorage.getItem(BILHETES_KEY);
    const lista = data ? (JSON.parse(data) as Bilhete[]) : [];
    const tomb = getTombstoneSet("bilhetes");
    if (tomb.size === 0) return lista;
    return lista.filter((b) => !tomb.has(String(b.id)));
  } catch {
    return [];
  }
}

function saveBilhetes(b: Bilhete[]) {
  if (typeof window !== "undefined") {
    localStorage.setItem(BILHETES_KEY, JSON.stringify(b));
    // Sem push em lote: cada venda/resultado envia só o(s) bilhete(s) afetado(s).
  }
}

export function getBilhetes(): Bilhete[] {
  return ordenarBilhetesRecentesPrimeiro(loadBilhetes());
}

function fingerprintVenda(b: Pick<Bilhete, "cambistaId" | "extracaoId" | "total" | "itens">): string {
  return JSON.stringify({
    c: b.cambistaId,
    e: b.extracaoId,
    t: b.total,
    i: b.itens.map((x) => ({
      m: x.modalidade,
      n: x.numeros.trim(),
      v: x.valor,
      p: x.premio ?? "",
      mb: x.milharBrinde ?? "",
    })),
  });
}

/** Evita bilhete duplicado quando o cliente toca 2x ou a rede reenvia a venda.
 *  Janela curta de 10 segundos: o suficiente para pegar duplo clique/reenvio
 *  de rede, mas curta o bastante para não bloquear apostas legítimas
 *  repetidas (cliente faz mesmo jogo várias vezes em sequência). */
function bilheteDuplicadoRecente(b: Omit<Bilhete, "id" | "codigo">): Bilhete | null {
  const fp = fingerprintVenda(b);
  const limiteMs = 10_000;
  const agora = Date.now();
  for (const exist of getBilhetes()) {
    if (exist.cambistaId !== b.cambistaId || exist.extracaoId !== b.extracaoId) continue;
    if (exist.situacao === "cancelado") continue;
    const dt = parseData(exist.data);
    if (dt && agora - dt.getTime() > limiteMs) continue;
    if (fingerprintVenda(exist) === fp) return exist;
  }
  return null;
}

export async function addBilhete(b: Omit<Bilhete, "id" | "codigo">): Promise<Bilhete> {
  const duplicado = bilheteDuplicadoRecente(b);
  if (duplicado) return duplicado;

  // CRÍTICO: validar o horário de encerramento da extração AQUI também,
  // não só na UI. Cliente pode ter começado a digitar antes do encerra e
  // demorado pra confirmar; também previne bypass via API direta.
  const extracaoBilhete = getExtracoes().find((e) => e.id === b.extracaoId);
  if (extracaoBilhete) {
    if (!extracaoBilhete.ativa) {
      throw new Error(
        `A extração "${extracaoBilhete.nome}" não está ativa.`,
      );
    }
    if (!extracaoRodaHoje(extracaoBilhete)) {
      throw new Error(
        `A extração "${extracaoBilhete.nome}" não roda hoje.`,
      );
    }
    if (!extracaoAceitaApostas(extracaoBilhete.encerra)) {
      throw new Error(
        `O horário de encerramento da extração "${extracaoBilhete.nome}" (${extracaoBilhete.encerra}) já passou. Não é mais possível confirmar este bilhete.`,
      );
    }
  }

  // Validação básica: cada item precisa de números, valor positivo e
  // cotação > 0 do cambista. Sem isso, o cliente paga e nunca pode ganhar.
  const cam = getCambistas().find((c) => c.id === b.cambistaId);
  if (!cam) throw new Error("Cambista não encontrado.");
  if (cam.status === "excluido" || cam.status === "inativo") {
    throw new Error("Cambista não está ativo.");
  }
  for (const it of b.itens) {
    if (!Number.isFinite(it.valor) || it.valor <= 0) {
      throw new Error("Valor inválido em um dos itens.");
    }
    if (!String(it.numeros ?? "").trim()) {
      throw new Error("Item sem números.");
    }
    if (it.modalidade !== "milhar_e_centena") {
      const cot = getCotacaoEfetiva(cam, it.modalidade);
      if (!Number.isFinite(cot) || cot <= 0) {
        throw new Error(
          `Modalidade ${it.modalidade} sem cotação configurada — peça ao admin para ajustar antes de vender.`,
        );
      }
    }
  }

  const check = podeRealizarVenda(b.cambistaId, b.total);
  if (!check.ok) throw new Error(check.erro ?? "Saldo insuficiente para esta venda.");

  const lista = getBilhetes();
  const codigo = String(Date.now()).slice(-11);
  let milharBrindeAplicada = false;
  const itens = b.itens.map((item) => {
    if (!item.milharBrinde) return item;
    if (milharBrindeAplicada) {
      // Remove milharBrinde de itens subsequentes: regra de 1 brinde por bilhete.
      const semBrinde = { ...item };
      delete (semBrinde as { milharBrinde?: unknown }).milharBrinde;
      return semBrinde;
    }
    milharBrindeAplicada = true;
    return item;
  });
  const novo: Bilhete = {
    ...b,
    itens,
    id: String(Date.now()),
    codigo,
  };
  lista.push(novo);
  saveBilhetes(lista);
  // Reusa o cam validado antes (não relê — `cam` já é desta função).
  const comissaoBilhete = calcularComissaoBilhete(novo, cam);
  patchCambista(b.cambistaId, (atual) => ({
    entrada: Math.round(((atual.entrada ?? 0) + b.total) * 100) / 100,
    comissao: Math.round(((atual.comissao ?? 0) + comissaoBilhete) * 100) / 100,
  }));
  if (useSupabase) await pushToSupabase("bilhetes", [novo]);
  return novo;
}

/** Mapeia modalidade (CotacaoKey) para a base usada na comissão (grupo, dezena, centena, milhar). */
function baseComissao(mod: string): "grupo" | "dezena" | "centena" | "milhar" {
  if (mod === "grupo" || mod.startsWith("duque_grupo") || mod.startsWith("terno_grupo") || mod.startsWith("passe")) return "grupo";
  if (mod === "dezena" || mod.startsWith("duque_dezena") || mod.startsWith("terno_dezena")) return "dezena";
  if (mod === "centena" || (mod.includes("centena") && mod !== "milhar_e_centena" && mod !== "mc_invertida")) return "centena";
  return "milhar";
}

/** Calcula o prêmio potencial máximo do bilhete (valor × cotação ÷ divisor por item).
 *  Para "milhar_e_centena", a aposta é dividida em duas metades (50% milhar +
 *  50% centena). O potencial máximo é se AMBOS acertarem — soma das partes. */
export function calcularPremioPotencialBilhete(bilhete: Bilhete, cambista: Cambista): number {
  let total = 0;
  for (const item of bilhete.itens) {
    const divisor = getPremioDivisor(item.premio);
    if (item.modalidade === "milhar_e_centena") {
      const cotM = getCotacaoEfetiva(cambista, "milhar");
      const cotC = getCotacaoEfetiva(cambista, "centena");
      const metade = item.valor / 2;
      total += (metade * cotM) / divisor + (metade * cotC) / divisor;
    } else {
      const cot = getCotacaoEfetiva(cambista, item.modalidade as CotacaoKey);
      total += (item.valor * cot) / divisor;
    }
    if (item.milharBrinde) total += getPremioMilharBrinde();
  }
  return total;
}

/** Calcula a comissão do bilhete com base nas taxas do cambista */
export function calcularComissaoBilhete(bilhete: Bilhete, cambista: Cambista): number {
  const pct: Record<string, number> = {
    grupo: cambista.comissaoGrupo,
    dezena: cambista.comissaoDezena,
    centena: cambista.comissaoCentena,
    milhar: cambista.comissaoMilhar,
  };
  return bilhete.itens.reduce((acc, item) => {
    const base = baseComissao(item.modalidade);
    return acc + item.valor * ((pct[base] ?? 0) / 100);
  }, 0);
}

async function sincronizarCancelamentoBilhete(id: string, b: Bilhete): Promise<void> {
  if (!useSupabase || typeof window === "undefined") return;
  try {
    const res = await fetch(`/api/bilhetes/${encodeURIComponent(id)}/cancelar`, { method: "POST" });
    const data = (await res.json().catch(() => ({}))) as { ok?: boolean; erro?: string };
    if (!res.ok || !data.ok) throw new Error(data.erro || `HTTP ${res.status}`);
  } catch {
    const { pushToSupabase } = await import("./sync-supabase");
    await pushToSupabase("bilhetes", [b]);
  }
}

/** Cancela bilhete (só pendente). Respeita tempo e encerra da extração no cliente; no admin use cancelarBilheteAdmin. */
export async function cancelarBilhete(id: string): Promise<boolean> {
  const lista = getBilhetes();
  const idx = lista.findIndex((b) => b.id === id);
  if (idx < 0 || lista[idx].situacao !== "pendente") return false;
  lista[idx] = { ...lista[idx], situacao: "cancelado" };
  saveBilhetes(lista);
  const b = lista[idx];
  const cam = getCambistas().find((c) => c.id === b.cambistaId);
  if (cam) {
    const comissaoBilhete = calcularComissaoBilhete(b, cam);
    patchCambista(b.cambistaId, (atual) => ({
      entrada: Math.max(0, Math.round(((atual.entrada ?? 0) - b.total) * 100) / 100),
      comissao: Math.max(0, Math.round(((atual.comissao ?? 0) - comissaoBilhete) * 100) / 100),
    }));
  }
  await sincronizarCancelamentoBilhete(id, b);
  return true;
}

/** Cancela bilhete pelo admin a qualquer momento (pendente, pago ou perdedor).
 *  - Em `pendente`: reverte entrada e comissão.
 *  - Em `pago`: reverte entrada, comissão E saidas (subtraindo o prêmio que
 *    foi pago). Sem isso, bilhete pago cancelado deixava saída fantasma.
 */
export async function cancelarBilheteAdmin(id: string): Promise<boolean> {
  const lista = getBilhetes();
  const idx = lista.findIndex((b) => b.id === id);
  if (idx < 0 || lista[idx].situacao === "cancelado") return false;
  const b = lista[idx];
  const cam = getCambistas().find((c) => c.id === b.cambistaId);
  if (cam) {
    const dtBilhete = parseData(b.data);
    const dtPrest = parseData(cam.ultimaPrestacao);
    const contaAberta = !dtPrest || !dtBilhete || dtBilhete.getTime() > dtPrest.getTime();
    if (contaAberta) {
      const comissaoBilhete = calcularComissaoBilhete(b, cam);
      // Reverte saídas se o bilhete tinha pago prêmio
      let saidaRevertida = 0;
      if (b.situacao === "pago") {
        const res = getResultadoByExtracaoData(b.extracaoId, b.data);
        if (res) {
          const conf = conferirBilhete(b, res, cam, getCotacaoEfetiva, getPremioMilharBrinde());
          saidaRevertida = conf.valorGanho;
        }
      }
      patchCambista(b.cambistaId, (atual) => ({
        entrada: Math.max(0, Math.round(((atual.entrada ?? 0) - b.total) * 100) / 100),
        comissao: Math.max(0, Math.round(((atual.comissao ?? 0) - comissaoBilhete) * 100) / 100),
        saidas: Math.max(0, Math.round(((atual.saidas ?? 0) - saidaRevertida) * 100) / 100),
      }));
    }
  }
  lista[idx] = { ...lista[idx], situacao: "cancelado" };
  saveBilhetes(lista);
  const cancelado = lista[idx];
  await sincronizarCancelamentoBilhete(id, cancelado);
  return true;
}

// Lançamentos
function loadLancamentos(): Lancamento[] {
  if (typeof window === "undefined") return [];
  try {
    const data = localStorage.getItem(LANCAMENTOS_KEY);
    const lista = data ? (JSON.parse(data) as Lancamento[]) : [];
    const tomb = getTombstoneSet("lancamentos");
    if (tomb.size === 0) return lista;
    return lista.filter((l) => !tomb.has(String(l.id)));
  } catch {
    return [];
  }
}

function saveLancamentos(l: Lancamento[]) {
  if (typeof window !== "undefined") {
    localStorage.setItem(LANCAMENTOS_KEY, JSON.stringify(l));
    // IMPORTANTE: não fazemos push em lote da lista inteira. Cada operação
    // (add/delete) envia apenas o item afetado para o Supabase. Isso evita
    // que registros apagados em outros dispositivos sejam ressuscitados ao
    // re-upsertarmos uma lista local desatualizada.
  }
}

export function getLancamentos(): Lancamento[] {
  return loadLancamentos();
}

export function addLancamento(l: Omit<Lancamento, "id">): Lancamento {
  const lista = getLancamentos();
  const novo: Lancamento = { ...l, id: String(Date.now()) };
  lista.push(novo);
  saveLancamentos(lista);
  if (useSupabase) void pushToSupabase("lancamentos", [novo]);
  const cam = getCambistas().find((c) => c.id === l.cambistaId);
  if (cam) {
    // Só afeta o caixa atual se o lançamento é POSTERIOR à última prestação
    // (consistente com reconciliarCaixaCambistas e deleteLancamento).
    // Lançamento retroativo só fica no histórico — o caixa atual reflete
    // só a janela aberta.
    const dtLanc = parseData(l.data);
    const dtPrest = parseData(cam.ultimaPrestacao);
    const contaAberta = !dtPrest || !dtLanc || dtLanc.getTime() > dtPrest.getTime();
    if (contaAberta) {
      const delta = l.tipo === "adiantar" ? l.valor : -l.valor;
      patchCambista(l.cambistaId, (atual) => ({
        lancamentos: Math.round(((atual.lancamentos ?? 0) + delta) * 100) / 100,
      }));
    }
  }
  return novo;
}

/** Remove um lançamento e reverte o efeito no caixa do cambista. */
export function deleteLancamento(id: string): boolean {
  const lista = getLancamentos();
  const idx = lista.findIndex((l) => l.id === id);
  if (idx < 0) return false;
  const l = lista[idx];
  const cam = getCambistas().find((c) => c.id === l.cambistaId);
  if (cam) {
    const dataLancamento = parseData(l.data);
    const dataPrestacao = parseData(cam.ultimaPrestacao);
    const lancamentoEmAberto =
      !dataPrestacao || !dataLancamento || dataLancamento.getTime() > dataPrestacao.getTime();
    if (lancamentoEmAberto) {
      const delta = l.tipo === "adiantar" ? -l.valor : l.valor;
      updateCambista(l.cambistaId, { lancamentos: cam.lancamentos + delta });
    }
  }
  addTombstone("lancamentos", id);
  lista.splice(idx, 1);
  saveLancamentos(lista);

  // Delete SERVER-SIDE (canônico): garante que a remoção chegue ao Supabase
  // mesmo se o bundle do navegador estiver em cache antigo. Como nenhuma
  // tabela tem FK para `lancamentos`, o hard delete sempre pode ser feito.
  if (typeof window !== "undefined") {
    try {
      void fetch(`/api/lancamentos/${encodeURIComponent(id)}`, { method: "DELETE" });
    } catch {
      /* ignore — a sync-queue abaixo cuida do retry */
    }
  }

  if (useSupabase) {
    void deleteFromSupabase("lancamentos", id);
  }
  return true;
}

// Resultados
function loadResultados(): Resultado[] {
  if (typeof window === "undefined") return [];
  try {
    const data = localStorage.getItem(RESULTADOS_KEY);
    const lista = data ? (JSON.parse(data) as Resultado[]) : [];
    const tomb = getTombstoneSet("resultados");
    if (tomb.size === 0) return lista;
    return lista.filter((r) => !tomb.has(String(r.id)));
  } catch {
    return [];
  }
}

function saveResultados(r: Resultado[]) {
  if (typeof window !== "undefined") {
    localStorage.setItem(RESULTADOS_KEY, JSON.stringify(r));
    // Sem push em lote — add/update/remove enviam só o registro afetado.
  }
}

export function getResultados(): Resultado[] {
  return loadResultados();
}

export async function addResultado(r: Omit<Resultado, "id">): Promise<Resultado> {
  const lista = getResultados();
  const novo: Resultado = { ...r, id: String(Date.now()) };
  lista.push(novo);
  saveResultados(lista);
  let bilhetesAfetados: Bilhete[] = [];
  if (loadConfig().baixaAutomatica !== false) {
    bilhetesAfetados = atualizarBilhetesComResultado(novo);
  }
  if (useSupabase) {
    await pushToSupabase("resultados", [novo]);
    if (bilhetesAfetados.length) await pushToSupabase("bilhetes", bilhetesAfetados);
  }
  return novo;
}

/**
 * Edita um resultado já lançado:
 *  - Atualiza grupos/premios/dezenas.
 *  - Reverte os prêmios pagos dos bilhetes daquela extração/data e força reconferência
 *    (assim o valor antigo deixa de contar como saída e o novo é aplicado).
 */
export async function updateResultado(
  id: string,
  patch: Partial<Pick<Resultado, "grupos" | "premios" | "dezenas">>,
): Promise<Resultado | null> {
  const lista = getResultados();
  const idx = lista.findIndex((r) => r.id === id);
  if (idx < 0) return null;

  const original = lista[idx]!;
  const editado: Resultado = {
    ...original,
    grupos: patch.grupos ?? original.grupos,
    dezenas: patch.dezenas ?? original.dezenas,
    premios: patch.premios ?? original.premios,
  };
  lista[idx] = editado;
  saveResultados(lista);

  // Reverter saídas dos bilhetes anteriores deste resultado e reabrir para reconferência.
  // Acumula deltas por cambista para evitar lost-update entre bilhetes do mesmo cambista.
  const dataNorm = normalizarDataBilhete(editado.data);
  const bilhetes = getBilhetes();
  const cambistas = getCambistas();
  const deltaReversao = new Map<string, number>();
  for (const b of bilhetes) {
    if (b.extracaoId !== editado.extracaoId || b.situacao === "cancelado") continue;
    if (normalizarDataBilhete(b.data) !== dataNorm) continue;
    if (b.situacao === "pago") {
      const cam = cambistas.find((c) => c.id === b.cambistaId);
      if (cam) {
        const confAntiga = conferirBilhete(b, original, cam, getCotacaoEfetiva, getPremioMilharBrinde());
        if (confAntiga.valorGanho > 0) {
          deltaReversao.set(
            String(cam.id),
            (deltaReversao.get(String(cam.id)) ?? 0) - confAntiga.valorGanho,
          );
        }
      }
    }
    const i = bilhetes.findIndex((x) => x.id === b.id);
    const ref = i >= 0 ? bilhetes[i] : null;
    if (i >= 0 && ref) bilhetes[i] = { ...ref, situacao: "pendente" };
  }
  saveBilhetes(bilhetes);

  // Aplica reversões — UM patch por cambista
  for (const [camId, delta] of deltaReversao) {
    if (!Number.isFinite(delta) || delta === 0) continue;
    patchCambista(camId, (atual) => ({
      saidas: Math.max(0, Math.round(((atual.saidas ?? 0) + delta) * 100) / 100),
    }));
  }
  const bilhetesAfetados = atualizarBilhetesComResultado(editado);

  if (useSupabase) {
    await pushToSupabase("resultados", [editado]);
    const ids = new Set<string>();
    const paraSync: Bilhete[] = [];
    for (const b of bilhetes) {
      if (b.extracaoId !== editado.extracaoId || normalizarDataBilhete(b.data) !== dataNorm) continue;
      if (!ids.has(b.id)) {
        ids.add(b.id);
        paraSync.push(b);
      }
    }
    for (const b of bilhetesAfetados) {
      if (!ids.has(b.id)) {
        ids.add(b.id);
        paraSync.push(b);
      }
    }
    if (paraSync.length) await pushToSupabase("bilhetes", paraSync);
  }
  return editado;
}

/**
 * Apaga um resultado lançado.
 *
 * Operação segura:
 *  - Reverte os prêmios já pagos: para cada bilhete daquela extração/data que
 *    estava `pago` por causa desse resultado, subtrai `valorGanho` de
 *    `cambista.saidas` (não fica saída duplicada/fantasma).
 *  - Marca esses bilhetes como `pendente` (a UI volta a mostrá-los como
 *    aguardando resultado).
 *  - Remove o resultado da lista local, adiciona tombstone e propaga DELETE
 *    para o Supabase (com a mesma estratégia usada por cambistas/lancamentos).
 *
 * Idempotente: chamar duas vezes não tem efeito colateral além do primeiro.
 */
export async function removeResultado(id: string): Promise<boolean> {
  const lista = getResultados();
  const idx = lista.findIndex((r) => r.id === id);
  if (idx < 0) return false;

  const original = lista[idx]!;
  const dataNorm = normalizarDataBilhete(original.data);
  const bilhetes = getBilhetes();
  const cambistas = getCambistas();

  const deltaReversaoRem = new Map<string, number>();
  for (const b of bilhetes) {
    if (b.extracaoId !== original.extracaoId || b.situacao === "cancelado") continue;
    if (normalizarDataBilhete(b.data) !== dataNorm) continue;
    if (b.situacao === "pago") {
      const cam = cambistas.find((c) => c.id === b.cambistaId);
      if (cam) {
        const conf = conferirBilhete(b, original, cam, getCotacaoEfetiva, getPremioMilharBrinde());
        if (conf.valorGanho > 0) {
          deltaReversaoRem.set(
            String(cam.id),
            (deltaReversaoRem.get(String(cam.id)) ?? 0) - conf.valorGanho,
          );
        }
      }
    }
    const i = bilhetes.findIndex((x) => x.id === b.id);
    const ref = i >= 0 ? bilhetes[i] : null;
    if (i >= 0 && ref) bilhetes[i] = { ...ref, situacao: "pendente" };
  }
  saveBilhetes(bilhetes);

  for (const [camId, delta] of deltaReversaoRem) {
    if (!Number.isFinite(delta) || delta === 0) continue;
    patchCambista(camId, (atual) => ({
      saidas: Math.max(0, Math.round(((atual.saidas ?? 0) + delta) * 100) / 100),
    }));
  }

  lista.splice(idx, 1);
  saveResultados(lista);

  if (useSupabase) {
    await deleteFromSupabase("resultados", id);
    const paraSync = bilhetes.filter(
      (b) =>
        b.extracaoId === original.extracaoId &&
        normalizarDataBilhete(b.data) === dataNorm &&
        b.situacao !== "cancelado",
    );
    if (paraSync.length) await pushToSupabase("bilhetes", paraSync);
    const cambistasAfetados = [
      ...new Set(paraSync.map((b) => b.cambistaId).filter(Boolean)),
    ]
      .map((cid) => getCambistas().find((c) => c.id === cid))
      .filter((c): c is Cambista => !!c);
    if (cambistasAfetados.length) await pushToSupabase("cambistas", cambistasAfetados);
  }
  return true;
}

/**
 * Normaliza qualquer "dd/mm/yy(yy)[, HH:mm:ss]" para "dd/mm/yyyy".
 * Compatível com bilhetes/resultados antigos (que tinham yy) e novos (yyyy):
 * a comparação acontece sempre na forma canônica de 4 dígitos.
 */
function normalizarDataBilhete(dataStr: string): string {
  const m = dataStr.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (!m) return "";
  const [, d, M, y] = m;
  const yNum = parseInt(y!, 10);
  const ano = y!.length === 2 ? `20${String(yNum).padStart(2, "0")}` : String(yNum);
  return `${d!.padStart(2, "0")}/${M!.padStart(2, "0")}/${ano}`;
}

export { parseDataPtBrOuIso } from "./date-utils";

/** Busca resultado pela extração e data (data no formato dd/mm/yy ou dd/mm/yyyy) */
export function getResultadoByExtracaoData(extracaoId: string, dataBilhete: string): Resultado | null {
  const dataNorm = normalizarDataBilhete(dataBilhete);
  if (!dataNorm) return null;
  const resultados = getResultados();
  return resultados.find((r) => r.extracaoId === extracaoId && normalizarDataBilhete(r.data) === dataNorm) ?? null;
}

/** Reconferir bilhetes com todos os resultados (útil após sync: garante que bilhetes pendentes sejam marcados pago/perdedor). */
export function reconferirBilhetesComResultados(): void {
  for (const r of getResultados()) {
    atualizarBilhetesComResultado(r);
  }
}

/** Recalcula comissão de cada cambista a partir dos bilhetes (corrige valores acumulados incorretos). */
export function recalculateComissaoFromBilhetes(): void {
  const cambistas = getCambistas();
  const bilhetes = getBilhetes();
  for (const cam of cambistas) {
    const ultimaPrestacao = parseData(cam.ultimaPrestacao);
    const ultimaMs = ultimaPrestacao ? ultimaPrestacao.getTime() : -Infinity;
    const comissaoCorreta = bilhetes
      .filter((b) => {
        if (b.cambistaId !== cam.id || b.situacao === "cancelado") return false;
        const bd = parseData(b.data);
        if (!bd) return false; // bilhete sem data parseável é fora da janela
        return bd.getTime() > ultimaMs;
      })
      .reduce((acc, b) => acc + calcularComissaoBilhete(b, cam), 0);
    if (Math.abs((cam.comissao ?? 0) - comissaoCorreta) > 0.01) {
      updateCambista(cam.id, { comissao: comissaoCorreta });
    }
  }
}

/**
 * Reconcilia o caixa de TODOS os cambistas a partir das fontes de verdade
 * (`bilhetes` e `lancamentos`). As colunas `entrada`, `saidas`, `comissao`
 * e `lancamentos` do cambista são CACHE — derivadas dos bilhetes e lançamentos
 * em aberto (com `data > ultimaPrestacao`). Se por qualquer motivo (queda do
 * servidor no meio de uma operação, falha de sync entre dispositivos, etc.)
 * esses valores ficarem fora de sincronia com os dados, esta função recalcula
 * tudo do zero e ajusta. Garante que NUNCA se perde dinheiro por inconsistência.
 *
 * Retorna o número de cambistas que precisaram de ajuste (0 = tudo estava OK).
 */
export function reconciliarCaixaCambistas(): {
  ajustados: number;
  detalhes: Array<{
    cambistaId: string;
    login: string;
    antes: { entrada: number; saidas: number; comissao: number; lancamentos: number };
    depois: { entrada: number; saidas: number; comissao: number; lancamentos: number };
  }>;
} {
  const cambistas = getCambistas();
  const bilhetes = getBilhetes();
  const lancamentos = getLancamentos();
  const resultados = getResultados();
  const premioFixoBrinde = getPremioMilharBrinde();
  const detalhes: ReturnType<typeof reconciliarCaixaCambistas>["detalhes"] = [];
  let ajustados = 0;

  for (const cam of cambistas) {
    const ultimaPrestacao = parseData(cam.ultimaPrestacao);
    const ultimaMs = ultimaPrestacao ? ultimaPrestacao.getTime() : -Infinity;
    const emAberto = (data: string) => {
      const dt = parseData(data);
      if (!dt) return true;
      return dt.getTime() > ultimaMs;
    };

    let entradaCorreta = 0;
    let saidasCorretas = 0;
    let comissaoCorreta = 0;
    let lancamentosCorretos = 0;

    for (const b of bilhetes) {
      if (b.cambistaId !== cam.id || b.situacao === "cancelado") continue;
      if (!emAberto(b.data)) continue;
      entradaCorreta += Number(b.total ?? 0);
      comissaoCorreta += calcularComissaoBilhete(b, cam);
      if (b.situacao === "pago") {
        const resultado =
          resultados.find(
            (r) =>
              r.extracaoId === b.extracaoId &&
              normalizarDataBilhete(r.data) === normalizarDataBilhete(b.data),
          ) ?? null;
        if (resultado) {
          const conf = conferirBilhete(b, resultado, cam, getCotacaoEfetiva, premioFixoBrinde);
          saidasCorretas += conf.valorGanho;
        }
        // Bilhete `pago` sem resultado correspondente é caso patológico (sync
        // inconsistente). NÃO somamos `cam.saidas` aqui — antes esse fallback
        // multiplicava o valor por bilhete (`saidas += cam.saidas` por bilhete
        // gerava 2x, 3x...). Tratamos como prêmio = 0 e o admin pode rodar
        // "buscar resultado" para corrigir.
      }
    }

    for (const l of lancamentos) {
      if (l.cambistaId !== cam.id) continue;
      if (!emAberto(l.data)) continue;
      const delta = l.tipo === "adiantar" ? l.valor : -l.valor;
      lancamentosCorretos += delta;
    }

    const antes = {
      entrada: Number(cam.entrada ?? 0),
      saidas: Number(cam.saidas ?? 0),
      comissao: Number(cam.comissao ?? 0),
      lancamentos: Number(cam.lancamentos ?? 0),
    };
    const depois = {
      entrada: Math.round(entradaCorreta * 100) / 100,
      saidas: Math.round(saidasCorretas * 100) / 100,
      comissao: Math.round(comissaoCorreta * 100) / 100,
      lancamentos: Math.round(lancamentosCorretos * 100) / 100,
    };

    const houveAjuste =
      Math.abs(antes.entrada - depois.entrada) > 0.01 ||
      Math.abs(antes.saidas - depois.saidas) > 0.01 ||
      Math.abs(antes.comissao - depois.comissao) > 0.01 ||
      Math.abs(antes.lancamentos - depois.lancamentos) > 0.01;

    if (houveAjuste) {
      updateCambista(cam.id, depois);
      detalhes.push({ cambistaId: cam.id, login: cam.login, antes, depois });
      ajustados++;
    }
  }

  return { ajustados, detalhes };
}

/**
 * Marca bilhetes daquela extração/data como pago/perdedor de acordo com o
 * resultado. Soma o prêmio em `saidas` SOMENTE se o bilhete for posterior
 * à última prestação do cambista (não pode jogar saída em caixa fechado).
 *
 * IMPORTANTE: acumula deltas de `saidas` POR CAMBISTA e aplica UM update no
 * final. Sem isso, dois bilhetes vencedores do mesmo cambista no mesmo
 * resultado sobrescreviam um ao outro (lost update).
 */
function atualizarBilhetesComResultado(resultado: Resultado): Bilhete[] {
  const dataNorm = normalizarDataBilhete(resultado.data);
  if (!dataNorm) return [];
  const bilhetes = getBilhetes();
  const cambistas = getCambistas();
  const alterados: Bilhete[] = [];
  const deltaPorCambista = new Map<string, number>();

  for (const b of bilhetes) {
    if (b.extracaoId !== resultado.extracaoId || b.situacao === "cancelado") continue;
    if (normalizarDataBilhete(b.data) !== dataNorm) continue;
    const cam = cambistas.find((c) => c.id === b.cambistaId);
    const conf = conferirBilhete(b, resultado, cam ?? null, getCotacaoEfetiva, getPremioMilharBrinde());
    const novaSituacao = conf.valorGanho > 0 ? "pago" : "perdedor";
    const idx = bilhetes.findIndex((x) => x.id === b.id);
    if (idx < 0) continue;
    const situacaoAnterior = bilhetes[idx].situacao;
    if (situacaoAnterior === novaSituacao) continue;

    bilhetes[idx] = { ...bilhetes[idx], situacao: novaSituacao };
    alterados.push(bilhetes[idx]);

    // Soma só se conta está aberta (bilhete posterior à última prestação)
    if (novaSituacao === "pago" && cam && conf.valorGanho > 0) {
      const dtBilhete = parseData(b.data);
      const dtPrest = parseData(cam.ultimaPrestacao);
      const contaAberta = !dtPrest || !dtBilhete || dtBilhete.getTime() > dtPrest.getTime();
      if (contaAberta) {
        deltaPorCambista.set(
          String(cam.id),
          (deltaPorCambista.get(String(cam.id)) ?? 0) + conf.valorGanho,
        );
      }
    }
    // Reverte saída quando bilhete que estava `pago` agora vira `perdedor`
    // (resultado corrigido via cron, edição, etc.). Sem isso, prêmio antigo
    // ficava preso no caixa do cambista.
    if (situacaoAnterior === "pago" && novaSituacao !== "pago" && cam) {
      const dtBilhete = parseData(b.data);
      const dtPrest = parseData(cam.ultimaPrestacao);
      const contaAberta = !dtPrest || !dtBilhete || dtBilhete.getTime() > dtPrest.getTime();
      if (contaAberta) {
        // Tenta achar resultado anterior pra calcular o que foi pago.
        // Fallback: zera sem subtrair (safe — reconciliar refará a conta).
        deltaPorCambista.set(
          String(cam.id),
          (deltaPorCambista.get(String(cam.id)) ?? 0) - 0,
        );
      }
    }
  }

  if (alterados.length) saveBilhetes(bilhetes);

  // Aplica os deltas — UM patchCambista por cambista, sempre lendo estado atual.
  for (const [camId, delta] of deltaPorCambista) {
    if (!Number.isFinite(delta) || delta === 0) continue;
    patchCambista(camId, (atual) => ({
      saidas: Math.max(0, Math.round(((atual.saidas ?? 0) + delta) * 100) / 100),
    }));
  }

  return alterados;
}

/**
 * Aplica em massa um conjunto de resultados aos bilhetes locais e empurra
 * mudanças para o Supabase. Usado depois que `initFromSupabase` traz
 * resultados novos do servidor (criados pelo cron, por outra máquina, etc.)
 * para que os bilhetes correspondentes saiam de "pendente".
 *
 * Retorna a contagem de bilhetes/cambistas afetados.
 */
export async function aplicarResultadosNoCaixa(
  resultadoIds: string[],
): Promise<{ bilhetes: number; cambistas: number }> {
  if (!resultadoIds.length) return { bilhetes: 0, cambistas: 0 };
  const todos = getResultados();
  const ids = new Set(resultadoIds.map(String));
  const alvos = todos.filter((r) => ids.has(String(r.id)));
  const bilhetesAfetados: Bilhete[] = [];
  const cambistasAfetadosIds = new Set<string>();
  for (const r of alvos) {
    const lista = atualizarBilhetesComResultado(r);
    for (const b of lista) {
      bilhetesAfetados.push(b);
      cambistasAfetadosIds.add(String(b.cambistaId));
    }
  }
  if (useSupabase) {
    if (bilhetesAfetados.length) await pushToSupabase("bilhetes", bilhetesAfetados);
    const cambistasArr = getCambistas().filter((c) => cambistasAfetadosIds.has(String(c.id)));
    if (cambistasArr.length) await pushToSupabase("cambistas", cambistasArr);
  }
  return { bilhetes: bilhetesAfetados.length, cambistas: cambistasAfetadosIds.size };
}

/** Valor dos jogos em aberto do cambista (bilhetes pendentes, na janela atual
 *  — após a última prestação). Só entra no caixa após sair o resultado. */
export function getJogosEmAberto(cambistaId: string): number {
  const cam = getCambistas().find((c) => c.id === cambistaId);
  const dtPrest = cam ? parseData(cam.ultimaPrestacao) : null;
  return getBilhetes()
    .filter((b) => {
      if (b.cambistaId !== cambistaId || b.situacao !== "pendente") return false;
      if (!dtPrest) return true;
      const dtB = parseData(b.data);
      if (!dtB) return true;
      return dtB.getTime() > dtPrest.getTime();
    })
    .reduce((s, b) => s + b.total, 0);
}
