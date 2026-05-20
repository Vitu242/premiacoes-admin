"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { loginAdminServer } from "@/lib/auth";
import { normalizeLogin } from "@/lib/login-normalize";

export default function LoginPage() {
  const router = useRouter();
  const [codigo, setCodigo] = useState("");
  const [admin, setAdmin] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErro("");
    if (!codigo || !admin || !senha) return;
    const adminNormalizado = normalizeLogin(admin);
    setLoading(true);
    try {
      // Autenticação 100% server-side (bcrypt + rate-limit). NÃO existe
      // mais fallback "primeiro acesso" via localStorage — qualquer
      // tentativa com senha que não exista no Supabase é rejeitada.
      const r = await loginAdminServer(codigo, adminNormalizado, senha);
      if (!r.ok) {
        setErro(r.erro ?? "Código, login ou senha incorretos.");
        return;
      }
      // Limpa qualquer credencial residual do localStorage antigo para
      // evitar que código legado aceite logins fantasmas.
      try { localStorage.removeItem("premiacoes_admin_credenciais"); } catch {}
      // Guarda a senha no localStorage para autenticar chamadas server-side
      // (X-Sync-Auth). Mesmo nível de exposição da senha: se o atacante tem
      // acesso ao localStorage, já tem acesso ao app inteiro.
      localStorage.setItem(
        "premiacoes_admin",
        JSON.stringify({ codigo, admin: adminNormalizado, senha }),
      );
      router.push("/");
      router.refresh();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-gray-50 dark:bg-slate-900 md:flex-row">
      <aside className="flex shrink-0 flex-col bg-gray-800 px-6 py-4 text-white md:w-56 md:py-6">
        <h2 className="text-lg font-semibold">Painel Administrativo</h2>
        <p className="mt-2 text-sm text-gray-400">
          Acesso restrito aos administradores
        </p>
      </aside>

      <main className="flex flex-1 items-center justify-center p-4 md:p-6">
        <form
          onSubmit={handleSubmit}
          className="w-full max-w-sm rounded-lg border border-gray-200 bg-white p-8 shadow-sm dark:border-slate-700 dark:bg-slate-800"
        >
          <h1 className="mb-2 text-xl font-bold text-gray-800 dark:text-slate-100">
            Entrar no painel
          </h1>
          <p className="mb-6 text-sm text-gray-500 dark:text-slate-400">
            Digite suas credenciais de administrador
          </p>

          {erro && (
            <p className="mb-4 rounded bg-red-50 p-2 text-sm text-red-600 dark:bg-red-900/40 dark:text-red-200">
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
              autoComplete="organization"
              required
            />
            <input
              type="text"
              placeholder="Admin"
              value={admin}
              onChange={(e) => setAdmin(e.target.value)}
              className="w-full rounded border border-gray-300 px-4 py-3 outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500"
              autoComplete="username"
              required
            />
            <input
              type="password"
              placeholder="Senha"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              className="w-full rounded border border-gray-300 px-4 py-3 outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500"
              autoComplete="current-password"
              required
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="btn-brand mt-6 w-full rounded px-4 py-3 font-semibold transition-colors disabled:opacity-60"
          >
            {loading ? "Entrando..." : "ENTRAR"}
          </button>

          <p className="mt-4 text-center text-sm text-gray-500 dark:text-slate-400">
            <a href="/cliente/login" className="text-orange-600 hover:underline">
              Área do cliente
            </a>
          </p>
        </form>
      </main>
    </div>
  );
}
