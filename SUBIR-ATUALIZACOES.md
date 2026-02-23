# Subir atualizações (como da última vez que funcionou)

## Passo 1 – No seu PC (PowerShell)

Abra o PowerShell e execute **na pasta do projeto**:

```powershell
cd C:\Users\User\premiacoes-admin
scp -r . root@167.71.168.183:/var/www/premiacoes-admin
```

(Se a senha ou SSH pedir confirmação, use a mesma que você usou da última vez.)

---

## Passo 2 – No servidor (SSH)

Conecte no servidor:

```powershell
ssh root@167.71.168.183
```

Dentro do servidor, rode:

```bash
cd /var/www/premiacoes-admin
npm install
npm run build
pm2 restart premiacoes-admin
```

---

## Passo 3 – Testar

Acesse no navegador: **http://167.71.168.183:3000**

---

## Resumo dos comandos

**No PC:**
```powershell
cd C:\Users\User\premiacoes-admin
scp -r . root@167.71.168.183:/var/www/premiacoes-admin
```

**No servidor (após ssh root@167.71.168.183):**
```bash
cd /var/www/premiacoes-admin
npm install
npm run build
pm2 restart premiacoes-admin
```
