# Run with local dependencies

Use `builder service up dev --full` to integrate declared endpoint-bearing local dependency implementations. Ordinary `builder service up dev` stays isolated. Production and service E2E integrate local dependencies by default.

An example dependency can contain Redis plus an initialization helper; when materialized, the complete Compose file is included. Declare endpoint owners explicitly and add healthchecks to every distinct endpoint owner. Builder gates the app on those healthchecks. A dependency with no effective endpoints is inert and is not run.

Use references such as `${dependencies.redis.endpoints.redis.network_address}` for internal connectivity. That value does not create readiness; dependency lifecycle belongs in `dependsOn`. A dependency endpoint with `publicPort` is host-published in standalone integrated execution; in a mesh it also needs a `publish` selection.

```bash
builder service up dev --full
builder service down dev
```

## Related

- [Local dependencies](../concepts/local-dependencies.md)
- [Dependency readiness](../concepts/lifecycle-and-readiness.md)
- [Dependency Compose contract](../reference/dependency-compose-contract.md)
