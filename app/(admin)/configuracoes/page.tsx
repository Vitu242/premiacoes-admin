"use client";

import { useState, useEffect } from "react";
import { atualizarAdminSenha } from "@/lib/auth";
import { getConfig, setConfig } from "@/lib/store";

export default function ConfiguracoesPage() {
  const [codigo, setCodigo] = useState("");
  const [adminAtual, setAdminAtual] = useState("");
  const [novoAdmin, setNovoAdmin] = useState("");
  const [novaSenha, setNovaSenha] = useState("");
  const [confirmarSenha, setConfirmarSenha] = useState("");
  const [tempoCancelamento, setTempoCancelamento] = useState(5);
  const [mensagem, setMensagem] = useState<{ tipo: "sucesso" | "erro"; texto: string } | null>(null);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const auth = localStorage.getItem("premiacoes_admin");
      if (auth) {
        const { codigo: c, admin } = JSON.parse(auth);
        setCodigo(c);
        setAdminAtual(admin);
        setNovoAdmin(admin);
      }
      const config = getConfig();
      setTempoCancelamento(config.tempoCancelamentoMinutos);
    }
  }, []);

  const handleSalvarLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setMensagem(null);

    if (!novoAdmin.trim()) {
      setMensagem({ tipo: "erro", texto: "Informe o novo login." });
      return;
    }

    if (novaSenha) {
      if (novaSenha.length < 4) {
        setMensagem({ tipo: "erro", texto: "A senha deve ter no mínimo 4 caracteres." });
        return;
      }
      if (novaSenha !== confirmarSenha) {
        setMensagem({ tipo: "erro", texto: "As senhas não coincidem." });
        return;
      }
    }

    const senhaFinal = novaSenha || undefined;
    atualizarAdminSenha(codigo, novoAdmin, senhaFinal ?? "");

    // Atualiza a sessão se mudou o login
    localStorage.setItem("premiacoes_admin", JSON.stringify({ codigo, admin: novoAdmin }));
    setAdminAtual(novoAdmin);
    setNovoAdmin(novoAdmin);
    setNovaSenha("");
    setConfirmarSenha("");

    setMensagem({ tipo: "sucesso", texto: "Login e senha atualizados com sucesso!" });
  };

  const handleSalvarTempoCancelamento = () => {
    const n = Math.max(1, Math.min(120, Math.floor(Number(tempoCancelamento))));
    setConfig({ tempoCancelamentoMinutos: n });
    setTempoCancelamento(n);
    setMensagem({ tipo: "sucesso", texto: "Tempo para cancelar bilhete atualizado!" });
  };

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-gray-800">Configurações</h1>

      {/* Alterar login e senha do admin */}
      <div className="mb-8 rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold text-gray-800">
          Alterar acesso ao painel
        </h2>
        <p className="mb-4 text-sm text-gray-500">
          Altere seu login e senha para acessar o painel. O código da banca não será alterado.
        </p>

        <form onSubmit={handleSalvarLogin} className="max-w-md space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-600">
              Código (não pode ser alterado)
            </label>
            <input
              type="text"
              value={codigo}
              readOnly
              className="w-full rounded border border-gray-200 bg-gray-50 px-4 py-2 text-gray-600"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-600">
              Novo login
            </label>
            <input
              type="text"
              value={novoAdmin}
              onChange={(e) => setNovoAdmin(e.target.value)}
              placeholder="Nome de usuário do admin"
              className="w-full rounded border border-gray-300 px-4 py-2 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
              required
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-600">
              Nova senha (deixe em branco para manter a atual)
            </label>
            <input
              type="password"
              value={novaSenha}
              onChange={(e) => setNovaSenha(e.target.value)}
              placeholder="Mínimo 4 caracteres"
              className="w-full rounded border border-gray-300 px-4 py-2 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-600">
              Confirmar nova senha
            </label>
            <input
              type="password"
              value={confirmarSenha}
              onChange={(e) => setConfirmarSenha(e.target.value)}
              placeholder="Repita a senha"
              className="w-full rounded border border-gray-300 px-4 py-2 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
            />
          </div>

          {mensagem && (
            <p
              className={`rounded p-2 text-sm ${
                mensagem.tipo === "sucesso"
                  ? "bg-green-50 text-green-700"
                  : "bg-red-50 text-red-600"
              }`}
            >
              {mensagem.texto}
            </p>
          )}

          <button
            type="submit"
            className="rounded bg-orange-500 px-4 py-2 font-medium text-white hover:bg-orange-600"
          >
            Salvar alterações
          </button>
        </form>
      </div>

      {/* Tempo para cancelar bilhete */}
      <div className="mb-8 rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold text-gray-800">
          Tempo para cancelar bilhete (cliente)
        </h2>
        <p className="mb-4 text-sm text-gray-500">
          O cliente poderá cancelar um bilhete até este tempo (em minutos) após a aposta, ou até o horário de encerramento da extração — o que ocorrer primeiro.
        </p>
        <div className="flex max-w-xs items-end gap-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-600">Minutos</label>
            <input
              type="number"
              min={1}
              max={120}
              value={tempoCancelamento}
              onChange={(e) => setTempoCancelamento(Number(e.target.value) || 1)}
              className="w-full rounded border border-gray-300 px-4 py-2 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
            />
          </div>
          <button
            onClick={handleSalvarTempoCancelamento}
            className="rounded bg-orange-500 px-4 py-2 font-medium text-white hover:bg-orange-600"
          >
            Salvar
          </button>
        </div>
      </div>

      <p className="text-sm text-gray-500">
        Outras configurações em breve.
      </p>
    </div>
  );
}
