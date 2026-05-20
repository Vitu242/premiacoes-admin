#!/usr/bin/env bash
# Backup diário do projeto Premiacoes Admin.
# - Empacota /var/www/premiacoes-admin (exceto node_modules, .next, .git)
# - Mantém .env.local
# - Guarda até 14 dias em /var/backups/premiacoes-admin
# Instalado em /etc/cron.daily/premiacoes-admin-backup pelo script setup-backup.sh

set -euo pipefail

SRC="/var/www/premiacoes-admin"
DEST_DIR="/var/backups/premiacoes-admin"
STAMP="$(date +%Y%m%d-%H%M%S)"
FILE="${DEST_DIR}/auto-${STAMP}.tar.gz"
KEEP_DAYS=14

mkdir -p "$DEST_DIR"

cd "$(dirname "$SRC")"
tar --exclude="premiacoes-admin/node_modules" \
    --exclude="premiacoes-admin/.next" \
    --exclude="premiacoes-admin/.git" \
    -czf "$FILE" "$(basename "$SRC")"

# SHA-256 ao lado
sha256sum "$FILE" > "${FILE}.sha256"

# Limpeza
find "$DEST_DIR" -name 'auto-*.tar.gz' -type f -mtime "+${KEEP_DAYS}" -delete
find "$DEST_DIR" -name 'auto-*.sha256' -type f -mtime "+${KEEP_DAYS}" -delete

echo "[$(date -Is)] backup OK: $FILE ($(du -h "$FILE" | cut -f1))"
