"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  getExtracoes,
  extracaoAceitaApostas,
  getCambistas,
  addBilhete,
  podeRealizarVenda,
  getSaldoDisponivel,
  getCotacaoEfetiva,
  getPremioMax,
} from "@/lib/store";
import type { Extracao, ModalidadeBilhete, ItemBilhete } from "@/lib/types";
import { COTACOES_LABELS } from "@/lib/cotacoes";
import type { CotacaoKey } from "@/lib/cotacoes";

type Step = "extracao" | "modalidade" | "variante" | "numeros" | "premio" | "milharBrinde" | "valor" | "confirmar";

/** 12 modalidades da tela do cliente (como na imagem). Com variantes = passo extra para escolher 1/2, 1/5, etc. */
const MODALIDADES_TELA: { label: string; key?: CotacaoKey; variantes?: { key: CotacaoKey; label: string }[] }[] = [
  { label: "Milhar", key: "milhar" },
  { label: "Centena", key: "centena" },
  { label: "Dezena", key: "dezena" },
  { label: "Grupo", key: "grupo" },
  { label: "Milhar e Centena", key: "milhar_e_centena" },
  { label: "Milhar Invertida", key: "milhar_invertida" },
  { label: "MC Invertida", key: "mc_invertida" },
  { label: "Centena Invertida", key: "centena_invertida" },
  { label: "Duque de Grupo", variantes: [{ key: "duque_grupo_1_2", label: "1/2" }, { key: "duque_grupo_1_5", label: "1/5" }] },
  { label: "Terno de Grupo", variantes: [{ key: "terno_grupo_1_3", label: "1/3" }, { key: "terno_grupo_1_5", label: "1/5" }, { key: "terno_grupo_1_10", label: "1/10" }] },
  { label: "Duque de Dezena", variantes: [{ key: "duque_dezena_1_2", label: "1/2" }, { key: "duque_dezena_1_5", label: "1/5" }] },
  { label: "Terno de Dezena", variantes: [{ key: "terno_dezena_1_3", label: "1/3" }, { key: "terno_dezena_1_5", label: "1/5" }, { key: "terno_dezena_1_10", label: "1/10" }] },
];

/** Config do input de números por modalidade (para as que têm key direta ou após variante). */
function getModalidadeConfig(key: CotacaoKey): { minDigits: number; maxDigits: number; max: number; count: number } {
  const grupo = { minDigits: 1, maxDigits: 2, max: 25, count: 1 };
  const dezena = { minDigits: 2, maxDigits: 2, max: 99, count: 1 };
  const centena = { minDigits: 3, maxDigits: 3, max: 999, count: 1 };
  const milhar = { minDigits: 4, maxDigits: 4, max: 9999, count: 1 };
  if (key === "grupo" || key === "milhar" || key === "centena" || key === "dezena") {
    return key === "grupo" ? grupo : key === "dezena" ? dezena : key === "centena" ? centena : milhar;
  }
  if (key.startsWith("duque_grupo") || key.startsWith("terno_grupo")) return { ...grupo, count: key.startsWith("duque") ? 2 : 3 };
  if (key.startsWith("duque_dezena") || key.startsWith("terno_dezena")) return { ...dezena, count: key.startsWith("duque") ? 2 : 3 };
  if (key.includes("centena") && key !== "milhar_e_centena" && key !== "mc_invertida") return centena;
  return milhar;
}

function formatarMoeda(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}


