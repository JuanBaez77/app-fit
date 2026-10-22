#!/bin/sh
# Corre dentro del contenedor backup (docker-compose.prod.yml).
# Hace un pg_dump al arrancar y después cada 24 h, y borra las copias de más de BACKUP_KEEP_DAYS días.
# Las variables PGHOST, PGUSER, PGPASSWORD y PGDATABASE las pone el compose.
set -u

keep="${BACKUP_KEEP_DAYS:-14}"

while true; do
  file="/backups/appfit-$(date -u +%Y%m%d-%H%M%S).dump"
  if pg_dump --format=custom --file="$file.tmp"; then
    mv "$file.tmp" "$file"
    echo "backup ok: $file ($(du -h "$file" | cut -f1))"
  else
    rm -f "$file.tmp"
    echo "backup FALLÓ $(date -u +%FT%TZ)" >&2
  fi
  find /backups -name 'appfit-*.dump' -mtime +"$keep" -delete
  sleep 86400
done
