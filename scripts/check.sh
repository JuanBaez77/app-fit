#!/bin/sh
# Corre en local lo mismo que los workflows de .github/workflows/.
# Uso: sh scripts/check.sh [api] [web]   (sin argumentos, las dos partes)
# Revisa el árbol de trabajo, no solo lo commiteado.
set -eu

cd "$(dirname "$0")/.."

parts="${*:-api web}"

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
      docker compose run --rm --no-deps api \
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
    *)
      echo "Parte desconocida: $part (usá api o web)" >&2
      exit 2
      ;;
  esac
done

echo "==> checks OK:$(printf ' %s' $parts)"
