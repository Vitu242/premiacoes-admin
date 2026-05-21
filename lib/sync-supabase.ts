"use client";

import { supabase, useSupabase } from "./supabase";
import { parseDataPtBrOuIso } from "./date-utils";
import { addTombstone, getTombstoneSet, type TombstoneTable } from "./tombstones";
import { getTombstoneSetRemoto, setCacheTombstonesRemotas } from "./tombstones-remotas";
import type { Cambista, Bilhete, Extracao, Gerente, Lancamento, Resultado } from "./types";
import { ordenarBilhetesRecentesPrimeiro, ordenarPorLogin } from "./list-order";

/** Considera "deletado" qualquer registro cujo status seja "excluido"
 *  (soft delete propagado entre dispositivos). */
function temStatusExcluido(r: { status?: unknown } | null | undefined): boolean {
  return String((r ?? {}).status ?? "") === "excluido";
}

/**
 * Lê a fila offline-first ("premiacoes_sync_queue") e devolve, por tabela, o
 * conjunto de IDs com operações de upsert ainda pendentes. Usado para
 * distinguir entre "registro criado offline que precisa subir" e "registro
 * apagado em outro dispositivo que precisa sumir daqui".
 */
function getIdsComUpsertPendente(): {
  gerentes: Set<string>;
  cambistas: Set<string>;
  bilhetes: Set<string>;
  lancamentos: Set<string>;
  resultados: Set<string>;
  extracoes: Set<string>;
} {
  const vazios = {
    gerentes: new Set<string>(),
    cambistas: new Set<string>(),
    bilhetes: new Set<string>(),
    lancamentos: new Set<string>(),
    resultados: new Set<string>(),
    extracoes: new Set<string>(),
  };
  if (typeof window === "undefined") return vazios;
  let fila: Array<{
    op?: {
      kind?: string;
      table?: string;
      payload?: unknown;
      match?: { id?: unknown };
    };
  }> = [];
  try {
    const raw = localStorage.getItem("premiacoes_sync_queue");
    fila = raw ? JSON.parse(raw) : [];
  } catch {
    return vazios;
  }
  for (const item of fila) {
    const op = item?.op;
    if (!op) continue;
    const tabela = String(op.table ?? "");
    const alvo = (vazios as Record<string, Set<string>>)[tabela];
    if (!alvo) continue;
    // Inclui upsert, update e delete — qualquer op pendente significa que
    // o local tem alteração não-confirmada e o servidor pode estar atrasado.
    if (op.kind === "upsert") {
      const payload = op.payload;
      const items = Array.isArray(payload) ? payload : [payload];
      for (const p of items) {
        const id = (p as { id?: unknown } | null | undefined)?.id;
        if (id != null) alvo.add(String(id));
      }
    } else if (op.kind === "update" || op.kind === "delete") {
      const id = op.match?.id;
      if (id != null) alvo.add(String(id));
    }
  }
  return vazios;
}

function filaTemConfigPendente(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const raw = localStorage.getItem("premiacoes_sync_queue");
    const fila = raw ? JSON.parse(raw) : [];
    return (fila as Array<{ op?: { kind?: string; table?: string } }>).some(
      (item) => item?.op?.kind === "upsert" && item?.op?.table === "config",
    );
  } catch {
    return false;
  }
}

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
    codigo: c.codigo ?? "default",
    tipo: c.tipo ?? "cambista",
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
    cotacoes: c.cotacoes ?? null,
    ultimo_acesso: (c as { ultimoAcesso?: string | null }).ultimoAcesso ?? null,
  };
}

