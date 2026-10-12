# Solid Stack Builder

Solid Stack Builder is a Docker-based CLI for running one service by itself or composing many independently runnable services into a local system.

A service describes its runtime contract in `build.json`. A multi-service system describes how those services connect in `mesh.json`. Builder turns those declarations into predictable development, production, test, and E2E environments without making application code depend on generated container names or hardcoded host ports.

## What Builder gives you

- **One workflow for a single service or a full service mesh.**
- **Named endpoints instead of hardcoded URLs and ports.**
- **Local dependency implementations** backed by Docker Compose.
- **Dependency substitution in a mesh** so a local mock can be replaced by a real top-level service.
- **Private-by-default mesh networking** with explicit host publication.
- **Fixed or automatic host ports** through `publicPort`.
- **Health-gated startup ordering** for applications and dependencies.
- **Stage overlays** for `dev`, `prod`, `test`, and `e2e`.
- **Service-level and global E2E testing** with endpoint references instead of guessed addresses.
- **Preflight validation** for Dockerfiles, Builder configuration, dependency Compose files, and mesh contracts.

## Requirements

Builder requires:

- Node.js **20 or newer**;
- Docker Engine with a reachable daemon;
- Docker Compose **2.24.0 or newer**.

For the complete user guide, tutorials, configuration references, recipes, and troubleshooting, start at the [Builder V2 documentation](docs/README.md).

## Installation

Install the package globally:

```bash
pnpm add -g @solid-stack/builder
```

or:

```bash
npm install -g @solid-stack/builder
```

The package exposes both `builder` and `solid-builder`. The documentation uses `builder`.

Verify the installation:

```bash
builder --version
builder --help
```

## Core mental model

Builder has two configuration files with separate responsibilities:

| File | Responsibility |
|---|---|
| `build.json` | Describes one independently runnable service: its app endpoints, runtime environment, local dependency implementations, tester environment, and stage-specific changes. |
| `mesh.json` | Describes how independently runnable services are composed: service paths, dependency substitutions, mesh-owned environment values, startup dependencies, host publication, and the global E2E tester. |

A `build.json` never chooses which top-level mesh service replaces one of its dependencies. A `mesh.json` never redefines an application's endpoint ports. This separation keeps each service runnable on its own while allowing larger systems to compose it differently.

---

# Quick start: one service

A Builder service directory normally contains at least:

```text
my-api/
├── build.json
├── Dockerfile
└── ...application files
```

## 1. Define the service

Create `build.json`:

```json
{
  "name": "my-api",
  "app": {
    "endpoints": {
      "http": {
        "port": 3000,
        "publicPort": "AUTO",
        "primary": true,
        "scheme": "http"
      }
    }
  }
}
```

The endpoint means:

- the app listens on container port `3000`;
- it may be reached from the host because `publicPort` is declared;
- Builder chooses an available host port because the value is `"AUTO"`;
- the endpoint is the app's primary endpoint, so Builder injects `PORT=3000`;
- URL references can be constructed because `scheme` is `http`.

## 2. Provide the Dockerfile targets

A Builder application Dockerfile must expose the expected stage contract:

```text
dev
test
test-e2e
prod
```

`dev` and `prod` must provide a valid Docker healthcheck. Network applications should use the Builder-provided `PORT` rather than assuming a fixed application port.

## 3. Validate the project

```bash
builder check
```

From another directory:

```bash
builder check -C ./services/my-api
```

## 4. Run development

```bash
builder service up dev
```

Development is isolated by default: local dependency implementations are not started.

To run development with all endpoint-bearing local dependencies:

```bash
builder service up dev --full
```

Stop it with:

```bash
builder service down dev
```

---

# Add a local dependency

A dependency is a **logical dependency** backed by one Compose implementation and zero or more named endpoints.

```json
{
  "name": "my-api",
  "app": {
    "env": {
      "DATABASE_HOST": "${dependencies.database.endpoints.tcp.network_host}",
      "DATABASE_PORT": "${dependencies.database.endpoints.tcp.network_port}"
    },
    "endpoints": {
      "http": {
        "port": 3000,
        "publicPort": "AUTO",
        "primary": true,
        "scheme": "http"
      }
    }
  },
  "dependencies": {
    "database": {
      "compose": ".docker/dependencies/database.compose.yml",
      "endpoints": {
        "tcp": {
          "service": "postgres",
          "port": 5432,
          "primary": true
        }
      }
    }
  }
}
```

The dependency endpoint's `service` must exactly name the owning service in the dependency Compose file. Builder does not infer the first service or guess which container owns the endpoint.

If a dependency has no effective endpoints, it is inert and is not materialized at runtime.

Dependency Compose files must keep endpoint-owning services healthcheckable. Builder uses those healthchecks to decide when a dependency is ready.

---

