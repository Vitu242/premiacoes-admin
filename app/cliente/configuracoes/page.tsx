"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getCambistas, updateCambista } from "@/lib/store";
import { normalizeLogin } from "@/lib/login-normalize";

const VERSAO = "1.1.0";

interface SessaoCliente {
  cambistaId: string;
  codigo: string;
  login?: string;
}

export default function ClienteConfiguracoesPage() {
  const router = useRouter();
  const [cambista, setCambista] = useState<{
    id: string;
    login: string;
    senhaAtualSalva: string;
  } | null>(null);

  const [senhaAtual, setSenhaAtual] = useState("");
  const [novaSenha, setNovaSenha] = useState("");
  const [confirmar, setConfirmar] = useState("");
  const [verSenha, setVerSenha] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [loadFalhou, setLoadFalhou] = useState(false);
  const [mensagem, setMensagem] = useState<{
    tipo: "ok" | "erro";
    texto: string;
  } | null>(null);

  useEffect(() => {
    let sessao: SessaoCliente | null = null;
    try {
      const raw = localStorage.getItem("premiacoes_cliente");
      if (raw) sessao = JSON.parse(raw) as SessaoCliente;
    } catch {}
    if (!sessao?.cambistaId) {
      router.replace("/cliente/login");
      return;
    }
    const tentarCarregar = () => {
      const cam = getCambistas().find((c) => c.id === sessao!.cambistaId);
      if (cam) {
        setCambista({ id: cam.id, login: cam.login, senhaAtualSalva: cam.senha });
        return true;
      }
      return false;
    };
    if (tentarCarregar()) return;
    // Tenta de novo após 1s (pode estar em sync em transição). Se falhar
    // após 6s, mostra mensagem em vez de loading infinito.
    const t1 = setTimeout(() => tentarCarregar(), 1000);
    const t2 = setTimeout(() => {
      if (!tentarCarregar()) setLoadFalhou(true);
    }, 6000);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [router]);

  const handleAlterar = (e: React.FormEvent) => {
    e.preventDefault();
    setMensagem(null);

    if (!cambista) return;
    const atual = senhaAtual.trim();
    const nova = novaSenha.trim();
    const conf = confirmar.trim();

    if (!atual || !nova || !conf) {
      setMensagem({ tipo: "erro", texto: "Preencha todos os campos." });
      return;
    }
    if (atual !== cambista.senhaAtualSalva) {
      setMensagem({ tipo: "erro", texto: "Senha atual incorreta." });
      return;
    }
    if (nova.length < 4) {
      setMensagem({
        tipo: "erro",
        texto: "A nova senha precisa ter pelo menos 4 caracteres.",
      });
      return;
    }
    if (nova === atual) {
      setMensagem({
        tipo: "erro",
        texto: "A nova senha deve ser diferente da atual.",
      });
      return;
    }
    if (nova !== conf) {
      setMensagem({
        tipo: "erro",
        texto: "A confirmação não bate com a nova senha.",
      });
      return;
    }

    setSalvando(true);
    try {
      updateCambista(cambista.id, { senha: nova });
      setCambista({ ...cambista, senhaAtualSalva: nova });
      setSenhaAtual("");
      setNovaSenha("");
      setConfirmar("");
      setMensagem({ tipo: "ok", texto: "Senha alterada com sucesso!" });
    } catch (err) {
      setMensagem({
        tipo: "erro",
        texto: `Erro ao alterar senha: ${(err as Error).message}`,
      });
    } finally {
      setSalvando(false);
    }
  };

  if (!cambista) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white dark:bg-slate-950">
        <div className="max-w-sm text-center">
          {loadFalhou ? (
            <>
              <p className="mb-3 text-sm text-rose-600 dark:text-rose-400">
                Não foi possível carregar seus dados. Verifique sua conexão e tente novamente.
              </p>
              <button
                onClick={() => location.reload()}
                className="rounded bg-emerald-500 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-600"
              >
                Tentar de novo
              </button>
            </>
          ) : (
            <>
              <div className="mx-auto mb-3 h-10 w-10 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent"></div>
              <p className="text-sm text-gray-500 dark:text-slate-400">Carregando...</p>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 p-4 pb-28 dark:bg-slate-950">
      <button
        type="button"
        onClick={() => router.push("/cliente")}
        className="mb-4 inline-flex items-center text-emerald-600 hover:underline dark:text-emerald-400"
      >
        ← Voltar
      </button>

      <h1 className="text-2xl font-bold text-gray-800 dark:text-slate-100">
        Configurações
      </h1>

      <p className="mt-1 text-sm text-gray-500 dark:text-slate-400">
        Conectado como{" "}
        <span className="font-semibold text-gray-700 dark:text-slate-200">
          {normalizeLogin(cambista.login)}
        </span>
      </p>

      {/* Alterar senha */}
      <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800">
        <h2 className="text-lg font-semibold text-gray-800 dark:text-slate-100">
          Alterar senha
        </h2>
        <p className="mt-1 text-xs text-gray-500 dark:text-slate-400">
          Por segurança, troque sua senha periodicamente. A nova senha será
          usada na próxima vez que você fizer login.
        </p>

        <form onSubmit={handleAlterar} className="mt-4 space-y-3">
          <Campo
            label="Senha atual"
            value={senhaAtual}
            onChange={setSenhaAtual}
            type={verSenha ? "text" : "password"}
            autoComplete="current-password"
          />
          <Campo
            label="Nova senha"
            value={novaSenha}
            onChange={setNovaSenha}
            type={verSenha ? "text" : "password"}
            autoComplete="new-password"
            hint="Mínimo de 4 caracteres."
          />
          <Campo
            label="Confirmar nova senha"
            value={confirmar}
            onChange={setConfirmar}
            type={verSenha ? "text" : "password"}
            autoComplete="new-password"
          />

          <label className="flex items-center gap-2 text-xs text-gray-600 dark:text-slate-400">
            <input
              type="checkbox"
              checked={verSenha}
              onChange={(e) => setVerSenha(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
            />
            Mostrar senhas
          </label>

          {mensagem && (
            <div
              className={`rounded-lg px-3 py-2 text-sm ${
                mensagem.tipo === "ok"
                  ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
                  : "bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300"
              }`}
              role="alert"
            >
              {mensagem.texto}
            </div>
          )}

          <button
            type="submit"
            disabled={salvando}
            className="w-full rounded-xl bg-emerald-600 px-4 py-3 font-semibold text-white transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {salvando ? "Salvando..." : "Salvar nova senha"}
          </button>
        </form>
      </section>

      {/* Versão */}
      <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800">
        <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-slate-400">
          Versão do app
        </p>
        <p className="mt-1 text-xl font-semibold text-gray-800 dark:text-slate-100">
          {VERSAO}
        </p>
      </section>
    </div>
  );
}

function Campo({
  label,
  value,
  onChange,
  type,
  autoComplete,
  hint,
}: {
  label: string;
  value: string;
  onChange: (s: string) => void;
  type: string;
  autoComplete?: string;
  hint?: string;
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-600 dark:text-slate-400">
        {label}
      </label>
      <input
        type={type}
        autoComplete={autoComplete}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-gray-900 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
      />
      {hint && (
        <p className="mt-1 text-[11px] text-gray-400 dark:text-slate-500">{hint}</p>
      )}
    </div>
  );
}
