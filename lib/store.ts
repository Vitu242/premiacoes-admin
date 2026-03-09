"use client";

import type { Gerente, Cambista, Extracao, Bilhete, ItemBilhete, Lancamento, Resultado, ModalidadeBilhete, Sorteio } from "./types";
import { pushToSupabase, useSupabase, pushConfigToSupabase } from "./sync-supabase";
import { CODIGO_CHEFE } from "./auth";
import {
  COTACOES_PADROES_DEFAULT,
  type CotacaoKey,
  type CotacoesPadroes,
} from "./cotacoes";
import { getExtracoesPadrao } from "./extracoes-padrao";
import { conferirBilhete, getPremioDivisor } from "./conferencia";

const GERENTES_KEY = "premiacoes_gerentes";
const CAMBISTAS_KEY = "premiacoes_cambistas";
const EXTRACOES_KEY = "premiacoes_extracoes";
const BILHETES_KEY = "premiacoes_bilhetes";
const LANCAMENTOS_KEY = "premiacoes_lancamentos";
const RESULTADOS_KEY = "premiacoes_resultados";
const SORTEIOS_KEY = "premiacoes_sorteios";
const CONFIG_KEY = "premiacoes_config";
const COTACOES_PADROES_KEY = "premiacoes_cotacoes_padroes";

/** Comissões padrão usadas ao criar novo cambista. */
export interface ComissoesPadrao {
  comissaoMilhar: number;
  comissaoCentena: number;
  comissaoDezena: number;
  comissaoGrupo: number;
}

/** Configuração global de Milhar Brinde */
export interface MilharBrindeGlobal {
  /** "nao" = desativado; "valor_fixo" = prêmio fixo; "valor_multiplicado" = multiplica o valor apostado */
  tipo: "nao" | "valor_fixo" | "valor_multiplicado";
  /** Valor mínimo da aposta para ativar (quando tipo !== "nao") */
  valorMinimoAtivar?: number;
  /** Prêmio fixo em R$ quando tipo === "valor_fixo" */
  premioFixo?: number;
}

