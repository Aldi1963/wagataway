.PHONY: dev build run clean migrate frontend

# Go backend
dev:
	GIN_MODE=debug go run ./cmd/server

build:
	CGO_ENABLED=0 go build -ldflags="-s -w" -o ./bin/server ./cmd/server

run: build
	./bin/server

clean:
	rm -rf ./bin

# Frontend
frontend-install:
	cd web && pnpm install

frontend-dev:
	cd web && pnpm dev

frontend-build:
	cd web && pnpm build

# Docker
docker-build:
	docker build -t wagataway .

docker-up:
	docker compose up -d

docker-down:
	docker compose down

# Production (VPS) — lihat deploy/DEPLOY.md
PROD_COMPOSE = docker compose -f deploy/docker-compose.prod.yml --env-file deploy/.env

prod-up:
	$(PROD_COMPOSE) up -d --build

prod-down:
	$(PROD_COMPOSE) down

prod-logs:
	$(PROD_COMPOSE) logs -f app

prod-restart:
	$(PROD_COMPOSE) restart app

prod-update:
	git pull
	$(PROD_COMPOSE) up -d --build
