# Deploy en el VPS

app-fit corre en el VPS de ExTend (`srv936263`, 31.97.94.54), junto a otros proyectos. Todo lo de app-fit va aparte, para no tocar a los demás:

- vive en `/root/app-fit`. El Docker de ese servidor es el de snap, que solo monta archivos desde `/root` o `/home`; por eso los otros proyectos también están en `/root`;
- tiene su propio compose (`app-fit`), con su Postgres, su red y su volumen;
- el backup corre en un contenedor aparte;
- la web escucha solo en `127.0.0.1:8020`, y el nginx del host le pone el HTTPS en un sitio propio;
- adelante está Cloudflare (`fit.extendsystem.com`, con proxy).

```
Internet ──https──> Cloudflare ──> nginx del host ──> 127.0.0.1:8020 ──> web (nginx + PWA) ──/api──> api ──> db
                                                                                                 backup ──┘
```

## Acceso

En tu PC, `~/.ssh/config` tiene el alias `vps-extend` (root, con la clave `~/.ssh/vps_extend`). Los scripts y el Makefile lo usan como host: `make deploy HOST=vps-extend`.

## Primera vez

Ya está hecho; queda escrito para rehacerlo en otro servidor.

1. **DNS:** un registro A de `fit` a la IP del VPS, en Cloudflare.
2. **Código:** el servidor lee el repo privado con una clave de deploy de solo lectura. La clave es `/root/.ssh/app_fit_deploy`, con el alias `github-app-fit` en `/root/.ssh/config`, y se carga en GitHub → Settings → Deploy keys, sin permiso de escritura.
   ```bash
   git clone git@github-app-fit:JuanBaez77/app-fit.git /root/app-fit
   cd /root/app-fit
   ```
3. **Variables:** copiá la plantilla y completá `POSTGRES_PASSWORD` y `JWT_SECRET`. Para el análisis del brain, también `ANTHROPIC_API_KEY`; sin ella, "Analizar" avisa que falta. Revisá que `APP_PORT` (8020) esté libre con `ss -ltn`.
   ```bash
   cp .env.prod.example .env
   openssl rand -base64 24   # POSTGRES_PASSWORD
   openssl rand -base64 48   # JWT_SECRET
   chmod 600 .env
   ```
4. **Levantar:**
   ```bash
   DOCKER_CONFIG=$(mktemp -d) docker compose -f docker-compose.prod.yml up -d --build
   curl http://127.0.0.1:8020/api/health   # {"status":"ok","db":"ok"}
   ```
   El `DOCKER_CONFIG` vacío hace que las imágenes base, que son públicas, se bajen sin los logins guardados en el servidor. Hay uno de `ghcr.io` de otro proyecto, y con ese login la imagen de `uv` responde "denied". `scripts/deploy.sh` hace lo mismo.
5. **Tu usuario** (pide la contraseña por teclado; mínimo 10 caracteres):
   ```bash
   docker compose -f docker-compose.prod.yml exec api python -m app.cli create-user tu@correo.com
   ```
6. **nginx del host y certificado:** el sitio está en [nginx/host/fit.extendsystem.com.conf](../nginx/host/fit.extendsystem.com.conf). El certificado sale por webroot, igual que en los otros sitios del servidor.
   1. **Snippet de IP real:** `/etc/nginx/snippets/app-fit-cloudflare-realip.conf`, una copia del de status-sv con los rangos de Cloudflare.
   2. **Primero solo el bloque del puerto 80.** El del 443 necesita el certificado, que todavía no existe. Copiá ese bloque a `/etc/nginx/sites-available/fit.extendsystem.com`, enlazalo en `sites-enabled` y recargá:
      ```bash
      ln -s /etc/nginx/sites-available/fit.extendsystem.com /etc/nginx/sites-enabled/
      nginx -t && systemctl reload nginx
      ```
   3. **Sacá el certificado:**
      ```bash
      certbot certonly --webroot -w /var/www/certbot -d fit.extendsystem.com
      ```
   4. **Copiá el archivo completo** y volvé a correr `nginx -t && systemctl reload nginx`.
   5. **Recarga al renovar:** para que nginx tome el certificado renovado, agregá `renew_hook = systemctl reload nginx` en `[renewalparams]` de `/etc/letsencrypt/renewal/fit.extendsystem.com.conf`.
7. **Verificar:**
   - `https://fit.extendsystem.com/api/health` responde;
   - `ls backups/` muestra el primer dump, y `sh scripts/restore-test.sh` lo restaura bien (ver el runbook);
   - en el celular, abrís el sitio, lo instalás ("Agregar a la pantalla de inicio") y entrás. **Esa es la prueba de cierre de S0.**

## Actualizaciones

Desde tu PC:

```bash
make deploy HOST=vps-extend
```

Hace `git pull` de `main` en el servidor, reconstruye las imágenes, aplica las migraciones (la api lo hace al arrancar) y espera a que `/api/health` responda. Necesita la clave de deploy cargada en GitHub (paso 2).

## Cloudflare

- **Corta a los 100 s.** Con el proxy activo, un pedido que tarda más de 100 s termina en un error 524. Lo único que tarda tanto es un análisis largo: la app avisa que se cortó, y el análisis aparece al volver a abrir la pantalla. Para que no se corte, poné `fit` en "DNS only".
- **Sus errores no cierran la sesión.** Los 52x de Cloudflare (servidor caído, sin respuesta) se tratan como falta de red, igual que los 502–504 del nginx.

## Bundle del brain

El análisis usa el último bundle que se subió. Cada vez que cambia el vault:

```bash
py brain/build_bundle.py
sh scripts/upload-bundle.sh vps-extend
```

Copia `brain/out/latest.json` y sus dos archivos a `brain-out/` en el servidor y los registra en la tabla `brain_bundle`. Sin host (`sh scripts/upload-bundle.sh`), lo registra en la base local de desarrollo.

## Backups

- El contenedor `backup` hace un `pg_dump` al arrancar y después cada 24 h, en `backups/appfit-AAAAMMDD-HHMMSS.dump`. Borra los de más de `BACKUP_KEEP_DAYS` días (14).
- Una copia que vive en el mismo VPS no te salva si se pierde el VPS. Bajalos a tu PC de vez en cuando:
  ```bash
  scp 'vps-extend:/root/app-fit/backups/*.dump' ./respaldos-app-fit/
  ```
- Probar que un backup se restaura, y restaurar de verdad: [docs/runbook.md](runbook.md).

## Si algo falla

```bash
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs --tail 100 api
docker compose -f docker-compose.prod.yml logs backup
```

Para el resto (errores de sincronización, análisis fallidos, restaurar un backup): [docs/runbook.md](runbook.md).