/** Carrega dados do Supabase e grava no localStorage. Se Supabase vazio mas há dados locais, envia-os. */
export async function initFromSupabase(): Promise<boolean> {
  if (!supabase || typeof window === "undefined") return false;
  // Após chegar até o Supabase, considera a banca inicializada e desliga o
  // seed automático de gerente/cambista (evita ressuscitar registros após delete).
  // Escreve a flag direto para evitar import circular com ./store.
  try {
    localStorage.setItem("premiacoes_seeded_v1", "1");
  } catch {
    /* ignore */
  }
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
    const local = (key: string): unknown[] => {
      try {
        const s = localStorage.getItem(key);
        return s ? JSON.parse(s) : [];
      } catch {
        return [];
      }
    };

    // Hidrata o cache de tombstones REMOTAS (config[id="tombstones"]). A
    // partir daqui, qualquer pushToSupabase filtra esses IDs e qualquer
    // load* local também os exclui via tombstones locais.
    try {
      const tombRow = (configRes.data as Array<{ id?: unknown; value?: unknown }> | null | undefined)?.find(
        (r) => String((r as { id?: unknown }).id ?? "") === "tombstones",
      );
      if (tombRow && tombRow.value && typeof tombRow.value === "object") {
        setCacheTombstonesRemotas(tombRow.value);
      }
    } catch {
      /* ignore */
    }

    const mapGerente = (r: Record<string, unknown>) => ({
      id: String(r.id ?? ""),
      codigo: r.codigo ?? "default",
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
      contasSocio: r.contas_socio ? String(r.contas_socio) : undefined,
      criadoEm: r.criado_em ?? "",
    });
    const mapCambista = (r: Record<string, unknown>) => ({
      id: String(r.id ?? ""),
      gerenteId: r.gerente_id ?? "",
      codigo: r.codigo ?? "default",
      tipo: r.tipo === "cliente" ? "cliente" : "cambista",
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
      cotacoes: r.cotacoes != null && typeof r.cotacoes === "object" ? r.cotacoes : undefined,
      ultimoAcesso: r.ultimo_acesso ?? undefined,
    });

    // Adiciona tombstones locais para registros que chegaram do servidor já
    // marcados como soft-deletados ("status=excluido"). Assim o filtro de UI
    // funciona mesmo nos pontos do código que ignoram o status, e os ids
    // entram automaticamente no reenfileirarDeletes para limpar o servidor.
    const aplicarSoftDeleteRemoto = (
      table: "gerentes" | "cambistas",
      rows: Array<Record<string, unknown>> | null | undefined,
    ) => {
      if (!rows?.length) return;
      for (const r of rows) {
        if (temStatusExcluido(r)) {
          const id = String((r as { id?: unknown }).id ?? "");
          if (id) addTombstone(table, id);
        }
      }
    };
    aplicarSoftDeleteRemoto("gerentes", gerentesRes.data as Array<Record<string, unknown>> | null);
    aplicarSoftDeleteRemoto("cambistas", cambistasRes.data as Array<Record<string, unknown>> | null);

    const tombGerentes = getTombstoneSet("gerentes");
    const tombCambistas = getTombstoneSet("cambistas");
    const tombBilhetes = getTombstoneSet("bilhetes");
    const tombLancamentos = getTombstoneSet("lancamentos");
    const tombResultados = getTombstoneSet("resultados");
    const tombExtracoes = getTombstoneSet("extracoes");

    // Auto-cura: se o Supabase ainda devolve um registro que está marcado
    // como deletado localmente, força um DELETE remoto. Isso garante que
    // mesmo após um delete que não confirmou (RLS, race, offline), o registro
    // suma do servidor na próxima sincronização — e pare de "ressuscitar".
    const reenfileirarDeletes = async (
      table: TombstoneTable,
      rows: Array<{ id?: unknown }> | null | undefined,
      tomb: Set<string>,
    ) => {
      if (!rows?.length || tomb.size === 0) return;
      const ids = rows
        .map((r) => String((r as { id?: unknown }).id ?? ""))
        .filter((id) => id && tomb.has(id));
      if (!ids.length) return;
      try {
        const { enqueue } = await import("./sync-queue");
        for (const id of ids) {
          await enqueue({ kind: "delete", table, match: { id }, id });
        }
      } catch {
        /* ignore */
      }
    };
    void reenfileirarDeletes("gerentes", gerentesRes.data as Array<{ id?: unknown }> | null, tombGerentes);
    void reenfileirarDeletes("cambistas", cambistasRes.data as Array<{ id?: unknown }> | null, tombCambistas);
    void reenfileirarDeletes("bilhetes", bilhetesRes.data as Array<{ id?: unknown }> | null, tombBilhetes);
    void reenfileirarDeletes("lancamentos", lancamentosRes.data as Array<{ id?: unknown }> | null, tombLancamentos);
    void reenfileirarDeletes("resultados", resultadosRes.data as Array<{ id?: unknown }> | null, tombResultados);
    void reenfileirarDeletes("extracoes", extracoesRes.data as Array<{ id?: unknown }> | null, tombExtracoes);

    // IDs que ainda têm upsert pendente na fila offline-first: locais que
    // estão APENAS no localStorage devem ser preservados apenas se ainda
    // não tiveram chance de subir ao Supabase. Caso contrário, "registro só
    // no local + sem na nuvem" é interpretado como "foi apagado em outro
    // dispositivo" e o registro é removido daqui — eliminando o
    // re-aparecimento de cambistas/lançamentos apagados via API/outro device.
    const idsPendentes = getIdsComUpsertPendente();

    // Helper: reconcilia uma lista local com o que veio do servidor. Quando a
    // query teve sucesso (mesmo retornando lista vazia), o servidor é a fonte
    // canônica. Locais só sobrevivem se ainda estão para subir na fila ou se
    // estão marcados como `status="excluido"` (propagação de soft-delete).
    function reconciliar<L extends { id: string; status?: unknown }>(
      key: string,
      res: { data: unknown[] | null; error: { message?: string } | null },
      tomb: Set<string>,
      pendentes: Set<string>,
      mapRow: (r: Record<string, unknown>) => L,
    ) {
      // Em caso de erro de rede/RLS, não tocamos no local — preserva offline.
      if (res.error) {
        const locais = (local(key) as L[]).filter((x) => !tomb.has(String(x.id)));
        write(key, locais);
        return;
      }
      const rows = (res.data ?? []) as Array<Record<string, unknown>>;
      const fromSupabase = rows
        .filter((r) => !tomb.has(String(r.id ?? "")))
        .map(mapRow);
      const idsSupabase = new Set(fromSupabase.map((x) => String(x.id)));
      const locais = (local(key) as L[]).filter(
        (x) =>
          !idsSupabase.has(String(x.id)) &&
          !tomb.has(String(x.id)) &&
          (pendentes.has(String(x.id)) || String(x.status ?? "") === "excluido"),
      );
      write(key, [...fromSupabase, ...locais]);
    }

    type GerenteLocal = ReturnType<typeof mapGerente> & { id: string; status?: unknown };

    function mergeGerentes(
      res: { data: unknown[] | null; error: { message?: string } | null },
    ): void {
      if (res.error) {
        write(
          KEYS.gerentes,
          (local(KEYS.gerentes) as GerenteLocal[]).filter((x) => !tombGerentes.has(String(x.id))),
        );
        return;
      }
      const rows = (res.data ?? []) as Array<Record<string, unknown>>;
      const fromSupabase = rows
        .filter((r) => !tombGerentes.has(String(r.id ?? "")))
        .map((r) => mapGerente(r) as GerenteLocal);
      const locaisAntes = (local(KEYS.gerentes) as GerenteLocal[]).filter(
        (x) => !tombGerentes.has(String(x.id)),
      );
      const porId = new Map<string, GerenteLocal>();
      for (const srv of fromSupabase) porId.set(String(srv.id), srv);
      for (const loc of locaisAntes) {
        const id = String(loc.id);
        if (idsPendentes.gerentes.has(id) || String(loc.status) === "excluido") {
          porId.set(id, loc);
        }
      }
      const idsSupabase = new Set(fromSupabase.map((x) => String(x.id)));
      const soLocal = locaisAntes.filter(
        (x) =>
          !idsSupabase.has(String(x.id)) &&
          (idsPendentes.gerentes.has(String(x.id)) || String(x.status) === "excluido"),
      );
      write(KEYS.gerentes, ordenarPorLogin([...porId.values(), ...soLocal]));
    }

    mergeGerentes(
      gerentesRes as { data: unknown[] | null; error: { message?: string } | null },
    );

    type CambistaLocal = ReturnType<typeof mapCambista> & { id: string; status?: unknown };

    function mergeCambistas(
      res: { data: unknown[] | null; error: { message?: string } | null },
    ): void {
      if (res.error) {
        const locais = (local(KEYS.cambistas) as CambistaLocal[]).filter(
          (x) => !tombCambistas.has(String(x.id)),
        );
        write(KEYS.cambistas, locais);
        return;
      }
      const rows = (res.data ?? []) as Array<Record<string, unknown>>;
      const fromSupabase = rows
        .filter((r) => !tombCambistas.has(String(r.id ?? "")))
        .map((r) => mapCambista(r) as CambistaLocal);
      const locaisAntes = (local(KEYS.cambistas) as CambistaLocal[]).filter(
        (x) => !tombCambistas.has(String(x.id)),
      );
      const porId = new Map<string, CambistaLocal>();
      for (const srv of fromSupabase) porId.set(String(srv.id), srv);

      // IDs de cambistas cuja fila local DEVE ser descartada (o servidor
      // mostrou uma prestação mais recente, o que invalida qualquer upsert
      // pendente com valores antigos).
      const cambistasParaLimparFila = new Set<string>();
      const TOLERANCIA = 5 * 60 * 1000;
      for (const loc of locaisAntes) {
        const id = String(loc.id);
        const srv = porId.get(id);
        const rawLoc = loc.ultimaPrestacao;
        const rawSrv = srv?.ultimaPrestacao;
        const sLoc = typeof rawLoc === "string" ? rawLoc : rawLoc != null ? String(rawLoc) : "";
        const sSrv = typeof rawSrv === "string" ? rawSrv : rawSrv != null ? String(rawSrv) : "";
        const tLoc = parseDataPtBrOuIso(sLoc || null);
        const tSrv = parseDataPtBrOuIso(sSrv || null);

        // Servidor com prestação mais recente que a local (com tolerância
        // de 5 min de relógio) → admin acabou de prestar contas. Aceita
        // o servidor INTEGRALMENTE e descarta qualquer upsert pendente do
        // cambista (esses upserts contêm valores ANTERIORES à prestação).
        if (srv && tSrv && (!tLoc || tSrv.getTime() > tLoc.getTime() + TOLERANCIA)) {
          porId.set(id, srv);
          if (idsPendentes.cambistas.has(id)) cambistasParaLimparFila.add(id);
          continue;
        }

        // Caso contrário, se há upsert pendente local, mantém local
        // (preserva venda offline ainda não sincronizada).
        if (idsPendentes.cambistas.has(id)) {
          porId.set(id, loc);
          continue;
        }
        if (!srv) continue;

        // Última prestação local é igual ou mais recente que a do servidor:
        // o LOCAL ganha (preserva os zeros aplicados após prestar contas
        // localmente).
        const locVenceuPrestacao =
          (sLoc && sSrv && sLoc === sSrv) ||
          (tLoc && (!tSrv || tLoc.getTime() + TOLERANCIA >= tSrv.getTime()));
        if (locVenceuPrestacao) {
          porId.set(id, {
            ...srv,
            entrada: loc.entrada,
            saidas: loc.saidas,
            comissao: loc.comissao,
            lancamentos: loc.lancamentos,
            ultimaPrestacao: loc.ultimaPrestacao,
          });
        }
      }

      // Limpa upserts pendentes dos cambistas cuja prestação foi
      // sobrescrita pelo servidor. Sem isso, o próximo flush subiria os
      // valores antigos e ressuscitaria o caixa zerado.
      if (cambistasParaLimparFila.size > 0) {
        try {
          const QKEY = "premiacoes_sync_queue";
          const raw = localStorage.getItem(QKEY);
          if (raw) {
            const fila = JSON.parse(raw) as Array<{
              op?: { kind?: string; table?: string; payload?: unknown; match?: { id?: unknown } };
            }>;
            const novaFila = fila.filter((it) => {
              const op = it?.op;
              if (!op || op.table !== "cambistas") return true;
              if (op.kind === "upsert") {
                const arr = Array.isArray(op.payload) ? op.payload : [op.payload];
                return !arr.some((p) =>
                  cambistasParaLimparFila.has(
                    String((p as { id?: unknown } | null | undefined)?.id ?? ""),
                  ),
                );
              }
              if (op.kind === "update" && op.match?.id) {
                return !cambistasParaLimparFila.has(String(op.match.id));
              }
              return true;
            });
            localStorage.setItem(QKEY, JSON.stringify(novaFila));
          }
        } catch {
          /* ignore */
        }
      }

      const idsSupabase = new Set(fromSupabase.map((x) => String(x.id)));
      const soLocal = locaisAntes.filter(
        (x) =>
          !idsSupabase.has(String(x.id)) &&
          (idsPendentes.cambistas.has(String(x.id)) || String(x.status ?? "") === "excluido"),
      );
      write(KEYS.cambistas, ordenarPorLogin([...porId.values(), ...soLocal]));
    }

    mergeCambistas(
      cambistasRes as { data: unknown[] | null; error: { message?: string } | null },
    );

    type ExtracaoLocal = {
      id: string;
      nome: string;
      encerra: string;
      ativa: boolean;
      tipo?: string;
      dias?: string[];
    };

    function mergeExtracoes(
      res: { data: unknown[] | null; error: { message?: string } | null },
    ): void {
      if (res.error) {
        write(
          KEYS.extracoes,
          (local(KEYS.extracoes) as ExtracaoLocal[]).filter((x) => !tombExtracoes.has(String(x.id))),
        );
        return;
      }
      const rows = (res.data ?? []) as Array<Record<string, unknown>>;
      const fromSupabase = rows
        .filter((r) => !tombExtracoes.has(String(r.id ?? "")))
        .map(
          (r) =>
            ({
              id: String(r.id ?? ""),
              nome: String(r.nome ?? ""),
              encerra: String(r.encerra ?? ""),
              ativa: Boolean(r.ativa ?? true),
              tipo: typeof r.tipo === "string" ? r.tipo : undefined,
              dias: Array.isArray(r.dias) ? r.dias : undefined,
            }) satisfies ExtracaoLocal,
        );
      const locaisAntes = (local(KEYS.extracoes) as ExtracaoLocal[]).filter(
        (x) => !tombExtracoes.has(String(x.id)),
      );
      const porId = new Map<string, ExtracaoLocal>();
      for (const srv of fromSupabase) porId.set(String(srv.id), srv);
      for (const loc of locaisAntes) {
        const id = String(loc.id);
        if (idsPendentes.extracoes.has(id)) porId.set(id, loc);
      }
      const idsSupabase = new Set(fromSupabase.map((x) => String(x.id)));
      const soLocal = locaisAntes.filter(
        (x) => !idsSupabase.has(String(x.id)) && idsPendentes.extracoes.has(String(x.id)),
      );
      write(KEYS.extracoes, [...porId.values(), ...soLocal]);
    }

    mergeExtracoes(
      extracoesRes as { data: unknown[] | null; error: { message?: string } | null },
    );

    type BilheteLocal = {
      id: string;
      codigo: string;
      cambistaId: string;
      extracaoId: string;
      extracaoNome: string;
      itens: unknown;
      total: number;
      data: string;
      situacao: string;
    };

    const mapBilhete = (r: Record<string, unknown>): BilheteLocal => ({
      id: String(r.id ?? ""),
      codigo: String(r.codigo ?? ""),
      cambistaId: String(r.cambista_id ?? r.cambistaId ?? ""),
      extracaoId: String(r.extracao_id ?? r.extracaoId ?? ""),
      extracaoNome: String(r.extracao_nome ?? r.extracaoNome ?? ""),
      itens: r.itens ?? [],
      total: Number(r.total ?? 0),
      data: String(r.data ?? ""),
      situacao: String(r.situacao ?? "pendente"),
    });

    function mergeBilhetes(
      res: { data: unknown[] | null; error: { message?: string } | null },
    ): void {
      if (res.error) {
        const locais = (local(KEYS.bilhetes) as BilheteLocal[]).filter(
          (x) => !tombBilhetes.has(String(x.id)),
        );
        write(KEYS.bilhetes, locais);
        return;
      }
      const rows = (res.data ?? []) as Array<Record<string, unknown>>;
      const fromSupabase = rows
        .filter((r) => !tombBilhetes.has(String(r.id ?? "")))
        .map((r) => mapBilhete(r));
      const locaisAntes = (local(KEYS.bilhetes) as BilheteLocal[]).filter(
        (x) => !tombBilhetes.has(String(x.id)),
      );
      const porId = new Map<string, BilheteLocal>();
      for (const srv of fromSupabase) porId.set(String(srv.id), srv);

      for (const loc of locaisAntes) {
        const id = String(loc.id);
        const srv = porId.get(id);
        // CASO ESPECIAL: bilhete está com upsert pendente local mas o
        // SERVIDOR já tem ele com situação final (pago/perdedor) — significa
        // que o cron/outra máquina já conferiu E já atualizou cambistas.saidas
        // no servidor. Se mantivermos o local pendente, aplicarResultadosNoCaixa
        // marcaria como pago de novo e SOMARIA SAIDAS DUPLAS.
        // Solução: aceita o servidor (situação final) e descarta upsert
        // pendente do bilhete (já foi processado).
        if (
          srv &&
          idsPendentes.bilhetes.has(id) &&
          loc.situacao === "pendente" &&
          srv.situacao !== "pendente" &&
          srv.situacao !== "cancelado"
        ) {
          porId.set(id, srv);
          continue;
        }
        if (idsPendentes.bilhetes.has(id)) {
          porId.set(id, loc);
          continue;
        }
        if (!srv) continue;
        // Cancelamento local ainda não subiu ao Supabase — não ressuscitar.
        if (loc.situacao === "cancelado" && srv.situacao !== "cancelado") {
          porId.set(id, loc);
          continue;
        }
        // Baixa automática / resultado aplicado localmente ainda não no servidor
        if (
          loc.situacao !== "pendente" &&
          srv.situacao === "pendente" &&
          loc.situacao !== srv.situacao
        ) {
          porId.set(id, loc);
        }
      }

      const idsSupabase = new Set(fromSupabase.map((x) => String(x.id)));
      const soLocal = locaisAntes.filter(
        (x) =>
          !idsSupabase.has(String(x.id)) &&
          (idsPendentes.bilhetes.has(String(x.id)) || String(x.situacao) === "excluido"),
      );
      write(KEYS.bilhetes, ordenarBilhetesRecentesPrimeiro([...porId.values(), ...soLocal]));
    }

    mergeBilhetes(
      bilhetesRes as { data: unknown[] | null; error: { message?: string } | null },
    );

    type LancamentoLocal = {
      id: string;
      cambistaId: string;
      tipo: string;
      valor: number;
      data: string;
      observacao?: string;
    };

    function mergeLancamentos(
      res: { data: unknown[] | null; error: { message?: string } | null },
    ): void {
      if (res.error) {
        write(
          KEYS.lancamentos,
          (local(KEYS.lancamentos) as LancamentoLocal[]).filter(
            (x) => !tombLancamentos.has(String(x.id)),
          ),
        );
        return;
      }
      const rows = (res.data ?? []) as Array<Record<string, unknown>>;
      const fromSupabase = rows
        .filter((r) => !tombLancamentos.has(String(r.id ?? "")))
        .map(
          (r) =>
            ({
              id: String(r.id ?? ""),
              cambistaId: String(r.cambista_id ?? ""),
              tipo: String(r.tipo ?? "adiantar"),
              valor: Number(r.valor ?? 0),
              data: String(r.data ?? ""),
              observacao: r.observacao as string | undefined,
            }) satisfies LancamentoLocal,
        );
      const locaisAntes = (local(KEYS.lancamentos) as LancamentoLocal[]).filter(
        (x) => !tombLancamentos.has(String(x.id)),
      );
      const porId = new Map<string, LancamentoLocal>();
      for (const srv of fromSupabase) porId.set(String(srv.id), srv);
      for (const loc of locaisAntes) {
        const id = String(loc.id);
        if (idsPendentes.lancamentos.has(id)) porId.set(id, loc);
      }
      const idsSupabase = new Set(fromSupabase.map((x) => String(x.id)));
      const soLocal = locaisAntes.filter(
        (x) => !idsSupabase.has(String(x.id)) && idsPendentes.lancamentos.has(String(x.id)),
      );
      write(KEYS.lancamentos, [...porId.values(), ...soLocal]);
    }

    mergeLancamentos(
      lancamentosRes as { data: unknown[] | null; error: { message?: string } | null },
    );

    type ResultadoLocal = {
      id: string;
      extracaoId: string;
      extracaoNome: string;
      data: string;
      grupos: string;
      dezenas?: string;
      premios?: Record<string, string>;
    };

    /** Retorna os ids de resultados NOVOS (estavam no servidor e não no local). */
    function mergeResultados(
      res: { data: unknown[] | null; error: { message?: string } | null },
    ): string[] {
      if (res.error) {
        write(
          KEYS.resultados,
          (local(KEYS.resultados) as ResultadoLocal[]).filter(
            (x) => !tombResultados.has(String(x.id)),
          ),
        );
        return [];
      }
      const rows = (res.data ?? []) as Array<Record<string, unknown>>;
      const fromSupabase = rows
        .filter((r) => !tombResultados.has(String(r.id ?? "")))
        .map(
          (r) =>
            ({
              id: String(r.id ?? ""),
              extracaoId: String(r.extracao_id ?? ""),
              extracaoNome: String(r.extracao_nome ?? ""),
              data: String(r.data ?? ""),
              grupos: String(r.grupos ?? ""),
              dezenas: r.dezenas as string | undefined,
              premios:
                r.premios != null && typeof r.premios === "object"
                  ? (r.premios as Record<string, string>)
                  : undefined,
            }) satisfies ResultadoLocal,
        );
      const locaisAntes = (local(KEYS.resultados) as ResultadoLocal[]).filter(
        (x) => !tombResultados.has(String(x.id)),
      );
      const idsLocais = new Set(locaisAntes.map((x) => String(x.id)));
      const novos = fromSupabase
        .filter((r) => !idsLocais.has(String(r.id)))
        .map((r) => String(r.id));

      const porId = new Map<string, ResultadoLocal>();
      for (const srv of fromSupabase) porId.set(String(srv.id), srv);
      for (const loc of locaisAntes) {
        const id = String(loc.id);
        if (idsPendentes.resultados.has(id)) porId.set(id, loc);
      }
      const idsSupabase = new Set(fromSupabase.map((x) => String(x.id)));
      const soLocal = locaisAntes.filter(
        (x) => !idsSupabase.has(String(x.id)) && idsPendentes.resultados.has(String(x.id)),
      );
      write(KEYS.resultados, [...porId.values(), ...soLocal]);
      return novos;
    }

    const resultadosNovos = mergeResultados(
      resultadosRes as { data: unknown[] | null; error: { message?: string } | null },
    );

    // Resultados novos (criados pelo cron ou por outra máquina) precisam
    // bater os bilhetes locais para sair de "pendente". Sem isso, bilhetes
    // ficavam pendentes para sempre porque `addResultado` não roda no cron.
    if (resultadosNovos.length > 0) {
      try {
        const { aplicarResultadosNoCaixa } = await import("./store");
        await aplicarResultadosNoCaixa(resultadosNovos);
      } catch (e) {
        console.warn("[sync] aplicar resultados novos falhou:", (e as Error).message);
      }
    }

    if (configRes.data?.length && !filaTemConfigPendente()) {
      const cfg = configRes.data[0] as Record<string, unknown>;
      const val = cfg?.value as Record<string, unknown> | undefined;
      if (val) write(KEYS.config, val);
    }

    // OBS: removida a antiga lógica "se Supabase vazio, push do local" — ela
    // ressuscitava registros que tinham sido apagados em outro dispositivo
    // (fazia upsert de toda a lista local, recriando IDs já removidos).
    // Hoje qualquer escrita local passa pelo `pushToSupabase` no momento da
    // ação (addX/updateX/saveX) ou cai na sync-queue offline-first, então
    // não há necessidade de "push de recuperação" aqui.
    if (!configRes.data?.length) {
      try {
        const s = localStorage.getItem(KEYS.config);
        if (s) {
          const val = JSON.parse(s) as Record<string, unknown>;
          if (val && typeof val === "object") await pushConfigToSupabase(val);
        }
      } catch {
        /* ignore */
      }
    }

    return true;
  } catch {
    return false;
  }
}

