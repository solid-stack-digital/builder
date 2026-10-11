# Solid Stack Builder

Builder compiles V2 `build.json` service projects and `mesh.json` service meshes into Docker Compose. Endpoint ports, dependency ownership, health gating, and stage overlays are declared in JSON; Builder generates the Compose publication and lifecycle wiring.

## Service configuration

```json
{
  "name": "api",
  "app": {
    "env": { "DATABASE_HOST": "${dependencies.database.endpoints.tcp.network_host}" },
    "endpoints": {
      "http": { "port": 3000, "publicPort": "AUTO", "primary": true, "scheme": "http" }
    }
  },
  "dependencies": {
    "database": {
      "compose": "./compose/database.yml",
      "endpoints": {
        "tcp": { "service": "postgres", "port": 5432, "primary": true }
      }
    }
  },
  "tester": {
    "env": { "API_URL": "${app.endpoints.http.public_url}" }
  }
}
```

The `app` primary endpoint sets the container's `PORT`. Builder owns `PORT`, `EXEC_MODE`, and `INFRA_MODE`; do not define them in app environment files. Host access is declared with endpoint `publicPort`, either a fixed integer or `"AUTO"`. Dependency Compose files keep their own service definitions and healthchecks, but must not publish raw host ports. A dependency with no endpoints is inert.

Stage overlays are named `dev`, `prod`, `test`, and `e2e`. Each can add or change app environment, endpoints, dependencies, and `override-compose`. E2E reads its own overlay and runs the app's `prod` Dockerfile target with `EXEC_MODE=e2e`.

```bash
builder check -C ./services/api
builder service up dev -C ./services/api
builder service up dev --full -C ./services/api
builder service up prod -C ./services/api
builder service up test-unit -C ./services/api
builder service up test-e2e -C ./services/api
builder service up test -C ./services/api
builder service export env dev --full -C ./services/api
builder service down dev -C ./services/api
```

`dev` and `test-unit` are isolated by default. `dev --full` and `prod` include local endpoint dependencies. `test` runs unit tests followed by E2E and stops if the unit phase fails. `--dry-run` compiles and validates without starting containers; `--skip-checks` skips the Dockerfile lint and contract preflight where supported.

## Mesh configuration

```json
{
  "name": "system",
  "services": {
    "database": { "path": "./services/database" },
    "api": {
      "path": "./services/api",
      "dependencies": { "database": "database" },
      "publish": ["app.endpoints.http"]
    }
  },
  "tester": {
    "compose": "./e2e/docker-compose.yml",
    "service": "runner",
    "env": { "API_URL": "${api.app.endpoints.http.public_url}" }
  }
}
```

Mesh service keys are authoritative identities. Bindings replace a service's logical dependency with a top-level provider. `publish` explicitly selects host-visible endpoints. Mesh `dev`, `prod`, `test`, and `e2e` overlays can add services and adjust bindings, environment, lifecycle, and publication. The root tester selects one exact Compose service; Builder places that runner on the host network and gates it on all top-level app healthchecks.

```bash
builder mesh check -C ./system
builder mesh up dev -C ./system
builder mesh up prod -C ./system
builder mesh up test-unit -C ./system
builder mesh up test-e2e -C ./system
builder mesh up test -C ./system
builder mesh down test -C ./system
```

`mesh test` runs per-service isolated unit tests followed by global E2E. Global E2E requires root `tester`; ordinary `mesh check` can validate dev, prod, and test without one.

## Contracts and reference

Application Dockerfiles require `dev`, `test`, `test-e2e`, and `prod` targets. `dev` and `prod` need Docker healthchecks, and `prod` needs an artifact `COPY --from=...`. Builder's packaged Conftest policy enforces these rules. Endpoint-bearing service Dockerfiles should probe the injected `PORT` dynamically.

The full configuration and reference grammar are documented in [BUILD_JSON_DOCS.md](docs/BUILD_JSON_DOCS.md), [MESH_JSON_DOCS.md](docs/MESH_JSON_DOCS.md), and [SPECS_V2.md](docs/SPECS_V2.md). Published JSON Schemas are [build-schema.json](schemas/build-schema.json) and [mesh-schema.json](schemas/mesh-schema.json).

## Development tests

- `pnpm test` — parallel unit, compiler, checker-boundary, and runner tests; no Docker required.
- `pnpm test:conformance` — all 384 catalog scenarios plus audit regressions. A traceability test requires each scenario ID exactly once in this suite.
- `pnpm check` — TypeScript and fast conformance checks.
- `pnpm test:docker` — serial Docker acceptance tests, including real readiness transitions, CLI pipelines, networking, cleanup, and the Rego policy matrix. Requires Docker Engine and Compose; cold image pulls and builds can take several minutes.
- `pnpm check:full` — fast checks, the complete default suite, legacy-removal guard, build, and Docker acceptance. Use this for releases, nightly CI, or manual acceptance.

Fast catalog tests inspect generated health gates and mock external process boundaries. Actual Docker behavior and Rego semantics remain covered in `tests/docker-acceptance`; the fast suite alone does not replace that acceptance gate. Normal test files run in parallel with up to four workers; Docker acceptance remains serial. Ordinary development aims for a sub-minute default suite without depending on Docker cache state.
