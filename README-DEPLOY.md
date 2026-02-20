# Deploy no Digital Ocean (Ubuntu Droplet)

Guia para publicar o Premiacoes Admin no seu servidor.

---

## Pré-requisitos

- Droplet Ubuntu no Digital Ocean
- Acesso SSH (root ou usuário com sudo)
- Domínio apontando para o IP do Droplet (opcional, mas recomendado)

---

## Passo 1: Enviar o projeto para o servidor

### Opção A - Via SCP (do seu Windows)

No PowerShell, na pasta do projeto:

```powershell
cd C:\Users\User\premiacoes-admin
scp -r . root@SEU_IP_DROPLET:/var/www/premiacoes-admin
```

Substitua `SEU_IP_DROPLET` pelo IP do seu servidor.

### Opção B - Via Git

No servidor Ubuntu:

```bash
apt update && apt install -y git
cd /var/www
git clone https://github.com/SEU_USUARIO/premiacoes-admin.git
cd premiacoes-admin
```

---

## Passo 2: Executar o script de deploy

Conecte ao servidor:

```bash
ssh root@SEU_IP_DROPLET
```

Dê permissão e execute:

```bash
cd /var/www/premiacoes-admin/scripts
chmod +x deploy-ubuntu.sh
bash deploy-ubuntu.sh
```

Se aparecer um comando do PM2 para rodar no boot, copie e execute.

---

## Passo 3: Configurar Nginx (acesso por domínio/IP)

Para acessar pelo IP ou domínio na porta 80:

```bash
cd /var/www/premiacoes-admin/scripts
chmod +x setup-nginx.sh
sudo bash setup-nginx.sh SEU_DOMINIO
```

Exemplo com domínio:
```bash
sudo bash setup-nginx.sh premiacoes.com.br
```

Exemplo só com IP (edite o script e use o IP no server_name).

---

## Passo 4: HTTPS (recomendado)

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d seu-dominio.com
```

---

## Comandos úteis

| Comando | Descrição |
|---------|-----------|
| `pm2 status` | Ver status da aplicação |
| `pm2 logs premiacoes-admin` | Ver logs em tempo real |
| `pm2 restart premiacoes-admin` | Reiniciar após alterações |
| `pm2 stop premiacoes-admin` | Parar a aplicação |

---

## Atualizar o site

Após fazer alterações no código:

1. Envie os arquivos novamente (SCP ou git pull)
2. No servidor:
   ```bash
   cd /var/www/premiacoes-admin
   npm install
   npm run build
   pm2 restart premiacoes-admin
   ```

---

## Solução de problemas

**Porta 3000 não responde?**
- Verifique: `pm2 status`
- Veja os logs: `pm2 logs premiacoes-admin`

**Nginx retorna 502?**
- Confirme que a app está rodando: `curl http://localhost:3000`
- Verifique o firewall: `ufw allow 80` e `ufw allow 443`

**Erro no build?**
- Verifique a versão do Node: `node -v` (recomendado 18 ou 20)
