# Startup order and readiness

Builder creates health-gated readiness edges for the relationships it owns:

1. In integrated service execution, the app waits for every distinct local dependency endpoint-owner service to become healthy.
2. A dependency's `dependsOn` orders one logical dependency after another using entries such as `dependencies.redis`.
3. Mesh `services.<name>.dependsOn` creates top-level service readiness ordering. A dependency binding also creates consumer-to-provider readiness automatically.

Readiness uses `service_healthy`, not merely “container started.” App `dev` and `prod` Dockerfile targets need valid healthchecks. Dependency endpoint owners need valid Compose healthchecks. Finite `test` and `test-e2e` targets do not require healthchecks.

Every `depends_on` edge in generated Compose is health-gated, including edges written in dependency and tester Compose files. Any helper named as a `depends_on` target therefore needs a working healthcheck; a finite one-shot helper cannot serve as a health-gated target.

Missing targets, self-dependencies, and lifecycle cycles fail. Endpoint references and environment values do not imply ordering: if an app references a Redis host, declare the lifecycle relationship through the dependency contract rather than relying on env resolution to start Redis.

## Related

- [Local dependencies](local-dependencies.md)
- [Dependency readiness recipe](../recipes/dependency-to-dependency-readiness.md)
- [Dockerfile contract](../reference/dockerfile-contract.md)
