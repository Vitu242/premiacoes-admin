"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getAdminCodigo, CODIGO_CHEFE } from "@/lib/auth";
import { normalizeLogin } from "@/lib/login-normalize";

interface AdminItem {
  codigo: string;
  admin: string;
}

interface FormEditar {
  codigo: string;       // original
  novoCodigo: string;   // editável (renomeia)
  admin: string;        // editável
  senha: string;        // opcional (em branco = mantém)
}

export default function GerirAdminsPage() {
  const router = useRouter();
  const codigo = getAdminCodigo();
  const [lista, setLista] = useState<AdminItem[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [novoCodigo, setNovoCodigo] = useState("");
  const [novoAdmin, setNovoAdmin] = useState("");
  const [novaSenha, setNovaSenha] = useState("");
  const [senhaLotobrasil, setSenhaLotobrasil] = useState("");
  const [editando, setEditando] = useState<FormEditar | null>(null);
  const [mensagem, setMensagem] = useState<{ tipo: "sucesso" | "erro"; texto: string } | null>(null);

  const recarregar = useCallback(async (senhaChef?: string) => {
    setCarregando(true);
    try {
      const senha = (senhaChef ?? senhaLotobrasil).trim();
      if (!senha) {
        setLista([]);
        return;
      }
      const r = await fetch("/api/admin-credenciais", {
        cache: "no-store",
        headers: { "X-Senha-Lotobrasil": senha },
      });
      const j = (await r.json()) as { ok?: boolean; lista?: AdminItem[]; erro?: string };
      if (j.ok && j.lista) setLista(j.lista);
      else setMensagem({ tipo: "erro", texto: j.erro ?? "Falha ao listar admins." });
    } catch (e) {
      setMensagem({ tipo: "erro", texto: (e as Error).message });
    } finally {
      setCarregando(false);
    }
  }, [senhaLotobrasil]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (codigo !== CODIGO_CHEFE) {
      router.replace("/");
      return;
    }
    // Não chama recarregar imediatamente — aguarda o chefe digitar a senha.
  }, [codigo, router]);

  if (codigo !== CODIGO_CHEFE) {
    return null;
  }

  const exigirSenha = (): string | null => {
    const s = senhaLotobrasil.trim();
    if (!s) {
      setMensagem({
        tipo: "erro",
        texto: "Digite a senha do Lotobrasil no campo acima para autorizar a operação.",
      });
      return null;
    }
    return s;
  };

  const handleCriar = async (e: React.FormEvent) => {
    e.preventDefault();
    setMensagem(null);
    const senha = exigirSenha();
    if (!senha) return;
    try {
      const r = await fetch("/api/admin-credenciais", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          codigo: novoCodigo.trim(),
          admin: normalizeLogin(novoAdmin),
          senha: novaSenha,
          senhaLotobrasil: senha,
        }),
      });
      const j = (await r.json()) as { ok?: boolean; erro?: string };
      if (!j.ok) {
        setMensagem({ tipo: "erro", texto: j.erro ?? "Falha ao criar." });
        return;
      }
      setMensagem({
        tipo: "sucesso",
        texto: `Admin "${normalizeLogin(novoAdmin)}" com código "${novoCodigo.trim()}" criado.`,
      });
      setNovoCodigo("");
      setNovoAdmin("");
      setNovaSenha("");
      await recarregar();
    } catch (err) {
      setMensagem({ tipo: "erro", texto: (err as Error).message });
    }
  };

  const handleEditarSalvar = async () => {
    if (!editando) return;
    setMensagem(null);
    const senha = exigirSenha();
    if (!senha) return;
    try {
      const r = await fetch(`/api/admin-credenciais/${encodeURIComponent(editando.codigo)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          admin: editando.admin ? normalizeLogin(editando.admin) : undefined,
          senha: editando.senha || undefined,
          novoCodigo: editando.novoCodigo.trim() || undefined,
          senhaLotobrasil: senha,
        }),
      });
      const j = (await r.json()) as { ok?: boolean; erro?: string };
      if (!j.ok) {
        setMensagem({ tipo: "erro", texto: j.erro ?? "Falha ao editar." });
        return;
      }
      setMensagem({ tipo: "sucesso", texto: `Admin "${editando.codigo}" atualizado.` });
      setEditando(null);
      await recarregar();
    } catch (err) {
      setMensagem({ tipo: "erro", texto: (err as Error).message });
    }
  };

  const handleDeletar = async (c: string) => {
    setMensagem(null);
    if (c === CODIGO_CHEFE) {
      setMensagem({ tipo: "erro", texto: "O código do chefe não pode ser removido." });
      return;
    }
    if (!confirm(`Remover o admin "${c}"? Os cambistas vinculados a esse código continuarão existindo, mas o admin perderá o acesso.`)) {
      return;
    }
    const senha = exigirSenha();
    if (!senha) return;
    try {
      const r = await fetch(`/api/admin-credenciais/${encodeURIComponent(c)}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ senhaLotobrasil: senha }),
      });
      const j = (await r.json()) as { ok?: boolean; erro?: string };
      if (!j.ok) {
        setMensagem({ tipo: "erro", texto: j.erro ?? "Falha ao remover." });
        return;
      }
      setMensagem({ tipo: "sucesso", texto: `Admin "${c}" removido.` });
      await recarregar();
    } catch (err) {
      setMensagem({ tipo: "erro", texto: (err as Error).message });
    }
  };

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-gray-800">Gerir admins e códigos</h1>
      <p className="mb-4 text-sm text-gray-600">
        Apenas o admin do código <strong>Lotobrasil</strong> (chefe) pode criar, editar
        e remover outros admins. Os admins comuns só configuram o app dos cambistas
        do próprio código — não conseguem acessar esta tela.
      </p>

      <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        <strong>Autorização:</strong> digite sua senha do Lotobrasil para autorizar
        qualquer ação abaixo (criar/editar/remover). Ela não é salva e precisa ser
        repetida em cada operação.
        <div className="mt-3">
          <input
            type="password"
            value={senhaLotobrasil}
            onChange={(e) => setSenhaLotobrasil(e.target.value)}
            placeholder="Senha do Lotobrasil"
            className="w-full max-w-sm rounded border border-amber-300 px-3 py-2 text-amber-900 placeholder:text-amber-700/60 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
            autoComplete="current-password"
          />
          <button
            type="button"
            onClick={() => void recarregar()}
            className="ml-2 rounded bg-amber-600 px-3 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
            disabled={!senhaLotobrasil.trim() || carregando}
          >
            {carregando ? "Carregando…" : "Listar admins"}
          </button>
        </div>
      </div>

      {mensagem && (
        <p
          className={`mb-4 rounded p-3 text-sm ${
            mensagem.tipo === "sucesso"
              ? "bg-green-50 text-green-800"
              : "bg-red-50 text-red-700"
          }`}
        >
          {mensagem.texto}
        </p>
      )}

      <div className="mb-8 rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold text-gray-800">Criar novo admin / código</h2>
        <form onSubmit={handleCriar} className="grid max-w-2xl gap-4 sm:grid-cols-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-600">Código da banca</label>
            <input
              type="text"
              value={novoCodigo}
              onChange={(e) => setNovoCodigo(e.target.value)}
              placeholder="Ex: Jaguar"
              className="w-full rounded border border-gray-300 px-3 py-2 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
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
              className="w-full rounded border border-gray-300 px-3 py-2 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
              required
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-600">Senha (mín. 4)</label>
            <input
              type="password"
              value={novaSenha}
              onChange={(e) => setNovaSenha(e.target.value)}
              placeholder="Senha inicial"
              minLength={4}
              className="w-full rounded border border-gray-300 px-3 py-2 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
              required
            />
          </div>
          <div className="sm:col-span-3">
            <button
              type="submit"
              className="rounded bg-orange-500 px-4 py-2 font-medium text-white hover:bg-orange-600"
            >
              Criar admin
            </button>
          </div>
        </form>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-800">Códigos registrados</h2>
          <button
            type="button"
            onClick={() => void recarregar()}
            className="rounded border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
            disabled={carregando}
          >
            {carregando ? "Atualizando..." : "Atualizar"}
          </button>
        </div>
        <p className="mb-4 text-sm text-gray-500">
          Estes códigos já possuem login/senha. Os admins entram no painel com o
          código, login e senha definidos.
        </p>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-600">Código</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-600">Login</th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase text-gray-600">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {lista.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-4 py-6 text-center text-sm text-gray-500">
                    Nenhum admin cadastrado.
                  </td>
                </tr>
              ) : (
                lista.map((it) => {
                  const isChefe = it.codigo === CODIGO_CHEFE;
                  return (
                    <tr key={it.codigo} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium text-gray-900">
                        {it.codigo}
                        {isChefe && (
                          <span className="ml-2 rounded-full bg-orange-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-orange-700">
                            Chefe
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-700">{it.admin}</td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => setEditando({
                              codigo: it.codigo,
                              novoCodigo: it.codigo,
                              admin: it.admin,
                              senha: "",
                            })}
                            className="rounded bg-blue-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-600"
                          >
                            Editar
                          </button>
                          {!isChefe && (
                            <button
                              type="button"
                              onClick={() => void handleDeletar(it.codigo)}
                              className="rounded bg-red-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-600"
                            >
                              Remover
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {editando && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setEditando(null)}
        >
          <div
            className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="mb-4 text-lg font-bold text-gray-800">
              Editar admin &quot;{editando.codigo}&quot;
            </h2>
            <div className="space-y-3">
              {editando.codigo !== CODIGO_CHEFE && (
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-600">Código</label>
                  <input
                    type="text"
                    value={editando.novoCodigo}
                    onChange={(e) => setEditando({ ...editando, novoCodigo: e.target.value })}
                    className="w-full rounded border border-gray-300 px-3 py-2 text-gray-900 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
                  />
                </div>
              )}
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-600">Login</label>
                <input
                  type="text"
                  value={editando.admin}
                  onChange={(e) => setEditando({ ...editando, admin: e.target.value })}
                  className="w-full rounded border border-gray-300 px-3 py-2 text-gray-900 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-600">
                  Nova senha (deixe em branco para manter)
                </label>
                <input
                  type="password"
                  value={editando.senha}
                  onChange={(e) => setEditando({ ...editando, senha: e.target.value })}
                  placeholder="••••"
                  className="w-full rounded border border-gray-300 px-3 py-2 text-gray-900 placeholder:text-gray-400 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
                />
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditando(null)}
                className="rounded border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void handleEditarSalvar()}
                className="rounded bg-orange-500 px-4 py-2 text-sm font-medium text-white hover:bg-orange-600"
              >
                Salvar alterações
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
