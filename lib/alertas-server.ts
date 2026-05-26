import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Versão server-side de `registrarAlerta`. Usada pelo cron de
 * resultados quando detecta que o 1º prêmio mudou. Grava direto na
 * `config[id="alertas_caixa"]` no Supabase para que todos os
 * dispositivos do admin recebam o alerta via realtime.
 */

interface AlertaInput {
  tipo: "bilhete_pago_para_perdedor" | "resultado_corrigido" | "outro";
  titulo: string;
  detalhes: string;
  cambistaId?: string;
  cambistaNome?: string;
  bilheteId?: string;
  bilheteCodigo?: string;
  extracaoNome?: string;
  data?: string;
  valor?: number;
}

interface AlertaCaixa extends AlertaInput {
  id: string;
  criadoEm: string;
  resolvido?: boolean;
  resolvidoEm?: string | null;
}

const MAX_ALERTAS = 200;

export async function registrarAlertaServidor(
  sb: SupabaseClient,
  alerta: AlertaInput,
): Promise<void> {
  // Lê alertas atuais.
  const { data } = await sb
    .from("config")
    .select("value")
    .eq("id", "alertas_caixa")
    .maybeSingle();
  const lista = (data?.value as AlertaCaixa[] | null | undefined) ?? [];

  // Dedup: mesma extração + tipo + data + ainda pendente = não duplica.
  if (alerta.tipo === "resultado_corrigido") {
    const dup = lista.find(
      (x) =>
        !x.resolvido &&
        x.tipo === alerta.tipo &&
        x.extracaoNome === alerta.extracaoNome &&
        x.data === alerta.data,
    );
    if (dup) return;
  }
  // Dedup por bilhete em outros tipos.
  if (alerta.bilheteId) {
    const dup = lista.find(
      (x) =>
        !x.resolvido &&
        x.tipo === alerta.tipo &&
        x.bilheteId === alerta.bilheteId,
    );
    if (dup) return;
  }

  const novo: AlertaCaixa = {
    ...alerta,
    id: `alert-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    criadoEm: new Date().toISOString(),
    resolvido: false,
  };
  const merged = [novo, ...lista].slice(0, MAX_ALERTAS);
  await sb
    .from("config")
    .upsert({ id: "alertas_caixa", value: merged }, { onConflict: "id" });
}