export interface AppConfig {
  tempoCancelamentoMinutos: number;
  /** Até qual prêmio o cliente pode apostar: 5 = só 1/5, 10 = até 1/10 */
  premioMax: 5 | 10;
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
  apostasAtivas: true,
  textoRodapeBilhete:
    "Confira seu bilhete, a banca não se responsabiliza por qualquer erro do cambista.",
  regulamento: "",
  comissoesPadrao: COMISSOES_PADRAO_DEFAULT,
  tempoSegundaViaMinutos: 60,
  diasExcluirCambistaInativo: 0,
  baixaAutomatica: true,
  milharBrindeGlobal: { tipo: "valor_multiplicado", valorMinimoAtivar: 0 },
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

function loadGerentes(): Gerente[] {
  if (typeof window === "undefined") return [];
  try {
    const data = localStorage.getItem(GERENTES_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

function saveGerentes(gerentes: Gerente[]) {
  if (typeof window !== "undefined") {
    localStorage.setItem(GERENTES_KEY, JSON.stringify(gerentes));
    if (useSupabase) void pushToSupabase("gerentes", gerentes);
  }
}

function loadCambistas(): Cambista[] {
  if (typeof window === "undefined") return [];
  try {
    const data = localStorage.getItem(CAMBISTAS_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

function saveCambistas(cambistas: Cambista[]) {
  if (typeof window !== "undefined") {
    localStorage.setItem(CAMBISTAS_KEY, JSON.stringify(cambistas));
    if (useSupabase) {
      void pushToSupabase("gerentes", loadGerentes());
      void pushToSupabase("cambistas", cambistas);
    }
  }
}

export function getGerentes(): Gerente[] {
  const g = loadGerentes();
  if (g.length === 0) {
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
    return [inicial];
  }
  return g.map((x) => ({ ...x, codigo: (x as { codigo?: string }).codigo ?? "default" }));
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
  return getGerentes().filter((g) => codigoCorresponde(codigo, g.codigo ?? "default"));
}

export function getCambistas(): Cambista[] {
  const c = loadCambistas();
  if (c.length === 0) {
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
    return inicial;
  }
  return c.map((x) => ({ ...x, codigo: (x as { codigo?: string }).codigo ?? "default" }));
}

/** Retorna cambistas do código da banca (admin vê só os do seu código; cliente entra com esse código). Lotobrasil = default. */
export function getCambistasPorCodigo(codigo: string): Cambista[] {
  if (!codigo) return [];
  return getCambistas().filter((c) => codigoCorresponde(codigo, c.codigo ?? "default"));
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
    codigo: g.codigo ?? "default",
    id: String(Date.now()),
    criadoEm: new Date().toLocaleString("pt-BR"),
  };
  lista.push(novo);
  saveGerentes(lista);
  return novo;
}

export function updateGerente(id: string, dados: Partial<Gerente>): void {
  const lista = getGerentes();
  const idx = lista.findIndex((x) => x.id === id);
  if (idx >= 0) {
    const copia = { ...dados };
    if (copia.senha === "") delete copia.senha;
    lista[idx] = { ...lista[idx], ...copia };
    saveGerentes(lista);
  }
}

export function deleteGerente(id: string): void {
  const lista = getGerentes().filter((x) => x.id !== id);
  saveGerentes(lista);
  const cambistas = getCambistas().filter((c) => c.gerenteId !== id);
  saveCambistas(cambistas);
}

export function addCambista(c: Omit<Cambista, "id">): Cambista {
  const lista = getCambistas();
  const novo: Cambista = { ...c, codigo: c.codigo ?? "default", id: String(Date.now()) };
  lista.push(novo);
  saveCambistas(lista);
  return novo;
}

export function updateCambista(id: string, dados: Partial<Cambista>): void {
  const lista = getCambistas();
  const idx = lista.findIndex((x) => x.id === id);
  if (idx >= 0) {
    lista[idx] = { ...lista[idx], ...dados };
    saveCambistas(lista);
  }
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
  const lista = getCambistas().filter((x) => x.id !== id);
  saveCambistas(lista);
}

export function prestarContasCambista(id: string): void {
  updateCambista(id, {
    entrada: 0,
    saidas: 0,
    comissao: 0,
    lancamentos: 0,
    ultimaPrestacao: new Date().toLocaleString("pt-BR"),
  });
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
    localStorage.setItem(EXTRACOES_KEY, JSON.stringify(e));
    if (useSupabase) void pushToSupabase("extracoes", e);
  }
}

export function getExtracoes(): Extracao[] {
  const e = loadExtracoes();
  if (e.length === 0) {
    const inicial = getExtracoesPadrao();
    saveExtracoes(inicial);
    return inicial;
  }
  return e;
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
  }
}

export function addExtracao(ext: Omit<Extracao, "id">) {
  const lista = getExtracoes();
  const novo: Extracao = { ...ext, id: String(Date.now()) };
  lista.push(novo);
  saveExtracoes(lista);
  return novo;
}

export function deleteExtracao(id: string) {
  saveExtracoes(getExtracoes().filter((e) => e.id !== id));
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
      milharBrindeGlobal: parsed.milharBrindeGlobal && typeof parsed.milharBrindeGlobal === "object" && ["nao", "valor_fixo", "valor_multiplicado"].includes((parsed.milharBrindeGlobal as MilharBrindeGlobal).tipo)
        ? (parsed.milharBrindeGlobal as MilharBrindeGlobal)
        : CONFIG_DEFAULT.milharBrindeGlobal,
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
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

function saveBilhetes(b: Bilhete[]) {
  if (typeof window !== "undefined") {
    localStorage.setItem(BILHETES_KEY, JSON.stringify(b));
    if (useSupabase) void pushToSupabase("bilhetes", b);
  }
}

export function getBilhetes(): Bilhete[] {
  return loadBilhetes();
}

export async function addBilhete(b: Omit<Bilhete, "id" | "codigo">): Promise<Bilhete> {
  const check = podeRealizarVenda(b.cambistaId, b.total);
  if (!check.ok) throw new Error(check.erro ?? "Saldo insuficiente para esta venda.");

  const lista = getBilhetes();
  const codigo = String(Date.now()).slice(-11);
  const novo: Bilhete = {
    ...b,
    id: String(Date.now()),
    codigo,
  };
  lista.push(novo);
  saveBilhetes(lista);
  const cam = getCambistas().find((c) => c.id === b.cambistaId);
  if (cam) {
    const comissaoBilhete = calcularComissaoBilhete(novo, cam);
    updateCambista(b.cambistaId, {
      entrada: (cam.entrada ?? 0) + b.total,
      comissao: (cam.comissao ?? 0) + comissaoBilhete,
    });
  }
  if (useSupabase) {
    await pushToSupabase("bilhetes", getBilhetes());
    await pushToSupabase("cambistas", getCambistas());
  }
  return novo;
}

/** Mapeia modalidade (CotacaoKey) para a base usada na comissão (grupo, dezena, centena, milhar). */
function baseComissao(mod: string): "grupo" | "dezena" | "centena" | "milhar" {
  if (mod === "grupo" || mod.startsWith("duque_grupo") || mod.startsWith("terno_grupo") || mod.startsWith("passe")) return "grupo";
  if (mod === "dezena" || mod.startsWith("duque_dezena") || mod.startsWith("terno_dezena")) return "dezena";
  if (mod === "centena" || (mod.includes("centena") && mod !== "milhar_e_centena" && mod !== "mc_invertida")) return "centena";
  return "milhar";
}

/** Calcula o prêmio potencial máximo do bilhete (valor × cotação ÷ divisor por item) */
export function calcularPremioPotencialBilhete(bilhete: Bilhete, cambista: Cambista): number {
  let total = 0;
  for (const item of bilhete.itens) {
    const divisor = getPremioDivisor(item.premio);
    if (item.modalidade === "milhar_e_centena") {
      const cotM = getCotacaoEfetiva(cambista, "milhar");
      const cotC = getCotacaoEfetiva(cambista, "centena");
      total += (item.valor * (cotM + cotC) / 2) / divisor;
    } else {
      const cot = getCotacaoEfetiva(cambista, item.modalidade as CotacaoKey);
      total += (item.valor * cot) / divisor;
    }
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

/** Cancela bilhete (só pendente). Respeita tempo e encerra da extração no cliente; no admin use cancelarBilheteAdmin. */
export function cancelarBilhete(id: string): boolean {
  const lista = getBilhetes();
  const idx = lista.findIndex((b) => b.id === id);
  if (idx < 0 || lista[idx].situacao !== "pendente") return false;
  lista[idx] = { ...lista[idx], situacao: "cancelado" };
  saveBilhetes(lista);
  const b = lista[idx];
  const cam = getCambistas().find((c) => c.id === b.cambistaId);
  if (cam) {
    const comissaoBilhete = calcularComissaoBilhete(b, cam);
    updateCambista(b.cambistaId, {
      entrada: Math.max(0, cam.entrada - b.total),
      comissao: Math.max(0, (cam.comissao ?? 0) - comissaoBilhete),
    });
  }
  return true;
}

/** Cancela bilhete pelo admin a qualquer momento (pendente, pago ou perdedor). Em pendente reverte entrada e comissão. */
export function cancelarBilheteAdmin(id: string): boolean {
  const lista = getBilhetes();
  const idx = lista.findIndex((b) => b.id === id);
  if (idx < 0 || lista[idx].situacao === "cancelado") return false;
  const b = lista[idx];
  const cam = getCambistas().find((c) => c.id === b.cambistaId);
  if (b.situacao === "pendente" && cam) {
    const comissaoBilhete = calcularComissaoBilhete(b, cam);
    updateCambista(b.cambistaId, {
      entrada: Math.max(0, (cam.entrada ?? 0) - b.total),
      comissao: Math.max(0, (cam.comissao ?? 0) - comissaoBilhete),
    });
  }
  lista[idx] = { ...lista[idx], situacao: "cancelado" };
  saveBilhetes(lista);
  return true;
}

// Lançamentos
function loadLancamentos(): Lancamento[] {
  if (typeof window === "undefined") return [];
  try {
    const data = localStorage.getItem(LANCAMENTOS_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

function saveLancamentos(l: Lancamento[]) {
  if (typeof window !== "undefined") {
    localStorage.setItem(LANCAMENTOS_KEY, JSON.stringify(l));
    if (useSupabase) void pushToSupabase("lancamentos", l);
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
  const cam = getCambistas().find((c) => c.id === l.cambistaId);
  if (cam) {
    // Lançamento afeta apenas o caixa (lancamentos), não o saldo (limite do cliente).
    // + adiantar: banca mandou dinheiro pro cliente → aumenta total a prestar
    // - retirar: cliente mandou dinheiro pra banca → diminui total a prestar
    const delta = l.tipo === "adiantar" ? l.valor : -l.valor;
    updateCambista(l.cambistaId, {
      lancamentos: cam.lancamentos + delta,
    });
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
    const delta = l.tipo === "adiantar" ? -l.valor : l.valor;
    updateCambista(l.cambistaId, { lancamentos: cam.lancamentos + delta });
  }
  lista.splice(idx, 1);
  saveLancamentos(lista);
  return true;
}

// Resultados
function loadResultados(): Resultado[] {
  if (typeof window === "undefined") return [];
  try {
    const data = localStorage.getItem(RESULTADOS_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

function saveResultados(r: Resultado[]) {
  if (typeof window !== "undefined") {
    localStorage.setItem(RESULTADOS_KEY, JSON.stringify(r));
    if (useSupabase) void pushToSupabase("resultados", r);
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
  if (loadConfig().baixaAutomatica !== false) {
    atualizarBilhetesComResultado(novo);
  }
  if (useSupabase) {
    await pushToSupabase("resultados", getResultados());
    await pushToSupabase("bilhetes", getBilhetes());
    await pushToSupabase("cambistas", getCambistas());
  }
  return novo;
}

/** Data do bilhete "23/02/2026, 12:05:00" -> "23/02/26" */
function normalizarDataBilhete(dataStr: string): string {
  const m = dataStr.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (!m) return "";
  const [, d, M, y] = m;
  const ano = y!.length === 2 ? y : y!.slice(-2);
  return `${d}/${M}/${ano}`;
}

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
    const comissaoCorreta = bilhetes
      .filter((b) => b.cambistaId === cam.id && b.situacao !== "cancelado")
      .reduce((acc, b) => acc + calcularComissaoBilhete(b, cam), 0);
    if (Math.abs((cam.comissao ?? 0) - comissaoCorreta) > 0.01) {
      updateCambista(cam.id, { comissao: comissaoCorreta });
    }
  }
}

/** Ao adicionar resultado, marca bilhetes daquela extração/data como pago ou perdedor. Prêmio pago vira Saída no caixa do cambista. */
function atualizarBilhetesComResultado(resultado: Resultado) {
  const dataNorm = normalizarDataBilhete(resultado.data);
  if (!dataNorm) return;
  const bilhetes = getBilhetes();
  const cambistas = getCambistas();
  let changed = false;
  for (const b of bilhetes) {
    if (b.extracaoId !== resultado.extracaoId || b.situacao !== "pendente") continue;
    if (normalizarDataBilhete(b.data) !== dataNorm) continue;
    const cam = cambistas.find((c) => c.id === b.cambistaId);
    const conf = conferirBilhete(b, resultado, cam ?? null, getCotacaoEfetiva);
    const novaSituacao = conf.valorGanho > 0 ? "pago" : "perdedor";
    const idx = bilhetes.findIndex((x) => x.id === b.id);
    if (idx >= 0) {
      bilhetes[idx] = { ...bilhetes[idx], situacao: novaSituacao };
      changed = true;
      if (novaSituacao === "pago" && cam && conf.valorGanho > 0) {
        updateCambista(b.cambistaId, {
          saidas: (cam.saidas ?? 0) + conf.valorGanho,
        });
      }
    }
  }
  if (changed) saveBilhetes(bilhetes);
}

/** Valor dos jogos em aberto do cambista (bilhetes pendentes, ainda sem resultado). Só entra no caixa após sair o resultado. */
export function getJogosEmAberto(cambistaId: string): number {
  return getBilhetes()
    .filter((b) => b.cambistaId === cambistaId && b.situacao === "pendente")
    .reduce((s, b) => s + b.total, 0);
}