# Endpoint references

Builder-managed JSON environment values can refer to endpoint properties instead of hardcoding generated addresses.

Inside `build.json`:

```text
${app.endpoints.<endpoint>.<property>}
${dependencies.<dependency>.endpoints.<endpoint>.<property>}
```

Inside `mesh.json`:

```text
${<service>.app.endpoints.<endpoint>.<property>}
${<service>.dependencies.<dependency>.endpoints.<endpoint>.<property>}
```

Available properties:

| Property | Meaning | Needs `scheme` | Needs effective host publication |
|---|---|---:|---:|
| `network_host` | Internal DNS host | No | No |
| `network_port` | Internal container port | No | No |
| `network_address` | `host:port` on the internal network | No | No |
| `network_url` | `scheme://host:port` on the internal network | Yes | No |
| `public_host` | Host-facing address, currently `127.0.0.1` | No | Yes |
| `public_port` | Resolved host port | No | Yes |
| `public_address` | `host:port` from the host | No | Yes |
| `public_url` | `scheme://host:port` from the host | Yes | Yes |

References can be embedded inside larger strings:

```json
{
  "API_URL": "${dependencies.backend.endpoints.http.network_url}/v1"
}
```

Use `$$` when a literal dollar escape is required in Builder-managed environment strings.

---

# Service stages

Builder has four configuration overlays but five service commands for execution/testing:

| Command | Config overlay | Dockerfile target | Local dependencies | Purpose |
|---|---|---|---|---|
| `builder service up dev` | `dev` | `dev` | Isolated | Normal development |
| `builder service up dev --full` | `dev` | `dev` | Integrated | Development with local dependencies |
| `builder service up prod` | `prod` | `prod` | Integrated | Production-style runtime |
| `builder service up test-unit` | `test` | `test` | Isolated | Unit/integration test runner |
| `builder service up test-e2e` | `e2e` | app=`prod`, tester=`test-e2e` | Integrated | Service-level E2E |
| `builder service up test` | `test` then `e2e` | test, then prod/test-e2e | As above | Unit tests first, then E2E |

E2E is its own runtime configuration. It uses the production app image target, but it does **not** inherit `.env.prod` or the `prod` JSON overlay.

---

# Quick start: a service mesh

A mesh composes service projects that can already run independently.

```text
system/
├── mesh.json
└── services/
    ├── frontend/
    │   ├── build.json
    │   └── Dockerfile
    └── backend/
        ├── build.json
        └── Dockerfile
```

Create `mesh.json`:

```json
{
  "name": "system",
  "services": {
    "backend": {
      "path": "./services/backend"
    },
    "frontend": {
      "path": "./services/frontend",
      "dependencies": {
        "backend": "backend"
      },
      "publish": [
        "app.endpoints.http"
      ]
    }
  }
}
```

The binding:

```json
"dependencies": {
  "backend": "backend"
}
```

means:

> for the `frontend` service's logical dependency named `backend`, use the top-level mesh service named `backend` instead of the frontend service's local dependency Compose implementation.

Substitution is atomic: the local implementation for that logical dependency is suppressed as a whole.

Run the mesh:

```bash
builder mesh check
builder mesh up dev
```

Stop it:

```bash
builder mesh down dev
```

---

# Mesh publication is explicit

Declaring `publicPort` in a service's `build.json` makes an endpoint *publishable*. It does not automatically make the endpoint host-visible inside a mesh.

The mesh must explicitly publish it:

```json
{
  "services": {
    "gateway": {
      "path": "./services/gateway",
      "publish": [
        "app.endpoints.http"
      ]
    }
  }
}
```

A mesh can publish:

```text
app.endpoints.<endpoint>
dependencies.<dependency>.endpoints.<endpoint>
```

A substituted dependency cannot be published through the consumer's old local dependency path. Publish the provider service's app endpoint instead.

This makes it practical to keep databases, APIs, queues, and internal services private while publishing only the entry point that developers or external test clients need.

---

# Mesh stages

| Command | Mesh overlay | Service build overlay | App target | Local service dependencies | Global tester |
|---|---|---|---|---|---|
| `builder mesh up dev` | `dev` | `dev` | `dev` | Integrated unless substituted | No |
| `builder mesh up prod` | `prod` | `prod` | `prod` | Integrated unless substituted | No |
| `builder mesh up test-unit` | `test` | `test` | `test` | Isolated | No |
| `builder mesh up test-e2e` | `e2e` | `e2e` | `prod` | Integrated unless substituted | Yes |
| `builder mesh up test` | `test`, then `e2e` | as above | as above | as above | E2E phase only |

`mesh test` first runs isolated per-service unit tests. If they succeed, Builder runs one global E2E composition.

---

# Global mesh E2E tester

A mesh can define a host-networked black-box tester:

