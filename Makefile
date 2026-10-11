# Music Room — one entry point for the whole stack (NFR-13).
# Requires Docker (compose v2) and Node 24 LTS (see .nvmrc) for the host-side commands.

COMPOSE := docker compose
API     := apps/api
MOBILE  := apps/mobile

.DEFAULT_GOAL := help
.PHONY: help env check-node install up down logs ps test test-unit test-e2e test-mobile db-migrate db-up lint build mobile mobile-go loadtest hooks secrets

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

test: test-unit test-e2e test-mobile ## Run all tests: API unit + e2e (Postgres from compose), mobile jest

test-unit: check-node
	cd $(API) && npm test

test-e2e: db-up check-node ## API e2e tests against the musicroom_test database
	cd $(API) && npm run test:e2e

test-mobile: ## Mobile unit + smoke tests (jest-expo)
	cd $(MOBILE) && npx jest

lint: check-node ## Lint + type-check API and mobile
	cd $(API) && npm run lint && npm run build
	cd $(MOBILE) && npx tsc --noEmit && npx expo lint

mobile: ## Build and run the Android dev build on the emulator/device
	cd $(MOBILE) && npx expo run:android

mobile-go: ## Serve the app to Expo Go on a phone on the same Wi-Fi (scan the QR code with Expo Go)
	cd $(MOBILE) && npx expo start --go

# --- Load test (NFR-11, NFR-12) ------------------------------------------------------------------
# Restarts the API with raised rate limits (docker-compose.loadtest.yml, env only), runs k6, then
# restarts it with the normal limits. Uses a local k6 if installed, otherwise the grafana/k6 image.
# STAGES / STAGE_SECONDS / LOGIN_RATE can be overridden: make loadtest STAGES=50,100 STAGE_SECONDS=30
LOADTEST_COMPOSE := $(COMPOSE) -f docker-compose.yml -f docker-compose.loadtest.yml
K6_IMAGE         := grafana/k6:1.0.0
STAGES           ?= 25,50,100,150,200,300
STAGE_SECONDS    ?= 60
LOGIN_RATE       ?= 4
K6_ENV            = -e STAGES=$(STAGES) -e STAGE_SECONDS=$(STAGE_SECONDS) -e LOGIN_RATE=$(LOGIN_RATE) \
                    $(if $(SHARED_EVENTS),-e SHARED_EVENTS=$(SHARED_EVENTS)) \
                    $(if $(SHARED_PLAYLISTS),-e SHARED_PLAYLISTS=$(SHARED_PLAYLISTS)) \
                    $(if $(VERBOSE),-e VERBOSE=$(VERBOSE))

loadtest: env ## Run the k6 load test against the compose stack (writes loadtest/results/*.json)
	@mkdir -p loadtest/results
	@restore() { \
	  echo "Restoring the normal rate limits..."; \
	  $(COMPOSE) up -d --wait api || { echo "ERROR: could not restore the normal rate limits; the API may still run with the load-test limits. Run 'make up'." >&2; return 1; }; \
	}; \
	trap 'status=$$?; trap - EXIT INT TERM; restore || status=1; exit $$status' EXIT; \
	trap 'exit 130' INT TERM; \
	marker=$$(mktemp); \
	$(LOADTEST_COMPOSE) up -d --build --wait || exit $$?; \
	status=0; \
	if command -v k6 >/dev/null 2>&1; then \
	  k6 run $(K6_ENV) -e API_URL=http://localhost:$${API_PORT:-3000} -e MAILPIT_URL=http://localhost:8025 loadtest/music-room.js || status=$$?; \
	else \
	  docker run --rm --network music-room_default -v "$(CURDIR)/loadtest:/loadtest" -w / $(K6_IMAGE) run $(K6_ENV) \
	    -e API_URL=http://api:3000 -e MAILPIT_URL=http://mailpit:8025 -e RESULTS_DIR=/loadtest/results /loadtest/music-room.js || status=$$?; \
	fi; \
	if [ $$status -eq 99 ]; then \
	  latest=$$(find loadtest/results -name 'stages-*.json' -newer "$$marker" | sort | tail -1); \
	  max=$$( [ -n "$$latest" ] && sed -n 's/.*"maxSimultaneousUsers": *\([0-9]*\).*/\1/p' "$$latest"); \
	  if [ -z "$$max" ] || [ "$$max" -eq 0 ]; then \
	    echo "ERROR: no stage met the thresholds (max simultaneous users: $${max:-unknown}); see $${latest:-the k6 output}." >&2; status=1; \
	  else \
	    echo "Some stages crossed the thresholds (expected at the top stages: that is the ceiling). Max simultaneous users: $$max."; status=0; \
	  fi; \
	fi; \
	rm -f "$$marker"; \
	exit $$status

# --- Secret scanning (NFR-8) ---------------------------------------------------------------------
hooks: ## Enable the git hooks in .githooks (gitleaks pre-commit)
	git config core.hooksPath .githooks
	@command -v gitleaks >/dev/null 2>&1 || echo "Install gitleaks for the pre-commit check: brew install gitleaks (see README)"

secrets: ## Scan the whole git history for secrets with gitleaks
	gitleaks git --no-banner --redact .
