#!/bin/sh
# Sube el bundle del brain (brain/out/latest.json y sus archivos) y lo registra en brain_bundle.
# Uso: sh scripts/upload-bundle.sh            (base local, con docker compose de desarrollo)
#      sh scripts/upload-bundle.sh <host-ssh> (el VPS: copia los archivos y lo registra ahí)
# Antes: py brain/build_bundle.py
set -eu

cd "$(dirname "$0")/.."
if [ ! -f brain/out/latest.json ]; then
  echo "Falta el bundle: corré py brain/build_bundle.py" >&2
  exit 1
fi
# Los dos archivos de la versión que apunta latest.json
files=$(sed -n 's/.*"\(bundle\|pages\)": *"\([^"]*\)".*/\2/p' brain/out/latest.json)

if [ -z "${1:-}" ]; then
  # En Git Bash, pwd -W da la ruta de Windows que entiende Docker
  root=$(pwd -W 2>/dev/null || pwd)
  MSYS_NO_PATHCONV=1 docker compose run --rm -v "$root/brain/out:/brain/out:ro" api \
    python -m app.brain.cli upload-bundle /brain/out/latest.json
  exit 0
fi

host="$1"
dir="${DEPLOY_DIR:-/opt/production/app-fit}"
ssh "$host" mkdir -p "$dir/brain-out"
# shellcheck disable=SC2086
(cd brain/out && scp latest.json $files "$host:$dir/brain-out/")
ssh "$host" sh -s -- "$dir" <<'REMOTE'
set -eu
cd "$1"
docker compose -f docker-compose.prod.yml run --rm -v "$1/brain-out:/brain/out:ro" api \
  python -m app.brain.cli upload-bundle /brain/out/latest.json
REMOTE
