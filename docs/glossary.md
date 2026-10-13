# Glossary

- **App** — the application built from a service project's Dockerfile. See [service and mesh model](concepts/service-and-mesh-model.md).
- **App endpoint** — a named app port contract in `build.json`. See [endpoints](concepts/endpoints.md).
- **AUTO** — request for Builder to choose an available host port. See [publication](concepts/publication-and-ports.md).
- **Binding / dependency binding** — mapping a consumer's logical dependency to a mesh provider. See [substitution](concepts/dependency-substitution.md).
- **Builder reference** — `${...}` endpoint expression in Builder-managed JSON environment. See [endpoint references](concepts/endpoint-references.md).
- **Composition** — a runnable service, dependency bundle, or mesh of service projects.
- **Configuration overlay / stage overlay** — stage-specific values merged over base JSON configuration. See [stages](concepts/stages.md).
- **Dependency endpoint** — a named endpoint whose owner is explicitly selected from a dependency Compose file.
- **Effective configuration** — base values after the active overlay is applied.
- **Effective publication** — a publishable endpoint actually exposed to the host in the current composition.
- **E2E** — finite end-to-end tests that use host-accessible endpoints.
- **Endpoint** — named network/port metadata used for connectivity without relying on generated container names.
- **Endpoint owner** — the exact Compose service named by a dependency endpoint's `service` field.
- **Host publication** — mapping a container port to a host address and port.
- **Integrated** — execution where endpoint-bearing local dependency implementations are materialized.
- **Isolated** — execution where local dependency implementations are not materialized.
- **Local dependency implementation** — a dependency's atomic Compose implementation.
- **Logical dependency** — a named dependency slot declared by a service, independent of its implementation/provider.
- **Mesh** — composition of independent service projects under one `mesh.json`.
- **Mesh service** — one service project entry in the effective mesh.
- **Primary endpoint** — the single canonical endpoint in a non-empty endpoint map; the app primary supplies `PORT`.
- **Provider** — a top-level mesh service replacing a consumer's logical dependency.
- **Public endpoint property** — one of `public_host`, `public_port`, `public_address`, or `public_url`; available only when published.
- **Publishable endpoint** — endpoint with `publicPort` configured.
- **Published endpoint** — endpoint effectively exposed to the host.
- **Service project** — directory containing one service's `build.json`.
- **Service-level E2E** — one app with its local dependencies and its `test-e2e` runner.
- **Stage** — a configuration overlay: `dev`, `prod`, `test`, or `e2e` in `build.json`, and `dev`, `prod`, or `e2e` in `mesh.json`. The mesh `test` command is a pipeline; service CLI also supports `test-unit`, and both CLIs support `test-e2e`.
- **Tester** — finite host-side E2E client configured by service tester env or root mesh tester.

## Related

- [Service and mesh model](concepts/service-and-mesh-model.md)
- [Stages](concepts/stages.md)
- [Endpoint properties](reference/endpoint-properties.md)
