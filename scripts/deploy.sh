#!/bin/sh
# Despliega main en el VPS: baja los cambios, reconstruye y verifica el health.
# Uso: sh scripts/deploy.sh <host-ssh>      (ej.: sh scripts/deploy.sh vps-extend)
# Requiere que el servidor ya esté preparado según docs/deploy.md.
set -eu

host="${1:?Uso: sh scripts/deploy.sh <host-ssh>}"
dir="${DEPLOY_DIR:-/root/app-fit}"

if [ -n "$(git status --porcelain)" ] || [ "$(git rev-parse HEAD)" != "$(git rev-parse origin/main)" ]; then
  echo "Tu copia local no coincide con origin/main: se despliega lo que está en GitHub." >&2
fi

ssh "$host" sh -s -- "$dir" <<'REMOTE'
set -eu
cd "$1"
git pull --ff-only
# Las imágenes base son públicas: se bajan sin los logins guardados en el servidor, que pueden
# no servir para ese registro (uno de ghcr.io de otro proyecto respondía "denied" con la de uv)
anon=$(mktemp -d)
trap 'rm -rf "$anon"' EXIT
DOCKER_CONFIG=$anon docker compose -f docker-compose.prod.yml up -d --build --remove-orphans
port=$(grep -E '^APP_PORT=' .env | cut -d= -f2)
for i in 1 2 3 4 5 6 7 8 9 10; do
  if curl -fsS "http://127.0.0.1:${port:-8020}/api/health"; then
    echo
    echo "Desplegado: $(git log --oneline -1)"
    exit 0
  fi
  sleep 3
done
echo "La API no responde: docker compose -f docker-compose.prod.yml logs api" >&2
exit 1
REMOTE
