"use client";

import { supabase, useSupabase } from "./supabase";
import type { Gerente, Cambista, Extracao, Bilhete, Lancamento, Resultado } from "./types";

// Mapeamento snake_case (DB) <-> camelCase (app)
function toCambista(row: Record<string, unknown>): Cambista {
  return {
    id: String(row.id),
    gerenteId: String(row.gerente_id ?? ""),
    login: String(row.login ?? ""),
    senha: String(row.senha ?? ""),
    saldo: Number(row.saldo ?? 0),
    comissaoMilhar: Number(row.comissao_milhar ?? 20),
    comissaoCentena: Number(row.comissao_centena ?? 20),
    comissaoDezena: Number(row.comissao_dezena ?? 17),
    comissaoGrupo: Number(row.comissao_grupo ?? 17),
    cotacaoM: Number(row.cotacao_m ?? 6000),
    cotacaoC: Number(row.cotacao_c ?? 800),
    cotacaoD: Number(row.cotacao_d ?? 80),
    cotacaoG: Number(row.cotacao_g ?? 20),
    milharBrinde: (row.milhar_brinde === "sim" ? "sim" : "nao") as "sim" | "nao",
    endereco: String(row.endereco ?? ""),
    telefone: String(row.telefone ?? ""),
    descricao: String(row.descricao ?? ""),
    status: (row.status === "inativo" ? "inativo" : "ativo") as "ativo" | "inativo",
    risco: String(row.risco ?? ""),
    entrada: Number(row.entrada ?? 0),
    saidas: Number(row.saidas ?? 0),
    comissao: Number(row.comissao ?? 0),
    lancamentos: Number(row.lancamentos ?? 0),
    ultimaPrestacao: row.ultima_prestacao ? String(row.ultima_prestacao) : null,
  };
}

function toBilhete(row: Record<string, unknown>): Bilhete {
  return {
    id: String(row.id),
    codigo: String(row.codigo ?? ""),
    cambistaId: String(row.cambista_id ?? ""),
    extracaoId: String(row.extracao_id ?? ""),
    extracaoNome: String(row.extracao_nome ?? ""),
    itens: Array.isArray(row.itens) ? (row.itens as Bilhete["itens"]) : [],
    total: Number(row.total ?? 0),
    data: String(row.data ?? ""),
    situacao: (row.situacao as Bilhete["situacao"]) ?? "pendente",
  };
}

export async function fetchCambistas(): Promise<Cambista[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.from("cambistas").select("*").order("id");
  if (error) throw error;
  return (data ?? []).map(toCambista);
}

export async function fetchBilhetes(): Promise<Bilhete[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.from("bilhetes").select("*").order("data", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(toBilhete);
}

export async function fetchExtracoes(): Promise<Extracao[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.from("extracoes").select("*").order("id");
  if (error) throw error;
  return (data ?? []).map((r: Record<string, unknown>) => ({
    id: String(r.id),
    nome: String(r.nome ?? ""),
    encerra: String(r.encerra ?? ""),
    ativa: Boolean(r.ativa ?? true),
  }));
}

export async function fetchGerentes(): Promise<Gerente[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.from("gerentes").select("*").order("id");
  if (error) throw error;
  return (data ?? []).map((r: Record<string, unknown>) => ({
    id: String(r.id),
    login: String(r.login ?? ""),
    senha: String(r.senha ?? ""),
    tipo: String(r.tipo ?? ""),
    comissaoBruto: Number(r.comissao_bruto ?? 0),
    comissaoLucro: Number(r.comissao_lucro ?? 0),
    endereco: String(r.endereco ?? ""),
    telefone: String(r.telefone ?? ""),
    descricao: String(r.descricao ?? ""),
    criarCambista: Boolean(r.criar_cambista ?? false),
    adicionarSaldo: Boolean(r.adicionar_saldo ?? false),
    status: (r.status === "inativo" ? "inativo" : "ativo") as "ativo" | "inativo",
    socio: String(r.socio ?? ""),
    criadoEm: String(r.criado_em ?? ""),
  }));
}

export async function fetchLancamentos(): Promise<Lancamento[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.from("lancamentos").select("*").order("id");
  if (error) throw error;
  return (data ?? []).map((r: Record<string, unknown>) => ({
    id: String(r.id),
    cambistaId: String(r.cambista_id ?? ""),
    tipo: (r.tipo as "adiantar" | "retirar") ?? "adiantar",
    valor: Number(r.valor ?? 0),
    data: String(r.data ?? ""),
    observacao: r.observacao ? String(r.observacao) : undefined,
  }));
}

export async function fetchResultados(): Promise<Resultado[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.from("resultados").select("*").order("data", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r: Record<string, unknown>) => ({
    id: String(r.id),
    extracaoId: String(r.extracao_id ?? ""),
    extracaoNome: String(r.extracao_nome ?? ""),
    data: String(r.data ?? ""),
    grupos: String(r.grupos ?? ""),
    dezenas: r.dezenas ? String(r.dezenas) : undefined,
  }));
}

export async function upsertCambista(c: Cambista): Promise<void> {
  if (!supabase) return;
  await supabase.from("cambistas").upsert({
    id: c.id,
    gerente_id: c.gerenteId,
    login: c.login,
    senha: c.senha,
    saldo: c.saldo,
    comissao_milhar: c.comissaoMilhar,
    comissao_centena: c.comissaoCentena,
    comissao_dezena: c.comissaoDezena,
    comissao_grupo: c.comissaoGrupo,
    cotacao_m: c.cotacaoM,
    cotacao_c: c.cotacaoC,
    cotacao_d: c.cotacaoD,
    cotacao_g: c.cotacaoG,
    milhar_brinde: c.milharBrinde,
    endereco: c.endereco,
    telefone: c.telefone,
    descricao: c.descricao,
    status: c.status,
    risco: c.risco,
    entrada: c.entrada,
    saidas: c.saidas,
    comissao: c.comissao,
    lancamentos: c.lancamentos,
    ultima_prestacao: c.ultimaPrestacao,
  });
}

export async function upsertBilhete(b: Bilhete): Promise<void> {
  if (!supabase) return;
  await supabase.from("bilhetes").upsert({
    id: b.id,
    codigo: b.codigo,
    cambista_id: b.cambistaId,
    extracao_id: b.extracaoId,
    extracao_nome: b.extracaoNome,
    itens: b.itens,
    total: b.total,
    data: b.data,
    situacao: b.situacao,
  });
}

export async function upsertExtracao(e: Extracao): Promise<void> {
  if (!supabase) return;
  await supabase.from("extracoes").upsert({
    id: e.id,
    nome: e.nome,
    encerra: e.encerra,
    ativa: e.ativa,
  });
}

export { useSupabase };
