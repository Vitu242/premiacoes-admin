#!/bin/bash
# ============================================
# Script de deploy - Premiacoes Admin
# Executar no servidor Ubuntu (Droplet)
# Uso: bash deploy-ubuntu.sh
# ============================================

set -e

# === CONFIGURACAO - AJUSTE CONFORME SEU SERVIDOR ===
APP_NAME="premiacoes-admin"
APP_DIR="/var/www/premiacoes-admin"
NODE_VERSION="20"

# Cores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}=== Deploy Premiacoes Admin ===${NC}"

# 1. Instalar Node.js (se nao existir)
if ! command -v node &> /dev/null; then
    echo -e "${YELLOW}[1/6] Instalando Node.js...${NC}"
    curl -fsSL https://deb.nodesource.com/setup_${NODE_VERSION}.x | sudo -E bash -
    sudo apt-get install -y nodejs
else
    echo -e "${GREEN}[1/6] Node.js já instalado: $(node -v)${NC}"
fi

# 2. Instalar PM2 globalmente
if ! command -v pm2 &> /dev/null; then
    echo -e "${YELLOW}[2/6] Instalando PM2...${NC}"
    sudo npm install -g pm2
else
    echo -e "${GREEN}[2/6] PM2 já instalado${NC}"
fi

# 3. Criar diretorio da aplicacao
echo -e "${YELLOW}[3/6] Verificando diretório da aplicação...${NC}"
sudo mkdir -p /var/www
sudo chown -R $USER:$USER /var/www 2>/dev/null || true

# 4. O script assume que os arquivos ja estao em $APP_DIR
# Se estiver vazio, avisar para fazer upload ou git clone
if [ ! -f "$APP_DIR/package.json" ]; then
    echo -e "${RED}ERRO: Arquivos do projeto não encontrados em $APP_DIR${NC}"
    echo ""
    echo "Faça o upload do projeto antes de rodar este script:"
    echo "  Opção A - Do seu PC: scp -r premiacoes-admin root@SEU_IP:$APP_DIR"
    echo "  Opção B - No servidor: git clone SEU_REPO $APP_DIR"
    echo ""
    exit 1
fi

# 5. Instalar dependencias e fazer build
echo -e "${YELLOW}[4/6] Instalando dependências e gerando build...${NC}"
cd $APP_DIR
npm install
npm run build

# 6. Parar instancia anterior (se existir) e iniciar com PM2
echo -e "${YELLOW}[5/6] Iniciando aplicação com PM2...${NC}"
pm2 delete $APP_NAME 2>/dev/null || true
pm2 start npm --name "$APP_NAME" -- start
pm2 save

# 7. Configurar PM2 para iniciar no boot
echo -e "${YELLOW}[6/6] Configurando PM2 para iniciar no boot...${NC}"
pm2 startup 2>/dev/null || echo "Execute o comando que o PM2 exibir acima manualmente"

echo ""
echo -e "${GREEN}=== Deploy concluído! ===${NC}"
echo ""
echo "A aplicação está rodando em: http://localhost:3000"
echo ""
echo "Comandos úteis:"
echo "  pm2 status          - Ver status"
echo "  pm2 logs $APP_NAME   - Ver logs"
echo "  pm2 restart $APP_NAME - Reiniciar"
echo ""
echo "Para acessar externamente, configure o Nginx (ver README-DEPLOY.md)"
echo ""
