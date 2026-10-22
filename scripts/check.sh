#!/bin/sh
# Corre en local lo mismo que los workflows de .github/workflows/.
# Uso: sh scripts/check.sh [api] [web] [brain]   (sin argumentos, todas)
# Revisa el árbol de trabajo, no solo lo commiteado.
set -eu

cd "$(dirname "$0")/.."

parts="${*:-api web brain}"

for part in $parts; do
  case "$part" in
    api)
      echo "==> api: ruff, mypy y pytest (en Docker)"
      if ! docker info >/dev/null 2>&1; then
        echo "Docker no está corriendo: abrí Docker Desktop y volvé a intentar." >&2
        exit 1
      fi
      # Reconstruye la imagen si cambió uv.lock; si no, usa la caché
      docker compose build --quiet api
      # Con dependencias: los tests usan Postgres (base <nombre>_test, se recrea en cada corrida)
      docker compose run --rm api \
        sh -c "ruff check . && ruff format --check . && mypy . && pytest -q"
      ;;
    web)
      echo "==> web: eslint, prettier, tsc, vitest y build"
      (
        cd web
        [ -d node_modules ] || npm ci
        npm run -s lint
        npm run -s format:check
        npm run -s typecheck
        npm test -s
        npm run -s build
      )
      ;;
    brain)
      echo "==> brain: ruff (en Docker) y tests del bundle (Python local: necesitan git)"
      # En Git Bash, pwd -W da la ruta de Windows que entiende Docker
      root=$(pwd -W 2>/dev/null || pwd)
      MSYS_NO_PATHCONV=1 docker compose run --rm --no-deps -v "$root/brain:/brain" api \
        sh -c "ruff check --config /app/pyproject.toml /brain \
               && ruff format --check --config /app/pyproject.toml /brain"
      python=$(command -v py || command -v python3)
      "$python" -m unittest discover -s brain/tests
      ;;
    *)
      echo "Parte desconocida: $part (usá api, web o brain)" >&2
      exit 2
      ;;
  esac
done

echo "==> checks OK:$(printf ' %s' $parts)"
