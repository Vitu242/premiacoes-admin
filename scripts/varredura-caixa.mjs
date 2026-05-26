/**
 * Varredura completa do caixa de uma cambista — tenta reproduzir o
 * caixa atual a partir dos bilhetes/lancamentos e flagrar inconsistencias.
 *
 * Uso:
 *   node scripts/varredura-caixa.mjs <login_parcial>
 *   node scripts/varredura-caixa.mjs andresa
 */
import { readFileSync } from "node:fs";
const txt = readFileSync("/var/www/premiacoes-admin/.env.local", "utf8");
for (const linha of txt.split("\n")) {
  const m = linha.match(/^([A-Z_][A-Z_0-9]*)=(.*)$/);
  if (m) process.env[m[1]] = m[2];
}
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function getJson(p) {
  const r = await fetch(`${url}${p}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  return r.json();
}

const filtro = process.argv[2] || "";
if (!filtro) {
  console.log("uso: node scripts/varredura-caixa.mjs <login_parcial>");
  process.exit(1);
}

const cambs = await getJson(
  `/rest/v1/cambistas?login=ilike.%2A${encodeURIComponent(filtro)}%2A&select=id,login,saldo,entrada,saidas,comissao,lancamentos,ultima_prestacao,updated_at`,
);
if (!cambs.length) {
  console.log("Nenhuma cambista encontrada com filtro:", filtro);
  process.exit(0);
}
const cam = cambs[0];
console.log("=== Cambista no banco (registro CRU) ===");
console.log(JSON.stringify(cam, null, 2));

const ultPrest = cam.ultima_prestacao;
console.log(`\nUltima prestacao: ${ultPrest || "(nunca)"}`);

function parseData(s) {
  if (!s) return 0;
  const m = String(s).match(/^(\d{2})\/(\d{2})\/(\d{2,4})[, ]+(\d{2}):(\d{2})/);
  if (m) {
    const yy = m[3].length === 2 ? 2000 + parseInt(m[3], 10) : parseInt(m[3], 10);
    return new Date(yy, parseInt(m[2], 10) - 1, parseInt(m[1], 10), parseInt(m[4], 10), parseInt(m[5], 10)).getTime();
  }
  return Date.parse(s) || 0;
}

const tsUlt = parseData(ultPrest);

const bs = await getJson(
  `/rest/v1/bilhetes?cambista_id=eq.${cam.id}&select=id,codigo,extracao_id,extracao_nome,total,situacao,data,itens,updated_at&order=data.desc&limit=2000`,
);
const ls = await getJson(
  `/rest/v1/lancamentos?cambista_id=eq.${cam.id}&select=id,tipo,valor,data,observacao,updated_at&limit=200`,
);

console.log(`\nBilhetes total no banco para ${cam.login}: ${bs.length}`);
console.log(`Lancamentos total: ${ls.length}`);

// Bilhetes apos prestacao
const bsAposPrest = bs.filter((b) => parseData(b.data) > tsUlt);
const lsAposPrest = ls.filter((l) => parseData(l.data) > tsUlt);

console.log(`\nApos a ultima prestacao (${ultPrest || "inicio"}):`);
console.log(`  Bilhetes: ${bsAposPrest.length}`);
console.log(`  Lancamentos: ${lsAposPrest.length}`);

// Calcular caixa derivado dos bilhetes/lancamentos
const cotacoesCambista = await getJson(
  `/rest/v1/cambistas?id=eq.${cam.id}&select=cotacao_m,cotacao_c,cotacao_d,cotacao_g,comissao_milhar,comissao_centena,comissao_dezena,comissao_grupo,cotacoes`,
);
const cot = cotacoesCambista[0];

function getCotacao(modalidade) {
  const ov = cot.cotacoes && cot.cotacoes[modalidade];
  if (typeof ov === "number" && ov > 0) return ov;
  if (modalidade === "milhar") return cot.cotacao_m ?? 0;
  if (modalidade === "centena") return cot.cotacao_c ?? 0;
  if (modalidade === "dezena") return cot.cotacao_d ?? 0;
  if (modalidade === "grupo") return cot.cotacao_g ?? 0;
  return 0;
}

function baseComissao(mod) {
  if (mod === "grupo" || mod.startsWith("duque_grupo") || mod.startsWith("terno_grupo") || mod.startsWith("passe")) return "grupo";
  if (mod === "dezena" || mod.startsWith("duque_dezena") || mod.startsWith("terno_dezena")) return "dezena";
  if (mod === "centena" || (mod.includes("centena") && mod !== "milhar_e_centena" && mod !== "mc_invertida")) return "centena";
  return "milhar";
}

let entrada = 0;
let saidas = 0;
let comissao = 0;
let qtd = 0;
let qtdPag = 0;
let qtdPend = 0;
let qtdPerd = 0;
let qtdCanc = 0;

const cancelados = [];
const pagosDepoisDePrest = [];
const status = new Map();

for (const b of bsAposPrest) {
  status.set(b.situacao, (status.get(b.situacao) || 0) + 1);
  qtd++;
  if (b.situacao === "cancelado") {
    qtdCanc++;
    cancelados.push(b);
    continue;
  }
  entrada += Number(b.total) || 0;
  for (const it of b.itens || []) {
    const mod = it.modalidade;
    const valor = Number(it.valor) || 0;
    const base = baseComissao(mod);
    const pct = base === "grupo" ? cot.comissao_grupo : base === "dezena" ? cot.comissao_dezena : base === "centena" ? cot.comissao_centena : cot.comissao_milhar;
    comissao += valor * (Number(pct) || 0) / 100;
  }
  if (b.situacao === "pago") {
    qtdPag++;
    pagosDepoisDePrest.push(b);
  } else if (b.situacao === "pendente") qtdPend++;
  else if (b.situacao === "perdedor") qtdPerd++;
}

let lancamentosTotal = 0;
for (const l of lsAposPrest) {
  const v = Number(l.valor) || 0;
  lancamentosTotal += l.tipo === "adiantar" ? v : -v;
}

console.log("\n=== Status dos bilhetes apos prestacao ===");
for (const [s, n] of status) console.log(`  ${s}: ${n}`);

console.log("\n=== Caixa CALCULADO a partir dos bilhetes/lancamentos ===");
console.log(`  Entrada calculada: R$ ${entrada.toFixed(2)}`);
console.log(`  Comissao calculada: R$ ${comissao.toFixed(2)}`);
console.log(`  Lancamentos calculados: R$ ${lancamentosTotal.toFixed(2)}`);
console.log(`  Saidas calculadas (precisa conferencia): aguardando`);

console.log("\n=== Caixa GRAVADO no registro do cambista ===");
console.log(`  entrada: R$ ${cam.entrada}`);
console.log(`  saidas: R$ ${cam.saidas}`);
console.log(`  comissao: R$ ${cam.comissao}`);
console.log(`  lancamentos: R$ ${cam.lancamentos}`);

console.log("\n=== DIFERENCAS (gravado - calculado) ===");
console.log(`  entrada: ${(Number(cam.entrada) - entrada).toFixed(2)}`);
console.log(`  comissao: ${(Number(cam.comissao) - comissao).toFixed(2)}`);
console.log(`  lancamentos: ${(Number(cam.lancamentos) - lancamentosTotal).toFixed(2)}`);

if (cancelados.length) {
  console.log(`\n=== ${cancelados.length} bilhete(s) cancelado(s) apos prestacao ===`);
  for (const b of cancelados) {
    console.log(`  ${b.codigo}  ${b.data}  R$${b.total}  ${b.extracao_nome}  updated=${b.updated_at?.slice(0, 19)}`);
  }
}

// Verifica bilhetes recentemente atualizados (situacao mudou nas ultimas 24h)
const cutoff24h = Date.now() - 24 * 3600 * 1000;
const recentes = bs.filter((b) => {
  const u = Date.parse(b.updated_at);
  return u && u > cutoff24h;
});
console.log(`\n=== Bilhetes com updated_at nas ultimas 24h: ${recentes.length} ===`);

// Conta status changes hoje (tomando como proxy: updated_at != criacao)
const statusMudou = recentes.filter((b) => {
  const dt = parseData(b.data);
  const ut = Date.parse(b.updated_at);
  return ut - dt > 60_000; // updated mais de 1 min depois da criacao
});
console.log(`  Desses, ${statusMudou.length} tiveram update >1min apos criacao (status mudou)`);
const porStatusUpdate = new Map();
for (const b of statusMudou) {
  porStatusUpdate.set(b.situacao, (porStatusUpdate.get(b.situacao) || 0) + 1);
}
for (const [s, n] of porStatusUpdate) console.log(`    -> ${s}: ${n}`);

// Alertas (config[id="alertas_caixa"])
const alertasConf = await getJson(`/rest/v1/config?id=eq.alertas_caixa&select=value`);
const alertas = (alertasConf?.[0]?.value || []).filter((a) => !a.resolvido);
const alertasDesseCam = alertas.filter((a) => String(a.cambistaId || "") === cam.id);
console.log(`\n=== Alertas pendentes para ${cam.login}: ${alertasDesseCam.length} ===`);
for (const a of alertasDesseCam.slice(0, 10)) {
  console.log(`  ${a.criadoEm.slice(0, 19)} ${a.tipo}: ${a.titulo}`);
}
