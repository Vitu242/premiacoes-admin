export interface Gerente {
  id: string;
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
  criadoEm: string;
}

export interface Cambista {
  id: string;
  gerenteId: string;
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
}

export type ModalidadeBilhete =
  | "grupo"
  | "dezena"
  | "centena"
  | "milhar";

export interface Extracao {
  id: string;
  nome: string;
  encerra: string; // HH:mm
  ativa: boolean;
}

export interface ItemBilhete {
  modalidade: ModalidadeBilhete;
  numeros: string;
  valor: number;
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
