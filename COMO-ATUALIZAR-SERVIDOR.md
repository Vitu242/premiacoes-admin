# Como atualizar o site no servidor

## Método 1: Editar o arquivo direto no servidor

### 1. Conecte ao Console do Digital Ocean

### 2. Vá para a pasta do projeto:
```bash
cd /var/www/premiacoes-admin
```

### 3. Edite o arquivo de login:
```bash
nano app/login/page.tsx
```

### 4. Substitua todo o conteúdo pelo novo (copie do arquivo local)

### 5. Salve: Ctrl+O, Enter. Saia: Ctrl+X

### 6. Rebuild e reinicie:
```bash
npm run build
pm2 restart premiacoes-admin
```

### 7. Pronto! Acesse http://167.71.168.183:3000/login

---

## Método 2: Via Git (se conseguir fazer push)

No seu PC:
```bash
cd C:\Users\User\premiacoes-admin
git add .
git commit -m "Nova tela de login"
git push origin main
```

No servidor:
```bash
cd /var/www/premiacoes-admin
git pull
npm install
npm run build
pm2 restart premiacoes-admin
```
