# La API corre sus herramientas dentro del contenedor (Python 3.12); la web, con el Node local.
COMPOSE := docker compose
API := $(COMPOSE) run --rm --no-deps api
API_DB := $(COMPOSE) run --rm api

.DEFAULT_GOAL := help
.PHONY: help up down logs ps migrate dev-user deploy web web-build \
        check lint lint-api lint-web test test-api test-web fmt fmt-api fmt-web

help: ## Lista los comandos
	@grep -E '^[a-z-]+:.*## ' $(MAKEFILE_LIST) | awk -F':.*## ' '{printf "  %-10s %s\n", $$1, $$2}'

up: ## Levanta db, api y nginx
	$(COMPOSE) up -d --build

down: ## Baja los servicios (la base queda en su volumen)
	$(COMPOSE) down

logs: ## Sigue los logs de todos los servicios
	$(COMPOSE) logs -f

ps: ## Estado de los servicios
	$(COMPOSE) ps

dev-user: ## Crea el usuario de desarrollo de .env.example en la base local
	$(COMPOSE) exec -e APPFIT_PASSWORD=$${DEV_USER_PASSWORD:-contrasena-dev-123} api \
		python -m app.cli create-user $${DEV_USER_EMAIL:-dev@example.com}

migrate: ## Aplica las migraciones (la api también las aplica al arrancar)
	$(API_DB) alembic upgrade head

deploy: ## Despliega main en el VPS: make deploy HOST=sv-gcg (ver docs/deploy.md)
	sh scripts/deploy.sh $(HOST)

web: ## Vite con recarga en caliente en http://localhost:5173
	cd web && npm run dev

web-build: ## Build de la PWA, que nginx sirve en http://localhost:8080
	cd web && npm run build

check: ## Lo mismo que el hook pre-push: lint, formato, tipos, tests y build
	sh scripts/check.sh

lint: lint-api lint-web ## Lint, formato y tipos de api y web

lint-api:
	$(API) sh -c "ruff check . && ruff format --check . && mypy ."

lint-web:
	cd web && npm run lint && npm run format:check && npm run typecheck

test: test-api test-web ## Tests de api y web

test-api:
	$(API_DB) pytest

test-web:
	cd web && npm test

fmt: fmt-api fmt-web ## Formatea y corrige lo automático

fmt-api:
	$(API) sh -c "ruff format . && ruff check --fix ."

fmt-web:
	cd web && npm run format
