#!/bin/sh
# Prueba que un backup se puede restaurar: lo carga en una base aparte y compara las filas de
# cada tabla con la base de verdad. No toca la base de la app.
#
# Uso: sh scripts/restore-test.sh                  hace un dump nuevo y lo compara exacto
#      sh scripts/restore-test.sh <archivo.dump>   restaura ese backup (ej. backups/appfit-...dump)
#
# En el VPS: COMPOSE="docker compose -f docker-compose.prod.yml" sh scripts/restore-test.sh <dump>
# Con un backup viejo, la base de verdad puede tener filas nuevas: ahí avisa, no falla.
set -eu

cd "$(dirname "$0")/.."
# En Git Bash, que no convierta /tmp/... en una ruta de Windows al pasarla al contenedor
export MSYS_NO_PATHCONV=1
compose=${COMPOSE:-docker compose}
user=${POSTGRES_USER:-appfit}
db=${POSTGRES_DB:-appfit}
test_db="${db}_restore_test"
dump=/tmp/restore-test.dump

psql() {
  # shellcheck disable=SC2086
  $compose exec -T -e PGOPTIONS=--client-min-messages=warning db \
    psql -U "$user" -v ON_ERROR_STOP=1 -q "$@"
}

# Filas por tabla: "tabla filas", una por renglón
counts() {
  psql -d "$1" -tA -F ' ' -c "
    SELECT table_name,
           (xpath('/row/c/text()',
                  query_to_xml(format('SELECT count(*) AS c FROM %I', table_name), false, true, '')
           ))[1]::text
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    ORDER BY table_name"
}

cleanup() {
  psql -d postgres -c "DROP DATABASE IF EXISTS \"$test_db\"" >/dev/null 2>&1 || true
  # shellcheck disable=SC2086
  $compose exec -T db rm -f "$dump" >/dev/null 2>&1 || true
}
trap cleanup EXIT

if [ -n "${1:-}" ]; then
  [ -f "$1" ] || { echo "No existe $1" >&2; exit 1; }
  echo "==> Copiando $1 al contenedor de la base"
  # shellcheck disable=SC2086
  $compose exec -T db sh -c "cat > $dump" < "$1"
  exact=false
else
  echo "==> Dump nuevo de $db"
  # shellcheck disable=SC2086
  $compose exec -T db pg_dump -U "$user" --format=custom --file="$dump" "$db"
  exact=true
fi

echo "==> Restaurando en $test_db"
psql -d postgres -c "DROP DATABASE IF EXISTS \"$test_db\"" >/dev/null
psql -d postgres -c "CREATE DATABASE \"$test_db\"" >/dev/null
# shellcheck disable=SC2086
$compose exec -T db pg_restore -U "$user" --no-owner --exit-on-error -d "$test_db" "$dump"

echo "==> Filas por tabla (restaurada / de verdad)"
restored=$(counts "$test_db")
live=$(counts "$db")
[ -n "$restored" ] || { echo "La restauración no trajo tablas" >&2; exit 1; }

report=$(echo "$restored" | while read -r table rows; do
  current=$(echo "$live" | awk -v t="$table" '$1 == t { print $2 }')
  if [ "$rows" = "$current" ]; then
    mark="ok"
  elif [ "$exact" = true ] || [ -z "$current" ]; then
    mark="DISTINTO"
  elif [ "$rows" -lt "$current" ]; then
    mark="la base tiene filas posteriores al backup"
  else
    # Los tokens de sesión vencidos se limpian: puede pasar, pero conviene mirarlo
    mark="la base tiene menos filas que el backup: revisar"
  fi
  printf '%-28s %8s %8s  %s\n' "$table" "$rows" "${current:-falta}" "$mark"
done)
echo "$report"

if echo "$report" | grep -q "DISTINTO"; then
  echo "==> FALLÓ: la restauración no coincide" >&2
  exit 1
fi
echo "==> Restauración OK"
