"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  getExtracoes,
  extracaoAceitaApostas,
  getCambistas,
  addBilhete,
} from "@/lib/store";
import type { Extracao, ModalidadeBilhete, ItemBilhete } from "@/lib/types";

type Step = "extracao" | "modalidade" | "numeros" | "milharBrinde" | "valor" | "confirmar";

const MODALIDADES: { id: ModalidadeBilhete; label: string; minDigits: number; maxDigits: number; max: number }[] = [
  { id: "grupo", label: "Grupo", minDigits: 1, maxDigits: 2, max: 25 },
  { id: "dezena", label: "Dezena", minDigits: 2, maxDigits: 2, max: 99 },
  { id: "centena", label: "Centena", minDigits: 3, maxDigits: 3, max: 999 },
  { id: "milhar", label: "Milhar", minDigits: 4, maxDigits: 4, max: 9999 },
];

function formatarMoeda(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function getCotacao(cambista: { cotacaoG: number; cotacaoD: number; cotacaoC: number; cotacaoM: number }, modalidade: ModalidadeBilhete): number {
  const m: Record<ModalidadeBilhete, number> = {
    grupo: cambista.cotacaoG,
    dezena: cambista.cotacaoD,
    centena: cambista.cotacaoC,
    milhar: cambista.cotacaoM,
  };
  return m[modalidade] ?? 0;
}

export default function ClienteVenderPage() {
  const router = useRouter();
  const [cambistaId, setCambistaId] = useState<string | null>(null);
  const [step, setStep] = useState<Step>("extracao");
  const [extracao, setExtracao] = useState<Extracao | null>(null);
  const [modalidade, setModalidade] = useState<ModalidadeBilhete | null>(null);
  const [numeros, setNumeros] = useState("");
  const [milharBrinde, setMilharBrinde] = useState("");
  const [valor, setValor] = useState("");
  const [erro, setErro] = useState("");
  const [sucesso, setSucesso] = useState<{ codigo: string } | null>(null);

  const extracoes = getExtracoes().filter((e) => e.ativa);
  const cambista = cambistaId ? getCambistas().find((c) => c.id === cambistaId) : null;

  useEffect(() => {
    const auth = localStorage.getItem("premiacoes_cliente");
    if (!auth) {
      router.replace("/cliente/login");
      return;
    }
    const { cambistaId: cid } = JSON.parse(auth);
    setCambistaId(cid);
  }, [router]);

  const voltar = () => {
    setErro("");
    if (step === "extracao") router.push("/cliente");
    else if (step === "modalidade") setStep("extracao");
    else if (step === "numeros") setStep("modalidade");
    else if (step === "milharBrinde") setStep("numeros");
    else if (step === "valor") setStep(cambista?.milharBrinde === "sim" ? "milharBrinde" : "numeros");
    else setStep("valor");
  };

  const escolherExtracao = (e: Extracao) => {
    setErro("");
    if (!extracaoAceitaApostas(e.encerra)) {
      setErro("Tempo excedido. Esta extração já encerrou apostas.");
      return;
    }
    setExtracao(e);
    setStep("modalidade");
  };

  const escolherModalidade = (m: ModalidadeBilhete) => {
    setErro("");
    setModalidade(m);
    setNumeros("");
    setStep("numeros");
  };

  const adicionarDigito = (d: string) => {
    const mod = MODALIDADES.find((x) => x.id === modalidade);
    if (!mod) return;
    const nova = numeros + d;
    if (nova.length > mod.maxDigits) return;
    const n = parseInt(nova, 10);
    if (n > mod.max) return;
    setNumeros(nova);
    setErro("");
  };

  const apagarDigito = () => setNumeros((s) => s.slice(0, -1));

  const confirmarNumeros = () => {
    const mod = MODALIDADES.find((x) => x.id === modalidade);
    if (!mod || !cambista) return;
    if (numeros.length < mod.minDigits) {
      setErro(`Informe ${mod.minDigits} a ${mod.maxDigits} dígito(s) para ${mod.label}.`);
      return;
    }
    const n = parseInt(numeros, 10);
    if (isNaN(n) || n > mod.max || (mod.id === "grupo" && (n < 1 || n > 25))) {
      setErro("Número inválido para esta modalidade.");
      return;
    }
    if (cambista.milharBrinde === "sim") {
      setStep("milharBrinde");
      setMilharBrinde("");
    } else {
      setStep("valor");
      setValor("");
    }
    setErro("");
  };

  const pularMilharBrinde = () => {
    setMilharBrinde("");
    setStep("valor");
    setValor("");
  };

  const adicionarDigitoMilharBrinde = (d: string) => {
    if (d === "⌫") {
      setMilharBrinde((s) => s.slice(0, -1));
      return;
    }
    const nova = milharBrinde + d;
    if (nova.length > 4) return;
    const n = parseInt(nova, 10);
    if (n > 9999) return;
    setMilharBrinde(nova);
  };

  const confirmarMilharBrinde = () => {
    if (milharBrinde.length !== 4) {
      setErro("Milhar brinde deve ter 4 dígitos, ou pule.");
      return;
    }
    setStep("valor");
    setValor("");
    setErro("");
  };

  const confirmarValor = () => {
    const v = parseFloat(valor.replace(",", "."));
    if (isNaN(v) || v <= 0) {
      setErro("Informe um valor válido.");
      return;
    }
    setStep("confirmar");
    setErro("");
  };

  const finalizarVenda = () => {
    if (!extracao || !modalidade || !cambistaId || !cambista) return;
    const v = parseFloat(valor.replace(",", "."));
    if (isNaN(v) || v <= 0) return;
    const item: ItemBilhete = {
      modalidade,
      numeros,
      valor: v,
      ...(milharBrinde.length === 4 && { milharBrinde }),
    };
    const bilhete = addBilhete({
      cambistaId,
      extracaoId: extracao.id,
      extracaoNome: extracao.nome,
      itens: [item],
      total: v,
      data: new Date().toLocaleString("pt-BR"),
      situacao: "pendente",
    });
    setSucesso({ codigo: bilhete.codigo });
    setStep("extracao");
    setExtracao(null);
    setModalidade(null);
    setNumeros("");
    setMilharBrinde("");
    setValor("");
  };

  if (!cambista) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white">
        <p className="text-gray-500">Carregando...</p>
      </div>
    );
  }

  if (sucesso) {
    return (
      <div className="min-h-screen bg-white p-4 pb-24">
        <div className="mx-auto max-w-md rounded-xl bg-green-50 p-6 text-center">
          <p className="text-4xl mb-4">✅</p>
          <h2 className="text-xl font-bold text-gray-800">Venda realizada!</h2>
          <p className="mt-2 text-gray-600">Código do bilhete: <strong>{sucesso.codigo}</strong></p>
          <div className="mt-6 flex gap-3">
            <button
              onClick={() => setSucesso(null)}
              className="flex-1 rounded-xl bg-green-600 py-3 font-semibold text-white"
            >
              Nova venda
            </button>
            <Link
              href="/cliente"
              className="flex-1 rounded-xl border border-gray-300 py-3 font-semibold text-gray-700"
            >
              Início
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white p-4 pb-24">
      <div className="mb-4 flex items-center gap-2">
        <button
          onClick={voltar}
          className="rounded p-2 text-gray-600 hover:bg-gray-100"
          aria-label="Voltar"
        >
          <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h1 className="text-lg font-bold text-gray-800">Vender</h1>
      </div>

      {erro && (
        <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-600">{erro}</div>
      )}

      {/* Step: Extração */}
      {step === "extracao" && (
        <div>
          <p className="mb-4 text-gray-600">Escolha a extração:</p>
          <div className="space-y-2">
            {extracoes.map((e) => {
              const aceita = extracaoAceitaApostas(e.encerra);
              return (
                <button
                  key={e.id}
                  onClick={() => escolherExtracao(e)}
                  disabled={!aceita}
                  className={`w-full rounded-xl px-4 py-4 text-left transition ${
                    aceita
                      ? "bg-gray-100 hover:bg-gray-200 text-gray-800"
                      : "bg-gray-50 text-gray-400 cursor-not-allowed"
                  }`}
                >
                  <span className="font-medium">{e.nome}</span>
                  <span className="ml-2 text-sm">
                    {aceita ? `Encerra às ${e.encerra}` : "Tempo excedido"}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Step: Modalidade */}
      {step === "modalidade" && extracao && (
        <div>
          <p className="mb-2 text-sm text-gray-500">{extracao.nome}</p>
          <p className="mb-4 text-gray-600">Escolha a modalidade:</p>
          <div className="grid grid-cols-2 gap-3">
            {MODALIDADES.map((m) => (
              <button
                key={m.id}
                onClick={() => escolherModalidade(m.id)}
                className="rounded-xl bg-gray-100 px-4 py-4 font-medium text-gray-800 hover:bg-gray-200"
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Step: Números */}
      {step === "numeros" && modalidade && (
        <div>
          <p className="mb-2 text-sm text-gray-500">{extracao?.nome} → {MODALIDADES.find((m) => m.id === modalidade)?.label}</p>
          <p className="mb-2 text-gray-600">Digite o número:</p>
          <div className="mb-4 flex h-14 items-center justify-center rounded-xl border-2 border-gray-200 bg-gray-50 text-2xl font-mono font-bold">
            {numeros || "—"}
          </div>
          <div className="grid grid-cols-3 gap-3 mb-4">
            {["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "⌫"].map((d) => (
              <button
                key={d}
                onClick={() => (d === "⌫" ? apagarDigito() : adicionarDigito(d))}
                disabled={d === ""}
                className="rounded-xl bg-gray-100 py-4 text-xl font-medium text-gray-800 hover:bg-gray-200 disabled:invisible"
              >
                {d}
              </button>
            ))}
          </div>
          <button
            onClick={confirmarNumeros}
            className="w-full rounded-xl bg-green-600 py-3 font-semibold text-white"
          >
            Continuar
          </button>
        </div>
      )}

      {/* Step: Milhar Brinde (opcional) - só se cambista habilitou */}
      {step === "milharBrinde" && cambista?.milharBrinde === "sim" && (
        <div>
          <p className="mb-2 text-sm text-gray-500">
            {extracao?.nome} → {MODALIDADES.find((m) => m.id === modalidade)?.label} {numeros}
          </p>
          <p className="mb-4 text-gray-600">Milhar brinde (opcional) – 4 dígitos:</p>
          <div className="mb-4 flex h-14 items-center justify-center rounded-xl border-2 border-gray-200 bg-gray-50 text-2xl font-mono font-bold">
            {milharBrinde || "—"}
          </div>
          <div className="grid grid-cols-3 gap-3 mb-4">
            {["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "⌫"].map((d) => (
              <button
                key={d}
                onClick={() => adicionarDigitoMilharBrinde(d)}
                disabled={d === ""}
                className="rounded-xl bg-gray-100 py-4 text-xl font-medium text-gray-800 hover:bg-gray-200 disabled:invisible"
              >
                {d}
              </button>
            ))}
          </div>
          <div className="flex gap-3">
            <button
              onClick={pularMilharBrinde}
              className="flex-1 rounded-xl border border-gray-300 py-3 font-semibold text-gray-700"
            >
              Pular
            </button>
            <button
              onClick={confirmarMilharBrinde}
              className="flex-1 rounded-xl bg-green-600 py-3 font-semibold text-white"
            >
              Continuar
            </button>
          </div>
        </div>
      )}

      {/* Step: Valor */}
      {step === "valor" && (
        <div>
          <p className="mb-2 text-sm text-gray-500">
            {extracao?.nome} → {MODALIDADES.find((m) => m.id === modalidade)?.label} {numeros}
            {milharBrinde && <span className="text-green-600"> + Brinde {milharBrinde}</span>}
          </p>
          <p className="mb-2 text-gray-600">Valor da aposta (R$):</p>
          <input
            type="text"
            inputMode="decimal"
            placeholder="0,00"
            value={valor}
            onChange={(e) => setValor(e.target.value.replace(/[^0-9,]/g, ""))}
            className="mb-4 w-full rounded-xl border border-gray-300 px-4 py-4 text-xl font-medium"
          />
          <p className="mb-4 text-sm text-gray-500">
            Cotação: {formatarMoeda(getCotacao(cambista, modalidade!))} (se ganhar)
          </p>
          <button
            onClick={confirmarValor}
            className="w-full rounded-xl bg-green-600 py-3 font-semibold text-white"
          >
            Continuar
          </button>
        </div>
      )}

      {/* Step: Confirmar */}
      {step === "confirmar" && (
        <div>
          <div className="mb-6 rounded-xl border border-gray-200 p-4">
            <p className="text-sm text-gray-500">{extracao?.nome}</p>
            <p className="mt-1 font-medium">
              {MODALIDADES.find((m) => m.id === modalidade)?.label} {numeros}
              {milharBrinde && <span className="text-green-600"> + Brinde {milharBrinde}</span>}
              {" – "}{formatarMoeda(parseFloat(valor.replace(",", ".")))}
            </p>
          </div>
          <button
            onClick={finalizarVenda}
            className="w-full rounded-xl bg-green-600 py-4 font-semibold text-white"
          >
            Finalizar venda
          </button>
        </div>
      )}
    </div>
  );
}
