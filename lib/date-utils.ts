/**
 * Utilitários de data compartilhados entre client e server, sem dependências de outros módulos
 * para evitar ciclos de import.
 */

/**
 * Converte strings em formato pt-BR ("dd/mm/aaaa, hh:mm:ss" / "dd/mm/aa" / etc.)
 * ou ISO em Date. Retorna null se não conseguir interpretar.
 * Usado para ordenar bilhetes/lançamentos e filtrar por período.
 */
export function parseDataPtBrOuIso(dataStr: string | null | undefined): Date | null {
  if (!dataStr) return null;
  const s = String(dataStr).trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    const dt = new Date(s);
    return Number.isNaN(dt.getTime()) ? null : dt;
  }
  const m = s.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})(?:[ ,]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (!m) return null;
  const [, d, M, y, hh, mm, ss] = m;
  const dia = parseInt(d!, 10);
  const mes = parseInt(M!, 10);
  const anoNum = parseInt(y!, 10);
  const ano = anoNum < 100 ? 2000 + anoNum : anoNum;
  const dt = new Date(
    ano,
    mes - 1,
    dia,
    hh ? parseInt(hh, 10) : 0,
    mm ? parseInt(mm, 10) : 0,
    ss ? parseInt(ss, 10) : 0,
  );
  return Number.isNaN(dt.getTime()) ? null : dt;
}

/** Retorna o início (00:00:00.000) do dia local da data informada. */
export function startOfDay(d: Date): Date {
  const r = new Date(d);
  r.setHours(0, 0, 0, 0);
  return r;
}

/** Retorna o fim (23:59:59.999) do dia local da data informada. */
export function endOfDay(d: Date): Date {
  const r = new Date(d);
  r.setHours(23, 59, 59, 999);
  return r;
}

/** Converte uma string "yyyy-mm-dd" (input type=date) em Date local. */
export function isoDateInputToDate(s: string): Date | null {
  if (!s) return null;
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  return new Date(parseInt(m[1]!, 10), parseInt(m[2]!, 10) - 1, parseInt(m[3]!, 10));
}

/** Compara qualquer data aceita por parseDataPtBrOuIso com um input "yyyy-mm-dd". */
export function isSameIsoInputDate(dataStr: string | null | undefined, isoInput: string): boolean {
  const alvo = isoDateInputToDate(isoInput);
  const data = parseDataPtBrOuIso(dataStr);
  if (!alvo || !data) return false;
  return (
    data.getFullYear() === alvo.getFullYear() &&
    data.getMonth() === alvo.getMonth() &&
    data.getDate() === alvo.getDate()
  );
}

/** Retorna "yyyy-mm-dd" do dia local atual (compatível com input type=date). */
export function hojeIsoDate(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Formata qualquer data parseável (Date, ISO, "dd/mm/yy" ou "dd/mm/yyyy")
 * em string "dd/mm/yyyy". Quando a string já contém o ano com 4 dígitos,
 * mantém os 4 dígitos; quando tem 2 dígitos, expande para 20yy.
 */
export function formatarDataBr(input: Date | string | null | undefined): string {
  if (!input) return "";
  const dt = input instanceof Date ? input : parseDataPtBrOuIso(input);
  if (!dt || Number.isNaN(dt.getTime())) return typeof input === "string" ? input : "";
  const dd = String(dt.getDate()).padStart(2, "0");
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const yyyy = dt.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

/**
 * Formata em "dd/mm/yyyy HH:mm" (sem segundos) para listagens curtas.
 * Usado em listas de bilhetes/lançamentos onde temos espaço limitado.
 */
export function formatarDataHoraBr(input: Date | string | null | undefined): string {
  if (!input) return "";
  const dt = input instanceof Date ? input : parseDataPtBrOuIso(input);
  if (!dt || Number.isNaN(dt.getTime())) return typeof input === "string" ? input : "";
  const dd = String(dt.getDate()).padStart(2, "0");
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const yyyy = dt.getFullYear();
  const hh = String(dt.getHours()).padStart(2, "0");
  const mi = String(dt.getMinutes()).padStart(2, "0");
  return `${dd}/${mm}/${yyyy} ${hh}:${mi}`;
}