/**
 * Envia dados do localStorage para o Supabase (após mutação).
 * Em caso de falha (offline / fetch failed / 5xx), enfileira em sync-queue
 * para reenvio automático quando a conexão voltar.
 */
export async function pushToSupabase(
  table: "gerentes" | "cambistas" | "extracoes" | "bilhetes" | "lancamentos" | "resultados",
  rows: unknown[]
): Promise<void> {
  if (!rows.length) return;
  // SEGURANÇA: nunca upserte registros cujo id esteja em tombstone LOCAL
  // ou REMOTA. Sem isso, um `save*` em lote (que envia a lista inteira)
  // re-inseriria no Supabase exatamente os IDs que acabamos de apagar —
  // causando o efeito de "registro ressuscitando".
  const tombLocal = getTombstoneSet(table as TombstoneTable);
  const tombRemota = getTombstoneSetRemoto(table as TombstoneTable);
  let rowsFiltradas = rows;
  if (tombLocal.size > 0 || tombRemota.size > 0) {
    rowsFiltradas = rows.filter((r) => {
      const id = (r as { id?: unknown } | null | undefined)?.id;
      if (id == null) return true;
      const s = String(id);
      return !tombLocal.has(s) && !tombRemota.has(s);
    });
    if (!rowsFiltradas.length) return;
  }
  const dbRows = rowsFiltradas.map((r: unknown) => {
    if (table === "cambistas") return toDbCambista(r as unknown as Cambista);
    if (table === "bilhetes") {
      const b = r as unknown as Bilhete;
      return { id: b.id, codigo: b.codigo, cambista_id: b.cambistaId, extracao_id: b.extracaoId, extracao_nome: b.extracaoNome, itens: b.itens, total: b.total, data: b.data, situacao: b.situacao };
    }
    if (table === "gerentes") {
      const g = r as unknown as Gerente;
      return { id: g.id, codigo: g.codigo ?? "default", login: g.login, senha: g.senha, tipo: g.tipo, comissao_bruto: g.comissaoBruto, comissao_lucro: g.comissaoLucro, endereco: g.endereco, telefone: g.telefone, descricao: g.descricao, criar_cambista: g.criarCambista, adicionar_saldo: g.adicionarSaldo, status: g.status, socio: g.socio, contas_socio: g.contasSocio ?? null, criado_em: g.criadoEm };
    }
    if (table === "extracoes") {
      const e = r as unknown as Extracao;
      return { id: e.id, nome: e.nome, encerra: e.encerra, ativa: e.ativa, tipo: e.tipo ?? null, dias: e.dias ?? null };
    }
    if (table === "lancamentos") {
      const l = r as unknown as Lancamento;
      return { id: l.id, cambista_id: l.cambistaId, tipo: l.tipo, valor: l.valor, data: l.data, observacao: l.observacao };
    }
    if (table === "resultados") {
      const r_ = r as unknown as Resultado;
      return { id: r_.id, extracao_id: r_.extracaoId, extracao_nome: r_.extracaoNome, data: r_.data, grupos: r_.grupos, dezenas: r_.dezenas, premios: r_.premios ?? null };
    }
    return r as Record<string, unknown>;
  });

  // Chunk vem do tuning adaptativo: encolhe em sobrecarga, cresce quando saudável.
  const { getTuning } = await import("./sync-tuning");
  const t = getTuning();
  const chunk = table === "bilhetes" ? t.bilheteChunk : t.upsertChunk;
  const { enqueue } = await import("./sync-queue");
  for (let i = 0; i < dbRows.length; i += chunk) {
    const slice = dbRows.slice(i, i + chunk) as Record<string, unknown>[];
    await enqueue({ kind: "upsert", table, payload: slice, onConflict: "id" });
    if (i + chunk < dbRows.length) {
      await new Promise((r) => setTimeout(r, t.flushDelayMs));
    }
  }
}

