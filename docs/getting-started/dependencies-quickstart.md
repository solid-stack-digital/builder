# Add a local dependency

Starting from a service project, add a Compose file `dependencies/redis.yml`:

```yaml
services:
  redis:
    image: redis:7-alpine
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
```

Declare the logical contract in `build.json`:

```json
{
  "app": {
    "env": { "REDIS_HOST": "${dependencies.redis.endpoints.redis.network_host}", "REDIS_PORT": "${dependencies.redis.endpoints.redis.network_port}" },
    "endpoints": { "http": { "port": 3000, "publicPort": "AUTO", "primary": true, "scheme": "http" } }
  },
  "dependencies": {
    "redis": {
      "compose": "dependencies/redis.yml",
      "endpoints": { "redis": { "service": "redis", "port": 6379, "primary": true, "scheme": "redis" } }
    }
  }
}
```

The endpoint's `service` names its exact Compose owner. It is never inferred. The owner needs a valid healthcheck. Compare isolated development with integrated development:

```bash
builder service up dev
builder service up dev --full
```

Ordinary dev does not materialize local dependencies; `--full` integrates the effective endpoint-bearing dependency implementations. A dependency with no endpoints stays inert. If its Compose file has multiple services, all are materialized together as one atomic implementation. See [local dependencies](../concepts/local-dependencies.md) and the [Compose contract](../reference/dependency-compose-contract.md).

## Related

- [Service quickstart](service-quickstart.md)
- [Run with local dependencies](../guides/run-with-local-dependencies.md)
- [Dependency Compose contract](../reference/dependency-compose-contract.md)
