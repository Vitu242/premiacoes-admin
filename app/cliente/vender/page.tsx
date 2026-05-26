"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  getExtracoes,
  extracaoAceitaApostas,
  extracaoRodaHoje,
  getCambistas,
  addBilhete,
  podeRealizarVenda,
  getSaldoDisponivel,
  getCotacaoEfetiva,
  getPremioMaxExtracao,
  getConfig,
} from "@/lib/store";
import type { Extracao, ModalidadeBilhete, ItemBilhete } from "@/lib/types";
import { COTACOES_LABELS, modalidadePodeApostar } from "@/lib/cotacoes";
import type { CotacaoKey, StatusModalidade } from "@/lib/cotacoes";
import { useConfigRefresh } from "@/lib/use-config-refresh";

type Step = "extracao" | "modalidade" | "variante" | "numeros" | "premio" | "milharBrinde" | "valor" | "carrinho" | "confirmar";

/** Ordem dos passos: usada para detectar avanço vs retrocesso do fluxo. */
const STEP_ORDER: Record<Step, number> = {
  extracao: 0,
  modalidade: 1,
  variante: 2,
  numeros: 3,
  premio: 4,
  milharBrinde: 5,
  valor: 6,
  carrinho: 7,
  confirmar: 8,
};

/** Item temporário do carrinho (antes de aplicar dividir/multiplicar) */
interface ItemCarrinho {
  modalidade: ModalidadeBilhete;
  numeros: string;
  premio: string;
  milharBrinde?: string;
  /** Valor digitado (R$ informado pelo cliente) */
  valorDigitado: number;
  /** Modo escolhido na hora: "multiplicar" = valorDigitado por palpite; "dividir" = valorDigitado total dividido entre palpites */
  valorModo: "dividir" | "multiplicar";
}

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
  const grupo = { minDigits: 2, maxDigits: 2, max: 25, count: 1 };
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

function gerarMilharBrindeAleatoria(): string {
  return String(Math.floor(Math.random() * 10000)).padStart(4, "0");
}

/**
 * Interpreta a string de números sem usar trim() no valor inteiro (trim apagava o
 * espaço final que marca "próximo palpite" e colava o novo dígito no palpite anterior).
 */
function splitNumerosPalpites(raw: string): { completed: string[]; draft: string } {
  const s = raw.replace(/^\s+/, "");
  if (!s) return { completed: [], draft: "" };
  if (/\s$/.test(s)) {
    const body = s.replace(/\s+$/, "");
    const completed = body.length ? body.split(/\s+/).filter(Boolean) : [];
    return { completed, draft: "" };
  }
  const parts = s.split(/\s+/).filter(Boolean);
  if (!parts.length) return { completed: [], draft: "" };
  const draft = parts[parts.length - 1]!;
  const completed = parts.slice(0, -1);
  return { completed, draft };
}

function todosPalpitesNumeros(raw: string): string[] {
  const { completed, draft } = splitNumerosPalpites(raw);
  return draft.length > 0 ? [...completed, draft] : completed;
}

