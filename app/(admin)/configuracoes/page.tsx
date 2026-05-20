"use client";

import { useEffect, useState } from "react";
import { atualizarAdminSenha } from "@/lib/auth";
import { getConfig, setConfig, verificarCambistasInativos, getCambistasPorCodigo } from "@/lib/store";
import { addLog } from "@/lib/auditoria";
import { useVisibilityRefresh } from "@/lib/use-config-refresh";
import { normalizeLogin } from "@/lib/login-normalize";
import type { MilharBrindeGlobal } from "@/lib/store";
import { useToast } from "@/app/components/Toast";

export default function ConfiguracoesPage() {
  const toast = useToast();
  const [codigo, setCodigo] = useState("");
  const [novoAdmin, setNovoAdmin] = useState("");
  const [novaSenha, setNovaSenha] = useState("");
  const [confirmarSenha, setConfirmarSenha] = useState("");
  const [tempoCancelamento, setTempoCancelamento] = useState(5);
  const [apostasAtivas, setApostasAtivas] = useState(true);
  const [textoBilhete, setTextoBilhete] = useState("");
  const [tempoSegundaVia, setTempoSegundaVia] = useState(60);
  const [diasExcluirInativo, setDiasExcluirInativo] = useState(0);
  const [baixaAutomatica, setBaixaAutomatica] = useState(false);
  const [milharBrindeTipo, setMilharBrindeTipo] = useState<"nao" | "valor_fixo">("valor_fixo");
  const [milharBrindePremioFixo, setMilharBrindePremioFixo] = useState(0);
  const [gerentePodeCancelar, setGerentePodeCancelar] = useState(true);

  const carregarConfig = () => {
    const config = getConfig();
    setTempoCancelamento(config.tempoCancelamentoMinutos);
    setApostasAtivas(config.apostasAtivas ?? true);
    setTextoBilhete(config.textoRodapeBilhete ?? "");
    setTempoSegundaVia(config.tempoSegundaViaMinutos ?? 60);
    setDiasExcluirInativo(config.diasExcluirCambistaInativo ?? 0);
    setBaixaAutomatica(config.baixaAutomatica ?? false);
    const mb = config.milharBrindeGlobal;
    setMilharBrindeTipo(mb?.tipo === "nao" ? "nao" : "valor_fixo");
    setMilharBrindePremioFixo(mb?.premioFixo ?? 0);
    setGerentePodeCancelar(config.gerentePodeCancelarAposta ?? true);
  };

  useEffect(() => {
    if (typeof window !== "undefined") {
      const auth = localStorage.getItem("premiacoes_admin");
      if (auth) {
        const { codigo: c, admin } = JSON.parse(auth);
        setCodigo(c);
        setNovoAdmin(admin);
      }
      carregarConfig();
    }
  }, []);

  useVisibilityRefresh(carregarConfig);

  const handleSalvarLogin = (e: React.FormEvent) => {
    e.preventDefault();

    const adminNormalizado = normalizeLogin(novoAdmin);
    if (!adminNormalizado) {
      toast.error("Informe o novo login.");
      return;
    }

    if (novaSenha) {
      if (novaSenha.length < 4) {
        toast.error("A senha deve ter no mínimo 4 caracteres.");
        return;
      }
      if (novaSenha !== confirmarSenha) {
        toast.error("As senhas não coincidem.");
        return;
      }
    }

    const senhaFinal = novaSenha || undefined;
    atualizarAdminSenha(codigo, adminNormalizado, senhaFinal ?? "");
    addLog("Alterou login/senha", `Admin: ${adminNormalizado}`);

    localStorage.setItem("premiacoes_admin", JSON.stringify({ codigo, admin: adminNormalizado }));
    setNovoAdmin(adminNormalizado);
    setNovaSenha("");
    setConfirmarSenha("");

    toast.success("Login e senha atualizados!");
  };

  const handleSalvarTempoCancelamento = () => {
    const n = Math.max(1, Math.min(120, Math.floor(Number(tempoCancelamento))));
    setConfig({ tempoCancelamentoMinutos: n });
    setTempoCancelamento(n);
    addLog("Configuração", `Tempo cancelar: ${n} min`);
    carregarConfig();
    toast.success(`Tempo para cancelar bilhete: ${n} min`);
  };

  const handleSalvarApostasAtivas = () => {
    setConfig({ apostasAtivas });
    addLog("Configuração", apostasAtivas ? "Apostas ativadas" : "Apostas desativadas");
    carregarConfig();
    toast.success(apostasAtivas ? "Apostas ativadas." : "Apostas desativadas.");
  };

  const handleSalvarTextoBilhete = () => {
    setConfig({ textoRodapeBilhete: textoBilhete });
    addLog("Configuração", "Texto do bilhete alterado");
    carregarConfig();
    toast.success("Texto do bilhete atualizado!");
  };

  const qtdCambistas = codigo ? getCambistasPorCodigo(codigo).length : 0;

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-gray-800">Configurações</h1>

      <div className="mb-6 rounded-lg border border-gray-200 bg-gray-50 p-4">
        <p className="text-sm text-gray-500">Número de cambistas cadastrados</p>
        <p className="text-xl font-bold text-gray-800">{qtdCambistas}</p>
      </div>


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
        <h2 className="mb-2 text-lg font-semibold text-gray-800">
          Texto ao final do bilhete
        </h2>
        <p className="mb-3 text-sm text-gray-500">
          Mensagem exibida na faixa amarela do rodapé do bilhete (aparece tanto na tela quanto na imagem
          que o cliente compartilha pelo WhatsApp). O nome da banca é adicionado automaticamente depois.
        </p>
        <div className="space-y-3">
          <textarea
            value={textoBilhete}
            onChange={(e) => setTextoBilhete(e.target.value)}
            rows={3}
            placeholder="Confira seu bilhete, a banca não se responsabiliza por qualquer erro do cambista."
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
          />
          <div className="rounded border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
            <strong>Pré-visualização:</strong> &quot;{(textoBilhete || "Confira seu bilhete, a banca não se responsabiliza por qualquer erro do cambista.")}&quot; <strong>{(typeof window !== "undefined" && (localStorage.getItem("premiacoes_branding") ? (JSON.parse(localStorage.getItem("premiacoes_branding") || "{}").displayName || "Sua banca") : "Sua banca"))}</strong> agradece a sua preferência, boa sorte e ótimos resultados!
          </div>
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
              carregarConfig();
              toast.success(`Tempo para 2ª via: ${tempoSegundaVia} min`);
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
              carregarConfig();
              toast.success(`Inativação automática: ${diasExcluirInativo} dia(s)`);
            }}
            className="rounded bg-orange-500 px-4 py-2 font-medium text-white hover:bg-orange-600"
          >
            Salvar
          </button>
          <button
            onClick={() => {
              const n = verificarCambistasInativos();
              addLog("Sistema", `Verificou inativos: ${n} inativado(s)`);
              if (n > 0) toast.success(`${n} cambista(s) inativado(s) por inatividade.`);
              else toast.info("Nenhum cambista inativo encontrado.");
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
              carregarConfig();
              toast.success(baixaAutomatica ? "Baixa automática ativada." : "Baixa automática desativada.");
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
          Define o comportamento do Milhar Brinde para todos os cambistas. Quando ativado,
          ele paga somente se bater no 1º prêmio (1/1), e o valor pago é fixo, definido
          pelo admin, independente do valor apostado no bilhete.
        </p>
        <div className="space-y-4">
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-600">Status</label>
            <div className="flex flex-wrap gap-4">
              <label className="flex items-center gap-2">
                <input type="radio" name="mbTipo" checked={milharBrindeTipo === "nao"} onChange={() => setMilharBrindeTipo("nao")} />
                Desativado
              </label>
              <label className="flex items-center gap-2">
                <input type="radio" name="mbTipo" checked={milharBrindeTipo === "valor_fixo"} onChange={() => setMilharBrindeTipo("valor_fixo")} />
                Ativado com prêmio fixo
              </label>
            </div>
          </div>
          {milharBrindeTipo !== "nao" && (
            <div className="flex flex-wrap gap-6">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-600">Quanto a milhar brinde vai pagar (R$)</label>
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  value={milharBrindePremioFixo}
                  onChange={(e) => setMilharBrindePremioFixo(Math.max(0, Number(e.target.value) || 0))}
                  className="w-32 rounded border border-gray-300 px-3 py-2"
                />
                <p className="mt-1 max-w-sm text-xs text-gray-500">
                  Ex.: se colocar R$ 100,00, qualquer milhar brinde vencedora paga R$ 100,00.
                  Não usa a cotação normal da milhar.
                </p>
              </div>
            </div>
          )}
          <button
            onClick={() => {
              const valor = Math.max(0, Number(milharBrindePremioFixo) || 0);
              const mb: MilharBrindeGlobal = {
                tipo: milharBrindeTipo,
                premioFixo: milharBrindeTipo === "valor_fixo" ? valor : undefined,
              };
              setConfig({ milharBrindeGlobal: mb });
              addLog(
                "Configuração",
                milharBrindeTipo === "nao"
                  ? "Milhar brinde desativada"
                  : `Milhar brinde: prêmio fixo R$ ${valor.toFixed(2)}`,
              );
              // Recarrega imediatamente do localStorage para CONFIRMAR a
              // persistência na tela (evita "salvei mas o input voltou ao
              // valor antigo" — bug típico de race condition com o sync).
              carregarConfig();
              toast.success(
                milharBrindeTipo === "nao"
                  ? "Milhar brinde desativada."
                  : `Milhar brinde salva! Prêmio fixo: R$ ${valor.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`,
              );
            }}
            className="rounded bg-orange-500 px-4 py-2 font-medium text-white hover:bg-orange-600"
          >
            Salvar
          </button>
          <p className="mt-2 text-xs text-gray-500">
            Esse valor se aplica a todos os cambistas do seu código (banca).
            Cada admin tem sua própria configuração.
          </p>
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
              carregarConfig();
              toast.success(gerentePodeCancelar ? "Gerente pode cancelar apostas." : "Apenas o chefe cancela apostas.");
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
