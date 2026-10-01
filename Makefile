COMPOSE = docker compose -f docker/docker-compose.yml

.PHONY: dev test test/cache build prod clean

# Run development watcher
dev:
	$(COMPOSE) up dev

# Run test suite (fresh build)
test:
	$(COMPOSE) up --build test

# Run test suite (cached)
test/cache:
	$(COMPOSE) up test

# Build package
build:
	$(COMPOSE) up --build build

# Run production verification
prod:
	$(COMPOSE) up --build prod

# Tear down containers and remove volumes
clean:
	$(COMPOSE) down -v --remove-orphans

publish:
	pnpm publish --access public

patch: 
	pnpm version patch
	make build
	make publish