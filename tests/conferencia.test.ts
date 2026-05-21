/**
 * Testes da engine de conferência de bilhetes.
 * Cobre regras críticas: grupo, dezena, centena, milhar, MC, divisor de prêmio,
 * múltiplos números por linha (valor por palpite).
 */
import { describe, it, expect } from "vitest";
import {
  itemBateu,
  contarHitsItem,
  contarHitsMC,
  conferirBilhete,
  parsePremioRange,
  getPremioDivisor,
} from "../lib/conferencia";
import type { Bilhete, Cambista, ItemBilhete, Resultado, ModalidadeBilhete } from "../lib/types";

const cambista: Cambista = {
  id: "c1",
  gerenteId: "g1",
  codigo: "default",
  tipo: "cambista",
  login: "Teste",
  senha: "123",
  saldo: 1000,
  comissaoMilhar: 20,
  comissaoCentena: 20,
  comissaoDezena: 17,
  comissaoGrupo: 17,
  cotacaoM: 6000,
  cotacaoC: 800,
  cotacaoD: 80,
  cotacaoG: 20,
  milharBrinde: "sim",
  endereco: "",
  telefone: "",
  descricao: "",
  status: "ativo",
  risco: "RUIM",
  entrada: 0,
  saidas: 0,
  comissao: 0,
  lancamentos: 0,
  ultimaPrestacao: null,
};

const getCotacao = (c: Cambista, mod: ModalidadeBilhete): number => {
  if (mod === "milhar") return c.cotacaoM;
  if (mod === "centena") return c.cotacaoC;
  if (mod === "dezena") return c.cotacaoD;
  if (mod === "grupo") return c.cotacaoG;
  return 0;
};

const resultadoExemplo: Resultado = {
  id: "r1",
  extracaoId: "1",
  extracaoNome: "Federal",
  data: "13/05/26",
  grupos: "06-12-25-01-13",
  premios: { 1: "06-12-25-01-13", 2: "10-15-20-03-08" },
};

const resultadoMilhar0001: Resultado = {
  id: "r2",
  extracaoId: "1",
  extracaoNome: "LOOK GOIAS 23:20",
  data: "13/05/26",
  grupos: "0001",
  premios: { 1: "0001" },
};

describe("parsePremioRange / getPremioDivisor", () => {
  it("retorna range correto", () => {
    expect(parsePremioRange("1/1")).toEqual([1]);
    expect(parsePremioRange("1/5")).toEqual([1, 2, 3, 4, 5]);
    expect(parsePremioRange("5/10")).toEqual([5, 6, 7, 8, 9, 10]);
  });
  it("divisor segue o denominador", () => {
    expect(getPremioDivisor("1/1")).toBe(1);
    expect(getPremioDivisor("1/5")).toBe(5);
    expect(getPremioDivisor("1/10")).toBe(10);
    expect(getPremioDivisor(undefined)).toBe(1);
  });
});

describe("itemBateu - modalidades clássicas", () => {
  it("grupo (1º prêmio)", () => {
    // grupos do 1º: 06,12,25,01,13 -> 06 está
    const item: ItemBilhete = { modalidade: "grupo", numeros: "06", valor: 10, premio: "1/1" };
    expect(itemBateu(item, resultadoExemplo)).toBe(true);
  });
  it("grupo fora", () => {
    const item: ItemBilhete = { modalidade: "grupo", numeros: "07", valor: 10, premio: "1/1" };
    expect(itemBateu(item, resultadoExemplo)).toBe(false);
  });
  it("milhar 1/5 — bate em algum prêmio do range", () => {
    // grupoParaDezenas(n) = [(n-1)*4 .. +3]; primeira dezena de cada:
    //   06→20, 12→44, 25→96, 01→00, 13→48 → concat="2044960048" → milhar4="0048"
    const item: ItemBilhete = { modalidade: "milhar", numeros: "0048", valor: 5, premio: "1/5" };
    expect(itemBateu(item, resultadoExemplo)).toBe(true);
  });

  it("resultado milhar 0001 premia grupo 01", () => {
    const item: ItemBilhete = { modalidade: "grupo", numeros: "01", valor: 5, premio: "1/1" };
    expect(itemBateu(item, resultadoMilhar0001)).toBe(true);
  });

  it("resultado milhar 0001 premia dezena, centena e milhar correspondentes", () => {
    expect(itemBateu({ modalidade: "dezena", numeros: "01", valor: 5, premio: "1/1" }, resultadoMilhar0001)).toBe(true);
    expect(itemBateu({ modalidade: "centena", numeros: "001", valor: 5, premio: "1/1" }, resultadoMilhar0001)).toBe(true);
    expect(itemBateu({ modalidade: "milhar", numeros: "0001", valor: 5, premio: "1/1" }, resultadoMilhar0001)).toBe(true);
  });
});

