"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  getCambistas,
  getConfig,
  getBilhetes,
  getExtracoes,
  extracaoAceitaApostas,
  extracaoRodaHoje,
} from "@/lib/store";
import { useConfigRefresh, useVisibilityRefresh } from "@/lib/use-config-refresh";
import { useTheme } from "@/app/components/ThemeProvider";
import { useBranding } from "@/app/components/BrandingProvider";
import InstallAppButton from "@/app/components/InstallAppButton";
import type { Bilhete } from "@/lib/types";

function formatarMoeda(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function dataParaTexto(s: string): string {
  // "12/05/26, 14:23" → "Hoje, 14:23" / "Ontem, 14:23" / "12/05, 14:23"
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{2,4})[,\s]*(\d{2}):(\d{2})/);
  if (!m) return s;
  const [, d, mm, y, hh, mi] = m;
  const dt = new Date(Number(y.length === 2 ? "20" + y : y), Number(mm) - 1, Number(d));
  const hoje = new Date();
  const ontem = new Date();
  ontem.setDate(hoje.getDate() - 1);
  const isMesmoDia = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  if (isMesmoDia(dt, hoje)) return `Hoje, ${hh}:${mi}`;
  if (isMesmoDia(dt, ontem)) return `Ontem, ${hh}:${mi}`;
  return `${d}/${mm}, ${hh}:${mi}`;
}

interface Resumo {
  cambistaId: string;
  apostasHoje: number;
  totalHoje: number;
  premioPendente: number;
  ultimos: Bilhete[];
  bilhetesPendentes: number;
}

function resumoDoCambista(cambistaId: string): Resumo {
  const todos = getBilhetes().filter((b) => b.cambistaId === cambistaId);
  const hoje = new Date();
  const ehHoje = (s: string) => {
    const m = s.match(/^(\d{2})\/(\d{2})\/(\d{2,4})/);
    if (!m) return false;
    const [, d, mm, y] = m;
    return (
      Number(d) === hoje.getDate() &&
      Number(mm) === hoje.getMonth() + 1 &&
      (y.length === 2 ? Number("20" + y) : Number(y)) === hoje.getFullYear()
    );
  };
  const bilhetesHoje = todos.filter((b) => ehHoje(b.data));
  const pendentes = todos.filter((b) => b.situacao === "pendente");
  const ultimos = [...todos]
    .sort((a, z) => new Date(z.data).getTime() - new Date(a.data).getTime())
    .slice(0, 4);
  return {
    cambistaId,
    apostasHoje: bilhetesHoje.length,
    totalHoje: bilhetesHoje.reduce((s, b) => s + b.total, 0),
    premioPendente: 0,
    bilhetesPendentes: pendentes.length,
    ultimos,
  };
}