export default function ClienteVenderPage() {
  const router = useRouter();
  const [cambistaId, setCambistaId] = useState<string | null>(null);
  const [step, setStep] = useState<Step>("extracao");
  const [extracao, setExtracao] = useState<Extracao | null>(null);
  const [modalidade, setModalidade] = useState<ModalidadeBilhete | null>(null);
  const [modalidadeGroupIndex, setModalidadeGroupIndex] = useState<number | null>(null);
  const [numeros, setNumeros] = useState("");
  const [premio, setPremio] = useState("1/1");
  const [milharBrinde, setMilharBrinde] = useState("");
  const [valor, setValor] = useState("");
  const [valorModo, setValorModo] = useState<"dividir" | "multiplicar">("multiplicar");
  const [erro, setErro] = useState("");
  const [sucesso, setSucesso] = useState<{ codigo: string } | null>(null);

  const extracoes = getExtracoes().filter((e) => e.ativa && extracaoAceitaApostas(e.encerra));
  const cambista = cambistaId ? getCambistas().find((c) => c.id === cambistaId) : null;
  const premioMax = getPremioMax();

  useEffect(() => {
    const auth = localStorage.getItem("premiacoes_cliente");
    if (!auth) {
      router.replace("/cliente/login");
      return;
    }
    const { cambistaId: cid } = JSON.parse(auth);
    setCambistaId(cid);
  }, [router]);

  const indexComVariante = (): number | null => {
    if (!modalidade) return null;
    const i = MODALIDADES_TELA.findIndex((m) => m.variantes?.some((v) => v.key === modalidade));
    return i >= 0 ? i : null;
  };

  const voltar = () => {
    setErro("");
    if (step === "extracao") router.back();
    else if (step === "modalidade") setStep("extracao");
    else if (step === "variante") { setStep("modalidade"); setModalidadeGroupIndex(null); }
    else if (step === "numeros") {
      const idx = indexComVariante();
      if (idx !== null && idx >= 0) { setStep("variante"); setModalidadeGroupIndex(idx); } else setStep("modalidade");
    } else if (step === "premio") setStep("numeros");
    else if (step === "milharBrinde") setStep("premio");
    else if (step === "valor") {
      if (modalidade && getPremioFixoFromKey(modalidade)) setStep("numeros");
      else setStep(cambista?.milharBrinde === "sim" ? "milharBrinde" : "premio");
    } else setStep("valor");
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

  const escolherModalidadeKey = (key: CotacaoKey) => {
    setErro("");
    setModalidade(key);
    setNumeros("");
    const premioFixo = getPremioFixoFromKey(key);
    if (premioFixo) setPremio(premioFixo);
    setStep("numeros");
  };

  const escolherModalidadeComVariante = (index: number) => {
    setErro("");
    setModalidadeGroupIndex(index);
    setModalidade(null);
    setNumeros("");
    setStep("variante");
  };

  const adicionarDigito = (d: string) => {
    if (!modalidade) return;
    const config = getModalidadeConfig(modalidade);
    if (d === " ") {
      const parts = numeros.trim().split(/\s+/);
      const last = parts[parts.length - 1] ?? "";
      if (last.length < config.minDigits) return;
      if (config.count > 1 && parts.length >= config.count) return;
      setNumeros(numeros.trim() + " ");
      setErro("");
      return;
    }
    const parts = numeros.trim().split(/\s+/);
    const last = parts[parts.length - 1] ?? "";
    const novaLast = last + d;
    if (novaLast.length > config.maxDigits) return;
    const n = parseInt(novaLast, 10);
    if (n > config.max || (config.max === 25 && (n < 1 || n > 25))) return;
    parts[parts.length - 1] = novaLast;
    if (config.count > 1 && parts.length > config.count) return;
    setNumeros(parts.join(" ").trim());
    setErro("");
  };

  const apagarDigito = () => setNumeros((s) => {
    const t = s.trimEnd();
    if (t.endsWith(" ")) return t.slice(0, -1);
    return s.slice(0, -1);
  });

  const confirmarNumeros = () => {
    if (!modalidade || !cambista) return;
    const config = getModalidadeConfig(modalidade);
    const parts = numeros.trim().split(/\s+/).filter(Boolean);
    if (config.count > 1) {
      if (parts.length !== config.count) {
        setErro(`Informe ${config.count} número(s) separados por espaço.`);
        return;
      }
    } else {
      if (parts.length === 0) {
        setErro(`Informe ao menos um número (${config.minDigits} a ${config.maxDigits} dígitos).`);
        return;
      }
    }
    for (const p of parts) {
      if (p.length < config.minDigits || p.length > config.maxDigits) {
        setErro(`Cada número deve ter ${config.minDigits} a ${config.maxDigits} dígito(s).`);
        return;
      }
      const n = parseInt(p, 10);
      if (isNaN(n) || n > config.max || (config.max === 25 && (n < 1 || n > 25))) {
        setErro("Número(s) inválido(s) para esta modalidade.");
        return;
      }
    }
    const premioFixo = getPremioFixoFromKey(modalidade);
    if (premioFixo) { setPremio(premioFixo); setStep(cambista?.milharBrinde === "sim" ? "milharBrinde" : "valor"); setValor(""); }
    else { setStep("premio"); setPremio(""); }
    setErro("");
  };

  function getPremioFixoFromKey(key: CotacaoKey): string | null {
    if (key.includes("_1_2")) return "1/2";
    if (key.includes("_1_5")) return "1/5";
    if (key.includes("_1_3")) return "1/3";
    if (key.includes("_1_10")) return "1/10";
    return null;
  }

  const adicionarDigitoPremio = (d: string) => {
    if (d === "⌫") {
      apagarDigitoPremio();
      return;
    }
    const num = parseInt(d, 10);
    if (isNaN(num) || num < 0 || num > 9) return;

    if (!premio.includes("/")) {
      if (premio.length >= 1) return;
      if (num < 1 || num > 5) return;
      setPremio(`${num}/`);
    } else {
      const [a, b] = premio.split("/");
      const primeiro = parseInt(a ?? "1", 10);
      const segundoAtual = b ?? "";
      if (segundoAtual.length >= 2) return;
      const novoSegundo = segundoAtual + d;
      const segundoNum = parseInt(novoSegundo, 10);
      if (segundoNum < primeiro || segundoNum > premioMax) return;
      setPremio(`${a}/${novoSegundo}`);
    }
    setErro("");
  };

  const apagarDigitoPremio = () => {
    if (!premio.includes("/")) {
      setPremio("");
    } else {
      const [a, b] = premio.split("/");
      const segundoAtual = b ?? "";
      if (segundoAtual.length > 0) {
        setPremio(`${a}/${segundoAtual.slice(0, -1)}`);
      } else {
        setPremio(a ?? "");
      }
    }
  };

  const confirmarPremio = () => {
    setErro("");
    const [a, b] = premio.split("/");
    const primeiro = parseInt(a ?? "0", 10);
    const segundo = parseInt(b ?? "0", 10);
    if (!a || !b || primeiro < 1 || primeiro > 5 || segundo < primeiro || segundo > premioMax) {
      setErro("Digite o prêmio no formato 1/5 (ex: 1º ao 5º).");
      return;
    }
    if (cambista?.milharBrinde === "sim") {
      setStep("milharBrinde");
      setMilharBrinde("");
    } else {
      setStep("valor");
      setValor("");
    }
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

  const qtdJogos = Math.max(1, numeros.trim().split(/\s+/).filter(Boolean).length);
  const valorDigitado = parseFloat(valor.replace(",", ".")) || 0;
  const valorTotal = valorModo === "dividir"
    ? valorDigitado
    : valorDigitado * qtdJogos;
  const valorPorJogo = qtdJogos >= 1 ? valorTotal / qtdJogos : valorTotal;

  const confirmarValor = () => {
    if (isNaN(valorDigitado) || valorDigitado <= 0) {
      setErro("Informe um valor válido.");
      return;
    }
    setStep("confirmar");
    setErro("");
  };

  const finalizarVenda = async () => {
    if (!extracao || !modalidade || !cambistaId || !cambista) return;
    if (isNaN(valorDigitado) || valorDigitado <= 0) return;

    const check = podeRealizarVenda(cambistaId, valorTotal);
    if (!check.ok) {
      setErro(check.erro ?? "Saldo insuficiente.");
      return;
    }

    try {
      const item: ItemBilhete = {
        modalidade,
        numeros,
        valor: valorTotal,
        premio: premio || "1/1",
        ...(milharBrinde.length === 4 && { milharBrinde }),
      };
      const bilhete = await addBilhete({
        cambistaId,
        extracaoId: extracao.id,
        extracaoNome: extracao.nome,
        itens: [item],
        total: valorTotal,
        data: new Date().toLocaleString("pt-BR"),
        situacao: "pendente",
      });
      setSucesso({ codigo: bilhete.codigo });
      setStep("extracao");
      setExtracao(null);
      setModalidade(null);
      setNumeros("");
      setPremio("1/1");
      setMilharBrinde("");
      setValor("");
      setValorModo("multiplicar");
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao finalizar venda.");
    }
  };

  if (!cambista) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white">
        <p className="text-gray-500">Carregando...</p>
      </div>
    );
  }

  const saldoDisp = getSaldoDisponivel(cambista);
  if (saldoDisp <= 0 && step === "extracao") {
    return (
      <div className="min-h-screen bg-white p-4 pb-24">
        <div className="mb-4 flex items-center gap-2">
          <button
            onClick={() => router.back()}
            className="rounded p-2 text-gray-600 hover:bg-gray-100"
            aria-label="Voltar"
          >
            <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h1 className="text-lg font-bold text-gray-800">Vender</h1>
        </div>
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-center">
          <p className="text-4xl mb-4">⚠️</p>
          <h2 className="text-lg font-bold text-amber-800">Saldo zerado</h2>
          <p className="mt-2 text-amber-700">
            Você não tem limite disponível para realizar vendas. Peça ao administrador para adicionar saldo.
          </p>
          <button
            onClick={() => router.back()}
            className="mt-6 w-full rounded-xl bg-amber-600 py-3 font-semibold text-white"
          >
            Voltar
          </button>
        </div>
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
          {extracoes.length === 0 && (
            <p className="mb-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">Nenhuma loteria disponível no momento (todas já passaram do horário ou estão inativas).</p>
          )}
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

      {/* Step: Modalidade (12 opções como na imagem) */}
      {step === "modalidade" && extracao && (
        <div>
          <p className="mb-2 text-sm text-gray-500">{extracao.nome}</p>
          <p className="mb-4 text-gray-600">Escolha a modalidade:</p>
          <div className="flex flex-col gap-3">
            {MODALIDADES_TELA.map((m, index) => (
              <button
                key={m.label}
                type="button"
                onClick={() => m.key ? escolherModalidadeKey(m.key) : escolherModalidadeComVariante(index)}
                className="w-full rounded-xl bg-sky-100 px-4 py-4 text-left font-bold text-gray-900 hover:bg-sky-200"
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Step: Variante (1/2, 1/5, 1/3, 1/10 para Duque/Terno) */}
      {step === "variante" && modalidadeGroupIndex !== null && (
        <div>
          <p className="mb-2 text-sm text-gray-500">{extracao?.nome} → {MODALIDADES_TELA[modalidadeGroupIndex]?.label}</p>
          <p className="mb-4 text-gray-600">Escolha o prêmio:</p>
          <div className="flex flex-col gap-3">
            {MODALIDADES_TELA[modalidadeGroupIndex]?.variantes?.map((v) => (
              <button
                key={v.key}
                type="button"
                onClick={() => escolherModalidadeKey(v.key)}
                className="w-full rounded-xl bg-sky-100 px-4 py-4 text-left font-bold text-gray-900 hover:bg-sky-200"
              >
                {v.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Step: Números */}
      {step === "numeros" && modalidade && (
        <div>
          <p className="mb-2 text-sm text-gray-500">{extracao?.nome} → {COTACOES_LABELS[modalidade] ?? modalidade}</p>
          <p className="mb-2 text-gray-600">
            {getModalidadeConfig(modalidade).count > 1
              ? `Digite ${getModalidadeConfig(modalidade).count} números separados por espaço (ou mais, para vários jogos):`
              : "Digite um ou mais números. Use Espaço para adicionar outro:"}
          </p>
          <div className="mb-4 flex min-h-14 items-center justify-center rounded-xl border-2 border-gray-200 bg-gray-50 px-2 py-3 text-xl font-mono font-bold break-all text-center text-black">
            {numeros || "—"}
          </div>
          <div className="mb-2 flex items-center justify-end text-sm text-gray-500">
            {numeros.trim().split(/\s+/).filter(Boolean).length} jogo(s)
          </div>
          <div className="grid grid-cols-3 gap-3 mb-4">
            {["1", "2", "3", "4", "5", "6", "7", "8", "9", "Espaço", "0", "⌫"].map((d) => (
              <button
                key={d || "empty"}
                onClick={() => (d === "⌫" ? apagarDigito() : adicionarDigito(d === "Espaço" ? " " : d))}
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

      {/* Step: Prêmio (digitar ex: 1/5 = 1º ao 5º) */}
      {step === "premio" && (
        <div>
          <p className="mb-2 text-sm text-gray-500">
            {extracao?.nome} → {(modalidade ? (COTACOES_LABELS[modalidade] ?? modalidade) : "—")} {numeros}
          </p>
          <p className="mb-2 text-gray-600">Em qual(is) prêmio(s) vale este jogo?</p>
          <p className="mb-4 text-sm text-gray-500">Exemplo: 1/5 = do 1º ao 5º prêmio (digite e a barra aparece)</p>
          <div className="mb-4 flex min-h-14 items-center justify-center rounded-xl border-2 border-gray-200 bg-gray-50 px-2 py-3 text-2xl font-mono font-bold text-black">
            {premio || "—"}
          </div>
          <div className="mb-4 grid grid-cols-3 gap-3">
            {["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "⌫"].map((d, i) => (
              <button
                key={d || `empty-${i}`}
                type="button"
                onClick={() => d && adicionarDigitoPremio(d)}
                disabled={d === ""}
                className="rounded-xl bg-gray-100 py-4 text-xl font-medium text-gray-800 hover:bg-gray-200 disabled:invisible"
              >
                {d === "⌫" ? "⌫" : d}
              </button>
            ))}
          </div>
          <button
            onClick={confirmarPremio}
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
            {extracao?.nome} → {(modalidade ? (COTACOES_LABELS[modalidade] ?? modalidade) : "—")} {numeros}
          </p>
          <p className="mb-4 text-gray-600">Milhar brinde (opcional) – 4 dígitos:</p>
          <div className="mb-4 flex h-14 items-center justify-center rounded-xl border-2 border-gray-200 bg-gray-50 text-2xl font-mono font-bold text-black">
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
      {step === "valor" && cambista && (
        <div>
          <p className="mb-2 text-sm text-gray-500">
            {extracao?.nome} → {(modalidade ? (COTACOES_LABELS[modalidade] ?? modalidade) : "—")} {numeros} — prêmio {premio}
            {milharBrinde && <span className="text-green-600"> + Brinde {milharBrinde}</span>}
          </p>
          <p className="mb-2 rounded-lg bg-amber-50 p-2 text-sm text-amber-800">
            Disponível para venda: <strong>{formatarMoeda(getSaldoDisponivel(cambista))}</strong>
          </p>
          {getSaldoDisponivel(cambista) <= 0 && (
            <p className="mb-4 rounded-lg bg-red-50 p-2 text-sm text-red-600">
              Saldo zerado. Peça ao administrador para adicionar limite antes de vender.
            </p>
          )}
          <p className="mb-2 text-gray-600">Valor da aposta (R$):</p>
          <input
            type="text"
            inputMode="decimal"
            placeholder="0,00"
            value={valor}
            onChange={(e) => setValor(e.target.value.replace(/[^0-9,]/g, ""))}
            className="mb-4 w-full rounded-xl border border-gray-300 px-4 py-4 text-xl font-medium"
          />
          {qtdJogos > 1 && (
            <div className="mb-4 grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setValorModo("dividir")}
                className={`rounded-xl border-2 p-4 text-left transition ${
                  valorModo === "dividir"
                    ? "border-green-500 bg-green-50 text-green-800"
                    : "border-gray-200 bg-gray-50 text-gray-600"
                }`}
              >
                <div className="text-sm font-medium">Dividir</div>
                <div className="text-lg font-bold">{formatarMoeda(valorTotal)}</div>
                <div className="text-xs text-gray-500">Total ÷ {qtdJogos} = {formatarMoeda(valorPorJogo)}/jogo</div>
              </button>
              <button
                type="button"
                onClick={() => setValorModo("multiplicar")}
                className={`rounded-xl border-2 p-4 text-left transition ${
                  valorModo === "multiplicar"
                    ? "border-green-500 bg-green-50 text-green-800"
                    : "border-gray-200 bg-gray-50 text-gray-600"
                }`}
              >
                <div className="text-sm font-medium">Multiplicar</div>
                <div className="text-lg font-bold">{formatarMoeda(valorTotal)}</div>
                <div className="text-xs text-gray-500">{formatarMoeda(valorDigitado)} × {qtdJogos} jogos</div>
              </button>
            </div>
          )}
          <p className="mb-4 text-sm text-gray-500">
            Cotação: {formatarMoeda(getCotacaoEfetiva(cambista, modalidade!))} (se ganhar)
          </p>
          <button
            onClick={confirmarValor}
            disabled={getSaldoDisponivel(cambista) <= 0 || valorTotal <= 0}
            className="w-full rounded-xl bg-green-600 py-3 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            Continuar
          </button>
        </div>
      )}

      {/* Step: Confirmar */}
      {step === "confirmar" && cambista && (
        <div>
          <div className="mb-4 rounded-lg bg-amber-50 p-2 text-sm text-amber-800">
            Disponível: <strong>{formatarMoeda(getSaldoDisponivel(cambista))}</strong>
          </div>
          <div className="mb-6 rounded-xl border border-gray-200 p-4">
            <p className="text-sm text-gray-500">{extracao?.nome}</p>
            <p className="mt-1 font-medium">
              {(modalidade ? (COTACOES_LABELS[modalidade] ?? modalidade) : "—")} {numeros} (prêmio {premio})
              {milharBrinde && <span className="text-green-600"> + Brinde {milharBrinde}</span>}
              {" – "}{formatarMoeda(valorTotal)}
            </p>
          </div>
          <button
            onClick={finalizarVenda}
            disabled={!podeRealizarVenda(cambista.id, valorTotal).ok}
            className="w-full rounded-xl bg-green-600 py-4 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            Finalizar venda
          </button>
        </div>
      )}
    </div>
  );
}