```json
{
  "tester": {
    "compose": "./e2e/docker-compose.yml",
    "service": "runner",
    "env": {
      "API_URL": "${gateway.app.endpoints.http.public_url}"
    }
  },
  "services": {
    "gateway": {
      "path": "./services/gateway",
      "publish": [
        "app.endpoints.http"
      ]
    }
  }
}
```

Tester environment references must use `public_*` endpoint properties because the selected tester runner acts as a host-side client.

Use:

```bash
builder mesh up test-e2e
```

or the complete test pipeline:

```bash
builder mesh up test
```

---

# Command overview

## Global

```bash
builder --help
builder --version
builder --verbose <command>
```

`--verbose` includes stack traces for failures.

## Validate a service

```bash
builder check [-C <service-dir>]
```

## Run a service

```bash
builder service up [dev|prod|test|test-unit|test-e2e] [options]
```

Common options include:

```text
-C, --project-dir <dir>
-d, --detach
--debug
--dry-run
--skip-checks
--silence-warnings
--full
```

`--full` is meaningful for development and materializes declared local endpoint dependencies.

## Stop a service

```bash
builder service down [dev|prod|test|test-unit|test-e2e] [options]
```

Options:

```text
-C, --project-dir <dir>
-v, --volumes
--debug
```

## Export resolved application environment

```bash
builder service export env [dev|prod|test|e2e] [options]
```

Without a stage, Builder exports all four configuration stages.

Options:

```text
-C, --project-dir <dir>
--full
--silence-warnings
```

The default output names are `.env.dev`, `.env.prod`, `.env.test`, and `.env.e2e`.

## Validate a mesh

```bash
builder mesh check [options]
```

Options:

```text
-C, --project-dir <dir>
--require-tester
```

## Run a mesh

```bash
builder mesh up [dev|prod|test|test-unit|test-e2e] [options]
```

Options:

```text
-C, --project-dir <dir>
-d, --detach
--debug
--dry-run
--skip-checks
--silence-warnings
```

## Stop a mesh

```bash
builder mesh down [dev|prod|test|test-unit|test-e2e] [options]
```

Options:

```text
-C, --project-dir <dir>
-v, --volumes
--debug
```

## Clean unused Docker resources

```bash
builder prune
builder prune --volumes
```

`builder prune` removes stopped containers and unused networks. `--volumes` also prunes dangling volumes.

---

# Important usage rules

## One primary endpoint

If an app or dependency has a non-empty endpoint map, exactly one effective endpoint must have:

```json
"primary": true
```

For the app, that primary endpoint determines the Builder-owned `PORT` value.

## `publicPort` means publishable host access

Use a fixed port:

```json
"publicPort": 8080
```

or let Builder allocate one:

```json
"publicPort": "AUTO"
```

In standalone execution, eligible declared endpoints can be published directly. In a mesh, an endpoint is host-visible only when the effective mesh `publish` list selects it.

## Environment values are strings

Builder JSON environment maps are always:

```ts
Record<string, string>
```

Do not put numbers, booleans, arrays, objects, or `null` in Builder `env` maps.

## Environment references do not imply startup ordering

An environment value can establish *where* another service lives, but it does not mean Builder should wait for that service.

Use:

- dependency `dependsOn` for dependency-to-dependency readiness;
- mesh service `dependsOn` for explicit top-level service readiness;
- mesh dependency bindings for automatic consumer-to-provider readiness.

## Do not hardcode Builder-generated internal names

Dependency implementations are namespaced when Builder composes them. Always refer to logical endpoints through Builder references.

---

# Configuration reference

The current repository includes the normative V2 references:

- [`docs/BUILD_JSON_DOCS.md`](docs/BUILD_JSON_DOCS.md) — complete `build.json` field reference.
- [`docs/MESH_JSON_DOCS.md`](docs/MESH_JSON_DOCS.md) — complete `mesh.json` field reference.
- [`docs/SPECS_V2.md`](docs/SPECS_V2.md) — cross-file V2 behavior and invariants.
- [`schemas/build-schema.json`](schemas/build-schema.json) — generated `build.json` JSON Schema.
- [`schemas/mesh-schema.json`](schemas/mesh-schema.json) — generated `mesh.json` JSON Schema.

The long-form user documentation should be organized around workflows and usage rather than requiring users to read the specification end-to-end. See `docs_plan.md` for the proposed documentation structure.

---

# Repository development

When working on Builder itself:

```bash
pnpm install
pnpm typecheck
pnpm test
pnpm build
```

Useful verification commands:

```bash
pnpm test:conformance
pnpm test:docker
pnpm check
pnpm check:full
```

The default unit/conformance workflow is designed to run without requiring Docker for every test. Docker acceptance remains the final verification path for real Compose behavior.

---

# License

See the package metadata and repository license policy for distribution terms.
