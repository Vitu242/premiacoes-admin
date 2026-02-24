"use client";

import type { Gerente, Cambista, Extracao, Bilhete, ItemBilhete, Lancamento, Resultado, ModalidadeBilhete } from "./types";
import { pushToSupabase, useSupabase, pushConfigToSupabase } from "./sync-supabase";
import { CODIGO_CHEFE } from "./auth";
import {
  COTACOES_PADROES_DEFAULT,
  type CotacaoKey,
  type CotacoesPadroes,
} from "./cotacoes";
import { getExtracoesPadrao } from "./extracoes-padrao";
import { conferirBilhete } from "./conferencia";

const GERENTES_KEY = "premiacoes_gerentes";
const CAMBISTAS_KEY = "premiacoes_cambistas";
const EXTRACOES_KEY = "premiacoes_extracoes";
const BILHETES_KEY = "premiacoes_bilhetes";
const LANCAMENTOS_KEY = "premiacoes_lancamentos";
const RESULTADOS_KEY = "premiacoes_resultados";
const CONFIG_KEY = "premiacoes_config";
const COTACOES_PADROES_KEY = "premiacoes_cotacoes_padroes";

export interface AppConfig {
  tempoCancelamentoMinutos: number;
  /** Até qual prêmio o cliente pode apostar: 5 = só 1/5, 10 = até 1/10 */
  premioMax: 5 | 10;
}

const CONFIG_DEFAULT: AppConfig = { tempoCancelamentoMinutos: 5, premioMax: 10 };

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
      criadoEm: new Date().toLocaleString("pt-BR"),
    };
    saveGerentes([inicial]);
    return [inicial];
  }
  return g.map((x) => ({ ...x, codigo: (x as { codigo?: string }).codigo ?? "default" }));
}

/** Verifica se o código da banca corresponde (Lotobrasil e default tratados como a mesma banca). */
function codigoCorresponde(codigoBanca: string, codigoEntidade: string): boolean {
  const c = codigoEntidade ?? "default";
  if (c === codigoBanca) return true;
  if (codigoBanca === CODIGO_CHEFE && c === "default") return true;
  if (codigoBanca === "default" && c === CODIGO_CHEFE) return true;
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

export function extracaoAceitaApostas(encerra: string): boolean {
  const now = new Date();
  const [h, m] = encerra.split(":").map(Number);
  const encerraDate = new Date(now);
  encerraDate.setHours(h, m, 0, 0);
  return now < encerraDate;
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
    return { ...CONFIG_DEFAULT, ...parsed, premioMax: parsed.premioMax === 5 ? 5 : 10 };
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
  if (mod.startsWith("duque_grupo") || mod.startsWith("terno_grupo") || mod.startsWith("passe")) return "grupo";
  if (mod.startsWith("duque_dezena") || mod.startsWith("terno_dezena")) return "dezena";
  if (mod.includes("centena") && mod !== "milhar_e_centena" && mod !== "mc_invertida") return "centena";
  return "milhar";
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
  atualizarBilhetesComResultado(novo);
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
