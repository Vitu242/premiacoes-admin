"use client";

import { supabase, useSupabase } from "./supabase";
import type { Cambista, Bilhete, Extracao, Gerente, Lancamento, Resultado } from "./types";

const KEYS = {
  gerentes: "premiacoes_gerentes",
  cambistas: "premiacoes_cambistas",
  extracoes: "premiacoes_extracoes",
  bilhetes: "premiacoes_bilhetes",
  lancamentos: "premiacoes_lancamentos",
  resultados: "premiacoes_resultados",
  config: "premiacoes_config",
};

function toDbCambista(c: Cambista) {
  return {
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
  };
}

/** Carrega dados do Supabase e grava no localStorage. Se Supabase vazio mas há dados locais, envia-os. */
export async function initFromSupabase(): Promise<boolean> {
  if (!supabase || typeof window === "undefined") return false;
  try {
    const [gerentesRes, cambistasRes, extracoesRes, bilhetesRes, lancamentosRes, resultadosRes, configRes] =
      await Promise.all([
        supabase.from("gerentes").select("*"),
        supabase.from("cambistas").select("*"),
        supabase.from("extracoes").select("*"),
        supabase.from("bilhetes").select("*"),
        supabase.from("lancamentos").select("*"),
        supabase.from("resultados").select("*"),
        supabase.from("config").select("*"),
      ]);

    const write = (key: string, data: unknown) => {
      localStorage.setItem(key, JSON.stringify(data ?? []));
    };

    if (gerentesRes.data?.length) write(KEYS.gerentes, gerentesRes.data.map((r: Record<string, unknown>) => ({
      id: r.id,
      login: r.login,
      senha: r.senha,
      tipo: r.tipo,
      comissaoBruto: Number(r.comissao_bruto ?? 0),
      comissaoLucro: Number(r.comissao_lucro ?? 0),
      endereco: r.endereco ?? "",
      telefone: r.telefone ?? "",
      descricao: r.descricao ?? "",
      criarCambista: Boolean(r.criar_cambista),
      adicionarSaldo: Boolean(r.adicionar_saldo),
      status: r.status ?? "ativo",
      socio: r.socio ?? "",
      criadoEm: r.criado_em ?? "",
    })));

    if (cambistasRes.data?.length) write(KEYS.cambistas, cambistasRes.data.map((r: Record<string, unknown>) => ({
      id: r.id,
      gerenteId: r.gerente_id ?? "",
      login: r.login ?? "",
      senha: r.senha ?? "",
      saldo: Number(r.saldo ?? 0),
      comissaoMilhar: Number(r.comissao_milhar ?? 20),
      comissaoCentena: Number(r.comissao_centena ?? 20),
      comissaoDezena: Number(r.comissao_dezena ?? 17),
      comissaoGrupo: Number(r.comissao_grupo ?? 17),
      cotacaoM: Number(r.cotacao_m ?? 6000),
      cotacaoC: Number(r.cotacao_c ?? 800),
      cotacaoD: Number(r.cotacao_d ?? 80),
      cotacaoG: Number(r.cotacao_g ?? 20),
      milharBrinde: r.milhar_brinde === "sim" ? "sim" : "nao",
      endereco: r.endereco ?? "",
      telefone: r.telefone ?? "",
      descricao: r.descricao ?? "",
      status: r.status ?? "ativo",
      risco: r.risco ?? "",
      entrada: Number(r.entrada ?? 0),
      saidas: Number(r.saidas ?? 0),
      comissao: Number(r.comissao ?? 0),
      lancamentos: Number(r.lancamentos ?? 0),
      ultimaPrestacao: r.ultima_prestacao ?? null,
    })));

    if (extracoesRes.data?.length) write(KEYS.extracoes, extracoesRes.data.map((r: Record<string, unknown>) => ({
      id: r.id,
      nome: r.nome ?? "",
      encerra: r.encerra ?? "",
      ativa: Boolean(r.ativa ?? true),
    })));

    if (bilhetesRes.data?.length) write(KEYS.bilhetes, bilhetesRes.data.map((r: Record<string, unknown>) => ({
      id: r.id,
      codigo: r.codigo ?? "",
      cambistaId: r.cambista_id ?? "",
      extracaoId: r.extracao_id ?? "",
      extracaoNome: r.extracao_nome ?? "",
      itens: r.itens ?? [],
      total: Number(r.total ?? 0),
      data: r.data ?? "",
      situacao: r.situacao ?? "pendente",
    })));

    if (lancamentosRes.data?.length) write(KEYS.lancamentos, lancamentosRes.data.map((r: Record<string, unknown>) => ({
      id: r.id,
      cambistaId: r.cambista_id ?? "",
      tipo: r.tipo ?? "adiantar",
      valor: Number(r.valor ?? 0),
      data: r.data ?? "",
      observacao: r.observacao,
    })));

    if (resultadosRes.data?.length) write(KEYS.resultados, resultadosRes.data.map((r: Record<string, unknown>) => ({
      id: r.id,
      extracaoId: r.extracao_id ?? "",
      extracaoNome: r.extracao_nome ?? "",
      data: r.data ?? "",
      grupos: r.grupos ?? "",
      dezenas: r.dezenas,
    })));

    if (configRes.data?.length) {
      const cfg = configRes.data[0] as Record<string, unknown>;
      const val = cfg?.value as Record<string, unknown> | undefined;
      if (val) write(KEYS.config, val);
    }

    // Se Supabase estava vazio mas temos dados locais, envia-os (ordem: gerentes antes de cambistas por FK)
    const local = (key: string) => {
      try {
        const s = localStorage.getItem(key);
        return s ? JSON.parse(s) : [];
      } catch {
        return [];
      }
    };
    if (!gerentesRes.data?.length && local(KEYS.gerentes).length) await pushToSupabase("gerentes", local(KEYS.gerentes));
    if (!cambistasRes.data?.length && local(KEYS.cambistas).length) await pushToSupabase("cambistas", local(KEYS.cambistas));
    if (!extracoesRes.data?.length && local(KEYS.extracoes).length) await pushToSupabase("extracoes", local(KEYS.extracoes));
    if (!bilhetesRes.data?.length && local(KEYS.bilhetes).length) await pushToSupabase("bilhetes", local(KEYS.bilhetes));
    if (!lancamentosRes.data?.length && local(KEYS.lancamentos).length) await pushToSupabase("lancamentos", local(KEYS.lancamentos));
    if (!resultadosRes.data?.length && local(KEYS.resultados).length) await pushToSupabase("resultados", local(KEYS.resultados));

    return true;
  } catch {
    return false;
  }
}

