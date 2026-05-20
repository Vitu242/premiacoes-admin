"use client";

/**
 * Exportação de CSV (com BOM UTF-8 para Excel ler acentos).
 *
 * - `exportarCsv("nome.csv", linhas)` aceita array de objetos.
 *   Cada chave do primeiro objeto vira coluna.
 * - `gerarCsv(linhas)` devolve a string CSV (útil em servidor).
 */

type Linha = Record<string, string | number | boolean | null | undefined>;

function escape(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  if (/[";\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function gerarCsv(linhas: Linha[]): string {
  if (!linhas.length) return "";
  const cols = Object.keys(linhas[0]);
  const head = cols.join(";");
  const body = linhas.map((l) => cols.map((c) => escape(l[c])).join(";")).join("\r\n");
  return head + "\r\n" + body;
}

export function exportarCsv(nomeArquivo: string, linhas: Linha[]): void {
  if (typeof window === "undefined") return;
  const csv = gerarCsv(linhas);
  const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nomeArquivo;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 500);
}

/** Lê um File do <input type="file"> e devolve linhas como array de objetos. */
export async function lerCsv(file: File, sep = ";"): Promise<Record<string, string>[]> {
  const text = await file.text();
  const semBom = text.replace(/^\ufeff/, "");
  const linhas = semBom.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (!linhas.length) return [];
  const cols = parseCsvLine(linhas[0], sep);
  const out: Record<string, string>[] = [];
  for (let i = 1; i < linhas.length; i++) {
    const vals = parseCsvLine(linhas[i], sep);
    const o: Record<string, string> = {};
    for (let j = 0; j < cols.length; j++) o[cols[j]] = vals[j] ?? "";
    out.push(o);
  }
  return out;
}

function parseCsvLine(line: string, sep: string): string[] {
  const out: string[] = [];
  let i = 0;
  const len = line.length;
  let cur = "";
  let inQ = false;
  while (i < len) {
    const c = line[i];
    if (inQ) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i += 2; continue; }
      if (c === '"') { inQ = false; i++; continue; }
      cur += c; i++; continue;
    }
    if (c === '"') { inQ = true; i++; continue; }
    if (c === sep) { out.push(cur); cur = ""; i++; continue; }
    cur += c; i++;
  }
  out.push(cur);
  return out;
}
