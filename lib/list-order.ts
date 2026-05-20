import { parseDataPtBrOuIso } from "./date-utils";
import type { Bilhete } from "./types";

/** Ordem alfabética de nomes/logins (pt-BR, sem diferenciar maiúsculas). */
export function compararLoginPt(a: string, b: string): number {
  return a.localeCompare(b, "pt-BR", { sensitivity: "base" });
}

export function ordenarPorLogin<T extends { login?: unknown }>(lista: T[]): T[] {
  return [...lista].sort((a, b) =>
    compararLoginPt(String(a.login ?? ""), String(b.login ?? "")),
  );
}

type BilheteOrdenavel = Pick<Bilhete, "id" | "data"> & { codigo?: string };

/** Bilhetes mais recentes primeiro (id = timestamp da venda; fallback data/hora). */
export function compararBilheteRecentePrimeiro(a: BilheteOrdenavel, b: BilheteOrdenavel): number {
  const idA = Number(a.id);
  const idB = Number(b.id);
  if (Number.isFinite(idA) && Number.isFinite(idB) && idA !== idB) return idB - idA;
  const tA = parseDataPtBrOuIso(a.data)?.getTime() ?? 0;
  const tB = parseDataPtBrOuIso(b.data)?.getTime() ?? 0;
  if (tA !== tB) return tB - tA;
  return String(b.codigo ?? "").localeCompare(String(a.codigo ?? ""), "pt-BR");
}

export function ordenarBilhetesRecentesPrimeiro<T extends BilheteOrdenavel>(lista: T[]): T[] {
  return [...lista].sort(compararBilheteRecentePrimeiro);
}
