# app-fit

PWA mobile-first y offline-first para registrar el entrenamiento en el gimnasio, conectada al brain de hipertrofia. Uso personal.

- Diseño: [docs/diseno-resumen.md](docs/diseno-resumen.md) y [docs/diseno-completo.md](docs/diseno-completo.md)
- Plan de sprints y PRs: [docs/sprints.md](docs/sprints.md)
- Deploy en el VPS: [docs/deploy.md](docs/deploy.md)

## Estructura

| Carpeta | Qué hay |
| --- | --- |
| `api/` | FastAPI (Python 3.12, uv). Corre en Docker |
| `web/` | PWA con React, Vite y TypeScript (Node 22) |
| `brain/` | Scripts que corren en tu PC contra el vault del brain |
| `nginx/` | Configuración de nginx |
| `docs/` | Diseño y plan |

## Requisitos

- Docker Desktop
- Node 22 (`web/.nvmrc`)
- GNU make. En Windows: `winget install ezwinports.make`, y usalo desde Git Bash

No hace falta Python local: lint y tests de la API corren dentro del contenedor.

## Uso

Una vez por clon, activá el hook pre-push:

```bash
git config core.hooksPath .githooks
```

```bash
make up          # db, api y nginx
make web         # Vite con recarga en caliente: http://localhost:5173
make check       # lint, formato, tipos y tests de api y web
make help        # todos los comandos
```

| URL | Qué es |
| --- | --- |
| http://localhost:5173 | Vite (desarrollo). `/api` va al contenedor de la API |
| http://localhost:8000/health | API directo |
| http://localhost:8080 | nginx sirviendo el build (`make web-build`), como en producción |

Para cambiar usuarios, contraseñas o puertos, copiá `.env.example` a `.env`.

## Checks antes de pushear

El hook [`.githooks/pre-push`](.githooks/pre-push) corre [`scripts/check.sh`](scripts/check.sh) solo para la parte que cambió (`api/` o `web/`) y frena el push si algo falla. Revisa lint, formato, tipos, tests y el build de la web. La API se chequea en Docker, así que Docker Desktop tiene que estar abierto. No depende de make.

```bash
sh scripts/check.sh          # todo, a mano
sh scripts/check.sh web      # solo una parte
git push --no-verify         # saltear el hook en una emergencia
```

Los workflows de GitHub Actions (`.github/workflows/`) corren lo mismo, pero están **desactivados** porque los minutos son pagos. Para volver a usarlos:

```bash
gh workflow enable api
gh workflow enable web
```
