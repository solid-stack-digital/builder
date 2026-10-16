# Builder V3 documentation

Builder 3.1.0 uses explicit service graphs and supports first-class main-service Docker build arguments. A `build.json` names a standalone main, a tester, and optional ordinary Compose modules. Requisites make ordinary modules reachable; `requirement` includes, `dependency` waits for health, and `prerequisite` waits for successful completion. A `mesh.json` imports independently runnable sources and may explicitly rewrite their requisites and environment.

Start with [installation](getting-started/installation.md), the [service quickstart](getting-started/service-quickstart.md), and the [mesh quickstart](getting-started/mesh-quickstart.md). Existing 2.2.0 users should follow the [V3 migration guide](migration/v2.2-to-v3.0.md).

Existing 3.0.0 projects can use the [3.1 build arguments guide](migration/v3.0-to-v3.1.md).

## Reference

- [build.json](reference/build-json.md), [mesh.json](reference/mesh-json.md), [JSON Schemas](reference/json-schemas.md), and [identifier rules](reference/identifier-rules.md)
- [Stages](reference/stage-matrix.md), [environment precedence](reference/environment-precedence.md), and [endpoint properties](reference/endpoint-properties.md)
- [Dockerfile](reference/dockerfile-contract.md), [ordinary Compose modules](reference/dependency-compose-contract.md), [main overrides](reference/override-compose-contract.md), and [CLI](reference/cli.md)

## Workflows

Read [testing](concepts/testing-model.md), [publication and ports](concepts/publication-and-ports.md), [local modules](concepts/local-dependencies.md), and [source rewrites](concepts/dependency-substitution.md). The [guides](guides/build-a-mesh.md), [recipes](recipes/real-service-replaces-local-mock.md), and [troubleshooting pages](troubleshooting/configuration-errors.md) cover common tasks. The [glossary](glossary.md) defines V3 terms.

[Earlier V1 to V2](migration/v1-to-v2.md) and [V2.1 to V2.2](migration/v2.1-to-v2.2.md) guides are historical; their examples are not V3 configuration.
