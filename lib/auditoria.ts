"use client";

const AUDITORIA_KEY = "premiacoes_auditoria";
const MAX_LOGS = 2000;

export interface LogAuditoria {
  id: string;
  data: string;
  codigo: string;
  admin: string;
  acao: string;
  detalhes: string;
}

function getSession(): { codigo: string; admin: string } {
  if (typeof window === "undefined") return { codigo: "", admin: "" };
  try {
    const s = localStorage.getItem("premiacoes_admin");
    if (!s) return { codigo: "", admin: "" };
    const { codigo, admin } = JSON.parse(s);
    return { codigo: codigo ?? "", admin: admin ?? "" };
  } catch {
    return { codigo: "", admin: "" };
  }
}

export function addLog(acao: string, detalhes: string): void {
  if (typeof window === "undefined") return;
  try {
    const { codigo, admin } = getSession();
    const logs: LogAuditoria[] = JSON.parse(
      localStorage.getItem(AUDITORIA_KEY) ?? "[]"
    );
    logs.unshift({
      id: String(Date.now()),
      data: new Date().toISOString(),
      codigo,
      admin,
      acao,
      detalhes,
    });
    if (logs.length > MAX_LOGS) logs.length = MAX_LOGS;
    localStorage.setItem(AUDITORIA_KEY, JSON.stringify(logs));
  } catch {
    /* ignore */
  }
}

export function getLogs(): LogAuditoria[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(AUDITORIA_KEY) ?? "[]");
  } catch {
    return [];
  }
}
