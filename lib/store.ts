"use client";

import type { Gerente, Cambista, Extracao, Bilhete } from "./types";

const GERENTES_KEY = "premiacoes_gerentes";
const CAMBISTAS_KEY = "premiacoes_cambistas";
const EXTRACOES_KEY = "premiacoes_extracoes";
const BILHETES_KEY = "premiacoes_bilhetes";
const CONFIG_KEY = "premiacoes_config";

export interface AppConfig {
  tempoCancelamentoMinutos: number;
}

const CONFIG_DEFAULT: AppConfig = { tempoCancelamentoMinutos: 5 };

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
  }
}

export function getGerentes(): Gerente[] {
  const g = loadGerentes();
  if (g.length === 0) {
    const inicial: Gerente = {
      id: "1",
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
  return g;
}

export function getCambistas(): Cambista[] {
  const c = loadCambistas();
  if (c.length === 0) {
    const inicial: Cambista[] = [
      {
        id: "1",
        gerenteId: "1",
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
  return c;
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
  const novo: Cambista = { ...c, id: String(Date.now()) };
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
  }
}

export function getExtracoes(): Extracao[] {
  const e = loadExtracoes();
  if (e.length === 0) {
    const inicial: Extracao[] = [
      { id: "1", nome: "NACIONAL 02:00", encerra: "02:00", ativa: true },
      { id: "2", nome: "LOOK GOIAS 07:20", encerra: "07:20", ativa: true },
      { id: "3", nome: "NACIONAL 08:00", encerra: "08:00", ativa: true },
      { id: "4", nome: "PT RIO 09:20", encerra: "09:20", ativa: true },
      { id: "5", nome: "NACIONAL 10:00", encerra: "10:00", ativa: true },
    ];
    saveExtracoes(inicial);
    return inicial;
  }
  return e;
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
    return data ? { ...CONFIG_DEFAULT, ...JSON.parse(data) } : CONFIG_DEFAULT;
  } catch {
    return CONFIG_DEFAULT;
  }
}

function saveConfig(c: AppConfig) {
  if (typeof window !== "undefined") localStorage.setItem(CONFIG_KEY, JSON.stringify(c));
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
  }
}

export function getBilhetes(): Bilhete[] {
  return loadBilhetes();
}

export function addBilhete(b: Omit<Bilhete, "id" | "codigo">): Bilhete {
  const lista = getBilhetes();
  const codigo = String(Date.now()).slice(-11);
  const novo: Bilhete = {
    ...b,
    id: String(Date.now()),
    codigo,
  };
  lista.push(novo);
  saveBilhetes(lista);
  updateCambista(b.cambistaId, {
    entrada: (getCambistas().find((c) => c.id === b.cambistaId)?.entrada ?? 0) + b.total,
  });
  return novo;
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
    return acc + item.valor * ((pct[item.modalidade] ?? 0) / 100);
  }, 0);
}

export function cancelarBilhete(id: string): boolean {
  const lista = getBilhetes();
  const idx = lista.findIndex((b) => b.id === id);
  if (idx < 0 || lista[idx].situacao !== "pendente") return false;
  lista[idx] = { ...lista[idx], situacao: "cancelado" };
  saveBilhetes(lista);
  const b = lista[idx];
  const cam = getCambistas().find((c) => c.id === b.cambistaId);
  if (cam) {
    updateCambista(b.cambistaId, { entrada: Math.max(0, cam.entrada - b.total) });
  }
  return true;
}
