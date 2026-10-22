FROM python:3.12-slim AS base

COPY --from=ghcr.io/astral-sh/uv:0.13.5 /uv /uvx /bin/

# El entorno vive fuera de /app para que el bind mount de desarrollo no lo tape
ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PROJECT_ENVIRONMENT=/opt/venv \
    PATH="/opt/venv/bin:$PATH" \
    PYTHONUNBUFFERED=1

WORKDIR /app
COPY pyproject.toml uv.lock ./

# Desarrollo: dependencias de dev (ruff, mypy, pytest) y recarga en caliente
FROM base AS dev
RUN uv sync --frozen
COPY . .
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload", "--root-path", "/api"]

# Producción: sin dependencias de dev, usuario sin privilegios, gunicorn con workers uvicorn
FROM base AS prod
RUN uv sync --frozen --no-dev \
    && useradd --system --uid 10001 --no-create-home appfit
COPY alembic.ini ./
COPY migrations ./migrations
COPY seeds ./seeds
COPY app ./app
USER appfit
EXPOSE 8000
# Detrás de nginx: confía en X-Forwarded-For (la red de compose no se publica)
CMD ["sh", "-c", "alembic upgrade head && exec gunicorn app.main:app \
     --worker-class uvicorn_worker.UvicornWorker --workers ${WEB_WORKERS:-2} \
     --bind 0.0.0.0:8000 --forwarded-allow-ips '*' --access-logfile -"]
