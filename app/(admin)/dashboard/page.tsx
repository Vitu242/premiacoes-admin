"use client";

import { useEffect, useMemo, useState } from "react";
import {
  getBilhetes,
  getCambistasPorCodigo,
  getGerentesPorCodigo,
  getExtracoes,
  getResultadoByExtracaoData,
  calcularComissaoBilhete,
  getCotacaoEfetiva,
  getPremioMilharBrinde,
  getJogosEmAberto,
} from "@/lib/store";
import { conferirBilhete } from "@/lib/conferencia";
import { getAdminCodigo } from "@/lib/auth";
import { useVisibilityRefresh } from "@/lib/use-config-refresh";
import { DonutCard } from "@/app/components/DashboardCharts";
import AlertasCambistas from "@/app/components/AlertasCambistas";
import { hojeIsoDate, parseDataPtBrOuIso } from "@/lib/date-utils";
import type { Bilhete, Cambista, Extracao } from "@/lib/types";
import type { ModalidadeBilhete } from "@/lib/types";

function formatarMoeda(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/** Identifica em qual “bolsa” o palpite deve ser contado (milhar, centena, dezena, grupo). */
function categoriaPalpite(mod: ModalidadeBilhete): "milhar" | "centena" | "dezena" | "grupo" | null {
  if (
    mod === "milhar" ||
    mod === "milhar_invertida" ||
    mod === "mc_invertida" ||
    mod === "milhar_e_centena"
  ) {
    return "milhar";
  }
  if (mod === "centena" || mod === "centena_invertida") return "centena";
  if (mod === "dezena" || mod.startsWith("duque_dezena") || mod.startsWith("terno_dezena")) {
    return "dezena";
  }
  if (
    mod === "grupo" ||
    mod.startsWith("duque_grupo") ||
    mod.startsWith("terno_grupo") ||
    mod.startsWith("passe")
  ) {
    return "grupo";
  }
  return null;
}

/** Padroniza o palpite no formato "0000"/"000"/"00"/"00" para contagem dos top N. */
function normalizaPalpite(p: string, cat: "milhar" | "centena" | "dezena" | "grupo"): string | null {
  const digits = p.replace(/\D/g, "");
  if (!digits) return null;
  if (cat === "milhar") return digits.padStart(4, "0").slice(-4);
  if (cat === "centena") return digits.padStart(3, "0").slice(-3);
  if (cat === "dezena") return digits.padStart(2, "0").slice(-2);
  return digits.padStart(2, "0").slice(-2);
}

interface ResumoCambista {
  cambista: Cambista;
  qtdBilhetes: number;
  venda: number;
  comissao: number;
  premio: number;
}

export default function DashboardPage() {
  const codigo = getAdminCodigo();
  const gerentes = useMemo(() => getGerentesPorCodigo(codigo ?? ""), [codigo]);
  const cambistas = useMemo(() => getCambistasPorCodigo(codigo ?? ""), [codigo]);
  const extracoes = useMemo(() => getExtracoes(), []);

  const [bilhetes, setBilhetes] = useState<Bilhete[]>([]);
  const carregar = () => setBilhetes(getBilhetes());

  useEffect(() => {
    carregar();
  }, []);
  useVisibilityRefresh(carregar);

  // Filtros (default: dia atual)
  const [gerenteId, setGerenteId] = useState<string>("todos");
  const [cambistaId, setCambistaId] = useState<string>("todos");
  const [categoriaFiltro, setCategoriaFiltro] = useState<string>("todas");
  const [extracaoFiltro, setExtracaoFiltro] = useState<string>("todas");
  const [dataInicio, setDataInicio] = useState<string>(() => hojeIsoDate());
  const [dataFim, setDataFim] = useState<string>(() => hojeIsoDate());

  const categoriasDisponiveis = useMemo(() => {
    const set = new Set<string>();
    for (const e of extracoes) set.add(e.tipo?.trim() || "Tradicional");
    return Array.from(set).sort();
  }, [extracoes]);

  const cambistasFiltro = useMemo(() => {
    if (gerenteId === "todos") return cambistas;
    return cambistas.filter((c) => c.gerenteId === gerenteId);
  }, [cambistas, gerenteId]);

  // Limpa cambista quando o gerente muda e a opção atual não pertence mais
  useEffect(() => {
    if (cambistaId !== "todos" && !cambistasFiltro.some((c) => c.id === cambistaId)) {
      setCambistaId("todos");
    }
  }, [cambistasFiltro, cambistaId]);

  const dataInicioDate = dataInicio ? new Date(`${dataInicio}T00:00:00`) : null;
  const dataFimDate = dataFim ? new Date(`${dataFim}T23:59:59.999`) : null;

  const idsCambistasFiltro = useMemo(() => {
    let lista = cambistasFiltro;
    if (cambistaId !== "todos") lista = lista.filter((c) => c.id === cambistaId);
    return new Set(lista.map((c) => c.id));
  }, [cambistasFiltro, cambistaId]);

  const extracaoMap = useMemo(() => {
    const m = new Map<string, Extracao>();
    for (const e of extracoes) m.set(e.id, e);
    return m;
  }, [extracoes]);

  const cambistaMap = useMemo(() => {
    const m = new Map<string, Cambista>();
    for (const c of cambistas) m.set(c.id, c);
    return m;
  }, [cambistas]);

  const bilhetesFiltrados = useMemo(() => {
    return bilhetes.filter((b) => {
      if (b.situacao === "cancelado") return false;
      if (!idsCambistasFiltro.has(b.cambistaId)) return false;
      if (extracaoFiltro !== "todas" && b.extracaoId !== extracaoFiltro) return false;
      if (categoriaFiltro !== "todas") {
        const tipo = extracaoMap.get(b.extracaoId)?.tipo?.trim() || "Tradicional";
        if (tipo !== categoriaFiltro) return false;
      }
      const dt = parseDataPtBrOuIso(b.data);
      if (!dt) return false;
      if (dataInicioDate && dt < dataInicioDate) return false;
      if (dataFimDate && dt > dataFimDate) return false;
      return true;
    });
  }, [
    bilhetes,
    idsCambistasFiltro,
    extracaoFiltro,
    categoriaFiltro,
    extracaoMap,
    dataInicioDate,
    dataFimDate,
  ]);

  // Cálculos de premiação (uma única passada por bilhete)
  const calculos = useMemo(() => {
    let entrada = 0;
    let premiosPagos = 0;
    let comissaoCambistas = 0;
    let qtdEmAberto = 0;
    let valorEmAberto = 0;
    const ultimaData: { ts: number; data: string } = { ts: 0, data: "" };
    const vendedoresAtivos = new Set<string>();

    const porCambista = new Map<string, ResumoCambista>();
    const porExtracao = new Map<string, number>();
    const porCategoria = new Map<string, number>();
    const porModalidade = new Map<string, number>();

    const topMilhar = new Map<string, number>();
    const topCentena = new Map<string, number>();
    const topDezena = new Map<string, number>();
    const topGrupo = new Map<string, number>();

    for (const b of bilhetesFiltrados) {
      entrada += b.total;
      vendedoresAtivos.add(b.cambistaId);

      const dt = parseDataPtBrOuIso(b.data);
      if (dt && dt.getTime() > ultimaData.ts) {
        ultimaData.ts = dt.getTime();
        ultimaData.data = b.data;
      }

      const cam = cambistaMap.get(b.cambistaId);
      const comissao = cam ? calcularComissaoBilhete(b, cam) : 0;
      comissaoCambistas += comissao;

      // Prêmios pagos: confere bilhete com o resultado da sua extração/data.
      const resultado = getResultadoByExtracaoData(b.extracaoId, b.data);
      const conf = conferirBilhete(b, resultado, cam ?? null, getCotacaoEfetiva, getPremioMilharBrinde());
      const pago = b.situacao === "pago" ? conf.valorGanho : 0;
      premiosPagos += pago;

      if (b.situacao === "pendente") {
        qtdEmAberto += 1;
        valorEmAberto += b.total;
      }

      // Por cambista (para tabelas TOP 5)
      if (cam) {
        const r =
          porCambista.get(cam.id) ?? {
            cambista: cam,
            qtdBilhetes: 0,
            venda: 0,
            comissao: 0,
            premio: 0,
          };
        r.qtdBilhetes += 1;
        r.venda += b.total;
        r.comissao += comissao;
        r.premio += pago;
        porCambista.set(cam.id, r);
      }

      // Por extração / categoria / modalidade
      const extr = extracaoMap.get(b.extracaoId);
      const nomeExt = extr?.nome ?? b.extracaoNome ?? "—";
      porExtracao.set(nomeExt, (porExtracao.get(nomeExt) ?? 0) + 1);
      const categoria = extr?.tipo?.trim() || "Tradicional";
      porCategoria.set(categoria, (porCategoria.get(categoria) ?? 0) + 1);

      // TOP 5 números + Modalidades mais jogadas
      for (const item of b.itens) {
        const cat = categoriaPalpite(item.modalidade);
        const rotuloMod =
          item.modalidade === "milhar"
            ? "Milhar"
            : item.modalidade === "centena"
              ? "Centena"
              : item.modalidade === "dezena"
                ? "Dezena"
                : item.modalidade === "grupo"
                  ? "Grupo"
                  : item.modalidade.startsWith("duque")
                    ? "Duques"
                    : item.modalidade.startsWith("terno")
                      ? "Ternos"
                      : item.modalidade.startsWith("passe")
                        ? "Passes"
                        : item.modalidade.startsWith("milhar")
                          ? "Milhar"
                          : item.modalidade.startsWith("centena")
                            ? "Centena"
                            : item.modalidade;
        porModalidade.set(rotuloMod, (porModalidade.get(rotuloMod) ?? 0) + 1);

        const palpites = item.numeros
          .trim()
          .split(/\s+/)
          .map((s) => s.trim())
          .filter(Boolean);
        if (!cat) continue;
        for (const p of palpites) {
          const norm = normalizaPalpite(p, cat);
          if (!norm) continue;
          const bucket =
            cat === "milhar"
              ? topMilhar
              : cat === "centena"
                ? topCentena
                : cat === "dezena"
                  ? topDezena
                  : topGrupo;
          bucket.set(norm, (bucket.get(norm) ?? 0) + 1);
        }
      }
    }

    // % de gerentes: aproximação = comissão bruta dos gerentes sobre vendas dos cambistas vinculados.
    let comissaoGerentes = 0;
    const gerentePorCambista = new Map<string, string>();
    for (const c of cambistas) gerentePorCambista.set(c.id, c.gerenteId);
    const gerenteMap = new Map<string, number>(); // bruto%
    for (const g of gerentes) gerenteMap.set(g.id, g.comissaoBruto ?? 0);
    for (const b of bilhetesFiltrados) {
      const gid = gerentePorCambista.get(b.cambistaId);
      if (!gid) continue;
      const pct = gerenteMap.get(gid) ?? 0;
      if (pct > 0) comissaoGerentes += (b.total * pct) / 100;
    }

    return {
      entrada,
      premiosPagos,
      comissaoCambistas,
      comissaoGerentes,
      qtdEmAberto,
      valorEmAberto,
      ultimaData,
      vendedoresAtivosCount: vendedoresAtivos.size,
      porCambista,
      porExtracao,
      porCategoria,
      porModalidade,
      topMilhar,
      topCentena,
      topDezena,
      topGrupo,
    };
  }, [bilhetesFiltrados, cambistaMap, extracaoMap, cambistas, gerentes]);

  const total =
    calculos.entrada -
    calculos.premiosPagos -
    calculos.comissaoCambistas -
    calculos.comissaoGerentes;

  const pctPremio =
    calculos.entrada > 0 ? (calculos.premiosPagos / calculos.entrada) * 100 : 0;

  const ultimaApostaTxt = useMemo(() => {
    if (!calculos.ultimaData.data) return "—";
    const dt = parseDataPtBrOuIso(calculos.ultimaData.data);
    if (!dt) return calculos.ultimaData.data;
    const dd = String(dt.getDate()).padStart(2, "0");
    const mm = String(dt.getMonth() + 1).padStart(2, "0");
    const yyyy = dt.getFullYear();
    const hh = String(dt.getHours()).padStart(2, "0");
    const mi = String(dt.getMinutes()).padStart(2, "0");
    return (
      <>
        <span>{`${dd}/${mm}/${yyyy}`}</span>
        <span className="block text-base font-semibold text-gray-600">{`${hh}:${mi}`}</span>
      </>
    );
  }, [calculos.ultimaData]);

  // Donut: Modalidades mais jogadas (top 6 + "Outras")
  const modalidadesData = useMemo(() => {
    const arr = Array.from(calculos.porModalidade.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
    if (arr.length <= 6) return arr;
    const head = arr.slice(0, 5);
    const tail = arr.slice(5).reduce((s, x) => s + x.value, 0);
    return [...head, { name: "Outras", value: tail }];
  }, [calculos.porModalidade]);

  const categoriasData = useMemo(
    () =>
      Array.from(calculos.porCategoria.entries())
        .map(([name, value]) => ({ name, value }))
        .sort((a, b) => b.value - a.value),
    [calculos.porCategoria],
  );

  const extracoesData = useMemo(() => {
    const arr = Array.from(calculos.porExtracao.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
    if (arr.length <= 6) return arr;
    const head = arr.slice(0, 5);
    const tail = arr.slice(5).reduce((s, x) => s + x.value, 0);
    return [...head, { name: "Outras", value: tail }];
  }, [calculos.porExtracao]);

  const topNumeros = (m: Map<string, number>) =>
    Array.from(m.entries())
      .map(([num, qtd]) => ({ num, qtd }))
      .sort((a, b) => b.qtd - a.qtd)
      .slice(0, 5);

  const cambistasMaisJogos = useMemo(() => {
    return Array.from(calculos.porCambista.values())
      .sort((a, b) => b.qtdBilhetes - a.qtdBilhetes)
      .slice(0, 5);
  }, [calculos.porCambista]);

  const cambistasMaiorLucro = useMemo(() => {
    return Array.from(calculos.porCambista.values())
      .map((r) => ({ ...r, total: r.venda - r.premio - r.comissao }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 5);
  }, [calculos.porCambista]);

  // O botão "Buscar" só recarrega dados do storage. Os filtros já reagem em tempo real.
  const onBuscar = () => carregar();

  const totalBilhetes = bilhetesFiltrados.length;

  return (
    <div>
      <header className="-mx-4 mb-4 flex items-center gap-2 bg-gray-800 px-4 py-3 text-white md:-mx-6 md:px-6">
        <h1 className="text-base font-semibold uppercase tracking-wide">Dashboard</h1>
      </header>

      {/* Filtros */}
      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-6">
        <FiltroCampo label="Gerente">
          <select
            value={gerenteId}
            onChange={(e) => setGerenteId(e.target.value)}
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm text-gray-900"
          >
            <option value="todos">Todos</option>
            {gerentes.map((g) => (
              <option key={g.id} value={g.id}>
                {g.login}
              </option>
            ))}
          </select>
        </FiltroCampo>
        <FiltroCampo label="Cambista">
          <select
            value={cambistaId}
            onChange={(e) => setCambistaId(e.target.value)}
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm text-gray-900"
          >
            <option value="todos">Todos</option>
            {cambistasFiltro.map((c) => (
              <option key={c.id} value={c.id}>
                {c.login}
              </option>
            ))}
          </select>
        </FiltroCampo>
        <FiltroCampo label="Categoria">
          <select
            value={categoriaFiltro}
            onChange={(e) => setCategoriaFiltro(e.target.value)}
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm text-gray-900"
          >
            <option value="todas">Todas</option>
            {categoriasDisponiveis.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </FiltroCampo>
        <FiltroCampo label="Loteria">
          <select
            value={extracaoFiltro}
            onChange={(e) => setExtracaoFiltro(e.target.value)}
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm text-gray-900"
          >
            <option value="todas">Todas</option>
            {extracoes.map((e) => (
              <option key={e.id} value={e.id}>
                {e.nome}
              </option>
            ))}
          </select>
        </FiltroCampo>
        <FiltroCampo label="Período" className="col-span-1 sm:col-span-2 xl:col-span-1">
          <div className="flex gap-1">
            <input
              type="date"
              value={dataInicio}
              onChange={(e) => setDataInicio(e.target.value)}
              className="w-full rounded border border-gray-300 px-2 py-2 text-sm text-gray-900"
            />
            <input
              type="date"
              value={dataFim}
              onChange={(e) => setDataFim(e.target.value)}
              className="w-full rounded border border-gray-300 px-2 py-2 text-sm text-gray-900"
            />
          </div>
        </FiltroCampo>
        <FiltroCampo label="&nbsp;">
          <button
            type="button"
            onClick={onBuscar}
            className="w-full rounded bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600"
          >
            Buscar
          </button>
        </FiltroCampo>
      </div>

      {/* Informações Gerais */}
      <Secao titulo="Informações gerais">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <KpiCard label="Última aposta" tone="neutral">
            <span className="text-lg font-bold leading-tight text-gray-800">
              {ultimaApostaTxt}
            </span>
          </KpiCard>
          <KpiCard label="Qtd. apostas" tone="neutral">
            <span className="text-2xl font-extrabold text-gray-800">{totalBilhetes}</span>
          </KpiCard>
          <KpiCard label="Qtd. em aberto" tone="rose">
            <span className="text-2xl font-extrabold text-rose-700">
              {calculos.qtdEmAberto}
            </span>
          </KpiCard>
          <KpiCard label="Vendedores ativos" tone="amber">
            <span className="text-2xl font-extrabold text-amber-700">
              {calculos.vendedoresAtivosCount}
            </span>
          </KpiCard>
          <KpiCard label="% prêmio" tone="rose">
            <span className="text-2xl font-extrabold text-rose-700">
              {pctPremio.toFixed(1)}%
            </span>
          </KpiCard>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-5">
          <KpiCard label="Entrada" tone="green">
            <span className="text-xl font-extrabold text-emerald-700">
              {formatarMoeda(calculos.entrada)}
            </span>
          </KpiCard>
          <KpiCard label="Prêmios" tone="rose">
            <span className="text-xl font-extrabold text-rose-700">
              {formatarMoeda(calculos.premiosPagos)}
            </span>
          </KpiCard>
          <KpiCard label="% vendedores" tone="rose">
            <span className="text-xl font-extrabold text-rose-700">
              {formatarMoeda(calculos.comissaoCambistas)}
            </span>
          </KpiCard>
          <KpiCard label="% gerentes" tone="amber">
            <span className="text-xl font-extrabold text-amber-700">
              {formatarMoeda(calculos.comissaoGerentes)}
            </span>
          </KpiCard>
          <KpiCard label="Total" tone={total >= 0 ? "green" : "rose"}>
            <span
              className={`text-xl font-extrabold ${
                total >= 0 ? "text-emerald-700" : "text-rose-700"
              }`}
            >
              {formatarMoeda(total)}
            </span>
          </KpiCard>
        </div>
      </Secao>

      {/* Donuts */}
      <div className="mb-6 grid gap-4 lg:grid-cols-3">
        <DonutCard
          title="Modalidades mais jogadas"
          data={modalidadesData}
          emptyLabel="Sem itens no período"
        />
        <DonutCard
          title="Categorias mais jogadas"
          data={categoriasData}
          emptyLabel="Sem itens no período"
        />
        <DonutCard
          title="Extrações mais jogadas"
          data={extracoesData}
          emptyLabel="Sem bilhetes no período"
        />
      </div>

      {/* TOP 5 números por modalidade */}
      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <TopNumerosCard titulo="Top 5 milhares" data={topNumeros(calculos.topMilhar)} />
        <TopNumerosCard titulo="Top 5 centenas" data={topNumeros(calculos.topCentena)} />
        <TopNumerosCard titulo="Top 5 dezenas" data={topNumeros(calculos.topDezena)} />
        <TopNumerosCard titulo="Top 5 grupos" data={topNumeros(calculos.topGrupo)} />
      </div>

      {/* Alertas inteligentes — cambistas em prejuízo no médio/longo prazo */}
      <div className="mb-6">
        <AlertasCambistas diasAnalise={30} maxItens={5} />
      </div>

      {/* TOP 5 cambistas: mais jogos / maior lucro */}
      <div className="mb-6 grid gap-4 lg:grid-cols-2">
        <TabelaCambistasCard
          titulo="Top 5 cambistas - mais jogos"
          linhas={cambistasMaisJogos.map((r) => ({
            cambista: r.cambista.login,
            venda: r.venda,
            comissao: r.comissao,
            premio: r.premio,
            total: r.venda - r.premio - r.comissao,
          }))}
        />
        <TabelaCambistasCard
          titulo="Top 5 cambistas - maior lucro"
          linhas={cambistasMaiorLucro.map((r) => ({
            cambista: r.cambista.login,
            venda: r.venda,
            comissao: r.comissao,
            premio: r.premio,
            total: r.total,
          }))}
        />
      </div>

      {/* Rodapé com saldo em aberto detalhado */}
      <div className="mb-6 rounded-lg border border-gray-200 bg-white p-4 text-sm text-gray-600 shadow-sm">
        <p>
          <strong>Em aberto (pendentes):</strong> {calculos.qtdEmAberto} bilhete(s) ·{" "}
          <strong>{formatarMoeda(calculos.valorEmAberto)}</strong>
        </p>
        <p className="mt-1 text-xs text-gray-500">
          Estimativa de prêmios pagos baseada nos bilhetes com situação “pago” no período.
          Estimativa de % gerentes usa a comissão bruta de cada gerente sobre a venda dos
          cambistas vinculados.
        </p>
        <p className="mt-2 text-xs text-gray-400">
          Saldo (em aberto) por cambista no painel:{" "}
          {Array.from(idsCambistasFiltro)
            .map((cid) => getJogosEmAberto(cid))
            .reduce((s, v) => s + v, 0)
            .toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
        </p>
      </div>
    </div>
  );
}

function FiltroCampo({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <label
        className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-700"
        dangerouslySetInnerHTML={{ __html: label }}
      />
      {children}
    </div>
  );
}

function Secao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="mb-6 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <h2 className="mb-3 -mx-4 -mt-4 bg-gray-800 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white">
        {titulo}
      </h2>
      {children}
    </section>
  );
}

function KpiCard({
  label,
  tone,
  children,
}: {
  label: string;
  tone: "neutral" | "green" | "rose" | "amber";
  children: React.ReactNode;
}) {
  const bg =
    tone === "green"
      ? "bg-emerald-50 border-emerald-200"
      : tone === "rose"
        ? "bg-rose-50 border-rose-200"
        : tone === "amber"
          ? "bg-amber-50 border-amber-200"
          : "bg-gray-50 border-gray-200";
  return (
    <div className={`rounded-md border px-3 py-2 ${bg}`}>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">
        {label}
      </p>
      <div className="mt-1 leading-tight">{children}</div>
    </div>
  );
}

interface TopNumerosCardProps {
  titulo: string;
  data: { num: string; qtd: number }[];
}

function TopNumerosCard({ titulo, data }: TopNumerosCardProps) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
      <div className="rounded-t-lg bg-gray-800 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-white">
        {titulo}
      </div>
      <div className="flex flex-wrap items-center justify-center gap-2 p-3">
        {data.length === 0 ? (
          <p className="py-4 text-xs text-gray-400">Sem palpites no período</p>
        ) : (
          data.map((d) => (
            <div
              key={d.num}
              className="min-w-[64px] rounded border border-gray-300 bg-gray-50 px-3 py-2 text-center"
            >
              <p className="text-[10px] font-semibold uppercase text-gray-500">
                {d.qtd}x
              </p>
              <p className="font-mono text-base font-extrabold tabular-nums text-gray-900">
                {d.num}
              </p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

interface LinhaCambistaTabela {
  cambista: string;
  venda: number;
  comissao: number;
  premio: number;
  total: number;
}

function TabelaCambistasCard({
  titulo,
  linhas,
}: {
  titulo: string;
  linhas: LinhaCambistaTabela[];
}) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
      <div className="rounded-t-lg bg-gray-800 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-white">
        {titulo}
      </div>
      {linhas.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-gray-500">
          Sem dados no período
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50 text-xs uppercase text-gray-600">
              <tr>
                <th className="px-3 py-2 text-left">Cambista</th>
                <th className="px-3 py-2 text-right">Venda</th>
                <th className="px-3 py-2 text-right">Comissão</th>
                <th className="px-3 py-2 text-right">Prêmio</th>
                <th className="px-3 py-2 text-right">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {linhas.map((r, i) => (
                <tr key={`${r.cambista}-${i}`} className="text-gray-700">
                  <td className="px-3 py-2 font-medium text-gray-900">{r.cambista}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {r.venda.toLocaleString("pt-BR", {
                      style: "currency",
                      currency: "BRL",
                    })}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {r.comissao.toLocaleString("pt-BR", {
                      style: "currency",
                      currency: "BRL",
                    })}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {r.premio.toLocaleString("pt-BR", {
                      style: "currency",
                      currency: "BRL",
                    })}
                  </td>
                  <td
                    className={`px-3 py-2 text-right font-semibold tabular-nums ${
                      r.total >= 0 ? "text-emerald-700" : "text-rose-700"
                    }`}
                  >
                    {r.total.toLocaleString("pt-BR", {
                      style: "currency",
                      currency: "BRL",
                    })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
