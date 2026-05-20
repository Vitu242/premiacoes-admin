"use client";

import { useRef, useState } from "react";
import { lerCsv, exportarCsv } from "@/lib/export-csv";
import { addCambista, getConfig } from "@/lib/store";
import { normalizeLogin } from "@/lib/login-normalize";
import type { Cambista } from "@/lib/types";

interface Props {
  codigo: string;
  gerenteIdPadrao: string;
  onImportado: () => void;
}

const TEMPLATE = [
  { login: "Cambista 1", senha: "123", saldo: "1000", telefone: "", endereco: "", milharBrinde: "sim", tipo: "cambista", status: "ativo" },
  { login: "Cliente 1", senha: "123", saldo: "0", telefone: "", endereco: "", milharBrinde: "nao", tipo: "cliente", status: "ativo" },
];

export default function ImportarCambistasCsv({ codigo, gerenteIdPadrao, onImportado }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const baixarTemplate = () => {
    exportarCsv("template-cambistas.csv", TEMPLATE);
  };

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setErro(null);
    setStatus(null);
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const linhas = await lerCsv(file);
      if (!linhas.length) {
        setErro("Arquivo vazio ou sem cabeçalho.");
        return;
      }
      const padrao = getConfig().comissoesPadrao ?? {
        comissaoMilhar: 20, comissaoCentena: 20, comissaoDezena: 17, comissaoGrupo: 17,
      };
      let ok = 0;
      for (const l of linhas) {
        const login = normalizeLogin(l.login || "");
        const senha = (l.senha || "").trim();
        if (!login || !senha) continue;
        const c: Omit<Cambista, "id"> = {
          gerenteId: gerenteIdPadrao,
          codigo,
          tipo: (l.tipo === "cliente" ? "cliente" : "cambista") as "cambista" | "cliente",
          login,
          senha,
          saldo: Number(l.saldo || 0) || 0,
          comissaoMilhar: Number(l.comissaoMilhar || padrao.comissaoMilhar),
          comissaoCentena: Number(l.comissaoCentena || padrao.comissaoCentena),
          comissaoDezena: Number(l.comissaoDezena || padrao.comissaoDezena),
          comissaoGrupo: Number(l.comissaoGrupo || padrao.comissaoGrupo),
          cotacaoM: Number(l.cotacaoM || 6000),
          cotacaoC: Number(l.cotacaoC || 800),
          cotacaoD: Number(l.cotacaoD || 80),
          cotacaoG: Number(l.cotacaoG || 20),
          milharBrinde: (l.milharBrinde === "nao" ? "nao" : "sim") as "sim" | "nao",
          endereco: l.endereco || "",
          telefone: l.telefone || "",
          descricao: l.descricao || "",
          status: (l.status === "inativo" ? "inativo" : "ativo") as "ativo" | "inativo",
          risco: l.risco || "RUIM",
          entrada: 0,
          saidas: 0,
          comissao: 0,
          lancamentos: 0,
          ultimaPrestacao: null,
        };
        addCambista(c);
        ok++;
      }
      setStatus(`${ok} cambista(s) importado(s).`);
      if (fileRef.current) fileRef.current.value = "";
      onImportado();
    } catch (e) {
      setErro((e as Error).message);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border border-dashed border-gray-300 bg-gray-50 p-3">
      <button
        type="button"
        onClick={baixarTemplate}
        className="rounded border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100"
      >
        Baixar modelo CSV
      </button>
      <label className="inline-flex cursor-pointer items-center gap-2 rounded bg-orange-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-orange-600">
        Importar CSV
        <input
          ref={fileRef}
          type="file"
          accept=".csv,text/csv"
          onChange={onFile}
          className="hidden"
        />
      </label>
      {status && <span className="text-sm text-green-700">{status}</span>}
      {erro && <span className="text-sm text-red-600">{erro}</span>}
    </div>
  );
}