describe("conferirBilhete - valor com divisor de prêmio", () => {
  it("Milhar 1/5 com R$ 5: prêmio = 5 × 6000 / 5 = 6000", () => {
    const bilhete: Bilhete = {
      id: "b1",
      codigo: "0001",
      cambistaId: "c1",
      extracaoId: "1",
      extracaoNome: "Federal",
      itens: [{ modalidade: "milhar", numeros: "0048", valor: 5, premio: "1/5" }],
      total: 5,
      data: "13/05/26 12:00",
      situacao: "pendente",
    };
    const r = conferirBilhete(bilhete, resultadoExemplo, cambista, getCotacao);
    expect(r.vencedor).toBe(true);
    expect(Math.round(r.valorGanho)).toBe(6000);
  });

  it("Múltiplos números na mesma linha: valor por palpite", () => {
    // 5 números, total 10 → 2 por palpite. Se acertar 1 → 2 × 6000 / 1 = 12000
    const bilhete: Bilhete = {
      id: "b2",
      codigo: "0002",
      cambistaId: "c1",
      extracaoId: "1",
      extracaoNome: "Federal",
      itens: [{ modalidade: "milhar", numeros: "0048 1234 5555 6666 7777", valor: 10, premio: "1/1" }],
      total: 10,
      data: "13/05/26 12:00",
      situacao: "pendente",
    };
    const r = conferirBilhete(bilhete, resultadoExemplo, cambista, getCotacao);
    expect(r.vencedor).toBe(true);
    expect(Math.round(r.valorGanho)).toBe(12000);
  });

  it("Palpite duplicado em GRUPO paga proporcionalmente (regressão: cachorro 2×)", () => {
    // Cliente apostou no grupo 06 DUAS vezes (R$1 cada) num bilhete de 5 palpites.
    // Antes o sistema pagava só 1× a cotação ao invés de 2×.
    // Resultado: grupos 06,12,25,01,13 — 06 está sorteado, demais palpites
    // (07,08,09) não estão.
    const bilhete: Bilhete = {
      id: "b-dup-grupo",
      codigo: "0010",
      cambistaId: "c1",
      extracaoId: "1",
      extracaoNome: "Federal",
      itens: [
        {
          modalidade: "grupo",
          numeros: "06 07 06 08 09",
          valor: 5,
          premio: "1/1",
        },
      ],
      total: 5,
      data: "13/05/26 12:00",
      situacao: "pendente",
    };
    const r = conferirBilhete(bilhete, resultadoExemplo, cambista, getCotacao);
    // 5 palpites, valorPorPalpite = R$1. 06 aparece 2 vezes (hits=2).
    // Esperado: 2 × 1 × 20 / 1 = R$ 40.
    expect(r.vencedor).toBe(true);
    expect(r.valorGanho).toBe(40);
    expect(contarHitsItem(bilhete.itens[0]!, resultadoExemplo)).toBe(2);
  });

  it("Palpite duplicado em DEZENA paga proporcionalmente", () => {
    // Resultado: grupos 06,12,25,01,13 → primeira dezena de cada:
    // grupo 06 → dezena 21..24 (linha 5 com 4 dezenas), 12 → 45..48,
    // 25 → 97..00, 01 → 01..04, 13 → 49..52.
    // Apostando em "21" duas vezes deve casar 2 hits.
    const bilhete: Bilhete = {
      id: "b-dup-dez",
      codigo: "0011",
      cambistaId: "c1",
      extracaoId: "1",
      extracaoNome: "Federal",
      itens: [
        {
          modalidade: "dezena",
          numeros: "21 33 21 77 88",
          valor: 5,
          premio: "1/1",
        },
      ],
      total: 5,
      data: "13/05/26 12:00",
      situacao: "pendente",
    };
    const r = conferirBilhete(bilhete, resultadoExemplo, cambista, getCotacao);
    // 5 palpites, valorPorPalpite = R$1. 21 aparece 2× e está no grupo 06 → hits=2.
    // Esperado: 2 × 1 × 80 / 1 = R$ 160.
    expect(r.vencedor).toBe(true);
    expect(r.valorGanho).toBe(160);
    expect(contarHitsItem(bilhete.itens[0]!, resultadoExemplo)).toBe(2);
  });

  it("Palpite duplicado em MC: milhar e centena contam separado", () => {
    // resultadoMilhar0001 → milhar=0001, centena=001.
    // Aposta "0001" duas vezes: 2 hits de milhar + 2 hits de centena.
    const bilhete: Bilhete = {
      id: "b-dup-mc",
      codigo: "0012",
      cambistaId: "c1",
      extracaoId: "1",
      extracaoNome: "LOOK GOIAS 23:20",
      itens: [
        {
          modalidade: "milhar_e_centena",
          numeros: "0001 5555 0001",
          valor: 6,
          premio: "1/1",
        },
      ],
      total: 6,
      data: "13/05/26 12:00",
      situacao: "pendente",
    };
    const r = conferirBilhete(bilhete, resultadoMilhar0001, cambista, getCotacao);
    // 3 palpites, valorPorPalpite = 2. Metade pra milhar/centena = 1.
    // 2 hits de milhar: 2 × 1 × 6000 = 12000
    // 2 hits de centena: 2 × 1 × 800 = 1600
    // Total = 13600.
    expect(r.vencedor).toBe(true);
    expect(r.valorGanho).toBe(13600);
    const hits = contarHitsMC(bilhete.itens[0]!, resultadoMilhar0001);
    expect(hits.milhar).toBe(2);
    expect(hits.centena).toBe(2);
  });

  it("itemBateu (boolean) ainda funciona — retrocompatível", () => {
    expect(
      itemBateu(
        { modalidade: "grupo", numeros: "06 06", valor: 2, premio: "1/1" },
        resultadoExemplo,
      ),
    ).toBe(true);
  });

  it("Milhar brinde paga prêmio fixo apenas no 1/1", () => {
    const bilhete: Bilhete = {
      id: "b3",
      codigo: "0003",
      cambistaId: "c1",
      extracaoId: "1",
      extracaoNome: "LOOK GOIAS 23:20",
      itens: [{ modalidade: "grupo", numeros: "02", valor: 10, premio: "1/10", milharBrinde: "0001" }],
      total: 10,
      data: "13/05/26 12:00",
      situacao: "pendente",
    };
    const r = conferirBilhete(bilhete, resultadoMilhar0001, cambista, getCotacao, 100);
    expect(r.vencedor).toBe(true);
    expect(r.valorGanho).toBe(100);
    expect(r.itens[0]?.brindeBateu).toBe(true);
    expect(r.itens[0]?.brindeValorGanho).toBe(100);
  });
});
