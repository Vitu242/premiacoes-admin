import type { CotacaoKey } from "./cotacoes";

export interface Gerente {
  id: string;
  codigo: string; // Código da banca (ex: Lotobrasil, Jaguar) – cada admin vê só os do seu código
  login: string;
  senha: string;
  tipo: string;
  comissaoBruto: number;
  comissaoLucro: number;
  endereco: string;
  telefone: string;
  descricao: string;
  criarCambista: boolean;
  adicionarSaldo: boolean;
  status: "ativo" | "inativo";
  socio: string;
  /** C/S = Contas/Sócio. Ex.: indicador de contas ou código. */
  contasSocio?: string;
  criadoEm: string;
}

export interface Cambista {
  id: string;
  gerenteId: string;
  codigo: string; // Mesmo código da banca do gerente – cliente entra com este código
  /** Tipo: Cambista (vendedor) ou Cliente. Padrão: "cambista". */
  tipo?: "cambista" | "cliente";
  login: string;
  senha: string;
  saldo: number;
  comissaoMilhar: number;
  comissaoCentena: number;
  comissaoDezena: number;
  comissaoGrupo: number;
  cotacaoM: number;
  cotacaoC: number;
  cotacaoD: number;
  cotacaoG: number;
  /** Overrides de cotações por tipo (quando preenchido, o cliente usa estes valores; senão usa cotações padrão) */
  cotacoes?: Partial<Record<CotacaoKey, number>>;
  milharBrinde: "sim" | "nao";
  endereco: string;
  telefone: string;
  descricao: string;
  status: "ativo" | "inativo";
  risco: string;
  // Prestar contas
  entrada: number;
  saidas: number;
  comissao: number;
  lancamentos: number;
  ultimaPrestacao: string | null;
  /** Data/hora do último login no app cliente (ISO string) - para controle de inatividade */
  ultimoAcesso?: string | null;
}

/** Todas as modalidades de aposta (inclui as 4 base e as demais do jogo do bicho). */
export type ModalidadeBilhete = CotacaoKey;

/** Sorteio cadastrado no painel (eventos/promos). */
export interface Sorteio {
  id: string;
  nome: string;
  /** Data do sorteio (dd/mm/aaaa ou ISO). */
  data: string;
  /** Regras, prêmios ou observações. */
  descricao?: string;
  ativo: boolean;
  criadoEm: string;
}

/** Dias da semana em que a extração ocorre. Vazio = todos os dias. */
export type DiaSemana = "Dom" | "Seg" | "Ter" | "Qua" | "Qui" | "Sex" | "Sab";

export interface Extracao {
  id: string;
  nome: string;
  encerra: string; // HH:mm
  ativa: boolean;
  /** Tipo de loteria (ex: Tradicional, Federal). Opcional. */
  tipo?: string;
  /** Dias da semana em que ocorre. Vazio ou omitido = todos os dias. */
  dias?: DiaSemana[];
}

export interface ItemBilhete {
  modalidade: ModalidadeBilhete;
  numeros: string;
  valor: number;
  /** Prêmio(s) do jogo: "1/1" (só 1º), "1/2" (1º ou 2º), ... "5/10" (5º ao 10º). Omitido = 1/1 */
  premio?: string;
  /** Milhar brinde opcional (4 dígitos) - habilitado nas configurações do cambista */
  milharBrinde?: string;
}

export interface Bilhete {
  id: string;
  codigo: string;
  cambistaId: string;
  extracaoId: string;
  extracaoNome: string;
  itens: ItemBilhete[];
  total: number;
  data: string;
  situacao: "pendente" | "pago" | "perdedor" | "cancelado";
}

export interface Lancamento {
  id: string;
  cambistaId: string;
  tipo: "adiantar" | "retirar";
  valor: number;
  data: string;
  observacao?: string;
}

/** Resultado por prêmio (1 = 1º, 2 = 2º, ... 10 = 10º). grupos = "01-02-03-04-05" */
export interface Resultado {
  id: string;
  extracaoId: string;
  extracaoNome: string;
  data: string; // dd/mm/yy
  /** 1º prêmio (retrocompat) */
  grupos: string;
  dezenas?: string;
  /** Por prêmio: 1..10. premios[1] = grupos do 1º, etc. */
  premios?: Record<number, string>;
}
