# Use local dependency implementations

A logical dependency is a contract, not a single Compose service. It points to one Compose file that can contain several services and resources. The entire file is one atomic local dependency implementation when materialized.

Each dependency endpoint names the exact Compose service that owns it using `service`. A non-empty endpoint map needs exactly one primary. Every distinct endpoint-owning service needs a valid enabled Compose healthcheck. Services that own no endpoint do not gain a Builder endpoint-health requirement.

A dependency with no effective endpoints is inert: it is not materialized. When integrated, every service and required resource in its Compose implementation comes along. Module-level dependency env applies across the implementation. App readiness automatically waits for endpoint owners; dependency-to-dependency ordering uses `dependsOn`. An env reference alone never creates a readiness edge.

| Service command | Local dependencies |
|---|---|
| `service up dev` | Isolated; not materialized |
| `service up dev --full` | Integrated |
| `service up prod` | Integrated |
| `service up test-unit` | Isolated |
| `service up test-e2e` | Integrated |

In a mesh, a binding suppresses the local implementation atomically and routes the logical dependency through the provider. See [dependency substitution](dependency-substitution.md) and the [Compose contract](../reference/dependency-compose-contract.md).

## Related

- [Dependencies quickstart](../getting-started/dependencies-quickstart.md)
- [Run with local dependencies](../guides/run-with-local-dependencies.md)
- [Dependency Compose contract](../reference/dependency-compose-contract.md)
