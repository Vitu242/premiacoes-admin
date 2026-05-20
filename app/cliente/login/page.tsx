"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  getCambistasPorCodigo,
  updateCambistaUltimoAcesso,
} from "@/lib/store";
import { loginClienteServer } from "@/lib/auth";
import { normalizeLogin, normalizeLoginKey } from "@/lib/login-normalize";
import InstallAppButton from "@/app/components/InstallAppButton";

export default function ClienteLoginPage() {
  const router = useRouter();
  const [codigo, setCodigo] = useState("");
  const [login, setLogin] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    try {
      const auth = localStorage.getItem("premiacoes_cliente");
      if (auth) router.replace("/cliente");
    } catch {
      /* ignore */
    }
  }, [router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErro("");

    if (!codigo || !login || !senha) {
      setErro("Preencha todos os campos.");
      return;
    }

    setLoading(true);
    try {
      const loginNormalizado = normalizeLogin(login);
      const r = await loginClienteServer(codigo.trim(), loginNormalizado, senha);

      if (r.ok && r.cambistaId) {
        try { updateCambistaUltimoAcesso(r.cambistaId); } catch {}
        localStorage.setItem(
          "premiacoes_cliente",
          JSON.stringify({ codigo, cambistaId: r.cambistaId, login: loginNormalizado, senha })
        );
        // replace remove a tela de login do histórico — apertar "voltar"
        // dentro do app não traz mais o cambista de volta para o login.
        router.replace("/cliente");
        router.refresh();
        return;
      }

      // Fallback offline: usar dados em cache (localStorage)
      const cambistas = getCambistasPorCodigo(codigo.trim());
      const loginKey = normalizeLoginKey(login);
      const cam = cambistas.find(
        (c) => normalizeLoginKey(c.login) === loginKey && c.senha === senha
      );
      if (cam && cam.status === "ativo") {
        updateCambistaUltimoAcesso(cam.id);
        localStorage.setItem(
          "premiacoes_cliente",
          JSON.stringify({ codigo, cambistaId: cam.id, login: cam.login, senha })
        );
        router.replace("/cliente");
        router.refresh();
        return;
      }

      setErro(r.erro ?? "Código, login ou senha incorretos.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-gray-50 dark:bg-slate-900 md:flex-row">
      <aside className="flex shrink-0 flex-col bg-gray-800 px-6 py-4 text-white md:w-56 md:py-6">
        <h2 className="text-lg font-semibold">Área do Cliente</h2>
        <p className="mt-2 text-sm text-gray-400">Acesso para cambistas</p>
      </aside>

      <main className="flex flex-1 items-center justify-center p-4 md:p-6">
        <form
          onSubmit={handleSubmit}
          className="w-full max-w-sm rounded-lg border border-gray-200 bg-white p-8 shadow-sm dark:border-slate-700 dark:bg-slate-800"
        >
          <h1 className="mb-2 text-xl font-bold text-gray-800 dark:text-slate-100">Entrar</h1>
          <p className="mb-6 text-sm text-gray-500 dark:text-slate-400">
            Digite o código da banca, seu login e senha
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
              placeholder="Login"
              value={login}
              onChange={(e) => setLogin(e.target.value)}
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
            <a href="/login" className="text-orange-600 hover:underline">
              Sou administrador
            </a>
          </p>

          <div className="mt-6 border-t border-gray-200 pt-4 dark:border-slate-700">
            <p className="mb-2 text-center text-xs text-gray-500 dark:text-slate-400">
              Para acessar mais rápido, instale o app no celular:
            </p>
            <InstallAppButton variant="primary" className="w-full" label="Baixar app no celular" />
          </div>
        </form>
      </main>
    </div>
  );
}
