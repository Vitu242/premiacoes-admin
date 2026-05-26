/**
 * Audita bilhetes em que o MESMO JOGO (mesmos números, modalidades e valor)
 * apareceu em MÚLTIPLAS EXTRAÇÕES dentro de uma janela curta (default 10 min).
 *
 * Útil para investigar se um cliente está fazendo isso intencionalmente ou
 * se há algum bug/auto-tap multiplicando bilhetes.
 *
 * Uso:
 *   node scripts/auditar-jogos-cross-extracao.mjs [JANELA_MIN] [DIAS]
 *
 * Default: janela de 10 min, últimos 7 dias.
 */
import { readFileSync } from "node:fs";
const txt = readFileSync("/var/www/premiacoes-admin/.env.local", "utf8");
for (const linha of txt.split("\n")) {
  const m = linha.match(/^([A-Z_][A-Z_0-9]*)=(.*)$/);
  if (m) process.env[m[1]] = m[2];
}
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

const janelaMin = parseInt(process.argv[2] || "10", 10);
const dias = parseInt(process.argv[3] || "7", 10);

async function getJson(p) {
  const r = await fetch(`${url}${p}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  return r.json();
}

const cambs = await getJson(
  `/rest/v1/cambistas?select=id,login,codigo`,
);
const camMap = new Map();
for (const c of cambs) camMap.set(c.id, c);

const bilhetes = await getJson(
  `/rest/v1/bilhetes?situacao=neq.cancelado&select=id,codigo,cambista_id,extracao_id,extracao_nome,itens,total,data&limit=5000`,
);
console.log(`Bilhetes nao-cancelados consultados: ${bilhetes.length}`);

function parseData(s) {
  if (!s) return 0;
  const m = String(s).match(/^(\d{2})\/(\d{2})\/(\d{2,4})[, ]+(\d{2}):(\d{2}):?(\d{2})?/);
  if (m) {
    const yy = m[3].length === 2 ? 2000 + parseInt(m[3], 10) : parseInt(m[3], 10);
    return new Date(yy, parseInt(m[2], 10) - 1, parseInt(m[1], 10), parseInt(m[4], 10), parseInt(m[5], 10), parseInt(m[6] || "0", 10)).getTime();
  }
  return Date.parse(s) || 0;
}

function fingerprintJogo(b) {
  // Mesmo jogo = mesmos itens (modalidade+numeros+valor) + mesmo total.
  // EXCLUI extracaoId e milharBrinde (é o que queremos detectar como
  // "mesmo jogo em várias extrações"). Brinde é gerado aleatoriamente
  // a cada venda no fluxo /vender, então não pode ser parte da fp.
  return JSON.stringify({
    t: b.total,
    i: (b.itens || [])
      .map((x) => `${x.modalidade}|${(x.numeros || "").trim()}|${x.valor}|${x.premio || ""}`)
      .sort(),
  });
}

const cutoffMs = Date.now() - dias * 86400000;
const janelaMs = janelaMin * 60_000;

// Agrupa por (cambista_id, fingerprint)
const grupos = new Map();
for (const b of bilhetes) {
  const t = parseData(b.data);
  if (t < cutoffMs) continue;
  const fp = fingerprintJogo(b);
  const chave = `${b.cambista_id}|${fp}`;
  if (!grupos.has(chave)) grupos.set(chave, []);
  grupos.get(chave).push({ ...b, _t: t });
}

const suspeitos = [];
for (const [chave, lista] of grupos) {
  if (lista.length < 2) continue;
  // Ordena por tempo
  lista.sort((a, b) => a._t - b._t);
  // Verifica se há pares dentro da janela COM extracoes DIFERENTES
  for (let i = 1; i < lista.length; i++) {
    const dt = lista[i]._t - lista[i - 1]._t;
    if (dt > janelaMs) continue;
    if (lista[i].extracao_id === lista[i - 1].extracao_id) continue;
    suspeitos.push(lista);
    break;
  }
}

if (suspeitos.length === 0) {
  console.log(`\nNenhum padrão suspeito encontrado nos últimos ${dias} dias (janela ${janelaMin}min).`);
  process.exit(0);
}

console.log(`\n=== Grupos de bilhetes com MESMO JOGO em extrações diferentes em <${janelaMin}min: ${suspeitos.length} ===\n`);
for (const lista of suspeitos.slice(0, 30)) {
  const cam = camMap.get(lista[0].cambista_id);
  const itensResumo = (lista[0].itens || [])
    .map((it) => `${it.modalidade} ${it.numeros}`)
    .join(" | ");
  console.log(
    `[${cam?.login ?? "?"}] ${itensResumo} (R$${lista[0].total.toFixed(2)}) — ${lista.length} bilhetes:`,
  );
  for (const b of lista) {
    console.log(`    ${b.data}  ${b.extracao_nome.padEnd(25)}  ${b.codigo}`);
  }
  console.log("");
}
if (suspeitos.length > 30) {
  console.log(`... +${suspeitos.length - 30} grupos suprimidos.`);
}

// Resumo por cambista
const porCam = new Map();
for (const lista of suspeitos) {
  const cid = lista[0].cambista_id;
  porCam.set(cid, (porCam.get(cid) || 0) + 1);
}
console.log("\n=== Frequência por cambista: ===");
const ord = [...porCam.entries()].sort((a, b) => b[1] - a[1]);
for (const [cid, n] of ord) {
  const cam = camMap.get(cid);
  console.log(`  ${(cam?.login ?? "?").padEnd(25)} → ${n} grupo(s) suspeito(s)`);
}