const SVG = {
  bell: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-5 w-5"><path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.4-1.4A2 2 0 0118 14.2V11a6 6 0 10-12 0v3.2c0 .5-.2 1-.6 1.4L4 17h5m6 0a3 3 0 11-6 0"/></svg>,
  gear: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-5 w-5"><path strokeLinecap="round" strokeLinejoin="round" d="M10.3 4.3a1.9 1.9 0 013.4 0 1.7 1.7 0 002.6 1.1c1.5-.9 3.3.9 2.4 2.4a1.7 1.7 0 001 2.6 1.9 1.9 0 010 3.4 1.7 1.7 0 00-1 2.6c.9 1.5-.9 3.3-2.4 2.4a1.7 1.7 0 00-2.6 1c-.3 1.8-2.9 1.8-3.4 0a1.7 1.7 0 00-2.6-1c-1.5.9-3.3-.9-2.4-2.4a1.7 1.7 0 00-1-2.6 1.9 1.9 0 010-3.4 1.7 1.7 0 001-2.6c-.9-1.5.9-3.3 2.4-2.4 1 .6 2.3.1 2.6-1z"/><circle cx="12" cy="12" r="3"/></svg>,
  repeat: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-5 w-5"><path strokeLinecap="round" strokeLinejoin="round" d="M17 1l4 4-4 4M3 11V9a4 4 0 014-4h14M7 23l-4-4 4-4M21 13v2a4 4 0 01-4 4H3"/></svg>,
  trophy: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-5 w-5"><path strokeLinecap="round" strokeLinejoin="round" d="M8 21h8M12 17v4M7 4h10v5a5 5 0 11-10 0V4zM7 4H5a2 2 0 00-2 2v1a3 3 0 003 3M17 4h2a2 2 0 012 2v1a3 3 0 01-3 3"/></svg>,
  wallet: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-5 w-5"><path strokeLinecap="round" strokeLinejoin="round" d="M3 7a2 2 0 012-2h14a2 2 0 012 2v3h-4a3 3 0 100 6h4v3a2 2 0 01-2 2H5a2 2 0 01-2-2V7z"/></svg>,
  chart: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-5 w-5"><path strokeLinecap="round" strokeLinejoin="round" d="M3 17l6-6 4 4 8-8M14 7h7v7"/></svg>,
  doc: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-5 w-5"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6M9 16h4M7 3h7l5 5v11a2 2 0 01-2 2H7a2 2 0 01-2-2V5a2 2 0 012-2zM14 3v5h5"/></svg>,
  dice: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-5 w-5"><rect x="3" y="3" width="18" height="18" rx="4"/><circle cx="8" cy="8" r="1.2" fill="currentColor"/><circle cx="16" cy="8" r="1.2" fill="currentColor"/><circle cx="12" cy="12" r="1.2" fill="currentColor"/><circle cx="8" cy="16" r="1.2" fill="currentColor"/><circle cx="16" cy="16" r="1.2" fill="currentColor"/></svg>,
  logout: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-5 w-5"><path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"/></svg>,
  moon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-5 w-5"><path strokeLinecap="round" strokeLinejoin="round" d="M21 12.8A9 9 0 1111.2 3 7 7 0 0021 12.8z"/></svg>,
  sun: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-5 w-5"><circle cx="12" cy="12" r="4"/><path strokeLinecap="round" strokeLinejoin="round" d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.66 17.66l1.42 1.42M2 12h2M20 12h2M4.93 19.07l1.42-1.42M17.66 6.34l1.42-1.42"/></svg>,
  eye: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-5 w-5"><path strokeLinecap="round" strokeLinejoin="round" d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z"/><circle cx="12" cy="12" r="3"/></svg>,
  eyeOff: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-5 w-5"><path strokeLinecap="round" strokeLinejoin="round" d="M17.94 17.94A10 10 0 0112 19c-7 0-11-7-11-7a18 18 0 014-4.94M9.9 4.24A9 9 0 0112 4c7 0 11 7 11 7a18 18 0 01-2.16 3.19M14.12 14.12A3 3 0 119.88 9.88M1 1l22 22"/></svg>,
};

const SITUACAO_STYLE: Record<string, { bg: string; text: string; label: string }> = {
  pendente: { bg: "bg-amber-100", text: "text-amber-700", label: "Aguardando" },
  pago: { bg: "bg-emerald-100", text: "text-emerald-700", label: "Pago" },
  perdedor: { bg: "bg-red-100", text: "text-red-700", label: "Sem prêmio" },
  cancelado: { bg: "bg-rose-100", text: "text-rose-700", label: "Cancelado" },
};