/** Envia dados do localStorage para o Supabase (após mutação). */
export async function pushToSupabase(
  table: "gerentes" | "cambistas" | "extracoes" | "bilhetes" | "lancamentos" | "resultados",
  rows: unknown[]
): Promise<void> {
  if (!supabase || !rows.length) return;
  try {
    const dbRows = rows.map((r: unknown) => {
      if (table === "cambistas") return toDbCambista(r as unknown as Cambista);
      if (table === "bilhetes") {
        const b = r as unknown as Bilhete;
        return { id: b.id, codigo: b.codigo, cambista_id: b.cambistaId, extracao_id: b.extracaoId, extracao_nome: b.extracaoNome, itens: b.itens, total: b.total, data: b.data, situacao: b.situacao };
      }
      if (table === "gerentes") {
        const g = r as unknown as Gerente;
        return { id: g.id, login: g.login, senha: g.senha, tipo: g.tipo, comissao_bruto: g.comissaoBruto, comissao_lucro: g.comissaoLucro, endereco: g.endereco, telefone: g.telefone, descricao: g.descricao, criar_cambista: g.criarCambista, adicionar_saldo: g.adicionarSaldo, status: g.status, socio: g.socio, criado_em: g.criadoEm };
      }
      if (table === "extracoes") {
        const e = r as unknown as Extracao;
        return { id: e.id, nome: e.nome, encerra: e.encerra, ativa: e.ativa };
      }
      if (table === "lancamentos") {
        const l = r as unknown as Lancamento;
        return { id: l.id, cambista_id: l.cambistaId, tipo: l.tipo, valor: l.valor, data: l.data, observacao: l.observacao };
      }
      if (table === "resultados") {
        const r_ = r as unknown as Resultado;
        return { id: r_.id, extracao_id: r_.extracaoId, extracao_nome: r_.extracaoNome, data: r_.data, grupos: r_.grupos, dezenas: r_.dezenas };
      }
      return r;
    });
    const { error } = await supabase.from(table).upsert(dbRows);
    if (error) console.error("[Supabase] Erro ao enviar " + table + ":", error.message);
  } catch (e) {
    console.error("[Supabase] Erro ao enviar " + table + ":", e);
  }
}

export { useSupabase };