/**
 * Marca um registro para deleção e enfileira o DELETE no Supabase.
 * - Adiciona uma tombstone para evitar que o próximo `initFromSupabase` (via
 *   Realtime/visibilidade) reinsira o registro antes do delete confirmar.
 * - A tombstone é removida automaticamente quando o DELETE confirma no servidor.
 */
export async function deleteFromSupabase(
  table: TombstoneTable,
  id: string,
): Promise<void> {
  if (!id) return;
  addTombstone(table, id);
  if (!useSupabase) return;
  const { enqueue } = await import("./sync-queue");
  await enqueue({ kind: "delete", table, match: { id }, id });
}

/**
 * Envia APENAS os campos alterados de um cambista (UPDATE parcial em vez de
 * UPSERT do registro inteiro).
 *
 * Por que isso é crítico:
 *   - O upsert manda o registro inteiro. Se o dispositivo tem cópia local
 *     desatualizada de algum campo (ex.: saldo definido por outro admin
 *     há poucos segundos), esse campo volta ao valor antigo no servidor.
 *   - O UPDATE parcial só toca nos campos que mudaram, evitando que
 *     incrementos/edições em paralelo se sobrescrevam entre dispositivos.
 *
 * IMPORTANTE: este caminho só funciona quando o registro JÁ EXISTE no
 * servidor (caso normal — o cambista é criado via `addCambista` que faz
 * upsert antes). Se a fila ainda não processou o upsert inicial, o
 * `compactQueue` mescla este UPDATE no upsert pendente automaticamente.
 */
