# Deploy en el VPS

Sigue el mismo esquema que tus otros proyectos en `sv-gcg` (`bot-ypf`, `gcg-alertas`):

- vive en `/opt/production/app-fit`;
- tiene su propio contenedor de Postgres;
- el backup corre en un contenedor aparte;
- la web escucha solo en `127.0.0.1`, y el nginx del host le pone el HTTPS.

```
Internet ──https──> nginx del host ──> 127.0.0.1:8020 ──> web (nginx + PWA) ──/api──> api ──> db
                                                                                      backup ──┘
```

## Primera vez

1. **DNS:** un registro A del subdominio (por ejemplo `fit.tudominio.com`) a la IP del VPS.
2. **Código:** el servidor necesita leer el repo privado (la misma clave de deploy que usás para los otros, o una nueva de solo lectura).
   ```bash
   sudo git clone git@github.com:JuanBaez77/app-fit.git /opt/production/app-fit
   cd /opt/production/app-fit
   ```
3. **Variables:** copiá la plantilla y completá `POSTGRES_PASSWORD` y `JWT_SECRET`, y `ANTHROPIC_API_KEY` para el análisis del brain (sin ella, "Analizar" avisa que falta). Revisá que `APP_PORT` (8020) esté libre con `ss -ltn`.
   ```bash
   cp .env.prod.example .env
   openssl rand -base64 24   # POSTGRES_PASSWORD
   openssl rand -base64 48   # JWT_SECRET
   chmod 600 .env
   ```
4. **Levantar:**
   ```bash
   docker compose -f docker-compose.prod.yml up -d --build
   curl http://127.0.0.1:8020/api/health   # {"status":"ok","db":"ok"}
   ```
5. **Tu usuario** (pide la contraseña por teclado; mínimo 10 caracteres):
   ```bash
   docker compose -f docker-compose.prod.yml exec api python -m app.cli create-user tu@correo.com
   ```
6. **nginx del host:** un sitio en `/etc/nginx/sites-available/app-fit`, enlazado en `sites-enabled`:
   ```nginx
   server {
       listen 80;
       server_name fit.tudominio.com;

       location / {
           proxy_pass http://127.0.0.1:8020;
           proxy_set_header Host $host;
           proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
           proxy_set_header X-Forwarded-Proto $scheme;
           # El análisis del brain (PR-27) puede tardar
           proxy_read_timeout 300s;
       }
   }
   ```
   ```bash
   sudo nginx -t && sudo systemctl reload nginx
   sudo certbot --nginx -d fit.tudominio.com
   ```
   Después de certbot, agregá `add_header Strict-Transport-Security "max-age=31536000" always;` en el bloque `server` del 443.
7. **Verificar:**
   - `https://fit.tudominio.com/api/health` responde;
   - `ls backups/` muestra el primer dump;
   - en el celular, abrís el sitio, lo instalás ("Agregar a la pantalla de inicio") y entrás. **Esa es la prueba de cierre de S0.**

## Actualizaciones

Desde tu PC, con el alias SSH del servidor:

```bash
sh scripts/deploy.sh sv-gcg
```

Hace `git pull` de `main` en el servidor, reconstruye las imágenes, aplica las migraciones (la api lo hace al arrancar) y espera a que `/api/health` responda.

## Bundle del brain

El análisis usa el último bundle que se subió. Cada vez que cambia el vault:

```bash
py brain/build_bundle.py
sh scripts/upload-bundle.sh sv-gcg
```

Copia `brain/out/latest.json` y sus dos archivos a `brain-out/` en el servidor y los registra en la tabla `brain_bundle`. Sin host (`sh scripts/upload-bundle.sh`), lo registra en la base local de desarrollo.

## Backups

- El contenedor `backup` hace un `pg_dump` al arrancar y después cada 24 h, en `backups/appfit-AAAAMMDD-HHMMSS.dump`. Borra los de más de `BACKUP_KEEP_DAYS` días (14).
- Una copia que vive en el mismo VPS no te salva si se pierde el VPS. Bajalos a tu PC de vez en cuando:
  ```bash
  scp 'sv-gcg:/opt/production/app-fit/backups/*.dump' ./respaldos-app-fit/
  ```
- Restaurar: [docs/runbook.md](runbook.md) (llega con PR-32).

## Si algo falla

```bash
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs --tail 100 api
docker compose -f docker-compose.prod.yml logs backup
```