function contarPalpitesNumeros(raw: string): number {
  return todosPalpitesNumeros(raw).length;
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
  const [apostasAtivas, setApostasAtivas] = useState(true);
  const [sucesso, setSucesso] = useState<{ codigo: string } | null>(null);
  const [enviandoVenda, setEnviandoVenda] = useState(false);
  const [carrinho, setCarrinho] = useState<ItemCarrinho[]>([]);
  const [mostraTabelaGrupos, setMostraTabelaGrupos] = useState(false);
  /** Quando o bilhete tem múltiplos itens, o cliente pode optar entre:
   *   "individual" = cada item mantém o valor digitado individualmente;
   *   "dividir_total" = soma de valoresDigitados é dividida em partes iguais entre todos os itens. */
  const [modoBilhete, setModoBilhete] = useState<"individual" | "dividir_total">("individual");
  const [modalidadesCfg, setModalidadesCfg] = useState<
    Record<string, { minValor?: number; maxValor?: number; ativa?: boolean; status?: StatusModalidade }> | null
  >(null);

  const extracoes = getExtracoes().filter((e) => e.ativa && extracaoAceitaApostas(e.encerra) && extracaoRodaHoje(e));
  const cambista = cambistaId ? getCambistas().find((c) => c.id === cambistaId) : null;
  const premioMax = getPremioMaxExtracao(extracao?.id);

  useEffect(() => {
    const auth = localStorage.getItem("premiacoes_cliente");
    if (!auth) {
      // Se não houver sessão, vai para a HOME — quem decide se mostra o
      // login é a `/cliente/page.tsx`. Isso evita derrubar o usuário no
      // login no meio de um fluxo (e o botão voltar dentro do app nunca
      // mais traz a tela de login para o histórico).
      router.replace("/cliente");
      return;
    }
    const { cambistaId: cid } = JSON.parse(auth);
    setCambistaId(cid);
    const cfg = getConfig();
    setApostasAtivas(cfg.apostasAtivas ?? true);
    setModalidadesCfg(cfg.modalidades ?? null);
  }, [router]);

  useConfigRefresh((cfg) => {
    setApostasAtivas(cfg.apostasAtivas ?? true);
    setModalidadesCfg(cfg.modalidades ?? null);
  });

  const cfg = getConfig() as { milharBrindeGlobal?: { tipo?: string } };
  const jaTemMilharBrindeNoBilhete = carrinho.some((item) => !!item.milharBrinde);
  const mostraMilharBrinde =
    (cambista?.milharBrinde === "sim") &&
    (cfg.milharBrindeGlobal?.tipo !== "nao") &&
    !jaTemMilharBrindeNoBilhete;

  const confirmarCancelamentoBilhete = () => {
    if (typeof window === "undefined") return false;
    return window.confirm(
      "Deseja realmente sair? O bilhete em andamento será cancelado.",
    );
  };

  const indexComVariante = (): number | null => {
    if (!modalidade) return null;
    const i = MODALIDADES_TELA.findIndex((m) => m.variantes?.some((v) => v.key === modalidade));
    return i >= 0 ? i : null;
  };

  const voltarEtapa = useCallback(() => {
    setErro("");
    if (step === "modalidade") {
      // se já tem itens no carrinho, voltar leva para o carrinho (não perder os itens)
      if (carrinho.length > 0) setStep("carrinho");
      else setStep("extracao");
    }
    else if (step === "variante") { setStep("modalidade"); setModalidadeGroupIndex(null); }
    else if (step === "numeros") {
      const idx = indexComVariante();
      if (idx !== null && idx >= 0) { setStep("variante"); setModalidadeGroupIndex(idx); } else setStep("modalidade");
    } else if (step === "premio") setStep("numeros");
    else if (step === "milharBrinde") setStep("premio");
    else if (step === "valor") {
      // Na etapa de valor já existe um jogo montado (extração, modalidade,
      // números, prêmio e possivelmente brinde). Sair daqui cancela a
      // montagem, então precisa de confirmação.
      if (confirmarCancelamentoBilhete()) {
        limparItemAtual();
        setCarrinho([]);
        setModoBilhete("individual");
        setStep("extracao");
      }
    } else if (step === "carrinho") {
      // voltar do carrinho para a extração (mantém itens)
      setStep("extracao");
    }
    else if (step === "confirmar") {
      // Última etapa antes de gerar o bilhete. Pergunta se quer mesmo
      // sair — caso sim, descarta o bilhete inteiro.
      if (confirmarCancelamentoBilhete()) {
        limparItemAtual();
        setCarrinho([]);
        setModoBilhete("individual");
        setStep("extracao");
      }
      // Se cancelar o popup, fica no passo "confirmar" mesmo.
    }
    else setStep("carrinho");
  }, [carrinho.length, modalidade, mostraMilharBrinde, step]);

  const voltar = () => {
    setErro("");
    if (step === "extracao") {
      // Vai para a home, não para router.back(), para não cair no /cliente/login
      // quando o usuário tiver aberto direto /cliente/vender (PWA/shortcut).
      router.push("/cliente");
    } else {
      voltarEtapa();
    }
  };

  const stepRef = useRef(step);
  const voltarEtapaRef = useRef(voltarEtapa);

  useEffect(() => {
    const previo = stepRef.current;
    const indoPraFrente = STEP_ORDER[step] > STEP_ORDER[previo];
    stepRef.current = step;
    // Toda vez que o usuário AVANÇA, adicionamos uma entrada extra no
    // histórico. Assim, cada passo do jogo ganha sua própria entrada — o
    // botão físico/visual de voltar consome uma de cada vez, recuando
    // passo a passo, sem nunca sair da tela /cliente/vender (e nunca cair
    // no /cliente/login).
    if (indoPraFrente) {
      try {
        window.history.pushState({ clienteVenderStepGuard: true, step }, "");
      } catch {
        /* ignore */
      }
    }
  }, [step]);

  useEffect(() => {
    voltarEtapaRef.current = voltarEtapa;
  }, [voltarEtapa]);

  // Marca/limpa a flag de "bilhete em andamento" em sessionStorage para que a
  // NavBar do cliente saiba interceptar cliques em Início/Bilhetes/Caixa/
  // Resultados e pedir confirmação antes de descartar o bilhete.
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      if (carrinho.length > 0 || step === "valor" || step === "confirmar") {
        sessionStorage.setItem("vender_em_andamento", "1");
      } else {
        sessionStorage.removeItem("vender_em_andamento");
      }
    } catch {
      /* ignore */
    }
  }, [carrinho.length, step]);

  useEffect(() => {
    return () => {
      try { sessionStorage.removeItem("vender_em_andamento"); } catch {}
    };
  }, []);

  useEffect(() => {
    // Adiciona uma entrada-guard inicial. Daí em diante, cada avanço de
    // passo no useEffect [step] acrescenta a sua própria entrada. O
    // botão físico de voltar do Android/navegador consome essas entradas
    // uma a uma, recuando passo a passo — e em momento algum chega na
    // tela /cliente/login.
    try {
      window.history.pushState({ clienteVenderStepGuard: true, step: "extracao" }, "");
    } catch {
      /* ignore */
    }

    const onPopState = () => {
      if (stepRef.current === "extracao") {
        // Sai do fluxo de venda indo para a home. `replace` para a entrada
        // atual não acumular no histórico (assim o próximo voltar na home
        // tenta sair do app/aba, sem voltar para /cliente/vender).
        router.replace("/cliente");
        return;
      }
      if (stepRef.current === "valor" || stepRef.current === "confirmar") {
        // Re-empurra a entrada-guard ANTES de pedir confirmação. Assim,
        // se o usuário cancelar o popup, ele continua na tela atual
        // com a entrada-guard ainda no histórico — o próximo voltar vai
        // perguntar de novo.
        try {
          window.history.pushState({ clienteVenderStepGuard: true, step: stepRef.current }, "");
        } catch {
          /* ignore */
        }
        const ok = window.confirm(
          "Deseja realmente sair? O bilhete em andamento será cancelado.",
        );
        if (ok) {
          setCarrinho([]);
          setModoBilhete("individual");
          setStep("extracao");
        }
        return;
      }
      // Recua um passo. O navegador já consumiu uma entrada quando o
      // popstate disparou; não precisamos pushar nada de volta.
      voltarEtapaRef.current();
    };

    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [router]);

  /** Limpa apenas o item em construção, preservando o carrinho e a extração. */
  const limparItemAtual = () => {
    setModalidade(null);
    setModalidadeGroupIndex(null);
    setNumeros("");
    setPremio("1/1");
    setMilharBrinde("");
    setValor("");
    setValorModo("multiplicar");
  };

  /** Limpa tudo (após sucesso) */
  const limparTudo = () => {
    setStep("extracao");
    setExtracao(null);
    limparItemAtual();
    setCarrinho([]);
    setModoBilhete("individual");
  };

  const escolherExtracao = (e: Extracao) => {
    setErro("");
    if (!extracaoAceitaApostas(e.encerra)) {
      setErro("Tempo excedido. Esta extração já encerrou apostas.");
      return;
    }
    // Se trocar de extração (já havia outra), zera carrinho — jogos são por extração.
    if (extracao && extracao.id !== e.id && carrinho.length > 0) {
      if (!confirm(`Você tem ${carrinho.length} jogo(s) da extração "${extracao.nome}" no bilhete. Trocar de extração vai limpar esses jogos. Continuar?`)) {
        return;
      }
      setCarrinho([]);
      setModoBilhete("individual");
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
      const { completed, draft } = splitNumerosPalpites(numeros);
      if (draft.length < config.minDigits) {
        setErro(
          config.minDigits > 1
            ? `Termine os ${config.minDigits} dígitos deste número antes de iniciar outro palpite.`
            : `Digite um número antes de iniciar outro palpite.`,
        );
        return;
      }
      const tokensAgora = [...completed, draft];
      if (config.count > 1 && tokensAgora.length >= config.count) return;
      setNumeros(tokensAgora.join(" ") + " ");
      setErro("");
      return;
    }

    const { completed, draft } = splitNumerosPalpites(numeros);

    // Auto-separação: para modalidades simples (count === 1), quando o palpite
    // atual já está no máximo de dígitos, o próximo dígito inicia automaticamente
    // um novo palpite. Sem botão extra — só fluxo natural.
    if (config.count === 1 && draft.length >= config.maxDigits) {
      const novaDraft = d;
      const nNovo = parseInt(novaDraft, 10);
      if (isNaN(nNovo)) return;
      if (config.max === 25 && (nNovo < 0 || nNovo > 25)) return;
      // Grupo/dezena exigem 2 dígitos; o próximo dígito inicia outro rascunho.
      setNumeros(`${[...completed, draft].join(" ")} ${novaDraft}`);
      setErro("");
      return;
    }

    const novaDraft = draft + d;
    if (novaDraft.length > config.maxDigits) return;
    const n = parseInt(novaDraft, 10);
    if (isNaN(n) || n > config.max) return;
    // Permite digitar "0" como primeiro dígito de grupo (para formar 01..09),
    // mas só aceita confirmar quando tiver 2 dígitos e estiver entre 01 e 25.
    if (config.max === 25 && novaDraft.length >= config.minDigits && (n < 1 || n > 25)) return;
    const futureTokens = [...completed, novaDraft];
    if (config.count > 1 && futureTokens.length > config.count) return;
    setNumeros(completed.length ? `${completed.join(" ")} ${novaDraft}` : novaDraft);
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
    const parts = todosPalpitesNumeros(numeros.trim());
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
    if (premioFixo) {
      setPremio(premioFixo);
      if (mostraMilharBrinde) setMilharBrinde(gerarMilharBrindeAleatoria());
      setStep(mostraMilharBrinde ? "milharBrinde" : "valor");
      setValor("");
    }
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

  function premioFixoDentroDoLimite(label: string): boolean {
    const max = Number(label.split("/")[1] ?? "1");
    return Number.isFinite(max) ? max <= premioMax : true;
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
    if (mostraMilharBrinde) {
      setStep("milharBrinde");
      setMilharBrinde(gerarMilharBrindeAleatoria());
    } else {
      setStep("valor");
      setValor("");
    }
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
      setErro("Milhar brinde deve ter 4 dígitos.");
      return;
    }
    setStep("valor");
    setValor("");
    setErro("");
  };

  const qtdJogos = Math.max(1, contarPalpitesNumeros(numeros.trim()));
  const valorDigitado = parseFloat(valor.replace(",", ".")) || 0;
  const valorTotal = valorModo === "dividir"
    ? valorDigitado
    : valorDigitado * qtdJogos;
  const valorTotalDividir = valorDigitado;
  const valorPorJogoDividir = qtdJogos >= 1 ? valorDigitado / qtdJogos : valorDigitado;
  const valorTotalMultiplicar = valorDigitado * qtdJogos;

  /** Valida o valor e ADICIONA o jogo ao carrinho. Vai pro passo "carrinho". */
  const confirmarValor = () => {
    if (isNaN(valorDigitado) || valorDigitado <= 0) {
      setErro("Informe um valor válido.");
      return;
    }
    if (!modalidade) {
      setErro("Selecione uma modalidade.");
      return;
    }
    const cfg = modalidadesCfg?.[modalidade];
    if (cfg) {
      if (!modalidadePodeApostar(cfg)) {
        setErro("Esta modalidade está bloqueada pela banca.");
        return;
      }
      const min = cfg.minValor ?? 0;
      const max = cfg.maxValor ?? 0;
      if (min > 0 && valorTotal < min) {
        setErro(`Valor mínimo para ${COTACOES_LABELS[modalidade] ?? modalidade} é ${min.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}.`);
        return;
      }
      if (max > 0 && valorTotal > max) {
        setErro(`Valor máximo para ${COTACOES_LABELS[modalidade] ?? modalidade} é ${max.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}.`);
        return;
      }
    }
    const novo: ItemCarrinho = {
      modalidade,
      numeros,
      premio: premio || "1/1",
      milharBrinde: milharBrinde.length === 4 ? milharBrinde : undefined,
      valorDigitado,
      valorModo,
    };
    setCarrinho([...carrinho, novo]);
    limparItemAtual();
    setStep("carrinho");
    setErro("");
  };

  const removerItemCarrinho = (idx: number) => {
    setCarrinho((prev) => prev.filter((_, i) => i !== idx));
  };

  const adicionarOutroJogo = () => {
    limparItemAtual();
    setStep("modalidade");
    setErro("");
  };

  /**
   * Calcula o valor final aplicado a cada item do carrinho.
   * "individual": cada item usa o próprio (multiplicar ou dividir).
   * "dividir_total": soma dos valoresDigitados / quantidade de itens, igual para cada item.
   */
  const valoresFinais = ((): number[] => {
    if (carrinho.length === 0) return [];
    if (modoBilhete === "dividir_total") {
      const soma = carrinho.reduce((s, c) => s + c.valorDigitado, 0);
      const cada = soma / carrinho.length;
      return carrinho.map(() => cada);
    }
    return carrinho.map((c) => {
      const qtd = c.numeros.trim().split(/\s+/).filter(Boolean).length || 1;
      return c.valorModo === "dividir" ? c.valorDigitado : c.valorDigitado * qtd;
    });
  })();
  const totalBilhete = valoresFinais.reduce((s, v) => s + v, 0);

  const finalizarVenda = async () => {
    if (enviandoVenda) return;
    if (!extracao || !cambistaId || !cambista) return;
    if (carrinho.length === 0) { setErro("Adicione ao menos um jogo."); return; }

    // CRÍTICO: revalidar o horário de encerramento agora, na hora da
    // confirmação. Cliente pode ter começado o jogo antes do encerra e
    // ultrapassado durante a digitação — só aceitar se ainda estiver dentro.
    if (!extracaoAceitaApostas(extracao.encerra)) {
      setErro(
        `O horário de encerramento da extração "${extracao.nome}" (${extracao.encerra}) já passou. Não é mais possível confirmar este bilhete.`,
      );
      return;
    }
    if (!extracaoRodaHoje(extracao)) {
      setErro(
        `A extração "${extracao.nome}" não roda hoje. Selecione outra extração.`,
      );
      return;
    }

    for (let i = 0; i < carrinho.length; i++) {
      const c = carrinho[i];
      const v = valoresFinais[i];
      const cfg = modalidadesCfg?.[c.modalidade];
      if (cfg) {
        if (!modalidadePodeApostar(cfg)) { setErro("Uma das modalidades do bilhete está bloqueada pela banca."); return; }
        const min = cfg.minValor ?? 0;
        const max = cfg.maxValor ?? 0;
        if (min > 0 && v < min) {
          setErro(`Valor mínimo para ${COTACOES_LABELS[c.modalidade] ?? c.modalidade} é ${min.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}.`);
          return;
        }
        if (max > 0 && v > max) {
          setErro(`Valor máximo para ${COTACOES_LABELS[c.modalidade] ?? c.modalidade} é ${max.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}.`);
          return;
        }
      }
    }

    const check = podeRealizarVenda(cambistaId, totalBilhete);
    if (!check.ok) { setErro(check.erro ?? "Saldo insuficiente."); return; }

    try {
      setEnviandoVenda(true);
      const itens: ItemBilhete[] = carrinho.map((c, i) => ({
        modalidade: c.modalidade,
        numeros: c.numeros,
        valor: valoresFinais[i],
        premio: c.premio,
        ...(c.milharBrinde ? { milharBrinde: c.milharBrinde } : {}),
      }));
      const bilhete = await addBilhete({
        cambistaId,
        extracaoId: extracao.id,
        extracaoNome: extracao.nome,
        itens,
        total: totalBilhete,
        data: new Date().toLocaleString("pt-BR"),
        situacao: "pendente",
      });
      setSucesso({ codigo: bilhete.codigo });
      limparTudo();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao finalizar venda.");
    } finally {
      setEnviandoVenda(false);
    }
  };

  if (!cambista) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white dark:bg-slate-950">
        <p className="text-gray-500 dark:text-slate-400">Carregando...</p>
      </div>
    );
  }

  if (!apostasAtivas) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-amber-50 to-white px-4 dark:from-amber-950/40 dark:to-slate-950">
        <div className="max-w-md rounded-3xl border border-amber-200 bg-white p-8 text-center shadow-xl dark:border-amber-800 dark:bg-slate-800">
          <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-amber-100 text-amber-600 dark:bg-amber-900/40">
            <svg className="h-8 w-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><circle cx="12" cy="12" r="10"/><path strokeLinecap="round" d="M12 8v4M12 16h.01"/></svg>
          </div>
          <h1 className="mb-2 text-lg font-bold text-amber-800 dark:text-amber-200">
            Apostas pausadas
          </h1>
          <p className="text-sm text-amber-700 dark:text-amber-300">
            No momento o administrador desativou as apostas. Procure-o para mais informações.
          </p>
          <Link href="/cliente" className="mt-6 inline-block w-full rounded-xl bg-amber-600 py-3 font-semibold text-white hover:bg-amber-700">
            Voltar ao início
          </Link>
        </div>
      </div>
    );
  }

  const saldoDisp = getSaldoDisponivel(cambista);
  if (saldoDisp <= 0 && step === "extracao") {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white p-4 pb-24 dark:from-slate-950 dark:to-slate-900">
        <div className="mb-4 flex items-center gap-2">
          <button
            onClick={() => router.push("/cliente")}
            className="rounded p-2 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
            aria-label="Voltar"
          >
            <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h1 className="text-lg font-bold text-slate-800 dark:text-slate-100">Vender</h1>
        </div>
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-center dark:border-amber-800 dark:bg-amber-950/40">
          <p className="text-4xl mb-4">⚠️</p>
          <h2 className="text-lg font-bold text-amber-800 dark:text-amber-200">Saldo zerado</h2>
          <p className="mt-2 text-amber-800 dark:text-amber-200/90">
            Você não tem limite disponível para realizar vendas. Peça ao administrador para adicionar saldo.
          </p>
          <button
            onClick={() => router.push("/cliente")}
            className="mt-6 w-full rounded-xl bg-amber-600 py-3 font-semibold text-white hover:bg-amber-700"
          >
            Voltar
          </button>
        </div>
      </div>
    );
  }

  if (sucesso) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-emerald-50 to-white p-4 pb-24 dark:from-slate-900 dark:to-slate-950">
        <div className="mx-auto w-full max-w-md rounded-3xl border border-emerald-100 bg-white p-8 text-center shadow-xl dark:border-slate-700 dark:bg-slate-800">
          <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/40">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} className="h-10 w-10 text-emerald-600 dark:text-emerald-400">
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Venda realizada!</h2>
          <p className="mt-2 text-slate-600 dark:text-slate-300">Código do bilhete</p>
          <p className="mt-1 font-mono text-3xl font-extrabold tracking-wide text-emerald-600">{sucesso.codigo}</p>
          <div className="mt-8 flex gap-3">
            <button
              onClick={() => setSucesso(null)}
              className="flex-1 rounded-xl bg-emerald-600 py-3 font-semibold text-white shadow-md hover:bg-emerald-700"
            >
              Nova venda
            </button>
            <Link
              href="/cliente/bilhete"
              className="flex-1 rounded-xl border border-slate-300 py-3 font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300"
            >
              Ver bilhete
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white pb-28 dark:from-slate-950 dark:to-slate-900">
      <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-slate-200/60 bg-white/85 px-4 py-3 backdrop-blur-md dark:border-slate-800 dark:bg-slate-900/85">
        <button
          onClick={voltar}
          className="rounded-full p-2 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
          aria-label="Voltar"
        >
          <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2.2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <div className="flex-1">
          <h1 className="text-base font-bold text-slate-800 dark:text-slate-100">Nova aposta</h1>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            {step === "extracao" ? "Passo 1 · escolha a extração" :
             step === "modalidade" ? "Passo 2 · escolha a modalidade" :
             step === "variante" ? "Passo 2 · escolha a variante" :
             step === "numeros" ? "Passo 3 · informe os números" :
             step === "premio" ? "Passo 4 · escolha o prêmio" :
             step === "milharBrinde" ? "Passo 5 · milhar brinde" :
             step === "valor" ? "Passo 6 · valor" :
             step === "carrinho" ? `Bilhete com ${carrinho.length} jogo(s)` :
             "Confirmação"}
          </p>
        </div>

        {/* Indicador do carrinho — sempre visível quando há itens */}
        {carrinho.length > 0 && step !== "carrinho" && (
          <button
            type="button"
            onClick={() => setStep("carrinho")}
            className="relative inline-flex items-center gap-1.5 rounded-full border-2 border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-700 shadow-sm hover:bg-emerald-100 dark:border-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200"
            aria-label="Ver carrinho"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-4 w-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13l-2-8M7 13l-1.6 4M17 13l1.6 4M9 21a1 1 0 100-2 1 1 0 000 2zm9 0a1 1 0 100-2 1 1 0 000 2z"/>
            </svg>
            {carrinho.length}
            <span className="hidden sm:inline">{carrinho.length === 1 ? "jogo" : "jogos"}</span>
          </button>
        )}
      </header>

      <div className="p-4">
      {erro && (
        <div className="mb-4 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700 dark:border-rose-800 dark:bg-rose-900/30 dark:text-rose-200">
          <svg className="mt-0.5 h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <circle cx="12" cy="12" r="10"/><path strokeLinecap="round" d="M12 8v4M12 16h.01"/>
          </svg>
          {erro}
        </div>
      )}

      {/* Banner discreto: você está montando um bilhete com X jogos */}
      {carrinho.length > 0 && step !== "carrinho" && (
        <div className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:border-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-200">
          <span>
            <strong>{carrinho.length}</strong> {carrinho.length === 1 ? "jogo adicionado" : "jogos adicionados"} ao bilhete. Você pode incluir mais.
          </span>
          <button
            type="button"
            onClick={() => setStep("carrinho")}
            className="rounded-md bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-emerald-700"
          >
            Ver carrinho
          </button>
        </div>
      )}

      {/* Step: Extração */}
      {step === "extracao" && (
        <div>
          <p className="mb-4 text-slate-700 dark:text-slate-200">Escolha a extração:</p>
          {extracoes.length === 0 && (
            <p className="mb-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-950/50 dark:text-amber-200">Nenhuma loteria disponível no momento (todas já passaram do horário ou estão inativas).</p>
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
                      ? "bg-slate-100 text-slate-900 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
                      : "cursor-not-allowed bg-slate-100 text-slate-400 dark:bg-slate-900/60 dark:text-slate-600"
                  }`}
                >
                  <span className="font-medium">{e.nome}</span>
                  <span className="ml-2 text-sm text-slate-600 dark:text-slate-300">
                    {aceita ? `Encerra às ${e.encerra}` : "Tempo excedido"}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Step: Modalidade (12 opções — oculta as desativadas no admin) */}
      {step === "modalidade" && extracao && (
        <div>
          <p className="mb-2 text-sm text-slate-600 dark:text-slate-300">{extracao.nome}</p>
          <p className="mb-4 text-slate-700 dark:text-slate-200">Escolha a modalidade:</p>
          <div className="flex flex-col gap-3">
            {MODALIDADES_TELA.filter((m) => {
              if (m.key) return modalidadePodeApostar(modalidadesCfg?.[m.key]);
              if (m.variantes) return m.variantes.some((v) => modalidadePodeApostar(modalidadesCfg?.[v.key]));
              return true;
            }).map((m) => {
              const index = MODALIDADES_TELA.indexOf(m);
              return (
                <button
                  key={m.label}
                  type="button"
                  onClick={() => m.key ? escolherModalidadeKey(m.key) : escolherModalidadeComVariante(index)}
                  className="w-full rounded-xl bg-sky-100 px-4 py-4 text-left font-bold text-slate-900 hover:bg-sky-200 dark:bg-sky-900/45 dark:text-sky-50 dark:hover:bg-sky-900/70"
                >
                  {m.label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Step: Variante (1/2, 1/5, 1/3, 1/10 — oculta as desativadas no admin) */}
      {step === "variante" && modalidadeGroupIndex !== null && (
        <div>
          <p className="mb-2 text-sm text-slate-600 dark:text-slate-300">{extracao?.nome} → {MODALIDADES_TELA[modalidadeGroupIndex]?.label}</p>
          <p className="mb-4 text-slate-700 dark:text-slate-200">Escolha o prêmio:</p>
          <div className="flex flex-col gap-3">
            {MODALIDADES_TELA[modalidadeGroupIndex]?.variantes
              ?.filter((v) => modalidadePodeApostar(modalidadesCfg?.[v.key]))
              .filter((v) => premioFixoDentroDoLimite(v.label))
              .map((v) => (
                <button
                  key={v.key}
                  type="button"
                  onClick={() => escolherModalidadeKey(v.key)}
                  className="w-full rounded-xl bg-sky-100 px-4 py-4 text-left font-bold text-slate-900 hover:bg-sky-200 dark:bg-sky-900/45 dark:text-sky-50 dark:hover:bg-sky-900/70"
                >
                  {v.label}
                </button>
              ))}
          </div>
        </div>
      )}

      {/* Step: Números — layout especial para mobile.
          Cabeçalho + lista de palpites + display rolam no topo (área scrollável)
          e o TECLADO + Continuar + "Exibir grupos" ficam GRUDADOS NO RODAPÉ.
          Antes, ao adicionar o 1o palpite, a badge verde aumentava a altura
          do conteúdo e empurrava o teclado pra fora da tela. Agora não. */}
      {step === "numeros" && modalidade && (
        <div className="-mx-4 -mb-4 flex flex-col" style={{ minHeight: "calc(100vh - 8rem)" }}>
          {/* Bloco rolável: tudo que pode crescer (lista de palpites). */}
          <div className="flex-1 overflow-y-auto px-4 pb-2">
            <p className="mb-2 text-sm text-slate-600 dark:text-slate-300">
              {extracao?.nome} → {COTACOES_LABELS[modalidade] ?? modalidade}
            </p>
            <p className="mb-3 text-slate-700 dark:text-slate-200">
              {getModalidadeConfig(modalidade).count > 1
                ? `Digite os ${getModalidadeConfig(modalidade).count} números deste tipo de jogo.`
                : `Digite o palpite. Pode seguir digitando para adicionar outros, ou toque em Continuar quando terminar.`}
            </p>
            {(() => {
              const lista = todosPalpitesNumeros(numeros.trim());
              if (lista.length === 0 && !numeros.trim()) return null;
              return (
                <div className="mb-3 flex flex-wrap gap-1.5">
                  {lista.map((p, i) => (
                    <span
                      key={`${i}-${p}`}
                      className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-bold tabular-nums text-emerald-900 dark:border-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200"
                    >
                      {p}
                    </span>
                  ))}
                </div>
              );
            })()}
            <div className="mb-2 flex min-h-12 items-center justify-center rounded-xl border-2 border-slate-200 bg-slate-50 px-2 py-2 text-center text-xl font-mono font-bold break-all text-slate-900 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-50">
              {numeros || "—"}
            </div>
            <div className="mb-2 flex items-center justify-end text-xs text-slate-600 dark:text-slate-400">
              {contarPalpitesNumeros(numeros.trim())} palpite(s)
            </div>
          </div>

          {/* Rodapé fixo: teclado + botões. NÃO sai da tela quando palpites
              acumulam acima (estes ficam no scroll do bloco anterior). */}
          <div className="sticky bottom-0 z-10 border-t border-slate-200 bg-white px-4 pb-3 pt-3 shadow-[0_-2px_8px_rgba(0,0,0,0.04)] dark:border-slate-800 dark:bg-slate-950">
            <div className="mb-2 grid grid-cols-3 gap-2">
              {["1", "2", "3", "4", "5", "6", "7", "8", "9", "Espaço", "0", "⌫"].map((d) => (
                <button
                  key={d || "empty"}
                  onClick={() => (d === "⌫" ? apagarDigito() : adicionarDigito(d === "Espaço" ? " " : d))}
                  disabled={d === ""}
                  className="rounded-xl bg-slate-100 py-3 text-lg font-medium text-slate-900 active:bg-slate-300 dark:bg-slate-800 dark:text-slate-100 dark:active:bg-slate-700 disabled:invisible"
                >
                  {d}
                </button>
              ))}
            </div>
            <button
              onClick={confirmarNumeros}
              className="w-full rounded-xl bg-green-600 py-2.5 text-sm font-semibold text-white active:bg-green-700"
            >
              Continuar
            </button>
            <button
              type="button"
              onClick={() => setMostraTabelaGrupos(true)}
              className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white py-2 text-xs font-medium text-slate-700 active:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:active:bg-slate-700"
            >
              Exibir grupos e dezenas
            </button>
          </div>
        </div>
      )}

      {/* Step: Prêmio (digitar ex: 1/5 = 1º ao 5º) */}
      {step === "premio" && (
        <div>
          <p className="mb-2 text-sm text-slate-600 dark:text-slate-300">
            {extracao?.nome} → {(modalidade ? (COTACOES_LABELS[modalidade] ?? modalidade) : "—")} {numeros}
          </p>
          <p className="mb-2 text-slate-700 dark:text-slate-200">Em qual(is) prêmio(s) vale este jogo?</p>
          <p className="mb-4 text-sm text-slate-600 dark:text-slate-400">
            Esta loteria permite até 1/{premioMax}. Exemplo: 1/5 = do 1º ao 5º prêmio.
          </p>
          <div className="mb-4 flex min-h-14 items-center justify-center rounded-xl border-2 border-slate-200 bg-slate-50 px-2 py-3 text-center text-2xl font-mono font-bold text-slate-900 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-50">
            {premio || "—"}
          </div>
          <div className="mb-4 grid grid-cols-3 gap-3">
            {["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "⌫"].map((d, i) => (
              <button
                key={d || `empty-${i}`}
                type="button"
                onClick={() => d && adicionarDigitoPremio(d)}
                disabled={d === ""}
                className="rounded-xl bg-slate-100 py-4 text-xl font-medium text-slate-900 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700 disabled:invisible"
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
      {step === "milharBrinde" && mostraMilharBrinde && (
        <div>
          <p className="mb-2 text-sm text-slate-600 dark:text-slate-300">
            {extracao?.nome} → {(modalidade ? (COTACOES_LABELS[modalidade] ?? modalidade) : "—")} {numeros}
          </p>
          <p className="mb-2 text-slate-700 dark:text-slate-200">Milhar brinde – 4 dígitos:</p>
          <p className="mb-4 text-xs text-slate-500 dark:text-slate-400">
            Já geramos uma milhar aleatória. Para trocar, apague e digite outra.
          </p>
          <div className="mb-4 flex h-14 items-center justify-center rounded-xl border-2 border-slate-200 bg-slate-50 text-2xl font-mono font-bold text-slate-900 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-50">
            {milharBrinde || "—"}
          </div>
          <div className="mb-4 grid grid-cols-3 gap-3">
            {["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "⌫"].map((d) => (
              <button
                key={d}
                onClick={() => adicionarDigitoMilharBrinde(d)}
                disabled={d === ""}
                className="rounded-xl bg-slate-100 py-4 text-xl font-medium text-slate-900 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700 disabled:invisible"
              >
                {d}
              </button>
            ))}
          </div>
          <button
            onClick={confirmarMilharBrinde}
            className="w-full rounded-xl bg-green-600 py-3 font-semibold text-white"
          >
            Prosseguir
          </button>
        </div>
      )}

      {/* Step: Valor */}
      {step === "valor" && cambista && (
        <div>
          <p className="mb-2 text-sm text-slate-600 dark:text-slate-300">
            {extracao?.nome} → {(modalidade ? (COTACOES_LABELS[modalidade] ?? modalidade) : "—")} {numeros} — prêmio {premio}
            {milharBrinde && <span className="text-green-600 dark:text-green-400"> + Brinde {milharBrinde}</span>}
          </p>
          <p className="mb-2 rounded-lg bg-amber-50 p-2 text-sm text-amber-800 dark:bg-amber-950/50 dark:text-amber-200">
            Disponível para venda: <strong>{formatarMoeda(getSaldoDisponivel(cambista))}</strong>
          </p>
          {getSaldoDisponivel(cambista) <= 0 && (
            <p className="mb-4 rounded-lg bg-red-50 p-2 text-sm text-red-600 dark:bg-red-950/40 dark:text-red-300">
              Saldo zerado. Peça ao administrador para adicionar limite antes de vender.
            </p>
          )}
          <p className="mb-2 text-slate-700 dark:text-slate-200">Valor da aposta (R$):</p>
          <input
            type="text"
            inputMode="decimal"
            placeholder="0,00"
            value={valor}
            onChange={(e) => setValor(e.target.value.replace(/[^0-9,]/g, ""))}
            className="mb-4 w-full rounded-xl border border-slate-300 bg-white px-4 py-4 text-xl font-medium text-slate-900 placeholder:text-slate-400 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-50 dark:placeholder:text-slate-500"
          />
          {qtdJogos > 1 && (
            <div className="mb-4 grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setValorModo("dividir")}
                className={`rounded-xl border-2 p-4 text-left transition ${
                  valorModo === "dividir"
                    ? "border-green-500 bg-green-50 text-green-800 dark:border-green-500 dark:bg-green-950/40 dark:text-green-200"
                    : "border-slate-200 bg-slate-50 text-slate-800 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
                }`}
              >
                <div className="text-sm font-medium">Dividir</div>
                <div className="text-lg font-bold">{formatarMoeda(valorPorJogoDividir)}</div>
                <div className="text-xs text-slate-600 dark:text-slate-400">
                  {formatarMoeda(valorTotalDividir)} ÷ {qtdJogos} jogos
                </div>
              </button>
              <button
                type="button"
                onClick={() => setValorModo("multiplicar")}
                className={`rounded-xl border-2 p-4 text-left transition ${
                  valorModo === "multiplicar"
                    ? "border-green-500 bg-green-50 text-green-800 dark:border-green-500 dark:bg-green-950/40 dark:text-green-200"
                    : "border-slate-200 bg-slate-50 text-slate-800 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
                }`}
              >
                <div className="text-sm font-medium">Multiplicar</div>
                <div className="text-lg font-bold">{formatarMoeda(valorTotalMultiplicar)}</div>
                <div className="text-xs text-slate-600 dark:text-slate-400">
                  {formatarMoeda(valorDigitado)} × {qtdJogos} jogos
                </div>
              </button>
            </div>
          )}
          <p className="mb-4 text-sm text-slate-600 dark:text-slate-400">
            Cotação: {formatarMoeda(getCotacaoEfetiva(cambista, modalidade!))} (se ganhar)
          </p>
          <button
            onClick={confirmarValor}
            disabled={getSaldoDisponivel(cambista) <= 0 || valorTotal <= 0}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-br from-emerald-500 to-green-600 py-3 font-semibold text-white shadow-md transition-all active:scale-[0.99] disabled:cursor-not-allowed disabled:from-slate-400 disabled:to-slate-400"
          >
            {carrinho.length === 0 ? "Adicionar ao bilhete" : `Adicionar como jogo ${carrinho.length + 1}`}
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className="h-4 w-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14M5 12h14"/>
            </svg>
          </button>
          <p className="mt-2 text-center text-[11px] text-slate-500 dark:text-slate-400">
            Você pode adicionar vários jogos antes de finalizar o bilhete. A milhar brinde é permitida apenas uma vez por bilhete.
          </p>
        </div>
      )}

      {/* Step: Carrinho — lista de jogos já adicionados + opção dividir/multiplicar */}
      {step === "carrinho" && cambista && extracao && (
        <div>
          <div className="mb-4 flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800 dark:border-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-200">
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 7a2 2 0 012-2h14a2 2 0 012 2v3h-4a3 3 0 100 6h4v3a2 2 0 01-2 2H5a2 2 0 01-2-2V7z"/>
            </svg>
            <span>Disponível: <strong>{formatarMoeda(getSaldoDisponivel(cambista))}</strong></span>
            <span className="ml-auto text-xs text-emerald-800/80 dark:text-emerald-300/90">{extracao.nome}</span>
          </div>

          {carrinho.length === 0 ? (
            <div className="rounded-2xl border-2 border-dashed border-slate-200 p-8 text-center dark:border-slate-700">
              <p className="text-sm text-slate-600 dark:text-slate-300">
                Nenhum jogo no bilhete ainda.
              </p>
              <button
                type="button"
                onClick={adicionarOutroJogo}
                className="mt-4 inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 font-semibold text-white shadow hover:bg-emerald-700"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className="h-5 w-5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14M5 12h14"/>
                </svg>
                Adicionar primeiro jogo
              </button>
            </div>
          ) : (
            <>
              {/* Modo do bilhete (só aparece com 2+ jogos) */}
              {carrinho.length >= 2 && (
                <div className="mb-4 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-700 dark:bg-slate-800">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">Como aplicar o valor?</p>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setModoBilhete("individual")}
                      className={`rounded-xl border-2 p-3 text-left transition ${
                        modoBilhete === "individual"
                          ? "border-emerald-500 bg-emerald-50 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-200"
                          : "border-slate-200 bg-white text-slate-800 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
                      }`}
                    >
                      <div className="text-sm font-semibold">Valor em cada</div>
                      <div className="mt-0.5 text-xs text-slate-600 dark:text-slate-400">
                        Cada jogo mantém o valor que você digitou.
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => setModoBilhete("dividir_total")}
                      className={`rounded-xl border-2 p-3 text-left transition ${
                        modoBilhete === "dividir_total"
                          ? "border-emerald-500 bg-emerald-50 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-200"
                          : "border-slate-200 bg-white text-slate-800 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
                      }`}
                    >
                      <div className="text-sm font-semibold">Dividir entre os jogos</div>
                      <div className="mt-0.5 text-xs text-slate-600 dark:text-slate-400">
                        Soma R$ {carrinho.reduce((s, c) => s + c.valorDigitado, 0).toFixed(2).replace(".", ",")} ÷ {carrinho.length} jogos.
                      </div>
                    </button>
                  </div>
                </div>
              )}

              {/* Lista de itens */}
              <div className="space-y-2">
                {carrinho.map((c, i) => {
                  const label = COTACOES_LABELS[c.modalidade] ?? c.modalidade;
                  const qtd = c.numeros.trim().split(/\s+/).filter(Boolean).length || 1;
                  const v = valoresFinais[i] ?? 0;
                  return (
                    <div key={i} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-800">
                      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                        <span className="text-sm font-bold">{i + 1}</span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                          {label} <span className="text-xs font-normal text-slate-600 dark:text-slate-400">· {c.premio}</span>
                        </p>
                        <p className="truncate font-mono text-base font-bold text-emerald-600 dark:text-emerald-400">{c.numeros}</p>
                        {qtd > 1 && (
                          <p className="text-[10px] text-slate-600 dark:text-slate-400">
                            {qtd} palpites · {modoBilhete === "individual" ? (c.valorModo === "dividir" ? "valor dividido entre eles" : "valor em cada") : "rateio pelo bilhete"}
                          </p>
                        )}
                        {c.milharBrinde && <p className="text-[10px] text-emerald-600">Brinde: {c.milharBrinde}</p>}
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-extrabold text-slate-900 dark:text-white">{formatarMoeda(v)}</p>
                        <button
                          type="button"
                          onClick={() => removerItemCarrinho(i)}
                          className="mt-1 text-[10px] font-medium text-rose-600 hover:underline"
                        >
                          remover
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Total */}
              <div className="mt-4 flex items-baseline justify-between rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-900/50">
                <span className="text-sm text-slate-600 dark:text-slate-400">Total do bilhete</span>
                <span className="text-2xl font-extrabold text-slate-900 dark:text-white">{formatarMoeda(totalBilhete)}</span>
              </div>

              {/* Ações — adicionar mais é a ação primária; finalizar fica como CTA secundária ao lado */}
              <div className="mt-4 space-y-2">
                <button
                  type="button"
                  onClick={adicionarOutroJogo}
                  className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-emerald-400 bg-emerald-50 py-3.5 text-base font-bold text-emerald-700 transition-colors hover:bg-emerald-100 dark:border-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-300"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} className="h-5 w-5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14M5 12h14"/>
                  </svg>
                  Adicionar outro jogo
                </button>
                <button
                  type="button"
                  onClick={finalizarVenda}
                  disabled={enviandoVenda || !podeRealizarVenda(cambista.id, totalBilhete).ok}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-br from-emerald-500 to-green-600 py-3.5 text-base font-bold text-white shadow-lg shadow-emerald-500/30 transition-all active:scale-[0.99] disabled:cursor-not-allowed disabled:from-slate-400 disabled:to-slate-400 disabled:shadow-none"
                >
                  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/>
                  </svg>
                  {enviandoVenda ? "Gerando bilhete…" : "Finalizar e gerar bilhete"}
                </button>
                <p className="text-center text-[11px] text-slate-500 dark:text-slate-400">
                  {carrinho.length === 1
                    ? "Você pode adicionar mais jogos da mesma extração antes de finalizar."
                    : `${carrinho.length} jogos no bilhete. Adicione quantos quiser.`}
                </p>
              </div>
            </>
          )}
        </div>
      )}
      </div>

      {/* Modal: tabela de grupos e dezenas (jogo do bicho) */}
      {mostraTabelaGrupos && (
        <TabelaGruposModal onClose={() => setMostraTabelaGrupos(false)} />
      )}
    </div>
  );
}

/**
 * Modal mostrando a tabela completa do jogo do bicho:
 * 25 grupos × 4 dezenas cada (01-100). Útil para o cliente consultar
 * a correspondência entre número/grupo/animal enquanto faz a aposta.
 */
const BICHOS_TABELA: Array<{ num: number; nome: string }> = [
  { num: 1, nome: "Avestruz" },
  { num: 2, nome: "Águia" },
  { num: 3, nome: "Burro" },
  { num: 4, nome: "Borboleta" },
  { num: 5, nome: "Cachorro" },
  { num: 6, nome: "Cabra" },
  { num: 7, nome: "Carneiro" },
  { num: 8, nome: "Camelo" },
  { num: 9, nome: "Cobra" },
  { num: 10, nome: "Coelho" },
  { num: 11, nome: "Cavalo" },
  { num: 12, nome: "Elefante" },
  { num: 13, nome: "Galo" },
  { num: 14, nome: "Gato" },
  { num: 15, nome: "Jacaré" },
  { num: 16, nome: "Leão" },
  { num: 17, nome: "Macaco" },
  { num: 18, nome: "Porco" },
  { num: 19, nome: "Pavão" },
  { num: 20, nome: "Peru" },
  { num: 21, nome: "Touro" },
  { num: 22, nome: "Tigre" },
  { num: 23, nome: "Urso" },
  { num: 24, nome: "Veado" },
  { num: 25, nome: "Vaca" },
];

function dezenasDoGrupo(g: number): string[] {
  const start = (g - 1) * 4;
  return [start + 1, start + 2, start + 3, start + 4].map((d) =>
    d === 100 ? "00" : String(d).padStart(2, "0"),
  );
}

function TabelaGruposModal({ onClose }: { onClose: () => void }) {
  // Lock scroll do body enquanto o modal estiver aberto.
  useEffect(() => {
    const orig = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = orig;
    };
  }, []);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center bg-black/70 sm:items-center sm:p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl bg-emerald-900 shadow-2xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-emerald-800 bg-emerald-900 px-4 py-3">
          <h2 className="text-base font-bold text-white">Grupos e dezenas</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1.5 text-emerald-100 hover:bg-emerald-800"
            aria-label="Fechar"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
        <div className="overflow-y-auto bg-emerald-900 p-3">
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
            {BICHOS_TABELA.map((b) => (
              <div
                key={b.num}
                className="relative flex flex-col items-center rounded-xl bg-white px-2 pb-2 pt-3 shadow-sm dark:bg-slate-100"
              >
                <span className="absolute left-1.5 top-1.5 rounded-md bg-amber-300 px-1.5 py-0.5 text-[10px] font-extrabold text-slate-900">
                  {String(b.num).padStart(2, "0")}
                </span>
                <span className="absolute right-1.5 top-1.5 flex flex-col items-end text-right font-mono text-[10px] font-bold leading-tight text-emerald-700">
                  {dezenasDoGrupo(b.num).map((d) => (
                    <span key={d}>{d}</span>
                  ))}
                </span>
                <div className="mt-3 flex h-12 w-full items-center justify-center sm:h-14">
                  <span className="text-3xl">
                    {bichoEmoji(b.num)}
                  </span>
                </div>
                <p className="mt-1 truncate text-[11px] font-bold uppercase tracking-wide text-slate-800">
                  {b.nome}
                </p>
              </div>
            ))}
          </div>
        </div>
        <div className="border-t border-emerald-800 bg-emerald-900 p-3">
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-xl bg-white py-2.5 text-sm font-semibold text-emerald-900 hover:bg-emerald-50"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}

function bichoEmoji(num: number): string {
  // Emojis para cada um dos 25 grupos do jogo do bicho.
  const map: Record<number, string> = {
    1: "🦃", 2: "🦅", 3: "🐴", 4: "🦋", 5: "🐕",
    6: "🐐", 7: "🐑", 8: "🐪", 9: "🐍", 10: "🐇",
    11: "🐎", 12: "🐘", 13: "🐓", 14: "🐈", 15: "🐊",
    16: "🦁", 17: "🐒", 18: "🐖", 19: "🦚", 20: "🦃",
    21: "🐂", 22: "🐅", 23: "🐻", 24: "🦌", 25: "🐄",
  };
  return map[num] ?? "?";
}