export async function pushCambistaPatch(
  id: string,
  patch: Partial<Cambista>,
): Promise<void> {
  if (!id) return;
  if (!patch || Object.keys(patch).length === 0) return;
  const dbPatch = camFieldsToDb(patch);
  if (Object.keys(dbPatch).length === 0) return;
  const { enqueue } = await import("./sync-queue");
  await enqueue({
    kind: "update",
    table: "cambistas",
    match: { id },
    payload: dbPatch,
  });
}

/** Mapeia chaves do tipo `Cambista` para colunas do banco. Só inclui as
 *  colunas presentes no patch, então campos não tocados não são enviados. */
function camFieldsToDb(p: Partial<Cambista>): Record<string, unknown> {
  const map: Record<keyof Cambista | string, string> = {
    gerenteId: "gerente_id",
    codigo: "codigo",
    tipo: "tipo",
    login: "login",
    senha: "senha",
    saldo: "saldo",
    comissaoMilhar: "comissao_milhar",
    comissaoCentena: "comissao_centena",
    comissaoDezena: "comissao_dezena",
    comissaoGrupo: "comissao_grupo",
    cotacaoM: "cotacao_m",
    cotacaoC: "cotacao_c",
    cotacaoD: "cotacao_d",
    cotacaoG: "cotacao_g",
    cotacoes: "cotacoes",
    milharBrinde: "milhar_brinde",
    endereco: "endereco",
    telefone: "telefone",
    descricao: "descricao",
    status: "status",
    risco: "risco",
    entrada: "entrada",
    saidas: "saidas",
    comissao: "comissao",
    lancamentos: "lancamentos",
    ultimaPrestacao: "ultima_prestacao",
    ultimoAcesso: "ultimo_acesso",
  };
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(p)) {
    if (k === "id") continue;
    const dbKey = map[k as keyof typeof map];
    if (dbKey) out[dbKey] = v ?? null;
  }
  return out;
}

/** Envia a config (premioMax, tempoCancelamentoMinutos) para o Supabase com retry/queue. */
export async function pushConfigToSupabase(value: Record<string, unknown>): Promise<void> {
  if (typeof value !== "object") return;
  const { enqueue } = await import("./sync-queue");
  await enqueue({
    kind: "upsert",
    table: "config",
    payload: [{ id: "default", value }],
    onConflict: "id",
  });
}

export { useSupabase };
