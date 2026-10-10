# Music Room — one entry point for the whole stack (NFR-13).
# Requires Docker (compose v2) and Node 24 LTS (see .nvmrc) for the host-side commands.

COMPOSE := docker compose
API     := apps/api
MOBILE  := apps/mobile

.DEFAULT_GOAL := help
.PHONY: help env check-node install up down logs ps test test-unit test-e2e db-migrate db-up lint build mobile mobile-go

help: ## List the targets
	@grep -E '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  make %-12s %s\n", $$1, $$2}'

env: ## Create .env from .env.example if it doesn't exist
	@test -f .env || (cp .env.example .env && echo "Created .env from .env.example")

check-node:
	@node -e 'const [M,m]=process.versions.node.split(".").map(Number); if(!(M===24||M>24||(M===22&&m>=12)||(M===20&&m>=19))){console.error("Node "+process.versions.node+" is not supported by Prisma 7. Use Node 24 (see .nvmrc), e.g. nvm use / fnm use."); process.exit(1)}'

install: env check-node ## Install API and mobile dependencies
	cd $(API) && npm ci && npx prisma generate
	cd $(MOBILE) && npm ci

up: env ## Build and start api, postgres and mailpit (API on :3000, Mailpit UI on :8025)
	$(COMPOSE) up -d --build --wait
	@echo "API:     http://localhost:$${API_PORT:-3000}/health  (docs: /docs)"
	@echo "Mailpit: http://localhost:8025"

down: ## Stop the stack (keeps the database volume)
	$(COMPOSE) down

logs: ## Follow the API logs
	$(COMPOSE) logs -f api

ps: ## Show the stack status
	$(COMPOSE) ps

db-up: env
	$(COMPOSE) up -d --wait postgres mailpit

db-migrate: db-up check-node ## Apply migrations to the local database (dev: creates new ones from schema changes)
	cd $(API) && npx prisma migrate dev

test: test-unit test-e2e ## Run all API tests (Postgres from compose)

test-unit: check-node
	cd $(API) && npm test

test-e2e: db-up check-node ## API e2e tests against the musicroom_test database
	cd $(API) && npm run test:e2e

lint: check-node ## Lint + type-check API and mobile
	cd $(API) && npm run lint && npm run build
	cd $(MOBILE) && npx tsc --noEmit

mobile: ## Build and run the Android dev build on the emulator/device
	cd $(MOBILE) && npx expo run:android

mobile-go: ## Serve the app to Expo Go on a phone on the same Wi-Fi (scan the QR code with Expo Go)
	cd $(MOBILE) && npx expo start --go
