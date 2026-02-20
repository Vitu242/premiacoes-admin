"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { validarLogin, salvarPrimeiroLogin } from "@/lib/auth";

export default function LoginPage() {
  const router = useRouter();
  const [codigo, setCodigo] = useState("");
  const [admin, setAdmin] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErro("");
    if (codigo && admin && senha) {
      if (validarLogin(codigo, admin, senha)) {
        const creds = localStorage.getItem("premiacoes_admin_credenciais");
        const parsed = creds ? JSON.parse(creds) : {};
        if (!parsed[codigo]) {
          salvarPrimeiroLogin(codigo, admin, senha);
        }
        localStorage.setItem("premiacoes_admin", JSON.stringify({ codigo, admin }));
        router.push("/");
        router.refresh();
      } else {
        setErro("Login ou senha incorretos.");
      }
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-gray-50 md:flex-row">
      <aside className="flex shrink-0 flex-col bg-gray-800 px-6 py-4 text-white md:w-56 md:py-6">
        <h2 className="text-lg font-semibold">Painel Administrativo</h2>
        <p className="mt-2 text-sm text-gray-400">
          Acesso restrito aos administradores
        </p>
      </aside>

      <main className="flex flex-1 items-center justify-center p-4 md:p-6">
        <form
          onSubmit={handleSubmit}
          className="w-full max-w-sm rounded-lg border border-gray-200 bg-white p-8 shadow-sm"
        >
          <h1 className="mb-2 text-xl font-bold text-gray-800">
            Entrar no painel
          </h1>
          <p className="mb-6 text-sm text-gray-500">
            Digite suas credenciais de administrador
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
              placeholder="Admin"
              value={admin}
              onChange={(e) => setAdmin(e.target.value)}
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
            <a href="/cliente/login" className="text-orange-600 hover:underline">
              Área do cliente
            </a>
          </p>
        </form>
      </main>
    </div>
  );
}
