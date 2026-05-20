"use client";

import { forwardRef, type CSSProperties } from "react";
import { COTACOES_LABELS } from "@/lib/cotacoes";
import type { Bilhete } from "@/lib/types";
import { formatarDataHoraBr } from "@/lib/date-utils";

interface Props {
  bilhete: Bilhete;
  bancaNome: string;
  cambistaNome: string;
  cotacaoPara: (modalidade: string) => number;
  rodapeTexto?: string;
  logoUrl?: string | null;
}

function moeda(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function moedaSemPrefixo(v: number) {
  return v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const SITUACAO_LABEL: Record<string, { txt: string; color: string }> = {
  pendente: { txt: "pendente", color: "#b45309" },
  pago: { txt: "pago", color: "#047857" },
  perdedor: { txt: "sem prêmio", color: "#475569" },
  cancelado: { txt: "cancelado", color: "#be123c" },
};

const BICHOS = [
  "Avestruz", "Águia", "Burro", "Borboleta", "Cachorro", "Cabra", "Carneiro",
  "Camelo", "Cobra", "Coelho", "Cavalo", "Elefante", "Galo", "Gato", "Jacaré",
  "Leão", "Macaco", "Porco", "Pavão", "Peru", "Touro", "Tigre", "Urso", "Veado", "Vaca",
];

function separarExtracaoHorario(nome: string): { nome: string; horario: string } {
  const texto = nome.trim().replace(/\s+/g, " ");
  const m = texto.match(/^(.*?)(?:\s+(\d{1,2}:\d{2}))$/);
  if (!m) return { nome: texto || "—", horario: "" };
  return { nome: (m[1] || texto).trim(), horario: m[2] ?? "" };
}

function bichoDoGrupo(numero: string): string | null {
  const n = parseInt(numero, 10);
  if (Number.isNaN(n) || n < 1 || n > 25) return null;
  return BICHOS[n - 1] ?? null;
}

function rotuloModalidade(mod: string): { tipo: string; variante?: string } {
  if (mod === "milhar") return { tipo: "MILHAR" };
  if (mod === "centena") return { tipo: "CENTENA" };
  if (mod === "dezena") return { tipo: "DEZENA" };
  if (mod === "grupo") return { tipo: "GRUPO" };
  if (mod === "milhar_e_centena") return { tipo: "MILHAR E CENTENA" };
  if (mod === "milhar_invertida") return { tipo: "MILHAR", variante: "Invertida" };
  if (mod === "centena_invertida") return { tipo: "CENTENA", variante: "Invertida" };
  if (mod === "mc_invertida") return { tipo: "MC", variante: "Invertida" };
  if (mod.startsWith("duque_grupo")) return { tipo: "DUQUE DE GRUPO" };
  if (mod.startsWith("terno_grupo")) return { tipo: "TERNO DE GRUPO" };
  if (mod.startsWith("duque_dezena")) return { tipo: "DUQUE DE DEZENA" };
  if (mod.startsWith("terno_dezena")) return { tipo: "TERNO DE DEZENA" };
  if (mod.startsWith("passe_vai_e_volta")) return { tipo: "PASSE V&V" };
  if (mod.startsWith("passe")) return { tipo: "PASSE" };
  return { tipo: (COTACOES_LABELS[mod as keyof typeof COTACOES_LABELS] ?? mod).toUpperCase() };
}

const S: Record<string, CSSProperties> = {
  card: {
    width: "100%",
    maxWidth: 380,
    margin: "0 auto",
    padding: 10,
    background: "#ffffff",
    borderRadius: 18,
    border: "2px solid #e5e7eb",
    boxShadow: "0 6px 24px -8px rgba(15, 23, 42, 0.18)",
    fontFamily: "system-ui, -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif",
    color: "#0f172a",
    boxSizing: "border-box",
    fontSize: 12.5,
    overflow: "hidden",
  },
  topBar: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginBottom: 10,
  },
  hline: { flex: 1, height: 1, background: "linear-gradient(to right, transparent 0%, #fbbf24 100%)" },
  hlineR: { flex: 1, height: 1, background: "linear-gradient(to left, transparent 0%, #fbbf24 100%)" },
  star: { color: "#f59e0b", fontSize: 14, lineHeight: 1, fontWeight: 700 },
  titlePill: {
    padding: "5px 16px",
    background: "#0f172a",
    color: "#ffffff",
    fontSize: 12,
    fontWeight: 800,
    letterSpacing: "0.32em",
    borderRadius: 6,
    boxShadow: "0 2px 6px rgba(0,0,0,.2)",
    whiteSpace: "nowrap",
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
  },
  block: {
    border: "1px solid #e5e7eb",
    background: "#ffffff",
    borderRadius: 12,
    padding: "8px 12px",
  },
  row: {
    display: "flex",
    alignItems: "flex-start",
    gap: 6,
    padding: "4px 0",
    fontSize: 12,
    lineHeight: 1.25,
  },
  rowDot: {
    width: 6,
    height: 6,
    minWidth: 6,
    borderRadius: 3,
    background: "#047857",
    marginTop: 5,
    flexShrink: 0,
  },
  rowLabel: { fontWeight: 700, color: "#475569", letterSpacing: "0.02em", flexShrink: 0 },
  rowValue: {
    flex: 1,
    color: "#0f172a",
    minWidth: 0,
    fontWeight: 600,
    overflowWrap: "anywhere",
    wordBreak: "break-word",
  },
  sep: { marginLeft: 12, borderTop: "1px dashed #e5e7eb", height: 0 },
  banner: {
    display: "grid",
    gridTemplateColumns: "auto minmax(0, 1fr)",
    alignItems: "stretch",
    borderRadius: 12,
    border: "2px solid #0f172a",
    marginTop: 10,
    width: "100%",
    minWidth: 0,
    overflow: "hidden",
    boxSizing: "border-box",
  },
  bannerLeft: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    background: "#0f172a",
    color: "#ffffff",
    padding: "6px 10px",
    fontSize: 10.5,
    fontWeight: 800,
    letterSpacing: "0.1em",
    whiteSpace: "nowrap",
    boxSizing: "border-box",
  },
  bannerRight: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    background: "#ffffff",
    color: "#0f172a",
    padding: "6px 10px",
    width: "100%",
    fontWeight: 800,
    fontSize: 12,
    gap: 6,
    minWidth: 0,
  },
  bannerName: {
    minWidth: 0,
    flex: 1,
    textTransform: "uppercase",
    lineHeight: 1.15,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  bannerTime: {
    whiteSpace: "nowrap",
    textAlign: "right",
    fontVariantNumeric: "tabular-nums",
    lineHeight: 1.15,
    flexShrink: 0,
  },
  itensWrap: {
    marginTop: 14,
    display: "flex",
    flexDirection: "column",
    gap: 10,
  },
  item: {
    border: "1.5px solid #e5e7eb",
    background: "#ffffff",
    borderRadius: 14,
    overflow: "hidden",
  },
  itemHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "5px 10px",
    background: "#0f172a",
    color: "#ffffff",
    fontWeight: 800,
    fontSize: 10.5,
    letterSpacing: "0.14em",
  },
  itemVariantePill: {
    background: "#f59e0b",
    color: "#ffffff",
    fontSize: 10,
    fontWeight: 800,
    padding: "2px 7px",
    borderRadius: 999,
    letterSpacing: "0.08em",
  },
  palpiteGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: 6,
    padding: 8,
  },
  palpiteCard: {
    display: "grid",
    gridTemplateColumns: "28px minmax(0, 1fr)",
    gap: 5,
    alignItems: "center",
    border: "1px solid #eef2f7",
    borderRadius: 10,
    background: "#fbfdff",
    padding: "6px 7px",
    minWidth: 0,
  },
  palpiteCircle: {
    width: 28,
    height: 28,
    minWidth: 28,
    borderRadius: 14,
    background: "#0f172a",
    color: "#fcd34d",
    border: "2px solid #fbbf24",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    fontWeight: 800,
    fontSize: 11,
    flexShrink: 0,
    fontFamily: "monospace",
  },
  palpiteInfo: { flex: 1, minWidth: 0 },
  palpiteNome: {
    fontSize: 11,
    fontWeight: 800,
    color: "#0f172a",
    margin: 0,
    overflow: "hidden",
    display: "-webkit-box",
    WebkitLineClamp: 2,
    WebkitBoxOrient: "vertical",
    lineHeight: 1.12,
    overflowWrap: "anywhere",
  },
  palpiteMeta: {
    color: "#64748b",
    margin: "1px 0 0 0",
    fontSize: 9.2,
    fontWeight: 600,
    lineHeight: 1.15,
    overflowWrap: "anywhere",
  },
  palpiteValor: {
    color: "#047857",
    fontWeight: 800,
    fontSize: 11.5,
    fontVariantNumeric: "tabular-nums",
    whiteSpace: "nowrap",
    marginTop: 2,
    display: "block",
  },
  fullWidth: {
    gridColumn: "1 / -1",
  },
  brindeWrap: {
    marginTop: 10,
    display: "flex",
    flexDirection: "column",
    gap: 4,
    border: "1.5px dashed #fbbf24",
    background: "#fffbeb",
    borderRadius: 12,
    padding: "8px 12px",
  },
  brindeLine: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    fontSize: 11.5,
    color: "#78350f",
    gap: 8,
    width: "100%",
    minWidth: 0,
    boxSizing: "border-box",
    flexWrap: "wrap",
  },
  totalRow: {
    marginTop: 10,
    display: "grid",
    gridTemplateColumns: "auto minmax(0, 1fr)",
    alignItems: "stretch",
    overflow: "hidden",
    borderRadius: 14,
    border: "2px solid #0f172a",
    width: "100%",
    boxSizing: "border-box",
  },
  totalLeft: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "#0f172a",
    color: "#ffffff",
    padding: "10px 16px",
    fontWeight: 800,
    letterSpacing: "0.12em",
    fontSize: 12.5,
    whiteSpace: "nowrap",
    boxSizing: "border-box",
  },
  totalRight: {
    width: "100%",
    minWidth: 0,
    background: "#f8fafc",
    display: "flex",
    alignItems: "center",
    justifyContent: "flex-end",
    padding: "10px 14px",
    color: "#059669",
    fontSize: 18,
    fontWeight: 800,
    fontVariantNumeric: "tabular-nums",
    whiteSpace: "nowrap",
  },
  footerNote: {
    marginTop: 10,
    border: "1.5px solid #fcd34d",
    background: "#fffbeb",
    borderRadius: 10,
    padding: "9px 12px",
    color: "#78350f",
    fontSize: 10.5,
    lineHeight: 1.45,
    textAlign: "center",
  },
};

