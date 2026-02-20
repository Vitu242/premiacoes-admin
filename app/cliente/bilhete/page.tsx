"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  getBilhetes,
  getCambistas,
  getExtracoes,
  getTempoCancelamentoMinutos,
  podeCancelarBilhete,
  cancelarBilhete,
  calcularComissaoBilhete,
} from "@/lib/store";
import type { Bilhete, Extracao } from "@/lib/types";

const MODALIDADES: Record<string, string> = {
  grupo: "GRUPO",
  dezena: "DEZENA",
  centena: "CENTENA",
  milhar: "MILHAR",
};

function formatarMoeda(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatarData(s: string) {
  return s.replace(",", " ").slice(0, 17);
}

export default function ClienteBilhetePage() {
  const router = useRouter();
  const [cambistaId, setCambistaId] = useState<string | null>(null);
  const [codigoBanca, setCodigoBanca] = useState("");
  const [filtroSituacao, setFiltroSituacao] = useState("todos");
  const [filtroData, setFiltroData] = useState("");
  const [filtroCodigo, setFiltroCodigo] = useState("");
  const [bilhetes, setBilhetes] = useState<Bilhete[]>([]);
  const [detalhe, setDetalhe] = useState<Bilhete | null>(null);

  const cambistas = getCambistas();
  const extracoes = getExtracoes();
  const tempoCancel = getTempoCancelamentoMinutos();

  useEffect(() => {
    const auth = localStorage.getItem("premiacoes_cliente");
    if (!auth) {
      router.replace("/cliente/login");
      return;
    }
    const { cambistaId: cid, codigo: c } = JSON.parse(auth);
    setCambistaId(cid);
    setCodigoBanca(c || "");
  }, [router]);

  useEffect(() => {
    if (!cambistaId) return;
    let lista = getBilhetes().filter((b) => b.cambistaId === cambistaId);
    if (filtroSituacao !== "todos") {
      lista = lista.filter((b) => b.situacao === filtroSituacao);
    }
    if (filtroData) {
      const [y, m, d] = filtroData.split("-");
      const busca = `${d}/${m}/${y.slice(2)}`;
      lista = lista.filter((b) => b.data.includes(busca));
    }
    if (filtroCodigo.trim()) {
      lista = lista.filter((b) => b.codigo.includes(filtroCodigo.trim()));
    }
    setBilhetes(lista.sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime()));
  }, [cambistaId, filtroSituacao, filtroData, filtroCodigo]);

  const cambista = cambistaId ? cambistas.find((c) => c.id === cambistaId) : null;
  const bancaNome = codigoBanca ? codigoBanca.charAt(0).toUpperCase() + codigoBanca.slice(1) + " Premiações" : "Premiações";

  const handleCancelar = (b: Bilhete) => {
    const ext = extracoes.find((e) => e.id === b.extracaoId);
    if (!ext || !podeCancelarBilhete(b, ext, tempoCancel)) {
      alert("Não é mais possível cancelar este bilhete.");
      return;
    }
    if (!confirm("Cancelar este bilhete?")) return;
    if (cancelarBilhete(b.id)) {
      setBilhetes((prev) => prev.map((x) => (x.id === b.id ? { ...x, situacao: "cancelado" as const } : x)));
      setDetalhe((prev) => (prev?.id === b.id ? { ...prev, situacao: "cancelado" as const } : prev));
    }
  };

  const getExtracao = (b: Bilhete): Extracao | undefined => extracoes.find((e) => e.id === b.extracaoId);
  const podeCancelar = (b: Bilhete) => {
    const ext = getExtracao(b);
    return ext ? podeCancelarBilhete(b, ext, tempoCancel) : false;
  };
  const getComissao = (b: Bilhete) => (cambista ? calcularComissaoBilhete(b, cambista) : 0);

  if (!cambista) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white">
        <p className="text-gray-500">Carregando...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f5f0e8] pb-24">
      {/* Header */}
      <header className="flex items-center justify-between border-b border-gray-200 bg-white px-4 py-4">
        <Link href="/cliente" className="rounded p-2 text-gray-600 hover:bg-gray-100">
          <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </Link>
        <h1 className="text-lg font-bold text-gray-800">{bancaNome}</h1>
        <div className="w-10" />
      </header>

      {/* Filtros */}
      <div className="border-b border-gray-200 bg-white px-4 py-3">
        <div className="flex flex-wrap gap-2">
          <select
            value={filtroSituacao}
            onChange={(e) => setFiltroSituacao(e.target.value)}
            className="rounded border border-gray-300 px-3 py-2 text-sm"
          >
            <option value="todos">Todos</option>
            <option value="pendente">Pendente</option>
            <option value="pago">Pago</option>
            <option value="perdedor">Perdedor</option>
            <option value="cancelado">Cancelado</option>
          </select>
          <input
            type="date"
            value={filtroData}
            onChange={(e) => setFiltroData(e.target.value)}
            className="rounded border border-gray-300 px-3 py-2 text-sm"
          />
          <input
            type="text"
            placeholder="Código"
            value={filtroCodigo}
            onChange={(e) => setFiltroCodigo(e.target.value)}
            className="flex-1 min-w-[100px] rounded border border-gray-300 px-3 py-2 text-sm"
          />
          <button
            onClick={() => {}}
            className="rounded bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700"
          >
            Buscar
          </button>
        </div>
      </div>

      {/* Lista de bilhetes */}
      <div className="space-y-3 p-4">
        {bilhetes.length === 0 ? (
          <p className="text-center text-gray-500 py-8">Nenhum bilhete encontrado.</p>
        ) : (
          bilhetes.map((b) => (
            <div
              key={b.id}
              className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <p className="text-xs text-gray-500">PULE</p>
                  <p className="text-lg font-bold text-gray-800">{b.codigo}</p>
                  <p className="mt-1 text-sm text-gray-600">
                    Data: {formatarData(b.data)}
                  </p>
                  <p className="text-sm text-gray-600">
                    Valor: {formatarMoeda(b.total)} | Comissão: {formatarMoeda(getComissao(b))}
                  </p>
                </div>
                <span
                  className={`rounded-full px-2 py-1 text-xs font-medium ${
                    b.situacao === "pendente"
                      ? "bg-gray-200 text-gray-700"
                      : b.situacao === "pago"
                      ? "bg-green-100 text-green-700"
                      : b.situacao === "cancelado"
                      ? "bg-red-100 text-red-700"
                      : "bg-gray-100 text-gray-600"
                  }`}
                >
                  {b.situacao}
                </span>
              </div>
              {b.situacao === "pendente" && podeCancelar(b) && (
                <button
                  onClick={() => handleCancelar(b)}
                  className="mt-3 w-full rounded bg-red-600 py-2 text-sm font-medium text-white hover:bg-red-700"
                >
                  CANCELAR
                </button>
              )}
              <button
                onClick={() => setDetalhe(detalhe?.id === b.id ? null : b)}
                className="mt-2 w-full rounded border border-gray-300 py-2 text-sm text-gray-700 hover:bg-gray-50"
              >
                {detalhe?.id === b.id ? "Ocultar detalhes" : "Ver detalhes"}
              </button>

              {/* Detalhe expandido */}
              {detalhe?.id === b.id && (
                <div className="mt-4 border-t border-gray-100 pt-4 text-sm">
                  <p className="text-gray-500">Emitido: {formatarData(b.data)}</p>
                  <p className="text-gray-500">Ponto: {cambista?.login}</p>
                  <p className="mt-2 font-medium text-gray-700">Tradicional</p>
                  <p className="text-gray-600">{b.extracaoNome}</p>
                  {b.itens.map((item, i) => (
                    <div key={i} className="mt-1">
                      <span className="font-medium">{MODALIDADES[item.modalidade] || item.modalidade}</span>{" "}
                      <span className="font-bold">{item.numeros}</span>
                      <span className="text-gray-600"> | 1/1 a {item.valor.toFixed(2).replace(".", ",")} = {item.valor.toFixed(2).replace(".", ",")}</span>
                      {item.milharBrinde && (
                        <p className="text-green-600">MILHAR BRINDE 1/1 {item.milharBrinde}</p>
                      )}
                    </div>
                  ))}
                  <p className="mt-3 font-bold text-gray-800">TOTAL: {formatarMoeda(b.total)}</p>
                  <p className="mt-2 text-xs text-blue-600">
                    Confira seu bilhete, a banca não se responsabiliza por qualquer erro do cambista.
                  </p>
                  <p className="mt-1 text-xs text-gray-500">
                    {bancaNome} agradece a sua preferência, boa sorte e ótimos resultados!
                  </p>
                  <div className="mt-4 flex gap-2">
                    <Link
                      href="/cliente"
                      className="flex-1 rounded bg-blue-100 py-2 text-center text-sm font-medium text-blue-700"
                    >
                      Início
                    </Link>
                    <button
                      onClick={() => {
                        if (navigator.share) {
                          navigator.share({
                            title: `Bilhete ${b.codigo}`,
                            text: `Bilhete ${b.codigo} - ${b.extracaoNome} - Total ${formatarMoeda(b.total)}`,
                          });
                        } else {
                          navigator.clipboard.writeText(`Bilhete ${b.codigo} - ${b.extracaoNome} - ${formatarMoeda(b.total)}`);
                          alert("Código copiado!");
                        }
                      }}
                      className="flex-1 rounded bg-blue-600 py-2 text-sm font-medium text-white"
                    >
                      Enviar
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
