# Unificação de Dados (PC e Celular)

## O que foi implementado

O sistema agora suporta **Supabase** como banco de dados central. Quando configurado:

1. **No carregamento**: os dados são buscados do Supabase e gravados no dispositivo (localStorage como cache).
2. **Em alterações**: cada mudança (novo cambista, bilhete, etc.) é enviada ao Supabase.
3. **Todos os dispositivos** (PC, celular) que acessam o mesmo link usam os mesmos dados.

## Como ativar

### 1. Criar projeto no Supabase

1. Acesse [supabase.com](https://supabase.com) e crie uma conta (plano gratuito).
2. Crie um novo projeto.
3. No painel, vá em **Settings → API** e copie:
   - **Project URL**
   - **anon public** (chave pública)

### 2. Executar o schema

1. No Supabase, vá em **SQL Editor**.
2. Copie o conteúdo de `supabase/schema.sql`.
3. Execute o script para criar as tabelas.

### 3. Configurar variáveis de ambiente

1. Crie o arquivo `.env.local` na raiz do projeto.
2. Adicione:

```
NEXT_PUBLIC_SUPABASE_URL=https://seu-projeto.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sua-chave-anon-publica
```

3. Reinicie o servidor de desenvolvimento (`npm run dev`).

### 4. Deploy

No servidor (Digital Ocean ou outro), configure as mesmas variáveis de ambiente antes de iniciar a aplicação.

## Fluxo de dados

- **Sem Supabase**: tudo continua funcionando só com localStorage (dados locais por dispositivo).
- **Com Supabase**: ao abrir o app, os dados são carregados do Supabase; ao criar/editar algo, a alteração é enviada para o Supabase e fica disponível para todos.

## Observações

- Credenciais de admin e config (tempo de cancelamento) permanecem apenas em localStorage por enquanto.
- Cambistas, bilhetes, extrações, resultados e lançamentos são sincronizados via Supabase.
