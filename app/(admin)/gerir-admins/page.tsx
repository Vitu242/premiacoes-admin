"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { getAdminCodigo, CODIGO_CHEFE, criarNovoAdmin, listarCodigosRegistrados } from "@/lib/auth";

export default function GerirAdminsPage() {
  const router = useRouter();
  const codigo = getAdminCodigo();
  const [lista, setLista] = useState<{ codigo: string; admin: string }[]>([]);
  const [novoCodigo, setNovoCodigo] = useState("");
  const [novoAdmin, setNovoAdmin] = useState("");
  const [novaSenha, setNovaSenha] = useState("");
  const [mensagem, setMensagem] = useState<{ tipo: "sucesso" | "erro"; texto: string } | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (codigo !== CODIGO_CHEFE) {
      router.replace("/");
      return;
    }
    setLista(listarCodigosRegistrados());
  }, [codigo, router]);

  const handleCriar = (e: React.FormEvent) => {
    e.preventDefault();
    setMensagem(null);
    const cod = novoCodigo.trim();
    const adm = novoAdmin.trim();
    const resultado = criarNovoAdmin(cod, adm, novaSenha);
    if (resultado.ok) {
      setLista(listarCodigosRegistrados());
      setNovoCodigo("");
      setNovoAdmin("");
      setNovaSenha("");
      setMensagem({ tipo: "sucesso", texto: `Admin "${adm}" com código "${cod}" criado. Repasse o código, login e senha ao novo administrador.` });
    } else {
      setMensagem({ tipo: "erro", texto: resultado.erro ?? "Erro ao criar." });
    }
  };

  if (codigo !== CODIGO_CHEFE) {
    return null;
  }

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-gray-800">Gerir admins e códigos</h1>
      <p className="mb-6 text-sm text-gray-600">
        Apenas o código <strong>Lotobrasil</strong> (chefe) pode criar novos códigos e admins. Repasse código, login e senha aos novos administradores para que entrem no painel.
      </p>

      <div className="mb-8 rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold text-gray-800">Criar novo admin / código</h2>
        <form onSubmit={handleCriar} className="max-w-md space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-600">Código da banca</label>
            <input
              type="text"
              value={novoCodigo}
              onChange={(e) => setNovoCodigo(e.target.value)}
              placeholder="Ex: Jaguar"
              className="w-full rounded border border-gray-300 px-4 py-2 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
              required
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-600">Login do admin</label>
            <input
              type="text"
              value={novoAdmin}
              onChange={(e) => setNovoAdmin(e.target.value)}
              placeholder="Nome de usuário"
              className="w-full rounded border border-gray-300 px-4 py-2 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
              required
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-600">Senha (mín. 4 caracteres)</label>
            <input
              type="password"
              value={novaSenha}
              onChange={(e) => setNovaSenha(e.target.value)}
              placeholder="Senha inicial"
              minLength={4}
              className="w-full rounded border border-gray-300 px-4 py-2 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
              required
            />
          </div>
          {mensagem && (
            <p
              className={`rounded p-2 text-sm ${
                mensagem.tipo === "sucesso" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-600"
              }`}
            >
              {mensagem.texto}
            </p>
          )}
          <button
            type="submit"
            className="rounded bg-orange-500 px-4 py-2 font-medium text-white hover:bg-orange-600"
          >
            Criar admin
          </button>
        </form>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold text-gray-800">Códigos registrados</h2>
        <p className="mb-4 text-sm text-gray-500">
          Estes códigos já possuem login/senha. O administrador entra no painel com o código, login e senha definidos.
        </p>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-600">Código</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-600">Login</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {lista.map(({ codigo: c, admin }) => (
                <tr key={c} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">{c}</td>
                  <td className="px-4 py-3 text-gray-600">{admin}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
