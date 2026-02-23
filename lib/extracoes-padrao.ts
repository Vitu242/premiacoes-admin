"use client";

import type { Extracao } from "./types";

/** Lista completa de loterias/extrações. Encerra é inferido do nome (ex: "NACIONAL 02:00" → 02:00). */
const NOMES = [
  "NACIONAL 02:00",
  "LOOK GOIAS 07:20",
  "NACIONAL 08:00",
  "PT RIO 09:20",
  "LOOK GOIAS 09:20",
  "MALUCA BA 10:00",
  "PT SP 10:00",
  "LBR BRASILIA 10:00",
  "NACIONAL 10:00",
  "PARATODOS BAHIA 10:20",
  "PB LOTEP 10:45",
  "AVAL PE 11:00",
  "PT RIO 11:20",
  "LOOK GOIAS 11:20",
  "MALUCA BA 12:00",
  "NACIONAL 12:00",
  "PARATODOS BAHIA 12:20",
  "PB LOTEP 12:45",
  "AVAL PE 12:45",
  "PT SP 13:00",
  "AVAL PE 14:00",
  "LOOK GOIAS 14:20",
  "PT RIO 14:20",
  "MALUCA BA 15:00",
  "LBR BRASILIA 15:00",
  "NACIONAL 15:00",
  "PARATODOS BAHIA 15:20",
  "PT SP 15:30",
  "PB LOTEP 15:45",
  "AVAL PE 15:45",
  "LOOK GOIAS 16:20",
  "PT RIO 16:20",
  "PT SP 17:00",
  "AVAL PE 17:00",
  "LBR BRASILIA 17:00",
  "NACIONAL 17:00",
  "PB LOTEP 18:00",
  "LOOK GOIAS 18:20",
  "PT RIO 18:20",
  "MALUCA BA 19:00",
  "AVAL PE 19:00",
  "LBR BRASILIA 19:00",
  "PARATODOS BAHIA 19:20",
  "PT SP 20:00",
  "PB PARATODOS 20:00",
  "FEDERAL 20:00",
  "LBR BRASILIA 20:40",
  "NACIONAL 21:00",
  "MALUCA BA 21:20",
  "PT RIO 21:20",
  "LOOK GOIAS 21:20",
  "PARATODOS BAHIA 21:20",
  "LBR BRASILIA 22:00",
  "NACIONAL 23:00",
  "LOOK GOIAS 23:20",
];

function extrairEncerra(nome: string): string {
  const match = nome.match(/(\d{1,2}):(\d{2})$/);
  return match ? `${match[1].padStart(2, "0")}:${match[2]}` : "23:59";
}

export function getExtracoesPadrao(): Extracao[] {
  return NOMES.map((nome, i) => ({
    id: String(i + 1),
    nome,
    encerra: extrairEncerra(nome),
    ativa: true,
  }));
}
