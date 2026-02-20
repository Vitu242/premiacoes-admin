# Como atualizar o site no servidor

**Servidor:** 167.71.168.183  
**URL:** http://167.71.168.183:3000

---

## Método 1: Atualizar via GitHub (recomendado)

### No servidor (SSH):

```bash
cd /var/www
mv premiacoes-admin premiacoes-admin.old
git clone https://github.com/Vitu242/premiacoes-admin.git
cd premiacoes-admin
bash scripts/deploy-ubuntu.sh
pm2 restart premiacoes-admin
```

Ou, se a pasta já for um repositório Git:

```bash
cd /var/www/premiacoes-admin
git pull origin main
bash scripts/deploy-ubuntu.sh
pm2 restart premiacoes-admin
```

---

## Método 2: Antes de atualizar — enviar código para o GitHub (no PC)

```powershell
cd C:\Users\User\premiacoes-admin
git add .
git commit -m "Descrição da atualização"
git push origin main
```

Depois execute o Método 1 no servidor.

---

## Método 3: Edição manual no servidor (rápido para pequenas mudanças)

```bash
cd /var/www/premiacoes-admin
nano caminho/do/arquivo
# Edite, salve: Ctrl+O, Enter, saia: Ctrl+X
npm run build
pm2 restart premiacoes-admin
```

---

## Comandos úteis PM2

| Comando | Descrição |
|---------|-----------|
| `pm2 status` | Ver status dos apps |
| `pm2 restart premiacoes-admin` | Reiniciar o app |
| `pm2 logs premiacoes-admin` | Ver logs |
