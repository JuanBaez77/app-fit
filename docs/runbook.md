# Runbook

Qué hacer cuando algo falla en producción, y cómo probar que los backups sirven. Los comandos
corren en el VPS, dentro de `/root/app-fit`, salvo que diga "en tu PC". Para no
repetir `-f docker-compose.prod.yml`:

```bash
ssh vps-extend
cd /root/app-fit
alias dc='docker compose -f docker-compose.prod.yml'
```

## Estado

```bash
dc ps                                   # los cuatro servicios: db, api, web (nginx) y backup
curl -s https://fit.extendsystem.com/api/health
dc logs --tail 100 api
```

- **La API no arranca:** mirá `dc logs api`. Corre `alembic upgrade head` antes de gunicorn: una migración que falla se ve ahí.
- **El celular dice "Sin conexión" con red:** si `/api/health` no responde, el problema es la API o el nginx del host. Si responde, es la red del celular. Mientras tanto, lo que registres queda en el celular y sube solo cuando vuelve.

## Errores de sincronización

Cuando la API rechaza una fila del celular, esa fila sale de la cola y queda solo en el celular. No se pierde, pero tampoco sube, y la API deja un renglón en el log:

```bash
dc logs --since 168h api 2>&1 | grep "sync rechazó"
```

Cada renglón dice la tabla, el id de la fila, el usuario y el motivo. Una vez corregida la causa, editar la fila en la app (cualquier cambio) la vuelve a poner en la cola.

| Motivo | Qué pasó | Qué hacer |
| --- | --- | --- |
| La fila es de otro usuario | Dos cuentas en el mismo celular, o un id repetido | Revisar con qué cuenta entraste |
| La sesión no existe o es de otro usuario | La serie llegó sin su sesión, o la sesión es de otra cuenta | Revisar la cuenta; si es la tuya, editar la serie |
| El ejercicio no existe o es de otro usuario | La serie usa un ejercicio que no está en la API | Abrir la app con red para que suba el ejercicio, y editar la serie |
| La rutina o el día no son del usuario; El ejercicio de la rutina no es del usuario | La sesión apunta a una rutina de otra cuenta | Revisar con qué cuenta entraste |
| Músculos desconocidos: … | Un ejercicio con un músculo que la API no tiene | Editar los músculos del ejercicio en la app |

En el celular, la consola del navegador muestra los mismos rechazos ("La API rechazó…").

## Análisis del brain

- **"Falta configurar ANTHROPIC_API_KEY":** completá `ANTHROPIC_API_KEY` en `.env` y reiniciá la API con `dc up -d api`.
- **"Falta subir el bundle":** en tu PC, corré `py brain/build_bundle.py` y después `make upload-bundle HOST=vps-extend`.
- **Un análisis falló:** queda guardado con el motivo; la pantalla lo muestra y se puede pedir otro. Para ver los últimos:
  ```bash
  dc exec db psql -U appfit -c "SELECT created_at, error FROM analysis WHERE status = 'fallido' ORDER BY created_at DESC LIMIT 5"
  ```
- **Cuánto gastó cada uno:** se guardan los tokens de cada análisis.
  ```bash
  dc exec db psql -U appfit -c "SELECT created_at::date, model, input_tokens, output_tokens, cache_read_tokens FROM analysis ORDER BY created_at DESC LIMIT 10"
  ```
- **Tarda y se corta:** el servidor espera hasta 300 s (nginx del host, nginx del contenedor y gunicorn), pero con el proxy de Cloudflare activo el pedido se corta a los 100 s. En los dos casos el análisis sigue en el servidor y aparece al volver a abrir Análisis. Para que no se corte, poné `fit` en "DNS only" en Cloudflare.

## Tiempo por serie

La meta del MVP es una mediana de 5 s o menos. Desde tu PC:

```bash
make interaction HOST=vps-extend
```

Muestra una fila por semana con la mediana, el p90 y el % de series registradas en 5 s o menos.

## Backups

- El contenedor `backup` hace un `pg_dump` al arrancar y después cada 24 h, en `backups/appfit-AAAAMMDD-HHMMSS.dump`. Guarda 14 días.
- Bajá copias a tu PC de vez en cuando; una copia en el mismo VPS no sirve si se pierde el VPS. En tu PC:
  ```bash
  scp 'vps-extend:/root/app-fit/backups/*.dump' ./respaldos-app-fit/
  ```

### Probar que un backup se restaura

Una vez por mes, y después de cambiar la versión de Postgres:

```bash
COMPOSE="docker compose -f docker-compose.prod.yml" sh scripts/restore-test.sh backups/appfit-AAAAMMDD-HHMMSS.dump
```

- **Qué hace:** restaura el backup en una base aparte (`appfit_restore_test`), compara las filas de cada tabla con la base de verdad y la borra al final. No toca la base de la app.
- **Cómo leer el resultado:**
  - "la base tiene filas posteriores al backup" es normal: es lo que registraste después;
  - "la base tiene menos filas que el backup" merece una mirada;
  - **DISTINTO**, o un error de `pg_restore`, quiere decir que el backup no sirve.
- **Sin archivo** (`sh scripts/restore-test.sh`), hace un dump nuevo y exige que todo coincida.
- **En tu PC** prueba lo mismo con la base de desarrollo, y también con un backup bajado del VPS.

### Restaurar de verdad

Solo si se perdió o se dañó la base.

1. **Guardá la base actual,** aunque esté dañada:
   ```bash
   dc exec -T db pg_dump -U appfit --format=custom appfit > antes-de-restaurar.dump
   ```
2. **Pará la API y los backups,** para que nadie escriba mientras restaurás:
   ```bash
   dc stop api backup
   ```
3. **Restaurá el backup elegido sobre la base:**
   ```bash
   dc exec -T db sh -c 'cat > /tmp/restore.dump' < backups/appfit-AAAAMMDD-HHMMSS.dump
   dc exec -T db pg_restore -U appfit -d appfit --clean --if-exists --no-owner /tmp/restore.dump
   dc exec -T db rm /tmp/restore.dump
   ```
4. **Levantá todo:** `dc up -d`. La API corre las migraciones al arrancar, así que un backup de una versión anterior del esquema se pone al día solo.
5. **Comprobá:** `/api/health`, entrar desde el celular y que sincronice.

**Lo que se pierde:** lo que el celular subió después del backup queda solo en el celular; no se vuelve a subir solo, porque ya salió de su cola. Lo que todavía no había subido sí sube al reconectar.

## Usuario

```bash
dc exec api python -m app.cli set-password tu@correo.com   # cambiar la contraseña
dc exec api python -m app.cli create-user tu@correo.com    # crear otro usuario
```
