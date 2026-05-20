#!/usr/bin/env bash
# Instala o cron diário de backup. Rode como root:
#   sudo bash /var/www/premiacoes-admin/scripts/setup-backup.sh

set -euo pipefail
SRC="/var/www/premiacoes-admin/scripts/backup.sh"
DEST="/etc/cron.daily/premiacoes-admin-backup"

if [[ $EUID -ne 0 ]]; then
  echo "Rode como root (sudo)." >&2
  exit 1
fi

install -m 0755 "$SRC" "$DEST"
echo "Instalado: $DEST"
echo "Próxima execução: pelas configs do /etc/cron.daily (anacron)."
echo "Teste imediato: $DEST"
