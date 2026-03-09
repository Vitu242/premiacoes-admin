"use client";

import { useState, useEffect } from "react";
import { atualizarAdminSenha } from "@/lib/auth";
import { getConfig, setConfig, verificarCambistasInativos, getCambistasPorCodigo, getExtracoes, updateExtracao } from "@/lib/store";
import { addLog } from "@/lib/auditoria";
import { useVisibilityRefresh } from "@/lib/use-config-refresh";
import type { MilharBrindeGlobal } from "@/lib/store";

export default function ConfiguracoesPage() {
  const [codigo, setCodigo] = useState("");
  const [adminAtual, setAdminAtual] = useState("");
  const [novoAdmin, setNovoAdmin] = useState("");
  const [novaSenha, setNovaSenha] = useState("");
  const [confirmarSenha, setConfirmarSenha] = useState("");
  const [tempoCancelamento, setTempoCancelamento] = useState(5);
  const [premioMax, setPremioMax] = useState<5 | 10>(10);
  const [apostasAtivas, setApostasAtivas] = useState(true);
  const [textoBilhete, setTextoBilhete] = useState("");
  const [tempoSegundaVia, setTempoSegundaVia] = useState(60);
  const [diasExcluirInativo, setDiasExcluirInativo] = useState(0);
  const [baixaAutomatica, setBaixaAutomatica] = useState(false);
  const [milharBrindeTipo, setMilharBrindeTipo] = useState<"nao" | "valor_fixo" | "valor_multiplicado">("valor_multiplicado");
  const [milharBrindeValorMin, setMilharBrindeValorMin] = useState(0);
  const [milharBrindePremioFixo, setMilharBrindePremioFixo] = useState(0);
  const [gerentePodeCancelar, setGerentePodeCancelar] = useState(true);
  const [mensagem, setMensagem] = useState<{ tipo: "sucesso" | "erro"; texto: string } | null>(null);
  const [extracoesKey, setExtracoesKey] = useState(0);

  const carregarConfig = () => {
    const config = getConfig();
    setTempoCancelamento(config.tempoCancelamentoMinutos);
    setPremioMax(config.premioMax ?? 10);
    setApostasAtivas(config.apostasAtivas ?? true);
    setTextoBilhete(config.textoRodapeBilhete ?? "");
    setTempoSegundaVia(config.tempoSegundaViaMinutos ?? 60);
    setDiasExcluirInativo(config.diasExcluirCambistaInativo ?? 0);
    setBaixaAutomatica(config.baixaAutomatica ?? false);
    const mb = config.milharBrindeGlobal;
    setMilharBrindeTipo(mb?.tipo ?? "valor_multiplicado");
    setMilharBrindeValorMin(mb?.valorMinimoAtivar ?? 0);
    setMilharBrindePremioFixo(mb?.premioFixo ?? 0);
    setGerentePodeCancelar(config.gerentePodeCancelarAposta ?? true);
  };

  useEffect(() => {
    if (typeof window !== "undefined") {
      const auth = localStorage.getItem("premiacoes_admin");
      if (auth) {
        const { codigo: c, admin } = JSON.parse(auth);
        setCodigo(c);
        setAdminAtual(admin);
        setNovoAdmin(admin);
      }
      carregarConfig();
    }
  }, []);

  useVisibilityRefresh(carregarConfig);

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
    addLog("Alterou login/senha", `Admin: ${novoAdmin}`);

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
    addLog("Configuração", `Tempo cancelar: ${n} min`);
    setMensagem({ tipo: "sucesso", texto: "Tempo para cancelar bilhete atualizado!" });
  };

  const handleSalvarPremioMax = () => {
    setConfig({ premioMax });
    addLog("Configuração", `Prêmio max: até 1/${premioMax}`);
    setMensagem({ tipo: "sucesso", texto: "Prêmios permitidos ao cliente atualizado!" });
  };

  const handleSalvarApostasAtivas = () => {
    setConfig({ apostasAtivas });
    addLog("Configuração", apostasAtivas ? "Apostas ativadas" : "Apostas desativadas");
    setMensagem({
      tipo: "sucesso",
      texto: apostasAtivas
        ? "Apostas ativadas para os clientes."
        : "Apostas desativadas para os clientes.",
    });
  };

  const handleSalvarTextoBilhete = () => {
    setConfig({ textoRodapeBilhete: textoBilhete });
    addLog("Configuração", "Texto do bilhete alterado");
    setMensagem({
      tipo: "sucesso",
      texto: "Texto do bilhete atualizado!",
    });
  };

  const qtdCambistas = codigo ? getCambistasPorCodigo(codigo).length : 0;

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-gray-800">Configurações</h1>

      <div className="mb-6 rounded-lg border border-gray-200 bg-gray-50 p-4">
        <p className="text-sm text-gray-500">Número de cambistas cadastrados</p>
        <p className="text-xl font-bold text-gray-800">{qtdCambistas}</p>
      </div>

      <div className="mb-8 rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold text-gray-800">Loterias ativas</h2>
        <p className="mb-4 text-sm text-gray-500">Ative ou desative extrações para apostas.</p>
        <div className="space-y-2">
          {getExtracoes().map((e) => (
            <div key={e.id} className="flex items-center justify-between rounded border border-gray-100 px-4 py-2">
              <span className="font-medium text-gray-800">{e.nome}</span>
              <button
                type="button"
                onClick={() => {
                  updateExtracao(e.id, { ativa: !e.ativa });
                  addLog("Configuração", `${e.nome}: ${e.ativa ? "desativada" : "ativada"}`);
                  setExtracoesKey((k) => k + 1);
                }}
                className={`rounded px-3 py-1 text-sm font-medium ${
                  e.ativa ? "bg-green-100 text-green-700 hover:bg-green-200" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                {e.ativa ? "Ativa" : "Inativa"}
              </button>
            </div>
          ))}
          {getExtracoes().length === 0 && <p className="text-sm text-gray-500">Nenhuma extração cadastrada.</p>}
        </div>
      </div>

      {mensagem && (
        <p
          className={`mb-4 rounded p-2 text-sm ${
            mensagem.tipo === "sucesso" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-600"
          }`}
        >
          {mensagem.texto}
        </p>
      )}

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
          Prêmios permitidos ao cliente
        </h2>
        <p className="mb-4 text-sm text-gray-500">
          Define até qual prêmio o cliente pode apostar. Ex.: &quot;Até 1/5&quot; = só jogos de 1/1 a 5/5; &quot;Até 1/10&quot; = de 1/1 até 5/10.
        </p>
        <div className="flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="premioMax"
              checked={premioMax === 5}
              onChange={() => setPremioMax(5)}
            />
            Até 1/5 (só 1º ao 5º prêmio)
          </label>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="premioMax"
              checked={premioMax === 10}
              onChange={() => setPremioMax(10)}
            />
            Até 1/10 (1º ao 10º prêmio)
          </label>
          <button
            onClick={handleSalvarPremioMax}
            className="rounded bg-orange-500 px-4 py-2 font-medium text-white hover:bg-orange-600"
          >
            Salvar
          </button>
        </div>
      </div>

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

      {/* Apostas ativas */}
      <div className="mb-8 rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold text-gray-800">
          Apostas ativas
        </h2>
        <p className="mb-4 text-sm text-gray-500">
          Quando desativado, o cliente não poderá realizar novas apostas na área de venda.
        </p>
        <div className="flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="apostasAtivas"
              checked={apostasAtivas}
              onChange={() => setApostasAtivas(true)}
            />
            Ativadas
          </label>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="apostasAtivas"
              checked={!apostasAtivas}
              onChange={() => setApostasAtivas(false)}
            />
            Desativadas
          </label>
          <button
            onClick={handleSalvarApostasAtivas}
            className="rounded bg-orange-500 px-4 py-2 font-medium text-white hover:bg-orange-600"
          >
            Salvar
          </button>
        </div>
      </div>

      {/* Texto do bilhete */}
      <div className="mb-8 rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold text-gray-800">
          Texto ao final do bilhete
        </h2>
        <p className="mb-4 text-sm text-gray-500">
          Mensagem exibida no rodapé do bilhete do cliente (ex.: aviso de conferência e responsabilidade).
        </p>
        <div className="space-y-3">
          <textarea
            value={textoBilhete}
            onChange={(e) => setTextoBilhete(e.target.value)}
            rows={3}
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
          />
          <button
            onClick={handleSalvarTextoBilhete}
            className="rounded bg-orange-500 px-4 py-2 font-medium text-white hover:bg-orange-600"
          >
            Salvar texto
          </button>
        </div>
      </div>

      {/* Tempo segunda via */}
      <div className="mb-8 rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold text-gray-800">
          Tempo para imprimir segunda via
        </h2>
        <p className="mb-4 text-sm text-gray-500">
          Prazo em minutos após a aposta em que o cliente pode imprimir a segunda via do bilhete. 0 = sem limite.
        </p>
        <div className="flex max-w-xs items-end gap-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-600">Minutos</label>
            <input
              type="number"
              min={0}
              max={1440}
              value={tempoSegundaVia}
              onChange={(e) => setTempoSegundaVia(Math.max(0, Number(e.target.value) || 0))}
              className="w-full rounded border border-gray-300 px-4 py-2 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
            />
          </div>
          <button
            onClick={() => {
              setConfig({ tempoSegundaViaMinutos: tempoSegundaVia });
              addLog("Configuração", `Tempo 2ª via: ${tempoSegundaVia} min`);
              setMensagem({ tipo: "sucesso", texto: "Tempo para segunda via atualizado!" });
            }}
            className="rounded bg-orange-500 px-4 py-2 font-medium text-white hover:bg-orange-600"
          >
            Salvar
          </button>
        </div>
      </div>

      {/* Dias para excluir cambista inativo */}
      <div className="mb-8 rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold text-gray-800">
          Inativar cambista inativo
        </h2>
        <p className="mb-4 text-sm text-gray-500">
          Quantidade de dias sem login para inativar automaticamente o cambista. 0 = desativado. Use o botão abaixo para verificar agora.
        </p>
        <div className="flex max-w-xs flex-wrap items-end gap-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-600">Dias</label>
            <input
              type="number"
              min={0}
              max={365}
              value={diasExcluirInativo}
              onChange={(e) => setDiasExcluirInativo(Math.max(0, Number(e.target.value) || 0))}
              className="w-full rounded border border-gray-300 px-4 py-2 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
            />
          </div>
          <button
            onClick={() => {
              setConfig({ diasExcluirCambistaInativo: diasExcluirInativo });
              addLog("Configuração", `Dias excluir inativo: ${diasExcluirInativo}`);
              setMensagem({ tipo: "sucesso", texto: "Configuração atualizada!" });
            }}
            className="rounded bg-orange-500 px-4 py-2 font-medium text-white hover:bg-orange-600"
          >
            Salvar
          </button>
          <button
            onClick={() => {
              const n = verificarCambistasInativos();
              addLog("Sistema", `Verificou inativos: ${n} inativado(s)`);
              setMensagem({
                tipo: "sucesso",
                texto: n > 0 ? `${n} cambista(s) inativado(s) por inatividade.` : "Nenhum cambista inativo encontrado.",
              });
            }}
            className="rounded border border-gray-300 px-4 py-2 font-medium text-gray-700 hover:bg-gray-50"
          >
            Verificar e inativar agora
          </button>
        </div>
      </div>

      {/* Baixa automática */}
      <div className="mb-8 rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold text-gray-800">
          Baixa automática
        </h2>
        <p className="mb-4 text-sm text-gray-500">
          Quando ativado, o sistema aplica automaticamente os resultados aos bilhetes pendentes ao cadastrar o resultado da extração.
        </p>
        <div className="flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2">
            <input type="radio" name="baixaAutomatica" checked={baixaAutomatica} onChange={() => setBaixaAutomatica(true)} />
            Ativada
          </label>
          <label className="flex items-center gap-2">
            <input type="radio" name="baixaAutomatica" checked={!baixaAutomatica} onChange={() => setBaixaAutomatica(false)} />
            Desativada
          </label>
          <button
            onClick={() => {
              setConfig({ baixaAutomatica });
              addLog("Configuração", baixaAutomatica ? "Baixa automática ativada" : "Baixa automática desativada");
              setMensagem({ tipo: "sucesso", texto: "Baixa automática atualizada!" });
            }}
            className="rounded bg-orange-500 px-4 py-2 font-medium text-white hover:bg-orange-600"
          >
            Salvar
          </button>
        </div>
      </div>

      {/* Milhar Brinde global */}
      <div className="mb-8 rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold text-gray-800">
          Milhar Brinde (configuração global)
        </h2>
        <p className="mb-4 text-sm text-gray-500">
          Define o comportamento do Milhar Brinde para todos os cambistas. Sobrescreve a opção individual quando definido.
        </p>
        <div className="space-y-4">
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-600">Tipo</label>
            <div className="flex flex-wrap gap-4">
              <label className="flex items-center gap-2">
                <input type="radio" name="mbTipo" checked={milharBrindeTipo === "nao"} onChange={() => setMilharBrindeTipo("nao")} />
                Desativado
              </label>
              <label className="flex items-center gap-2">
                <input type="radio" name="mbTipo" checked={milharBrindeTipo === "valor_fixo"} onChange={() => setMilharBrindeTipo("valor_fixo")} />
                Valor fixo
              </label>
              <label className="flex items-center gap-2">
                <input type="radio" name="mbTipo" checked={milharBrindeTipo === "valor_multiplicado"} onChange={() => setMilharBrindeTipo("valor_multiplicado")} />
                Valor multiplicado
              </label>
            </div>
          </div>
          {milharBrindeTipo !== "nao" && (
            <div className="flex flex-wrap gap-6">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-600">Valor mínimo para ativar (R$)</label>
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  value={milharBrindeValorMin}
                  onChange={(e) => setMilharBrindeValorMin(Math.max(0, Number(e.target.value) || 0))}
                  className="w-32 rounded border border-gray-300 px-3 py-2"
                />
              </div>
              {milharBrindeTipo === "valor_fixo" && (
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-600">Prêmio fixo (R$)</label>
                  <input
                    type="number"
                    min={0}
                    step={0.01}
                    value={milharBrindePremioFixo}
                    onChange={(e) => setMilharBrindePremioFixo(Math.max(0, Number(e.target.value) || 0))}
                    className="w-32 rounded border border-gray-300 px-3 py-2"
                  />
                </div>
              )}
            </div>
          )}
          <button
            onClick={() => {
              const mb: MilharBrindeGlobal = {
                tipo: milharBrindeTipo,
                valorMinimoAtivar: milharBrindeTipo !== "nao" ? milharBrindeValorMin : undefined,
                premioFixo: milharBrindeTipo === "valor_fixo" ? milharBrindePremioFixo : undefined,
              };
              setConfig({ milharBrindeGlobal: mb });
              addLog("Configuração", `Milhar brinde: ${milharBrindeTipo}`);
              setMensagem({ tipo: "sucesso", texto: "Milhar brinde atualizado!" });
            }}
            className="rounded bg-orange-500 px-4 py-2 font-medium text-white hover:bg-orange-600"
          >
            Salvar
          </button>
        </div>
      </div>

      {/* Gerente pode cancelar aposta */}
      <div className="mb-8 rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold text-gray-800">
          Gerente pode cancelar apostas
        </h2>
        <p className="mb-4 text-sm text-gray-500">
          Quando desativado, apenas o chefe (código principal) pode cancelar bilhetes no painel.
        </p>
        <div className="flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2">
            <input type="radio" name="gerenteCancelar" checked={gerentePodeCancelar} onChange={() => setGerentePodeCancelar(true)} />
            Sim
          </label>
          <label className="flex items-center gap-2">
            <input type="radio" name="gerenteCancelar" checked={!gerentePodeCancelar} onChange={() => setGerentePodeCancelar(false)} />
            Não
          </label>
          <button
            onClick={() => {
              setConfig({ gerentePodeCancelarAposta: gerentePodeCancelar });
              addLog("Configuração", gerentePodeCancelar ? "Gerente pode cancelar" : "Só chefe pode cancelar");
              setMensagem({ tipo: "sucesso", texto: "Permissão atualizada!" });
            }}
            className="rounded bg-orange-500 px-4 py-2 font-medium text-white hover:bg-orange-600"
          >
            Salvar
          </button>
        </div>
      </div>
    </div>
  );
}
