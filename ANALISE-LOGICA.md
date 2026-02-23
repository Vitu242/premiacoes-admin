# Análise lógica do sistema Premiações Admin

Revisão do que foi implementado e verificação de padrões e inconsistências.

---

## 1. Fluxos que estão consistentes

### 1.1 Auth e isolamento por código
- **Admin:** login por código + usuário/senha; credenciais em `premiacoes_admin_credenciais`; só Lotobrasil pode criar novos códigos; primeiro acesso Lotobrasil = admin/admin.
- **Cliente:** login por código da banca + login/senha do cambista; vê apenas o próprio cambista.
- **Filtros:** `getGerentesPorCodigo`, `getCambistasPorCodigo` usados em todas as telas do admin; novo gerente/cambista recebe o código do admin logado.

### 1.2 Lançamentos e caixa
- Lançamento **não** altera saldo do cambista: só mexe em `lancamentos` (e indiretamente no total a prestar).
- Adiantar = banca manda para o cliente (+); retirar = cliente manda para a banca (−).
- Fórmula do caixa: `entrada - saidas - comissao + lancamentos`.

### 1.3 Bilhetes e conferência
- **Prêmio:** `(valor por palpite × cotação) / divisor`, com divisor pelo tipo de jogo (1/1 → 1, 1/5 → 5, 1/10 → 10). Aplicado em grupo, dezena, centena e milhar.
- **Múltiplos números na mesma linha:** `splitNumeros` passa a tratar centena/milhar com números separados por espaço; valor da linha é dividido pela quantidade de palpites para obter o valor por palpite no cálculo do prêmio.
- Ao lançar resultado, bilhetes da extração/data são marcados como pago ou perdedor usando essa conferência.

### 1.4 Cotações
- 22 cotações padrão em `lib/cotacoes.ts`; admin pode editar em Cotações (padrão global ou por cambista).
- Na venda e na conferência só entram as 4 modalidades do bilhete (grupo, dezena, centena, milhar) via `getCotacaoEfetiva(cambista, modalidade)` (legacy + override).

### 1.5 Configurações e prêmios
- **premioMax (5 | 10):** em Configurações; cliente em Vender vê apenas opções 1/1 … 5/5 ou 1/1 … 5/10 conforme o config.
- **Loterias:** admin pode editar, adicionar, apagar e restaurar lista padrão; em Configurações define até 1/5 ou 1/10.

### 1.6 Resultados
- 10 prêmios (1º a 10º); resultado guarda `grupos` (1º) e `premios[1..10]`; conferência usa o range do item (ex.: 1/10) para ver se acertou em algum deles e aplica o divisor correto no valor.

### 1.7 Extrações padrão
- `getExtracoesPadrao()` devolve 50 loterias com `id` numérico; “Restaurar lista padrão” chama `setExtracoes(getExtracoesPadrao())` e está correto.

---

## 2. Ajustes feitos nesta revisão

### 2.1 Config e Supabase
- **Problema:** Alterações em Configurações (premioMax, tempo para cancelar) só iam para `localStorage`; não eram enviadas ao Supabase.
- **Correção:** Criado `pushConfigToSupabase` em `lib/sync-supabase.ts`; `saveConfig` no store chama esse push após salvar no `localStorage`. Na inicialização, se a tabela `config` no Supabase estiver vazia, a config local é enviada.

### 2.2 Valor por palpite e múltiplos números (centena/milhar)
- **Problema:** Na conferência, o prêmio usava o valor total do item; com vários números na mesma linha (ex.: “1970 2200 2297 2298 2299”) o valor deveria ser dividido pelo número de palpites.
- **Correção:** Em `lib/conferencia.ts`: `splitNumeros` para centena/milhar passa a separar por espaço quando houver vários números; o valor usado no prêmio é `item.valor / qtdPalpites` (valor por palpite), depois (valor por palpite × cotação) / divisor.

---

## 3. Pontos de atenção (padrão atual)

### 3.1 22 cotações vs 4 modalidades no bilhete
- Existem 22 chaves em `CotacaoKey` (milhar, centena, MC, invertidas, duques, ternos, passe etc.).
- No bilhete só há as modalidades grupo, dezena, centena, milhar; a conferência e a venda usam só essas 4.
- As outras cotações servem para o painel de Cotações (padrão e overrides por cambista) e para uso futuro (ex.: modalidade “Milhar e Centena” ou “Milhar Invertida”). Não é erro; é decisão de produto.

### 3.2 Venda: um número por linha
- Na tela de venda do cliente, hoje só é possível informar **um** número por linha (um campo por modalidade).
- A conferência já aceita vários números separados por espaço no campo `numeros` (ex.: “1970 2200 2297 2298 2299”). Para o cliente poder apostar “5 milhares” na mesma linha, seria preciso ajustar a tela de venda (ex.: permitir digitar vários números com espaço ou vários campos).

### 3.3 Modalidade “Milhar e Centena” (MC)
- No recibo do usuário existe “Milhar e Centena” com divisão 50/50 do valor (R$ 1 milhar + R$ 1 centena por palpite).
- No sistema atual não há modalidade MC: só grupo, dezena, centena, milhar. Cada linha é uma modalidade. Incluir MC exigiria nova modalidade e lógica de split 50/50 no cálculo e na conferência.

### 3.4 Exibição do bilhete (cliente)
- Hoje aparece algo como: `1/1 a 10,00 = 10,00` (redundante quando há um único palpite).
- Poderia evoluir para algo como “1/1 — R$ 10,00” ou, com vários números, “1/1 a 2,00 = 10,00 (5 palpites)”. Fica como melhoria de UX.

### 3.5 Tabela `config` no Supabase
- O sync espera uma tabela `config` com pelo menos `id` e `value` (objeto JSON). O upsert usa `id: "default"`. Vale garantir no schema que existe essa tabela e que `id` é a chave de conflito no upsert.

---

## 4. Resumo

- **Lógica de negócio:** isolamento por código, lançamentos, caixa, bilhetes, conferência com divisor e valor por palpite, resultados e configurações estão alinhados com o combinado.
- **Correções aplicadas:** (1) config passando a ser enviada e inicializada no Supabase; (2) múltiplos números por linha em centena/milhar na conferência com valor por palpite no prêmio.
- **Fora do padrão crítico:** nada que quebre consistência; restam evoluções desejáveis (MC, vários números na UI de venda, texto do bilhete) e a distinção entre as 22 cotações e as 4 modalidades do bilhete, já documentada.
