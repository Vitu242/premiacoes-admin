#!/bin/bash
# ============================================
# Configura Nginx como proxy reverso
# Uso: sudo bash setup-nginx.sh SEU_DOMINIO
# Exemplo: sudo bash setup-nginx.sh premiacoes.com.br
# ============================================

if [ -z "$1" ]; then
    echo "Uso: sudo bash setup-nginx.sh SEU_DOMINIO"
    echo "Exemplo: sudo bash setup-nginx.sh premiacoes.com.br"
    exit 1
fi

DOMAIN=$1

echo "Instalando Nginx..."
apt update
apt install -y nginx

echo "Criando configuração para $DOMAIN..."
cat > /etc/nginx/sites-available/premiacoes << EOF
server {
    listen 80;
    server_name $DOMAIN www.$DOMAIN;
    
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
    }
}
EOF

ln -sf /etc/nginx/sites-available/premiacoes /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default

echo "Testando configuração..."
nginx -t

echo "Recarregando Nginx..."
systemctl reload nginx

echo ""
echo "Nginx configurado! Acesse: http://$DOMAIN"
echo ""
echo "Para HTTPS (recomendado):"
echo "  apt install -y certbot python3-certbot-nginx"
echo "  certbot --nginx -d $DOMAIN"
echo ""
