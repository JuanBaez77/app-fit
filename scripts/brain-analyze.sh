#!/bin/sh
# Corre un caso de prueba del prompt del brain contra la API (T3.2).
# Uso: sh scripts/brain-analyze.sh 1-datos-normales.json [--count-only] [--model ...] [--effort ...]
# Necesita el bundle (py brain/build_bundle.py) y ANTHROPIC_API_KEY en el entorno.
set -eu

cd "$(dirname "$0")/.."
case_file="${1:?Uso: sh scripts/brain-analyze.sh CASO.json [opciones]}"
shift

if [ ! -f brain/out/latest.json ]; then
  echo "Falta el bundle: corré py brain/build_bundle.py" >&2
  exit 1
fi

# En Git Bash, pwd -W da la ruta de Windows que entiende Docker
root=$(pwd -W 2>/dev/null || pwd)
MSYS_NO_PATHCONV=1 docker compose run --rm --no-deps \
  -v "$root/brain:/brain" -e ANTHROPIC_API_KEY -e BRAIN_MODEL \
  api python -m app.brain.cli analyze "/brain/cases/$(basename "$case_file")" \
  --bundle /brain/out/latest.json --out /brain/cases/resultados "$@"