const BilheteDetalhado = forwardRef<HTMLDivElement, Props>(function BilheteDetalhado(
  { bilhete: b, bancaNome, cambistaNome, cotacaoPara, rodapeTexto, logoUrl },
  ref
) {
  const sit = SITUACAO_LABEL[b.situacao] ?? SITUACAO_LABEL.pendente;
  const { nome: extNome, horario: extHora } = separarExtracaoHorario(b.extracaoNome);

  return (
    <div ref={ref} className="bilhete-card" style={S.card}>
      {/* Topo: ★ BILHETE ★ */}
      <div style={S.topBar}>
        <div style={S.hline} />
        <span style={S.star}>★</span>
        <div style={S.titlePill}>
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={logoUrl}
              alt=""
              crossOrigin="anonymous"
              style={{ height: 12, display: "inline-block", verticalAlign: "middle" }}
            />
          ) : null}
          BILHETE
        </div>
        <span style={S.star}>★</span>
        <div style={S.hlineR} />
      </div>

      {/* Cabeçalho com infos */}
      <div style={S.block}>
        <InfoRow label="BILHETE" value={<strong style={{ letterSpacing: "0.04em" }}>{b.codigo}</strong>} />
        <div style={S.sep} />
        <InfoRow label="EMITIDO" value={formatarDataHoraBr(b.data)} />
        <div style={S.sep} />
        <InfoRow label="PONTO" value={cambistaNome || "—"} />
        <div style={S.sep} />
        <InfoRow
          label="SITUAÇÃO"
          value={<span style={{ color: sit.color, fontWeight: 800, textTransform: "lowercase" }}>{sit.txt}</span>}
        />
      </div>

      {/* Banner extração */}
      <div style={S.banner}>
        <div style={S.bannerLeft}>
          <span style={{ color: "#fbbf24" }}>●</span>
          <span>TRADICIONAL</span>
        </div>
        <div style={S.bannerRight}>
          <span style={S.bannerName}>{extNome}</span>
          {extHora && <span style={S.bannerTime}>{extHora}</span>}
        </div>
      </div>

      {/* Itens compactos: palpites lado a lado para reduzir a altura do bilhete */}
      <div style={S.itensWrap}>
        {b.itens.map((it, i) => {
          const r = rotuloModalidade(it.modalidade);
          const palpites = (it.numeros || "").trim().split(/\s+/).filter(Boolean);
          const qtd = Math.max(1, palpites.length);
          const valorPorPalpite = it.valor / qtd;
          const isGrupo = it.modalidade.includes("grupo");
          const cot = cotacaoPara(it.modalidade);

          return (
            <div key={i} style={S.item}>
              <div style={S.itemHeader}>
                <span>{r.tipo}</span>
                {r.variante && <span style={S.itemVariantePill}>{r.variante}</span>}
              </div>
              <div style={S.palpiteGrid}>
                {palpites.map((p, j) => {
                  const nomeBicho = isGrupo ? bichoDoGrupo(p) : null;
                  const titulo = nomeBicho
                    ? `${p.padStart(2, "0")} — ${nomeBicho.toUpperCase()}`
                    : p;
                  const cardStyle =
                    palpites.length === 1 ? { ...S.palpiteCard, ...S.fullWidth } : S.palpiteCard;
                  return (
                    <div key={j} style={cardStyle}>
                      <div style={S.palpiteCircle}>{p.length <= 2 ? p.padStart(2, "0") : p}</div>
                      <div style={S.palpiteInfo}>
                        <p style={S.palpiteNome} title={titulo}>{titulo}</p>
                        <p style={S.palpiteMeta}>
                          {it.premio ?? "1/1"} · Cotação {moedaSemPrefixo(cot)}
                        </p>
                        <span style={S.palpiteValor}>= {moedaSemPrefixo(valorPorPalpite)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Milhar brinde */}
      {b.itens.some((x) => x.milharBrinde) && (
        <div style={S.brindeWrap}>
          {b.itens.filter((x) => x.milharBrinde).map((x, i) => (
            <div key={i} style={S.brindeLine}>
              <span style={{ fontWeight: 700, letterSpacing: "0.06em" }}>MILHAR BRINDE {x.premio ?? "1/1"}</span>
              <strong style={{ fontFamily: "monospace", fontSize: 13 }}>{x.milharBrinde}</strong>
            </div>
          ))}
        </div>
      )}

      {/* Total */}
      <div style={S.totalRow}>
        <div style={S.totalLeft}>
          <span>TOTAL</span>
        </div>
        <div style={S.totalRight}>{moeda(b.total)}</div>
      </div>

      {/* Rodapé editável */}
      <div style={S.footerNote}>
        {rodapeTexto ||
          "Confira seu bilhete, a banca não se responsabiliza por qualquer erro do cambista."}{" "}
        <strong>{bancaNome}</strong> agradece a sua preferência, boa sorte e ótimos resultados!
      </div>
    </div>
  );
});

export default BilheteDetalhado;

function InfoRow({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div style={S.row}>
      <span style={S.rowDot} />
      <span style={S.rowLabel}>{label}:</span>
      <span style={S.rowValue}>{value}</span>
    </div>
  );
}
