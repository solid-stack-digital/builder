# Solid Stack Builder V2

Builder runs one service project from `build.json` or composes several service projects from `mesh.json`. Docker Compose runs the resulting containers, while Builder configuration gives apps stable named endpoints, explicit stage overlays, dependency contracts, and controlled host publication.

## Start here

- [Install Builder](getting-started/installation.md)
- [Run your first service](getting-started/service-quickstart.md)
- [Add a local dependency](getting-started/dependencies-quickstart.md)
- [Compose a mesh](getting-started/mesh-quickstart.md)

## I want to...

| Goal | Start here |
|---|---|
| Run development | [Develop a service](guides/develop-a-service.md) |
| Run development with local dependencies | [Run with local dependencies](guides/run-with-local-dependencies.md) |
| Run production-style locally | [Service stage matrix](reference/stage-matrix.md) |
| Run unit tests or E2E tests | [Testing model](concepts/testing-model.md) |
| Expose an endpoint to the host | [Publish mesh endpoints](guides/publish-mesh-endpoints.md) |
| Replace a local mock with a real service | [Dependency substitution](concepts/dependency-substitution.md) |
| Wire mesh services together | [Build a mesh](guides/build-a-mesh.md) |
| Export effective environment variables | [Export resolved environment](guides/export-resolved-environment.md) |
| Validate a project | [Validate before running](guides/validate-before-running.md) |
| Clean Docker resources | [Clean up Builder resources](guides/clean-up-builder-resources.md) |
| Migrate from V1/V1.2 | [Migration guide](migration/v1-to-v2.md) |

## Core references

[CLI reference](reference/cli.md) · [build.json](reference/build-json.md) · [mesh.json](reference/mesh-json.md) · [Endpoint properties](reference/endpoint-properties.md) · [Stage matrix](reference/stage-matrix.md) · [Dockerfile contract](reference/dockerfile-contract.md) · [Dependency Compose contract](reference/dependency-compose-contract.md)

## Learn the model

Start with [service and mesh responsibilities](concepts/service-and-mesh-model.md), then read about [stages](concepts/stages.md), [endpoints](concepts/endpoints.md), [references](concepts/endpoint-references.md), and [environment precedence](concepts/environment.md). The [glossary](glossary.md) defines the terms used throughout.

## Related

- [Installation](getting-started/installation.md)
- [CLI reference](reference/cli.md)
- [Troubleshooting](troubleshooting/configuration-errors.md)
