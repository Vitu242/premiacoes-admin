"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { getCambistas } from "@/lib/store";

export default function ClienteLoginPage() {
  const router = useRouter();
  const [codigo, setCodigo] = useState("");
  const [login, setLogin] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErro("");

    if (!codigo || !login || !senha) {
      setErro("Preencha todos os campos.");
      return;
    }

    const cambistas = getCambistas();
    const cambista = cambistas.find(
      (c) => c.login.toLowerCase() === login.toLowerCase() && c.senha === senha
    );

    if (cambista && cambista.status === "ativo") {
      localStorage.setItem(
        "premiacoes_cliente",
        JSON.stringify({
          codigo,
          cambistaId: cambista.id,
          login: cambista.login,
        })
      );
      router.push("/cliente");
      router.refresh();
    } else {
      setErro("Código, login ou senha incorretos. Verifique e tente novamente.");
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-gray-50 md:flex-row">
      <aside className="flex shrink-0 flex-col bg-gray-800 px-6 py-4 text-white md:w-56 md:py-6">
        <h2 className="text-lg font-semibold">Área do Cliente</h2>
        <p className="mt-2 text-sm text-gray-400">
          Acesso para cambistas
        </p>
      </aside>

      <main className="flex flex-1 items-center justify-center p-4 md:p-6">
        <form
          onSubmit={handleSubmit}
          className="w-full max-w-sm rounded-lg border border-gray-200 bg-white p-8 shadow-sm"
        >
          <h1 className="mb-2 text-xl font-bold text-gray-800">
            Entrar
          </h1>
          <p className="mb-6 text-sm text-gray-500">
            Digite o código da banca, seu login e senha
          </p>

          {erro && (
            <p className="mb-4 rounded bg-red-50 p-2 text-sm text-red-600">
              {erro}
            </p>
          )}

          <div className="space-y-4">
            <input
              type="text"
              placeholder="Código"
              value={codigo}
              onChange={(e) => setCodigo(e.target.value)}
              className="w-full rounded border border-gray-300 px-4 py-3 outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500"
              required
            />

            <input
              type="text"
              placeholder="Login"
              value={login}
              onChange={(e) => setLogin(e.target.value)}
              className="w-full rounded border border-gray-300 px-4 py-3 outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500"
              required
            />

            <input
              type="password"
              placeholder="Senha"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              className="w-full rounded border border-gray-300 px-4 py-3 outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500"
              required
            />
          </div>

          <button
            type="submit"
            className="mt-6 w-full rounded bg-orange-500 px-4 py-3 font-semibold text-white transition-colors hover:bg-orange-600"
          >
            ENTRAR
          </button>

          <p className="mt-4 text-center text-sm text-gray-500">
            <a href="/login" className="text-orange-600 hover:underline">
              Sou administrador
            </a>
          </p>
        </form>
      </main>
    </div>
  );
}
