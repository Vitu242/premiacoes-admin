/**
 * Lista bilhetes "pagos" com palpite duplicado vencedor — provável diferença
 * a pagar para o cliente após o fix da conferência.
 *
 * Não escreve nada no banco. Só imprime relatório.
 */
import { readFileSync } from "node:fs";

const txt = readFileSync("/var/www/premiacoes-admin/.env.local", "utf8");
for (const linha of txt.split("\n")) {
  const m = linha.match(/^([A-Z_][A-Z_0-9]*)=(.*)$/);
  if (m) process.env[m[1]] = m[2];
}
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function getJson(path) {
  const r = await fetch(`${url}${path}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  return r.json();
}

const dias = parseInt(process.argv[2] || "7", 10);
const cutoffMs = Date.now() - dias * 86400000;

console.log(`Procurando bilhetes pagos nos últimos ${dias} dias...\n`);

const bilhetes = await getJson(
  `/rest/v1/bilhetes?situacao=in.(pago,perdedor)&select=id,codigo,cambista_id,extracao_id,extracao_nome,itens,total,data,situacao&order=data.desc&limit=3000`,
);
if (!Array.isArray(bilhetes)) {
  console.error("Erro ao buscar bilhetes:", bilhetes);
  process.exit(1);
}
console.log(`Total bilhetes pagos consultados: ${bilhetes.length}`);

const resultadosCache = new Map();
function extrairDataSoData(data) {
  // Bilhete pode ter "20/05/2026, 15:08:17" — pegar só "DD/MM/YYYY".
  const m = String(data || "").match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (m) return `${m[1]}/${m[2]}/${m[3]}`;
  return data;
}
async function getResultado(extracao_id, dataBilhete) {
  const dataLimpa = extrairDataSoData(dataBilhete);
  const k = `${extracao_id}|${dataLimpa}`;
  if (resultadosCache.has(k)) return resultadosCache.get(k);
  const r = await getJson(
    `/rest/v1/resultados?extracao_id=eq.${encodeURIComponent(extracao_id)}&data=eq.${encodeURIComponent(dataLimpa)}&select=premios,grupos&limit=1`,
  );
  const out = Array.isArray(r) && r[0] ? r[0] : null;
  resultadosCache.set(k, out);
  return out;
}

const cambistas = await getJson(`/rest/v1/cambistas?select=id,login,cotacao_m,cotacao_c,cotacao_d,cotacao_g,cotacoes`);
const camMap = new Map();
for (const c of cambistas) camMap.set(c.id, c);

function parseDataBilhete(s) {
  if (!s) return 0;
  if (typeof s === "string") {
    const m = s.match(/^(\d{2})\/(\d{2})\/(\d{2,4})/);
    if (m) {
      const yy = m[3].length === 2 ? 2000 + parseInt(m[3], 10) : parseInt(m[3], 10);
      return new Date(yy, parseInt(m[2], 10) - 1, parseInt(m[1], 10)).getTime();
    }
    const t = Date.parse(s);
    if (!Number.isNaN(t)) return t;
  }
  return 0;
}

function getCotacao(cam, mod) {
  const ov = cam.cotacoes && cam.cotacoes[mod];
  if (typeof ov === "number" && ov > 0) return ov;
  if (mod === "milhar") return cam.cotacao_m ?? 0;
  if (mod === "centena") return cam.cotacao_c ?? 0;
  if (mod === "dezena") return cam.cotacao_d ?? 0;
  if (mod === "grupo") return cam.cotacao_g ?? 0;
  return 0;
}

function grupoParaDezenas(g) {
  const start = (g - 1) * 4;
  return [start, start + 1, start + 2, start + 3].map((d) =>
    d === 100 ? "00" : String(d).padStart(2, "0"),
  );
}

function getWinningData(s) {
  if (!s) return null;
  const parts = String(s).split(/[-,\s]+/).filter(Boolean);
  if (parts.length === 1) {
    const raw = parts[0].replace(/\D/g, "");
    if (raw.length >= 3) {
      return {
        grupos: new Set([(() => {
          const dez = parseInt(raw.slice(-2), 10);
          if (dez === 0) return "25";
          return String(Math.ceil(dez / 4)).padStart(2, "0");
        })()]),
        dezenas: new Set([raw.slice(-2).padStart(2, "0")]),
        milhar4: raw.slice(-4).padStart(4, "0"),
        centena3: raw.slice(-3).padStart(3, "0"),
      };
    }
  }
  const grupos = new Set();
  const dezenas = new Set();
  for (const p of parts) {
    const n = parseInt(p, 10);
    if (n >= 1 && n <= 25) {
      grupos.add(String(n).padStart(2, "0"));
      grupoParaDezenas(n).forEach((d) => dezenas.add(d));
    }
  }
  if (parts.length < 5) return { grupos, dezenas, milhar4: "", centena3: "" };
  const dezOrd = [];
  for (let i = 0; i < 5; i++) {
    const n = parseInt(parts[i], 10);
    if (n >= 1 && n <= 25) dezOrd.push(grupoParaDezenas(n)[0]);
  }
  const concat = dezOrd.join("");
  return {
    grupos,
    dezenas,
    milhar4: concat.slice(-4),
    centena3: concat.slice(-3),
  };
}

function splitNumeros(numeros, modalidade) {
  const s = String(numeros || "").trim().replace(/\s+/g, " ");
  const isGrupo = modalidade === "grupo";
  const isDez = modalidade === "dezena";
  if (isGrupo || isDez) {
    return s.split(/\s+/).filter(Boolean).map((n) =>
      n.length >= 2 ? n.slice(-2).padStart(2, "0") : n.padStart(2, "0"),
    );
  }
  if (["centena", "milhar", "milhar_e_centena", "milhar_invertida", "centena_invertida", "mc_invertida"].includes(modalidade)) {
    const parts = s.split(/\s+/).filter(Boolean);
    return parts.length > 1 ? parts : [s];
  }
  return [s];
}

function parseRange(premio) {
  if (!premio || !premio.includes("/")) return [1];
  const [a, b] = premio.split("/").map((x) => parseInt(x.trim(), 10));
  if (isNaN(a) || isNaN(b)) return [1];
  const out = [];
  for (let p = a; p <= Math.min(b, 10); p++) out.push(p);
  return out;
}

function divisor(premio) {
  if (!premio || !premio.includes("/")) return 1;
  const [, b] = premio.split("/").map((x) => parseInt(x.trim(), 10));
  return isNaN(b) ? 1 : b;
}

function premioDoResultado(res, p) {
  if (res?.premios && res.premios[p]) return res.premios[p];
  if (p === 1 && res?.grupos) return res.grupos;
  return "";
}

function contarHits(item, res) {
  const range = parseRange(item.premio || "1/1");
  const lista = splitNumeros(item.numeros, item.modalidade);
  let hits = 0;
  for (const num of lista) {
    let matched = false;
    for (const p of range) {
      const w = getWinningData(premioDoResultado(res, p));
      if (!w) continue;
      const m = item.modalidade;
      if (m === "grupo") {
        const g = num.length <= 2 ? num.padStart(2, "0") : num.slice(0, 2);
        if (w.grupos.has(g)) { matched = true; break; }
      } else if (m === "dezena") {
        if (w.dezenas.has(num.slice(-2).padStart(2, "0"))) { matched = true; break; }
      } else if (m === "centena") {
        const c = num.replace(/\D/g, "").slice(-3).padStart(3, "0");
        if (w.centena3 && c === w.centena3) { matched = true; break; }
      } else if (m === "milhar") {
        const x = num.replace(/\D/g, "").slice(-4).padStart(4, "0");
        if (w.milhar4 && x === w.milhar4) { matched = true; break; }
      }
    }
    if (matched) hits++;
  }
  return hits;
}

function calcularGanhoVelho(item, res, cam) {
  const lista = splitNumeros(item.numeros, item.modalidade);
  const qtd = Math.max(1, lista.length);
  const valorPP = item.valor / qtd;
  const range = parseRange(item.premio || "1/1");
  const div = divisor(item.premio);
  const m = item.modalidade;
  // boolean: bate?
  for (const p of range) {
    const w = getWinningData(premioDoResultado(res, p));
    if (!w) continue;
    for (const num of lista) {
      let bateu = false;
      if (m === "grupo") {
        const g = num.length <= 2 ? num.padStart(2, "0") : num.slice(0, 2);
        bateu = w.grupos.has(g);
      } else if (m === "dezena") {
        bateu = w.dezenas.has(num.slice(-2).padStart(2, "0"));
      } else if (m === "centena") {
        const c = num.replace(/\D/g, "").slice(-3).padStart(3, "0");
        bateu = w.centena3 && c === w.centena3;
      } else if (m === "milhar") {
        const x = num.replace(/\D/g, "").slice(-4).padStart(4, "0");
        bateu = w.milhar4 && x === w.milhar4;
      }
      if (bateu) {
        const cot = getCotacao(cam, m);
        return Math.round((valorPP * cot / div) * 100) / 100;
      }
    }
  }
  return 0;
}

function calcularGanhoNovo(item, res, cam) {
  const hits = contarHits(item, res);
  if (hits === 0) return 0;
  const lista = splitNumeros(item.numeros, item.modalidade);
  const qtd = Math.max(1, lista.length);
  const valorPP = item.valor / qtd;
  const div = divisor(item.premio);
  const cot = getCotacao(cam, item.modalidade);
  return Math.round((hits * valorPP * cot / div) * 100) / 100;
}

const afetados = [];
for (const b of bilhetes) {
  const t = parseDataBilhete(b.data);
  if (t < cutoffMs) continue;
  const cam = camMap.get(b.cambista_id);
  if (!cam) continue;
  // só modalidades simples
  const itens = (b.itens || []).filter((i) =>
    ["grupo", "dezena", "centena", "milhar"].includes(i.modalidade),
  );
  if (!itens.length) continue;
  const res = await getResultado(b.extracao_id, b.data);
  if (!res) continue;
  let velho = 0;
  let novo = 0;
  let temDuplicado = false;
  for (const it of itens) {
    velho += calcularGanhoVelho(it, res, cam);
    novo += calcularGanhoNovo(it, res, cam);
    const lista = splitNumeros(it.numeros, it.modalidade);
    if (new Set(lista).size !== lista.length) temDuplicado = true;
  }
  if (novo > velho + 0.01 && temDuplicado) {
    afetados.push({
      codigo: b.codigo,
      cambista: cam.login,
      extracao: b.extracao_nome,
      data: b.data,
      situacao: b.situacao,
      pagoBugado: velho,
      pagoCorreto: novo,
      diferenca: Math.round((novo - velho) * 100) / 100,
    });
  }
}

afetados.sort((a, b) => b.diferenca - a.diferenca);

console.log(`\n=== Bilhetes afetados pelo bug (palpite duplicado vencedor): ${afetados.length}\n`);
if (afetados.length === 0) {
  console.log("(nenhum bilhete encontrado nos últimos " + dias + " dias)");
} else {
  console.log("Cód.       Cambista              Extração                    Data       Sit.       Pago    Correto  Diferença");
  console.log("─────────  ────────────────────  ──────────────────────────  ─────────  ─────────  ──────  ───────  ─────────");
  let totalDif = 0;
  for (const a of afetados) {
    console.log(
      `${a.codigo.padEnd(10)} ${a.cambista.padEnd(20)} ${a.extracao.padEnd(27)} ${a.data.slice(0, 10).padEnd(10)} ${a.situacao.padEnd(10)} R$${a.pagoBugado.toFixed(2).padStart(6)} R$${a.pagoCorreto.toFixed(2).padStart(7)} R$${a.diferenca.toFixed(2).padStart(8)}`,
    );
    totalDif += a.diferenca;
  }
  console.log("─────────  ────────────────────  ──────────────────────────  ─────────  ──────  ───────  ─────────");
  console.log(`Total a pagar adicional: R$ ${totalDif.toFixed(2)}`);
}