export default function ClienteDashboardPage() {
  const router = useRouter();
  const { resolved, toggle } = useTheme();
  const { branding } = useBranding();
  const [cambista, setCambista] = useState<{
    id: string;
    login: string;
    saldo: number;
    entrada: number;
    tipo?: "cambista" | "cliente";
  } | null>(null);
  const [codigo, setCodigo] = useState("");
  const [apostasAtivas, setApostasAtivas] = useState(true);
  const [mostrarSaldo, setMostrarSaldo] = useState(true);
  const [resumo, setResumo] = useState<Resumo | null>(null);

  const atualizarCambista = () => {
    const auth = localStorage.getItem("premiacoes_cliente");
    if (!auth) {
      // Sem sessão local. Vai para o login apenas aqui (na home), nunca
      // do meio de outras telas. Isso garante que "voltar" durante um
      // fluxo nunca cai no login por engano.
      router.replace("/cliente/login");
      return;
    }
    let cambistaId = "";
    let c = "";
    try {
      const parsed = JSON.parse(auth) as { cambistaId?: string; codigo?: string };
      cambistaId = parsed.cambistaId ?? "";
      c = parsed.codigo ?? "";
    } catch {
      // Sessão JSON corrompida: aí sim, derruba para o login.
      localStorage.removeItem("premiacoes_cliente");
      router.replace("/cliente/login");
      return;
    }
    if (!cambistaId) {
      localStorage.removeItem("premiacoes_cliente");
      router.replace("/cliente/login");
      return;
    }
    setCodigo(c);
    const cambistas = getCambistas();
    const cam = cambistas.find((x) => x.id === cambistaId);
    // SÓ derruba para o login se o cambista foi *explicitamente* marcado
    // como excluído pelo admin (status="excluido"). Se simplesmente não
    // está na lista local, mantemos a sessão — pode ser que o sync com o
    // Supabase ainda esteja em transição. Mostramos "Carregando..." até
    // a próxima atualização.
    if (cam && cam.status === "excluido") {
      localStorage.removeItem("premiacoes_cliente");
      router.replace("/cliente/login");
      return;
    }
    if (!cam) {
      // Aguarda o próximo refresh; mantém a tela em "Carregando..." sem
      // derrubar o usuário para o login.
      return;
    }
    setCambista({
      id: cam.id,
      login: cam.login,
      saldo: cam.saldo,
      entrada: cam.entrada,
      tipo: cam.tipo,
    });
    try { setResumo(resumoDoCambista(cam.id)); } catch {}
  };

  useEffect(() => {
    setApostasAtivas(getConfig().apostasAtivas ?? true);
    try { setMostrarSaldo(localStorage.getItem("premiacoes_ver_saldo") !== "0"); } catch {}
  }, []);

  useConfigRefresh((cfg) => setApostasAtivas(cfg.apostasAtivas ?? true));

  useEffect(() => {
    const auth = localStorage.getItem("premiacoes_cliente");
    if (!auth) {
      router.replace("/cliente/login");
      return;
    }
    atualizarCambista();
  }, [router]);

  useVisibilityRefresh(atualizarCambista);

  const handleSair = () => {
    localStorage.removeItem("premiacoes_cliente");
    router.replace("/cliente/login");
  };

  const toggleSaldo = () => {
    const novo = !mostrarSaldo;
    setMostrarSaldo(novo);
    try { localStorage.setItem("premiacoes_ver_saldo", novo ? "1" : "0"); } catch {}
  };

  const extracoesProximas = useMemo(() => {
    try {
      return getExtracoes()
        .filter((e) => e.ativa && extracaoAceitaApostas(e.encerra) && extracaoRodaHoje(e))
        .sort((a, b) => a.encerra.localeCompare(b.encerra))
        .slice(0, 4);
    } catch { return []; }
  }, []);

  if (!cambista) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white dark:bg-slate-950">
        <div className="text-center">
          <div className="mx-auto mb-3 h-10 w-10 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent"></div>
          <p className="text-sm text-gray-500 dark:text-slate-400">Carregando...</p>
        </div>
      </div>
    );
  }

  const disp = Math.max(0, cambista.saldo - cambista.entrada);
  const semLimite = disp <= 0;
  const bancaNome = branding.displayName || (codigo ? codigo.charAt(0).toUpperCase() + codigo.slice(1) : "Premiações");

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white pb-28 dark:from-slate-950 dark:to-slate-900">
      {/* Header com gradiente */}
      <header className="relative overflow-hidden bg-gradient-to-br from-emerald-600 via-emerald-500 to-teal-600 px-5 pb-20 pt-6 text-white shadow-lg">
        {/* Decorações */}
        <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/10 blur-xl"></div>
        <div className="pointer-events-none absolute -bottom-20 -left-10 h-48 w-48 rounded-full bg-white/10 blur-2xl"></div>

        <div className="relative flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-white/20 text-lg font-bold backdrop-blur-sm">
              {cambista.login.charAt(0).toUpperCase()}
            </div>
            <div>
              <p className="text-xs text-emerald-50/80">Olá, bem-vindo</p>
              <h1 className="text-lg font-bold leading-tight">{cambista.login}</h1>
              <p className="text-[11px] text-emerald-50/80">
                {bancaNome}
                {(cambista.tipo ?? "cambista") === "cliente" && (
                  <span className="ml-1 rounded-full bg-white/30 px-2 py-0.5 text-[10px] font-semibold">CLIENTE</span>
                )}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={toggle}
              aria-label="Alternar tema"
              className="rounded-full p-2 text-white/90 hover:bg-white/10"
            >
              {resolved === "dark" ? SVG.sun : SVG.moon}
            </button>
            <Link
              href="/cliente/configuracoes"
              className="rounded-full p-2 text-white/90 hover:bg-white/10"
              aria-label="Configurações"
            >
              {SVG.gear}
            </Link>
          </div>
        </div>
      </header>

      {/* Card de saldo (sobreposto ao header) */}
      <section className="relative -mt-14 px-4">
        <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-xl dark:border-slate-800 dark:bg-slate-800">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Disponível para vendas
            </p>
            <button
              type="button"
              onClick={toggleSaldo}
              className="rounded-full p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700"
              aria-label={mostrarSaldo ? "Ocultar saldo" : "Mostrar saldo"}
            >
              {mostrarSaldo ? SVG.eye : SVG.eyeOff}
            </button>
          </div>
          <div className="mt-1 flex items-baseline gap-2">
            {mostrarSaldo ? (
              <>
                <span className="text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">
                  {formatarMoeda(disp)}
                </span>
                {semLimite && (
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                    sem limite
                  </span>
                )}
              </>
            ) : (
              <span className="text-3xl font-extrabold tracking-tight text-slate-400">••••••</span>
            )}
          </div>

          {semLimite && (
            <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">
              Saldo zerado. Peça ao administrador para liberar limite.
            </p>
          )}

          {/* Mini stats */}
          <div className="mt-4 grid grid-cols-3 gap-2 border-t border-slate-100 pt-4 dark:border-slate-700">
            <div>
              <p className="text-[10px] font-medium uppercase tracking-wide text-slate-400">Hoje</p>
              <p className="text-sm font-bold text-slate-800 dark:text-slate-100">
                {resumo?.apostasHoje ?? 0} apostas
              </p>
              <p className="text-[10px] text-slate-500">
                {mostrarSaldo ? formatarMoeda(resumo?.totalHoje ?? 0) : "•••"}
              </p>
            </div>
            <div className="border-l border-slate-100 pl-2 dark:border-slate-700">
              <p className="text-[10px] font-medium uppercase tracking-wide text-slate-400">Pendentes</p>
              <p className="text-sm font-bold text-amber-600 dark:text-amber-400">{resumo?.bilhetesPendentes ?? 0}</p>
              <p className="text-[10px] text-slate-500">aguardando</p>
            </div>
            <div className="border-l border-slate-100 pl-2 dark:border-slate-700">
              <p className="text-[10px] font-medium uppercase tracking-wide text-slate-400">Limite</p>
              <p className="text-sm font-bold text-slate-800 dark:text-slate-100">
                {mostrarSaldo ? formatarMoeda(cambista.saldo) : "•••"}
              </p>
              <p className="text-[10px] text-slate-500">total</p>
            </div>
          </div>
        </div>
      </section>

      {/* CTAs principais */}
      <section className="mt-4 px-4">
        <div className="grid grid-cols-2 gap-3">
          <Link
            href="/cliente/vender"
            onClick={(e) => { if (!apostasAtivas || semLimite) e.preventDefault(); }}
            className={`group relative overflow-hidden rounded-2xl p-4 text-left shadow-md transition-all active:scale-[0.98] ${
              !apostasAtivas || semLimite
                ? "cursor-not-allowed bg-slate-200 text-slate-500 dark:bg-slate-700"
                : "bg-gradient-to-br from-emerald-500 to-green-600 text-white hover:shadow-lg hover:shadow-emerald-500/30"
            }`}
          >
            <div className="relative z-10">
              <div className="mb-6 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-white/20 backdrop-blur-sm">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-5 w-5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14M5 12h14"/>
                </svg>
              </div>
              <p className="text-xs font-medium uppercase tracking-wide opacity-90">Aposta</p>
              <p className="text-lg font-bold">{apostasAtivas ? "Vender" : "Indisponível"}</p>
            </div>
            <div className="pointer-events-none absolute -right-4 -top-4 h-20 w-20 rounded-full bg-white/10"></div>
          </Link>

          <Link
            href="/cliente/repetir"
            className="group relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-md transition-all hover:border-orange-300 hover:shadow-lg active:scale-[0.98] dark:border-slate-700 dark:bg-slate-800"
          >
            <div className="mb-6 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-orange-100 text-orange-600 dark:bg-orange-900/30">
              {SVG.repeat}
            </div>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">Atalho</p>
            <p className="text-lg font-bold text-slate-800 dark:text-slate-100">Repetir bilhete</p>
          </Link>
        </div>
      </section>

      {/* Próximas extrações */}
      {extracoesProximas.length > 0 && (
        <section className="mt-6 px-4">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100">Próximas extrações</h2>
            <Link href="/cliente/vender" className="text-xs font-medium text-emerald-600 hover:underline">
              Ver todas
            </Link>
          </div>
          <div className="-mx-4 overflow-x-auto px-4">
            <div className="flex gap-2 pb-2">
              {extracoesProximas.map((e) => (
                <Link
                  key={e.id}
                  href="/cliente/vender"
                  className="flex min-w-[140px] flex-col rounded-xl border border-slate-200 bg-white p-3 shadow-sm transition-all hover:border-emerald-300 hover:shadow-md dark:border-slate-700 dark:bg-slate-800"
                >
                  <p className="truncate text-xs font-semibold text-slate-800 dark:text-slate-100">{e.nome}</p>
                  <p className="mt-1 text-[10px] uppercase text-slate-400">encerra</p>
                  <p className="font-mono text-lg font-bold text-emerald-600 dark:text-emerald-400">{e.encerra}</p>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Acesso rápido (grid) */}
      <section className="mt-6 px-4">
        <h2 className="mb-2 text-sm font-bold text-slate-800 dark:text-slate-100">Acesso rápido</h2>
        <div className="grid grid-cols-4 gap-2">
          {[
            { href: "/cliente/bilhete", label: "Bilhetes", icon: SVG.doc, color: "bg-blue-100 text-blue-600 dark:bg-blue-900/30" },
            { href: "/cliente/resultado", label: "Resultados", icon: SVG.trophy, color: "bg-amber-100 text-amber-600 dark:bg-amber-900/30" },
            { href: "/cliente/caixa", label: "Caixa", icon: SVG.wallet, color: "bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30" },
            { href: "/cliente/relatorio", label: "Relatório", icon: SVG.chart, color: "bg-purple-100 text-purple-600 dark:bg-purple-900/30" },
            { href: "/cliente/sorteios", label: "Sorteios", icon: SVG.dice, color: "bg-pink-100 text-pink-600 dark:bg-pink-900/30" },
            { href: "/cliente/regulamento", label: "Regras", icon: SVG.doc, color: "bg-slate-100 text-slate-600 dark:bg-slate-700/50" },
            { href: "/cliente/repetir", label: "Repetir", icon: SVG.repeat, color: "bg-orange-100 text-orange-600 dark:bg-orange-900/30" },
            { href: "/cliente/configuracoes", label: "Config.", icon: SVG.gear, color: "bg-cyan-100 text-cyan-600 dark:bg-cyan-900/30" },
          ].map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex flex-col items-center gap-1.5 rounded-xl border border-slate-100 bg-white p-3 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md active:scale-95 dark:border-slate-700 dark:bg-slate-800"
            >
              <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${item.color}`}>
                {item.icon}
              </div>
              <span className="text-[10px] font-medium text-slate-700 dark:text-slate-200">{item.label}</span>
            </Link>
          ))}
        </div>
      </section>

      {/* Atividade recente */}
      <section className="mt-6 px-4">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100">Atividade recente</h2>
          <Link href="/cliente/bilhete" className="text-xs font-medium text-emerald-600 hover:underline">
            Ver todos
          </Link>
        </div>
        <div className="space-y-2">
          {resumo?.ultimos.length ? (
            resumo.ultimos.map((b) => {
              const st = SITUACAO_STYLE[b.situacao] ?? SITUACAO_STYLE.pendente;
              return (
                <Link
                  key={b.id}
                  href="/cliente/bilhete"
                  className="flex items-center justify-between rounded-xl border border-slate-100 bg-white p-3 shadow-sm transition-all hover:shadow-md dark:border-slate-700 dark:bg-slate-800"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs text-slate-500">#{b.codigo}</span>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${st.bg} ${st.text}`}>
                        {st.label}
                      </span>
                    </div>
                    <p className="mt-1 truncate text-sm font-medium text-slate-800 dark:text-slate-100">
                      {b.extracaoNome}
                    </p>
                    <p className="text-[11px] text-slate-500">{dataParaTexto(b.data)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-slate-800 dark:text-slate-100">
                      {mostrarSaldo ? formatarMoeda(b.total) : "•••"}
                    </p>
                    <p className="text-[10px] text-slate-400">{b.itens.length} item(ns)</p>
                  </div>
                </Link>
              );
            })
          ) : (
            <div className="rounded-xl border-2 border-dashed border-slate-200 p-6 text-center dark:border-slate-700">
              <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400 dark:bg-slate-800">
                {SVG.doc}
              </div>
              <p className="text-sm font-medium text-slate-600 dark:text-slate-300">Nenhum bilhete ainda</p>
              <p className="mt-1 text-xs text-slate-400">Faça sua primeira aposta tocando em Vender</p>
            </div>
          )}
        </div>
      </section>

      {/* Instalar app */}
      <section className="mt-6 px-4">
        <InstallAppButton variant="primary" className="w-full" label="Baixar app no celular" />
      </section>

      {/* Sair */}
      <section className="mt-4 px-4">
        <button
          onClick={handleSair}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white py-3 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
        >
          {SVG.logout}
          Sair da conta
        </button>
      </section>

      <p className="mt-4 text-center text-[10px] text-slate-400">v1.1.0 · feito com cuidado</p>
    </div>
  );
}
