# Mensagem para o assistente – Atualizar Premiacoes Admin no servidor

**Use este texto na próxima vez que for subir atualizações.** Cole na conversa para o assistente seguir o fluxo correto e evitar erros.

---

## Contexto do projeto

- **Projeto:** Premiacoes Admin (Next.js + Supabase)
- **Repositório:** https://github.com/Vitu242/premiacoes-admin
- **Servidor:** 167.71.168.183 (Ubuntu)
- **Pasta no servidor:** /var/www/premiacoes-admin
- **Método de deploy:** Git (push no PC → pull no servidor)

---

## Fluxo de deploy (sempre assim)

### 1. No PC (PowerShell)

```powershell
cd C:\Users\User\premiacoes-admin
git add -A
git status
git commit -m "Descrição das alterações"
git push origin main
```

**Importante:** No PowerShell, caminhos com parênteses precisam de aspas:
- `git add "app/(admin)/bilhetes/page.tsx"` (e não `git add app/(admin)/...`)

### 2. No servidor (SSH)

```bash
ssh root@167.71.168.183
cd /var/www/premiacoes-admin
git pull origin main
npm install
npm run build
pm2 restart premiacoes-admin
```

### 3. Testar

Acessar: **http://167.71.168.183:3000**

---

## O que garantir antes de fazer push

1. **Verificar TypeScript localmente:**  
   `npx tsc --noEmit` — deve passar sem erros.

2. **Não usar SCP para enviar o projeto** — apenas Git. O SCP manda `.git`, `node_modules` e `.next`, o que atrasa e pode causar conflitos.

3. **No servidor, o `.env.local` já existe** com `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY`. Não está no Git (está no `.gitignore`).

---

## Problemas que já foram resolvidos (não repetir)

- **Chaves duplicadas em objetos** (ex.: `grupo` em MODALIDADES) — usar só `COTACOES_LABELS` quando já tiver todas as chaves.
- **`idx` possibly null** — sempre checar `!== null` antes de comparar.
- **`modalidade` null em índice** — usar `modalidade ? (COTACOES_LABELS[modalidade] ?? modalidade) : "—"`.
- **Propriedade `codigo` faltando** — incluir em `toCambista`, `fetchGerentes`, `upsertCambista` (store-supabase).
- **`AppConfig` em `pushConfigToSupabase`** — usar cast `c as unknown as Record<string, unknown>`.
- **Carregamento infinito** — `SupabaseSyncProvider` tem timeout de 8 segundos; se a sincronização demorar, a página abre mesmo assim.

---

## Se o build falhar no servidor

1. Ver o erro exato (TypeScript, etc.).
2. Corrigir no PC, commitar, dar push.
3. No servidor: `git pull`, `npm run build`, `pm2 restart premiacoes-admin`.

**Não** usar `git reset --hard` no servidor a menos que queira descartar alterações locais e alinhar tudo ao GitHub.

---

## Comandos úteis no servidor

| Comando | Descrição |
|---------|-----------|
| `pm2 status` | Status da aplicação |
| `pm2 logs premiacoes-admin` | Ver logs em tempo real |
| `pm2 restart premiacoes-admin` | Reiniciar após alterações |
