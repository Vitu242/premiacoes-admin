"use client";

import { useState, useEffect } from "react";
import {
  getBilhetes,
  getCambistas,
  getGerentes,
  getExtracoes,
  calcularComissaoBilhete,
} from "@/lib/store";

function formatarMoeda(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

const MODALIDADES: Record<string, string> = {
  grupo: "Grupo",
  dezena: "Dezena",
  centena: "Centena",
  milhar: "Milhar",
};

export default function BilhetesAdminPage() {
  const [bilhetes, setBilhetes] = useState(getBilhetes());
  const [filtroGerente, setFiltroGerente] = useState("todos");
  const [filtroCambista, setFiltroCambista] = useState("todos");
  const [filtroSituacao, setFiltroSituacao] = useState("todos");
  const [filtroExtracao, setFiltroExtracao] = useState("todos");
  const [filtroData, setFiltroData] = useState("");
  const [filtroCodigo, setFiltroCodigo] = useState("");

  const cambistas = getCambistas();
  const gerentes = getGerentes();
  const extracoes = getExtracoes();

  useEffect(() => {
    setBilhetes(getBilhetes());
  }, []);

  const filtrar = bilhetes.filter((b) => {
    const cam = cambistas.find((c) => c.id === b.cambistaId);
    if (!cam) return false;
    if (filtroGerente !== "todos" && cam.gerenteId !== filtroGerente) return false;
    if (filtroCambista !== "todos" && b.cambistaId !== filtroCambista) return false;
    if (filtroSituacao !== "todos" && b.situacao !== filtroSituacao) return false;
    if (filtroExtracao !== "todos" && b.extracaoId !== filtroExtracao) return false;
    if (filtroData) {
      const [y, m, d] = filtroData.split("-");
      const busca = `${d}/${m}/${y.slice(2)}`;
      if (!b.data.includes(busca)) return false;
    }
    if (filtroCodigo.trim() && !b.codigo.includes(filtroCodigo.trim())) return false;
    return true;
  });

  const getCambistaNome = (id: string) => cambistas.find((c) => c.id === id)?.login ?? "-";

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-gray-800">Bilhetes</h1>

      <div className="mb-4 flex flex-wrap gap-3">
        <select
          value={filtroGerente}
          onChange={(e) => setFiltroGerente(e.target.value)}
          className="rounded border border-gray-300 px-3 py-2 text-sm"
        >
          <option value="todos">Todos gerentes</option>
          {gerentes.map((g) => (
            <option key={g.id} value={g.id}>{g.login}</option>
          ))}
        </select>
        <select
          value={filtroCambista}
          onChange={(e) => setFiltroCambista(e.target.value)}
          className="rounded border border-gray-300 px-3 py-2 text-sm"
        >
          <option value="todos">Todos cambistas</option>
          {cambistas.map((c) => (
            <option key={c.id} value={c.id}>{c.login}</option>
          ))}
        </select>
        <select
          value={filtroSituacao}
          onChange={(e) => setFiltroSituacao(e.target.value)}
          className="rounded border border-gray-300 px-3 py-2 text-sm"
        >
          <option value="todos">Todas situações</option>
          <option value="pendente">Pendente</option>
          <option value="pago">Pago</option>
          <option value="perdedor">Perdedor</option>
          <option value="cancelado">Cancelado</option>
        </select>
        <select
          value={filtroExtracao}
          onChange={(e) => setFiltroExtracao(e.target.value)}
          className="rounded border border-gray-300 px-3 py-2 text-sm"
        >
          <option value="todos">Todas extrações</option>
          {extracoes.map((e) => (
            <option key={e.id} value={e.id}>{e.nome}</option>
          ))}
        </select>
        <input
          type="date"
          value={filtroData}
          onChange={(e) => setFiltroData(e.target.value)}
          className="rounded border border-gray-300 px-3 py-2 text-sm"
        />
        <input
          type="text"
          placeholder="Nº Bilhete"
          value={filtroCodigo}
          onChange={(e) => setFiltroCodigo(e.target.value)}
          className="rounded border border-gray-300 px-3 py-2 text-sm"
        />
      </div>

      <p className="mb-4 text-sm text-gray-600">{filtrar.length} bilhete(s) encontrado(s)</p>

      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white shadow">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-600">Código</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-600">Cambista</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-600">Extração</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-600">Data</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-600">Jogo</th>
              <th className="px-4 py-3 text-right text-xs font-medium uppercase text-gray-600">Total</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-600">Situação</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {filtrar.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                  Nenhum bilhete encontrado.
                </td>
              </tr>
            ) : (
              [...filtrar].reverse().map((b) => {
                const cam = cambistas.find((c) => c.id === b.cambistaId);
                const comissao = cam ? calcularComissaoBilhete(b, cam) : 0;
                const jogo = b.itens.map((i) => `${MODALIDADES[i.modalidade] || i.modalidade} ${i.numeros}${i.milharBrinde ? ` + Brinde ${i.milharBrinde}` : ""}`).join(" | ");
                return (
                  <tr key={b.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-mono text-sm font-medium text-gray-800">{b.codigo}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{getCambistaNome(b.cambistaId)}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{b.extracaoNome}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{b.data.replace(",", " ")}</td>
                    <td className="max-w-[200px] truncate px-4 py-3 text-xs text-gray-600" title={jogo}>{jogo}</td>
                    <td className="px-4 py-3 text-right text-sm font-medium text-gray-800">{formatarMoeda(b.total)}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2 py-1 text-xs font-medium ${
                          b.situacao === "pendente" ? "bg-yellow-100 text-yellow-700" :
                          b.situacao === "pago" ? "bg-green-100 text-green-700" :
                          b.situacao === "cancelado" ? "bg-red-100 text-red-700" :
                          "bg-gray-100 text-gray-700"
                        }`}
                      >
                        {b.situacao}
                      </span>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
