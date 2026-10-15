# @solid-stack/builder 3.0.0 Specification

**Package:** `@solid-stack/builder`  
**Version:** `3.0.0`  
**Status:** Canonical V3 specification  
**Configuration files:** `build.json`, `mesh.json`

---

## 1. Purpose

`@solid-stack/builder` is a technology-agnostic build and orchestration system for independently runnable services and multi-service meshes.

Version 3.0.0 replaces the previous `app` / `dependencies` / provider-substitution model with a unified **service graph** model.

The core V3 invariant is:

> **Declared services are possibilities. Requisites define reachability. Reachable services materialize. Ordering requisites define when consumers may proceed. References configure services but never create graph edges.**

V3 has three primary concepts:

1. **Services** — runtime modules.
2. **Requisites** — graph edges that determine materialization and ordering.
3. **Stages** — deterministic overlays that transform configuration before validation and evaluation.

The application service is represented by the reserved `services.main` service. E2E testers are represented by the reserved `services.tester` service. All other services are ordinary Compose-backed service modules.

---

## 2. Normative Language

The keywords **MUST**, **MUST NOT**, **REQUIRED**, **SHALL**, **SHALL NOT**, **SHOULD**, **SHOULD NOT**, and **MAY** are normative.

Unless a rule explicitly says otherwise, a configuration that violates a MUST/MUST NOT rule MUST fail fast before runtime materialization begins.

---

# Part I — Core Model

## 3. Service Kinds

Every `build.json` contains a root `services` object.

There are exactly three service kinds.

### 3.1 `services.main`

`main` is the application runtime.

It is special because:

- it is the standalone build evaluation root;
- it is the only service backed by the project's canonical Dockerfile rather than a user-provided Compose module;
- it is the only service that receives `EXEC_MODE`;
- it is the only service that receives `INFRA_MODE`;
- it may define `override-compose`;
- it MUST support the Dockerfile targets `dev`, `test`, and `prod`;
- it MUST provide a valid healthcheck in its `dev` and `prod` runtime targets;
- during E2E it runs the `prod` target with production runtime semantics.

`main` is a reserved service identifier.

### 3.2 `services.tester`

`tester` is the E2E test runner.

It is special because:

- it is Compose-backed;
- it runs only during E2E;
- it is not part of ordinary `main` requisite traversal;
- it has no endpoints;
- it receives neither `EXEC_MODE` nor `INFRA_MODE`;
- it implicitly waits on the complete effective reachable runtime graph before starting;
- its runner process is identified by its required `service` field.

`tester` is a reserved service identifier.

Canonical shape:

```json
{
  "compose": "./e2e/docker-compose.yml",
  "service": "e2e-runner",
  "env": {
    "BASE_URL": "${main.endpoints.http.public_url}"
  }
}
```

Fields:

| Field | Required | Meaning |
|---|---:|---|
| `compose` | yes | Compose file containing the tester runner |
| `service` | yes | Compose service that Builder runs/waits for as the tester |
| `env` | no | Tester environment variables |

`compose` is immutable once declared.

### 3.3 Ordinary services

Every other entry under `services` is an ordinary service.

Ordinary services:

- are backed by a Compose file;
- may represent one or many Compose services/containers;
- are treated as an atomic Builder module;
- may have environment variables;
- may expose zero or more Builder endpoints;
- may have requisites;
- only materialize if they become reachable in the active effective graph.

---

## 4. Execution Variables

Only `services.main` receives Builder application execution variables.

### 4.1 `EXEC_MODE`

Valid values are exactly:

```text
dev
test
prod
```

`e2e` is **not** an `EXEC_MODE`.

During E2E:

```text
EXEC_MODE=prod
```

### 4.2 `INFRA_MODE`

Valid conceptual values are:

```text
isolated
integrated
```

Semantics:

- `isolated` — Builder does not traverse external requisites. Only `main` runs. The application is responsible for using its in-process stubs/mocks according to `INFRA_MODE`.
- `integrated` — Builder evaluates and materializes the effective requisite graph starting from `main`.

Only `main` receives `INFRA_MODE`.

---

## 5. Canonical Dockerfile Targets

The main Dockerfile MUST provide the canonical Builder lifecycle targets:

```text
dev
test
prod
```

There is no `test-e2e` target in V3.

- `dev` SHOULD support hot reload and MUST run in the foreground.
- `test` executes isolated/unit tests and terminates with a meaningful exit code.
- `prod` is the production-equivalent application runtime and is used during E2E.

---

## 6. E2E Is a Configuration Overlay

`e2e` is a configuration stage, not an execution mode.

For application runtime during E2E:

```text
Dockerfile target = prod
EXEC_MODE          = prod
INFRA_MODE         = integrated
```

The E2E tester is a separate Compose-backed service.

---

# Part II — Requisite Graph

## 7. Requisites

A service may define:

```json
{
  "requisites": {
    "target": "requirement",
    "database": "dependency",
    "migration": "prerequisite"
  }
}
```

Valid effective requisite values are:

```text
requirement
dependency
prerequisite
```

Overlay configurations additionally allow `false` to remove an inherited requisite edge.

## 8. `requirement`

A `requirement` means the target MUST be included in the effective reachable graph and therefore materialized. It does **not** create readiness ordering.

## 9. `dependency`

A `dependency` means the target MUST materialize and MUST become healthy before the consumer may proceed.

Conceptually:

```text
dependency -> service_healthy
```

A dependency target is long-running/readiness-oriented. Its lifecycle representative MUST provide a valid healthcheck.

## 10. `prerequisite`

A `prerequisite` means the target MUST materialize and MUST terminate successfully before the consumer may proceed.

Conceptually:

```text
prerequisite -> service_completed_successfully
```

A non-zero prerequisite exit MUST fail execution and prevent its consumers from proceeding.

Typical uses include migrations, seeders, initialization jobs, schema preparation, and fixture loaders.

## 11. `false`

`false` is an overlay-only deletion operation for requisite edges.

```json
{
  "requisites": {
    "source.backend": false
  }
}
```

This removes an inherited requisite. It does not delete the target declaration and does not create a replacement.

## 12. Requisite Reachability

### Standalone build

In integrated standalone execution:

```text
root = services.main
```

Builder recursively follows effective requisite edges. Only reachable ordinary services materialize.

### Isolated execution

In isolated execution Builder does not traverse requisites:

```text
materialized graph = main only
```

### Mesh

Every effective non-tester top-level mesh service is an execution root.

For each root Builder:

1. loads its source build;
2. takes its effective `services.main`;
3. evaluates its effective requisite tree;
4. recursively evaluates fellow mesh roots referenced by requisites;
5. merges all resulting trees into one effective mesh graph.

`services.tester` is excluded from the initial root set.

## 13. Requisite to a Fellow Mesh Service

Inside a sourced mesh service override:

```json
{
  "extends": {
    "main": {
      "requisites": {
        "frontend": "requirement"
      }
    }
  }
}
```

means:

```text
current source main
    requires
mesh service frontend
    resolves to
frontend.source.services.main
    then
frontend's own effective requisite tree
```

## 14. Lifecycle Classification Conflicts

A target may participate as `requirement + dependency` or `requirement + prerequisite`, but MUST NOT be classified as both `dependency` and `prerequisite` in the same effective graph.

A service referenced only through `requirement` is treated as long-running unless another valid ordering edge classifies it as a prerequisite.

## 15. Cycles

Requirement-only cycles are allowed.

Ordering cycles are forbidden. Builder MUST create an ordering subgraph containing both `dependency` and `prerequisite` edges, and that combined ordering graph MUST be acyclic.

---

# Part III — Endpoint Model

## 16. Endpoint Shapes

Main endpoint:

```ts
type MainEndpoint = {
  port: number;
  publicPort?: number | "AUTO";
  primary?: boolean;
  scheme?: string;
};
```

Ordinary-service endpoint:

```ts
type ServiceEndpoint = {
  service: string;
  port: number;
  publicPort?: number | "AUTO";
  primary?: boolean;
  scheme?: string;
};
```

The ordinary endpoint `service` names the Compose service that owns the endpoint.

## 17. Primary Endpoint Rules

If an endpoint collection is non-empty:

- exactly one endpoint MUST have `primary: true`;
- omitted `primary` means false;
- multiple primaries are invalid;
- zero primaries are invalid.

For `main`, the primary endpoint is the source for Builder-owned `PORT`.

For ordinary services, the primary endpoint's `service` identifies the lifecycle representative Compose service.

## 18. Endpoint-Less Ordinary Services

Ordinary services may omit `endpoints`.

When endpoints are absent or empty, top-level `service` is REQUIRED:

```json
{
  "compose": "./migration/docker-compose.yml",
  "service": "migration"
}
```

That `service` identifies the lifecycle representative Compose service.

If top-level `service` is also supplied when endpoints exist, it MUST identify the same Compose service as the primary endpoint.

## 19. Scheme

`scheme`, when present, MUST match:

```regex
^[A-Za-z][A-Za-z0-9+.-]*$
```

URL-derived endpoint properties require `scheme`.

## 20. Endpoint Properties

Network properties:

```text
network_host
network_port
network_address
network_url
```

Public properties:

```text
public_host
public_port
public_address
public_url
```

Definitions:

```text
network_address = <network_host>:<network_port>
network_url     = <scheme>://<network_address>
public_address  = <public_host>:<public_port>
public_url      = <scheme>://<public_address>
```

`network_url` and `public_url` require `scheme`.

A public property reference is valid only when the endpoint is effectively published.

## 21. `publicPort`

Valid forms:

```json
3000
```

or:

```json
"AUTO"
```

Semantics:

- omitted — no publication capability;
- integer — fixed requested host port;
- `"AUTO"` — Builder allocates a collision-free host port.

Fixed conflicts MUST fail.

---

# Part IV — `build.json`

## 22. Root Schema

```ts
type BuildJson = {
  $schema?: string;
  name: string;
  services: BuildServices;
  dev?: BuildStage;
  prod?: BuildStage;
  test?: BuildStage;
  e2e?: BuildStage;
};
```

Allowed stages are exactly `dev`, `prod`, `test`, and `e2e`.

## 23. Build Root Fields

- `$schema` — optional JSON Schema URI.
- `name` — required logical build/project name.
- `services` — required service declarations containing reserved `main` and `tester` plus zero or more ordinary services.
- `dev`, `prod`, `test`, `e2e` — optional stage overlays.

Canonical schema URI:

```json
{
  "$schema": "https://raw.githubusercontent.com/solid-stack-digital/builder/refs/heads/main/schemas/build-schema.json"
}
```

## 24. Main Schema

```ts
type MainService = {
  env?: Record<string, string>;
  endpoints?: Record<string, MainEndpoint>;
  requisites?: Requisites;
  "override-compose"?: string;
};
```

## 25. Tester Schema

```ts
type TesterService = {
  compose: string;
  service: string;
  env?: Record<string, string>;
};
```

Tester has no endpoints and no explicit requisites.

## 26. Ordinary Service Schema

```ts
type NormalService = {
  compose: string;
  service?: string;
  env?: Record<string, string>;
  endpoints?: Record<string, ServiceEndpoint>;
  requisites?: Requisites;
};
```

## 27. Atomic Multi-Service Compose Modules

A normal Builder service may reference a Compose file containing multiple Compose services. Builder treats the Compose file as one atomic module for materialization, stage configuration, mesh extension, cleanup, and namespacing.

Individual endpoints may identify different Compose services inside the module.

## 28. Build Stages

```ts
type BuildStage = {
  services?: Record<string, ServiceOverlayOrNewService>;
};
```

A stage may override existing services or introduce new ordinary services.

A stage MUST NOT replace `compose` for an already-declared service.

A newly introduced stage service MUST provide its full required declaration.

### Stage-added build-local services

A build-stage-added ordinary service does not materialize merely because it is declared. It must become reachable from effective `main` requisites.

---

# Part V — Merge and Stage Inheritance

## 29. Generic Merge Rule

Objects recursively merge.

All non-object values replace the previous value, including arrays.

Arrays do not union or append.

## 30. Immutable Fields

For an existing service:

```text
compose
```

is immutable.

For an existing mesh source service:

```text
source
```

is immutable.

## 31. Requisite Deletion

`false` removes an inherited requisite during overlay merge.

## 32. Build Stage Inheritance

```text
dev  = base -> dev
prod = base -> prod
test = base -> test
e2e  = base -> prod -> e2e
```

E2E inherits structured production configuration, but it does not inherit `.env.prod`.

---
# Part VI — `mesh.json`

## 33. Root Mesh Schema

```ts
type MeshJson = {
  $schema?: string;
  name: string;
  services: MeshServices;
  dev?: MeshStage;
  prod?: MeshStage;
  e2e?: MeshStage;
};
```

Allowed mesh stages are exactly:

```text
dev
prod
e2e
```

There is no `mesh.json.test` stage. `mesh test` is a workflow, not a configuration stage.

## 34. Mesh Services

`services` contains:

- reserved `tester`;
- one or more sourced mesh services.

Example:

```json
{
  "services": {
    "tester": {
      "compose": "./e2e/docker-compose.yml",
      "service": "global-e2e"
    },
    "backend": {
      "source": "./services/backend"
    }
  }
}
```

## 35. Mesh Tester

Mesh tester shape is identical to build tester:

```ts
type MeshTester = {
  compose: string;
  service: string;
  env?: Record<string, string>;
};
```

It runs only during global E2E.

## 36. Sourced Mesh Service

```ts
type MeshSourceService = {
  source: string;
  extends?: Record<string, SourceServiceOverlay>;
  publish?: string[];
};
```

### `source`

Required path to a directory containing a V3 `build.json`.

`source` is immutable for an existing mesh service. A stage-added mesh service may define its own `source`.

### `extends`

Overrides services inside the sourced build.

### `publish`

Explicitly exposes selected endpoints from the sourced build into the mesh host/public surface.

## 37. `extends`

Imported source overrides live only under `extends`.

```json
{
  "source": "./services/backend",
  "extends": {
    "main": {
      "env": {
        "ENVIRONMENT": "mesh"
      }
    },
    "postgres": {
      "env": {
        "POSTGRES_DB": "mesh_backend"
      }
    }
  }
}
```

`extends.main` modifies source `services.main`.

`extends.postgres` modifies source `services.postgres`.

This avoids collisions between imported service names and mesh structural fields such as `source`, `extends`, and `publish`.

## 38. `extends` Target Validation

`extends.<name>` MUST refer to a service that exists in the effective sourced build.

`extends` modifies; it does not create source services.

Invalid:

```json
{
  "extends": {
    "does-not-exist": {
      "env": {
        "A": "B"
      }
    }
  }
}
```

New source-local services are introduced by the source build or its applicable build stage.

The source build's standalone `tester` is not part of normal mesh runtime composition; global E2E uses mesh `services.tester`.

## 39. Mesh Stage-Added Services

Mesh stages may introduce new top-level mesh services.

```json
{
  "dev": {
    "services": {
      "inspector": {
        "source": "./services/inspector"
      }
    }
  }
}
```

Once present in the active effective mesh, a non-tester top-level mesh service is itself an execution root.

This is distinct from a stage-added build-local ordinary service, which still requires requisite reachability from `main`.

---

# Part VII — Source and Mesh Scoping

## 40. Source Namespace

Inside a sourced mesh service override:

```text
source.<name>
```

refers to a service inside the build referenced by that mesh service's `source`.

Example:

```json
{
  "frontend": {
    "source": "./services/frontend",
    "extends": {
      "main": {
        "requisites": {
          "source.backend": false
        }
      }
    }
  }
}
```

`source.backend` means `services.backend` from `./services/frontend/build.json`.

## 41. Unprefixed Mesh Requisite Names

Inside mesh `extends`, an unprefixed requisite name refers to a top-level service in the current `mesh.json`.

```json
{
  "extends": {
    "main": {
      "requisites": {
        "backend": "requirement"
      }
    }
  }
}
```

Here `backend` means root mesh `services.backend`, not a source-local service.

## 42. Cross-Source Endpoint References

From mesh/composition scope, a source-local service inside another sourced mesh service is referenced as:

```text
<mesh-service>.source.<source-service>.endpoints.<endpoint>.<property>
```

Canonical example:

```text
backend.source.mailpit.endpoints.http.public_url
```

The `.endpoints.` namespace is always retained.

## 43. Build-Local References

Within `build.json`, references use:

```text
<service>.endpoints.<endpoint>.<property>
```

Example:

```json
{
  "DATABASE_URL": "postgres://${postgres.endpoints.database.network_address}/app"
}
```

## 44. Self-Reference

A service may always reference itself without declaring itself in requisites.

```json
{
  "main": {
    "env": {
      "PUBLIC_URL": "${main.endpoints.http.public_url}"
    }
  }
}
```

## 45. Reference Permission

References never create requisites.

A service may reference another service only when that target already exists in the referencing service's effective requisite closure.

Therefore:

```text
reference != requirement != lifecycle edge
```

If an effective requisite was pruned using `false`, a surviving reference to the removed target is invalid.

A requisite to a fellow mesh service makes that mesh service's sourced `main` and its effective reachable subtree exist in the graph.

Tester is special: immediately before tester execution it has an implicit dependency barrier over the complete effective reachable graph, so tester references may address reachable nodes in that graph.

## 46. Effective Merge Before Reference Validation

Builder MUST compute final effective configuration before resolving references.

Canonical order:

```text
1. load base configuration
2. apply source stage inheritance
3. apply mesh base extends
4. apply mesh stage extends
5. compute effective env/requisites/endpoints/publication
6. validate surviving references
7. evaluate graph
8. materialize
```

A lower-precedence reference that was completely shadowed MUST NOT be resolved or rejected merely because it existed before merging.

---

# Part VIII — Mesh Publication

## 47. Private by Default

All source-build endpoints are private at mesh composition level unless explicitly selected by `publish`, even when the source endpoint defines `publicPort`.

## 48. Publish Selector Syntax

Publish selectors are relative to the sourced build and omit `source`.

```json
{
  "backend": {
    "source": "./services/backend",
    "publish": [
      "mailpit.endpoints.http"
    ]
  }
}
```

```json
{
  "gateway": {
    "source": "./services/gateway",
    "publish": [
      "main.endpoints.http"
    ]
  }
}
```

Canonical selector:

```text
<source-service>.endpoints.<endpoint>
```

## 49. Publication Validation

A publish selector is valid only when:

1. the selected source service exists;
2. the service is in that sourced build's effective reachable requisite tree;
3. the selected endpoint exists;
4. the endpoint has an effective `publicPort`.

If any condition fails, Builder MUST reject the mesh.

Publication does not create reachability.

## 50. Public Reference Validation

A reference such as:

```text
backend.source.mailpit.endpoints.http.public_url
```

requires that endpoint to be effectively published in the active mesh.

---

# Part IX — Mesh Composition Order

## 51. Mesh Dev

For each source:

```text
source base
-> source dev
-> mesh base extends
-> mesh dev extends
```

Then:

```text
merge -> validate references -> evaluate graph -> materialize
```

## 52. Mesh Prod

```text
source base
-> source prod
-> mesh base extends
-> mesh prod extends
```

## 53. Global Mesh E2E

```text
source base
-> source prod
-> source e2e
-> mesh base extends
-> mesh prod extends
-> mesh e2e extends
```

Then:

```text
merge
-> validate
-> evaluate
-> materialize
-> readiness/completion barrier
-> tester
```

---

# Part X — Environment Model

## 54. Env Value Type

Every Builder-defined env value MUST be a string.

Invalid:

```json
{
  "PORT": 3000,
  "ENABLED": true
}
```

Valid:

```json
{
  "PORT": "3000",
  "ENABLED": "true"
}
```

## 55. Builder-Owned Environment

Builder-owned variables have highest authority.

For `main`, Builder-owned variables include at least:

```text
EXEC_MODE
INFRA_MODE
PORT
```

when applicable.

User configuration MUST NOT override Builder-owned lifecycle semantics. A collision SHOULD fail validation rather than silently change Builder behavior.

Tester receives neither `EXEC_MODE` nor `INFRA_MODE`.

## 56. Main — Standalone Non-E2E Precedence

Low to high:

```text
1. .env.<stage>
2. base services.main.env
3. <stage>.services.main.env
4. effective services.main.override-compose environment
5. Builder-owned main environment
```

## 57. Main — Mesh Non-E2E Precedence

Low to high:

```text
1. source .env.<stage>
2. source base services.main.env
3. source <stage>.services.main.env
4. effective source services.main.override-compose environment
5. mesh base extends.main.env
6. mesh <stage> extends.main.env
7. Builder-owned main environment
```

## 58. Main — Standalone E2E Precedence

Low to high:

```text
1. .env.e2e
2. base services.main.env
3. prod.services.main.env
4. e2e.services.main.env
5. effective services.main.override-compose environment after base -> prod -> e2e
6. Builder-owned main environment
```

`.env.prod` is not loaded for E2E.

## 59. Main — Global Mesh E2E Precedence

Low to high:

```text
1. source .env.e2e
2. source base services.main.env
3. source prod.services.main.env
4. source e2e.services.main.env
5. effective source services.main.override-compose environment
6. mesh base extends.main.env
7. mesh prod extends.main.env
8. mesh e2e extends.main.env
9. Builder-owned main environment
```

## 60. Ordinary Service Non-E2E Precedence

Normal Compose services do not automatically receive `.env.dev`, `.env.prod`, `.env.test`, or `.env.e2e`.

Low to high:

```text
1. Compose implementation environment/defaults
2. base services.<name>.env
3. source <stage>.services.<name>.env
4. mesh base extends.<name>.env
5. mesh <stage> extends.<name>.env
6. Builder-owned service environment
```

Standalone execution omits mesh layers.

## 61. Ordinary Service E2E Precedence

Low to high:

```text
1. Compose implementation environment/defaults
2. source base services.<name>.env
3. source prod.services.<name>.env
4. source e2e.services.<name>.env
5. mesh base extends.<name>.env
6. mesh prod extends.<name>.env
7. mesh e2e extends.<name>.env
8. Builder-owned service environment
```

## 62. Module-Wide Service Env

For an atomic multi-service Compose module, Builder-level service env is module-wide. Container-specific differences belong in the underlying Compose file.

Builder service env overrides conflicting Compose implementation defaults.

## 63. Tester Precedence — Service E2E

Low to high:

```text
1. .env.e2e-tester
2. base services.tester.env
3. prod.services.tester.env
4. e2e.services.tester.env
5. Builder-owned tester environment
```

## 64. Tester Precedence — Global Mesh E2E

Low to high:

```text
1. root .env.e2e-tester
2. mesh base services.tester.env
3. mesh prod services.tester.env
4. mesh e2e services.tester.env
5. Builder-owned tester environment
```

`.env.e2e` and `.env.e2e-tester` are separate domains and are never implicitly merged.

---

# Part XI — `override-compose`

## 65. Purpose

`override-compose` is allowed only on `services.main`.

It provides Compose-level customization for the Builder-generated main runtime and may be used for:

- build arguments;
- volumes;
- environment;
- development mounts;
- other technology-specific Docker/Compose configuration that does not belong in Builder's generic schema.

Build arguments are intentionally supplied through `override-compose`; Builder does not need a separate build-args schema field.

## 66. Override Restrictions

`override-compose` MUST NOT override Builder-owned lifecycle semantics such as:

- selected Dockerfile target;
- `EXEC_MODE`;
- `INFRA_MODE`;
- Builder-owned endpoint publication;
- Builder-managed namespacing.

Its environment participates in the pinned env precedence rules.

---

# Part XII — Compose Requirements

## 67. Normal-Service Compose Restrictions

Builder owns cross-module networking and host publication.

Normal service Compose modules SHOULD NOT independently publish host ports.

Builder SHOULD reject configurations that bypass its runtime ownership, including:

- fixed `container_name`;
- `network_mode: host`;
- `privileged: true`;
- host-root filesystem mounts;
- host port mappings that bypass Builder endpoint publication.

The tester is a special test-runner exception where host-network semantics may be used by the tester runtime.

## 68. Endpoint Service Validation

Each ordinary endpoint's `service` MUST exist in that module's Compose file.

The top-level lifecycle `service` for endpoint-less services MUST also exist.

## 69. Healthcheck Validation

- `main` dev/prod runtime MUST provide a valid healthcheck.
- any long-running service used as a `dependency` MUST provide a valid healthcheck on its lifecycle representative;
- during E2E every reachable long-running service must be health-checkable because tester start is gated on graph readiness;
- prerequisite services are validated by successful process completion instead.

---

# Part XIII — Namespacing

## 70. Builder Namespacing

Builder owns deterministic Compose project/service/network namespacing.

Two Builder modules may use identical internal Compose service names without collision.

Cross-source runtime identities remain distinct even when local Compose names are identical.

---
# Part XIV — Execution Model

## 71. Standalone `dev`

Semantic operation:

```text
main target = dev
EXEC_MODE    = dev
INFRA_MODE   = isolated
env file     = .env.dev
```

Requisites are not traversed. Only `main` materializes.

## 72. Standalone `dev --full`

```text
main target = dev
EXEC_MODE    = dev
INFRA_MODE   = integrated
env file     = .env.dev
```

Builder evaluates from `services.main` and materializes the complete reachable graph.

## 73. Standalone `prod`

```text
main target = prod
EXEC_MODE    = prod
INFRA_MODE   = integrated
env file     = .env.prod
```

Builder evaluates the production effective graph.

## 74. Standalone `test`

`test` is a two-phase workflow.

### Phase 1 — isolated/unit

```text
main target = test
EXEC_MODE    = test
INFRA_MODE   = isolated
env file     = .env.test
```

No external requisites materialize.

If Phase 1 fails, testing stops.

### Phase 2 — service E2E

Structured configuration:

```text
base -> prod -> e2e
```

Main:

```text
target      = prod
EXEC_MODE   = prod
INFRA_MODE  = integrated
env file    = .env.e2e
```

Builder:

1. evaluates the reachable graph from main;
2. materializes it;
3. waits for graph readiness/completion;
4. requires `main` specifically to become healthy;
5. starts `services.tester`;
6. supplies tester env using `.env.e2e-tester` precedence;
7. treats tester exit status as the E2E result;
8. performs strict cleanup.

---

# Part XV — E2E Tester Barrier

## 75. Barrier Semantics

Before tester starts, Builder resolves the complete effective reachable graph.

Every reachable runtime node must be in the state appropriate to its lifecycle:

- long-running nodes MUST be healthy;
- prerequisite/one-shot nodes MUST have completed successfully;
- `main` MUST specifically be healthy.

Unreachable declared services are ignored.

The tester does not pull unreachable services into the graph.

---

# Part XVI — Mesh Execution

## 76. Mesh Dev

Every effective non-tester top-level mesh service is a root.

For each root Builder:

1. composes `source base -> source dev -> mesh base -> mesh dev`;
2. takes source `main`;
3. evaluates its reachable tree;
4. follows fellow mesh requisites;
5. merges all root trees;
6. validates the final graph;
7. materializes it.

Each sourced `main` runs:

```text
target      = dev
EXEC_MODE   = dev
INFRA_MODE  = integrated
```

## 77. Mesh Prod

Same root semantics.

Composition:

```text
source base
-> source prod
-> mesh base
-> mesh prod
```

Each sourced `main` runs:

```text
target      = prod
EXEC_MODE   = prod
INFRA_MODE  = integrated
```

## 78. Mesh Test

There is no `mesh.json.test` configuration stage.

`mesh test` is a two-phase orchestration workflow.

### Phase 1 — standalone source tests

For every base/root non-tester mesh service:

1. use that service's `source` directory as the source-project context;
2. run the semantic equivalent of that source project's complete standalone `test` lifecycle;
3. run source projects sequentially, never concurrently;
4. after each source project, perform strict teardown of application containers, service modules, tester, networks, temporary runtime artifacts, and allocated host ports;
5. stop immediately on failure.

`services.tester` is excluded.

Stage-only top-level mesh services are not Phase-1 standalone members unless also present in the base/root mesh.

### Phase 2 — global E2E

Builder composes:

```text
source base
-> source prod
-> source e2e
-> mesh base
-> mesh prod
-> mesh e2e
```

for every effective mesh root.

Then Builder:

1. evaluates and merges the complete mesh graph;
2. materializes all effective roots and their trees;
3. waits for long-running nodes to become healthy;
4. waits for prerequisites to complete successfully;
5. requires every sourced `main` to become healthy;
6. starts mesh `services.tester`;
7. executes the global E2E suite;
8. strictly cleans all resources afterward.

There is no separate user-facing mesh E2E lifecycle.

---

# Part XVII — Tester Network and Reference Semantics

## 79. Black-Box Testing

Tester is a black-box client.

Tester endpoint references SHOULD use public endpoint properties.

Typical references:

```text
main.endpoints.http.public_url
gateway.source.main.endpoints.http.public_url
backend.source.mailpit.endpoints.http.public_url
```

A public reference is valid only when the endpoint is effectively public in the active standalone or mesh composition.

---

# Part XVIII — Standalone Versus Mesh Publication

## 80. Standalone Build

In standalone execution, an endpoint that defines `publicPort` has publication capability and may be exposed by Builder for that standalone runtime.

This enables service E2E testers to reach application/dependency endpoints using public properties.

## 81. Mesh

In a mesh, source endpoints are private regardless of source `publicPort` until selected by mesh `publish`.

Therefore:

```json
{
  "publicPort": "AUTO"
}
```

means:

> this endpoint is capable of publication

not:

> this endpoint is automatically public in every mesh.

---

# Part XIX — Canonical Compiler/Evaluator Pipeline

## 82. Pipeline

Builder MUST conceptually perform:

```text
1. parse JSON
2. validate structural schema
3. load source builds and Compose metadata
4. apply build stage inheritance
5. apply mesh base extends
6. apply mesh stage extends
7. recursively merge effective objects
8. apply false requisite deletions
9. determine effective publication
10. validate surviving references
11. build reachability graph
12. build dependency/prerequisite ordering graph
13. validate lifecycle-classification conflicts
14. validate ordering acyclicity
15. validate endpoint/service/publication requirements
16. allocate public ports
17. generate namespaced runtime composition
18. materialize runtime
19. enforce readiness/completion barriers
20. run tester when applicable
```

Validation MUST operate on the final effective composition, not stale lower-precedence values.

---

# Part XX — Fail-Fast Validation

## 83. Builder MUST Reject at Least

- unknown root fields;
- unknown stage names;
- missing `name`;
- missing `services.main`;
- missing required `services.tester` for a testable build/mesh;
- legacy V2 `app`;
- legacy root `dependencies`;
- legacy `dependsOn`;
- legacy mesh `path`;
- legacy top-level mesh `tester`;
- `mesh.json.test`;
- invalid env non-string values;
- missing normal-service `compose`;
- replacing existing `compose`;
- replacing existing mesh `source`;
- endpoint collections with zero or multiple primaries;
- endpoint `service` names not present in Compose;
- endpoint-less ordinary service without top-level `service`;
- `extends` targeting a nonexistent source service;
- reference to a target outside effective requisite scope;
- reference to a target whose requisite was pruned;
- unresolved endpoint reference;
- `*_url` reference when `scheme` is absent;
- public property reference without effective publication;
- publish selector targeting an unreachable source service;
- publish selector targeting endpoint without `publicPort`;
- fixed public-port collision;
- dependency target without a valid healthcheck;
- main dev/prod runtime without valid healthcheck;
- prerequisite exiting non-zero;
- target classified as both dependency and prerequisite;
- dependency/prerequisite ordering cycle;
- Compose configuration that bypasses Builder networking/publication ownership;
- user attempts to override authoritative Builder runtime variables.

---

# Part XXI — Naming

## 84. Service Names

Canonical service-name grammar:

```regex
^[a-z][a-z0-9-]*$
```

Reserved names:

```text
main
tester
```

`main` and `tester` may appear only with their Builder-defined special semantics.

Mesh top-level service keys use the same naming convention.

---

# Part XXII — Exhaustive `build.json` Example

The following example intentionally exercises nearly every build-side V3 capability:

- `main`;
- tester;
- ordinary endpoint-bearing service;
- ordinary endpoint-less service;
- atomic multi-container Compose module;
- multiple endpoints;
- primary endpoints;
- fixed and AUTO public ports;
- env references;
- self-reference;
- requirement;
- dependency;
- prerequisite;
- stage requisite deletion;
- stage-added service;
- stage env overrides;
- endpoint override;
- `override-compose`;
- all four build stages.

```json
{
  "$schema": "https://raw.githubusercontent.com/solid-stack-digital/builder/refs/heads/main/schemas/build-schema.json",
  "name": "orders-api",

  "services": {
    "main": {
      "env": {
        "DATABASE_URL": "postgres://app:local@${postgres.endpoints.database.network_address}/orders",
        "SMTP_HOST": "${mailpit.endpoints.smtp.network_host}",
        "SMTP_PORT": "${mailpit.endpoints.smtp.network_port}",
        "MAILPIT_INTERNAL_URL": "${mailpit.endpoints.http.network_url}",
        "PUBLIC_API_URL": "${main.endpoints.http.public_url}",
        "LOG_LEVEL": "info",
        "ENVIRONMENT": "local"
      },

      "endpoints": {
        "http": {
          "port": 3000,
          "publicPort": "AUTO",
          "primary": true,
          "scheme": "http"
        },
        "metrics": {
          "port": 9090,
          "scheme": "http"
        }
      },

      "requisites": {
        "postgres": "dependency",
        "migration": "prerequisite",
        "mailpit": "requirement",
        "observability": "requirement"
      },

      "override-compose": ".docker/overrides/docker-compose.base.override.yml"
    },

    "tester": {
      "compose": "./services/tester/docker-compose.e2e.yml",
      "service": "orders-e2e",
      "env": {
        "API_URL": "${main.endpoints.http.public_url}",
        "MAILPIT_URL": "${mailpit.endpoints.http.public_url}",
        "E2E_SUITE": "orders"
      }
    },

    "postgres": {
      "compose": "./services/postgres/docker-compose.yml",
      "env": {
        "POSTGRES_DB": "orders",
        "POSTGRES_USER": "app",
        "POSTGRES_PASSWORD": "local"
      },
      "endpoints": {
        "database": {
          "service": "postgres",
          "port": 5432,
          "primary": true,
          "scheme": "tcp"
        }
      }
    },

    "migration": {
      "compose": "./services/migration/docker-compose.yml",
      "service": "migration",
      "env": {
        "DATABASE_URL": "postgres://app:local@${postgres.endpoints.database.network_address}/orders"
      },
      "requisites": {
        "postgres": "dependency"
      }
    },

    "mailpit": {
      "compose": "./services/mailpit/docker-compose.yml",
      "endpoints": {
        "smtp": {
          "service": "mailpit",
          "port": 1025,
          "primary": true,
          "scheme": "smtp"
        },
        "http": {
          "service": "mailpit",
          "port": 8025,
          "publicPort": "AUTO",
          "scheme": "http"
        }
      }
    },

    "observability": {
      "compose": "./services/observability/docker-compose.yml",
      "env": {
        "OBSERVABILITY_PROFILE": "local"
      },
      "endpoints": {
        "otlp": {
          "service": "collector",
          "port": 4318,
          "primary": true,
          "scheme": "http"
        },
        "prometheus": {
          "service": "prometheus",
          "port": 9090,
          "scheme": "http"
        },
        "grafana": {
          "service": "grafana",
          "port": 3000,
          "publicPort": "AUTO",
          "scheme": "http"
        }
      }
    }
  },

  "dev": {
    "services": {
      "main": {
        "env": {
          "ENVIRONMENT": "development",
          "LOG_LEVEL": "debug"
        },
        "override-compose": ".docker/overrides/docker-compose.dev.override.yml"
      },
      "postgres": {
        "endpoints": {
          "database": {
            "publicPort": 5432
          }
        }
      },
      "mailpit": {
        "endpoints": {
          "http": {
            "publicPort": 8025
          }
        }
      },
      "observability": {
        "env": {
          "OBSERVABILITY_PROFILE": "development"
        }
      }
    }
  },

  "test": {
    "services": {
      "main": {
        "env": {
          "ENVIRONMENT": "test",
          "LOG_LEVEL": "warn"
        }
      }
    }
  },

  "prod": {
    "services": {
      "main": {
        "env": {
          "ENVIRONMENT": "production",
          "LOG_LEVEL": "info"
        },
        "override-compose": ".docker/overrides/docker-compose.prod.override.yml"
      },
      "tester": {
        "env": {
          "E2E_SUITE": "orders-production-shape"
        }
      }
    }
  },

  "e2e": {
    "services": {
      "main": {
        "env": {
          "ENVIRONMENT": "e2e",
          "LOG_LEVEL": "debug",
          "ORDER_TIMEOUT_SECONDS": "5"
        },
        "requisites": {
          "observability": false,
          "fixture-loader": "prerequisite"
        },
        "override-compose": ".docker/overrides/docker-compose.e2e.override.yml"
      },

      "fixture-loader": {
        "compose": "./e2e/fixtures/docker-compose.yml",
        "service": "fixture-loader",
        "env": {
          "DATABASE_URL": "postgres://app:local@${postgres.endpoints.database.network_address}/orders",
          "FIXTURE_SET": "e2e"
        },
        "requisites": {
          "postgres": "dependency"
        }
      },

      "tester": {
        "env": {
          "E2E_SUITE": "orders-e2e",
          "ASSERT_EMAIL": "true"
        }
      }
    }
  }
}
```

## 85. Build Example Evaluation

### Isolated dev

Only `main` runs. Requisites are not traversed.

### Integrated dev

Reachable graph:

```text
main
├── dependency    -> postgres
├── prerequisite -> migration
│                   └── dependency -> postgres
├── requirement   -> mailpit
└── requirement   -> observability
```

`postgres` must become healthy before consumers ordered on it proceed. `migration` must exit 0 before `main` may proceed. Requirement-only services materialize without adding startup ordering.

### E2E

Effective structured config is:

```text
base -> prod -> e2e
```

`observability` is pruned. `fixture-loader` is introduced by E2E and becomes reachable because E2E `main.requisites` adds it as a prerequisite.

Tester starts only after all effective long-running services are healthy, all prerequisites have completed successfully, and `main` is healthy.

---
# Part XXIII — Exhaustive `mesh.json` Example

This example demonstrates:

- mesh tester;
- multiple sourced services;
- `source`;
- `extends`;
- overriding source `main`;
- overriding nested source services;
- pruning source-local requisites;
- adding fellow mesh requisites;
- requirement cycles;
- cross-source network references;
- cross-source public references;
- source-relative `publish`;
- mesh-private endpoint semantics;
- dev/prod/e2e overlays;
- stage-added top-level mesh services;
- tester stage env;
- array replacement semantics.

Assumptions:

- `./services/backend` is a V3 build exposing `main`, `postgres`, `mailpit`, and other source-local services;
- `./services/frontend` is a V3 build whose standalone `main` uses a source-local `backend` mock;
- `./services/gateway` is a V3 build whose standalone `main` uses source-local `frontend` and `backend` mocks;
- all endpoints selected by `publish` have effective `publicPort` values in their source builds.

```json
{
  "$schema": "https://raw.githubusercontent.com/solid-stack-digital/builder/refs/heads/main/schemas/mesh-schema.json",
  "name": "fullstack",

  "services": {
    "tester": {
      "compose": "./e2e/docker-compose.yml",
      "service": "global-e2e",
      "env": {
        "GATEWAY_URL": "${gateway.source.main.endpoints.http.public_url}",
        "MAILPIT_URL": "${backend.source.mailpit.endpoints.http.public_url}",
        "WEB_BASE_PATH": "/web"
      }
    },

    "backend": {
      "source": "./services/backend",

      "extends": {
        "main": {
          "requisites": {
            "gateway": "requirement"
          },
          "env": {
            "PUBLIC_APPLICATION_URL": "${gateway.source.main.endpoints.http.public_url}",
            "ENVIRONMENT": "mesh"
          }
        },

        "postgres": {
          "env": {
            "POSTGRES_DB": "mesh_backend"
          }
        },

        "mailpit": {
          "env": {
            "MP_MAX_MESSAGES": "500"
          }
        }
      },

      "publish": [
        "mailpit.endpoints.http"
      ]
    },

    "frontend": {
      "source": "./services/frontend",

      "extends": {
        "main": {
          "requisites": {
            "source.backend": false,
            "gateway": "requirement"
          },
          "env": {
            "BASE_PATH": "/web",
            "FRONTEND_EXTERNAL_URL": "${gateway.source.main.endpoints.http.public_url}/web",
            "NEXT_PUBLIC_BACKEND_URL": "${gateway.source.main.endpoints.http.public_url}/api"
          }
        }
      }
    },

    "gateway": {
      "source": "./services/gateway",

      "extends": {
        "main": {
          "requisites": {
            "source.frontend": false,
            "source.backend": false,
            "frontend": "requirement",
            "backend": "requirement"
          },
          "env": {
            "FRONTEND_URL": "${frontend.source.main.endpoints.http.network_url}",
            "BACKEND_URL": "${backend.source.main.endpoints.http.network_url}"
          }
        }
      },

      "publish": [
        "main.endpoints.http"
      ]
    }
  },

  "dev": {
    "services": {
      "backend": {
        "extends": {
          "main": {
            "env": {
              "ENVIRONMENT": "mesh-development"
            }
          },
          "mailpit": {
            "env": {
              "MP_MAX_MESSAGES": "1000"
            }
          }
        },
        "publish": [
          "main.endpoints.http",
          "mailpit.endpoints.http"
        ]
      },

      "frontend": {
        "extends": {
          "main": {
            "env": {
              "DEBUG_CLIENT": "true"
            }
          }
        }
      },

      "inspector": {
        "source": "./services/inspector",
        "publish": [
          "main.endpoints.http"
        ]
      }
    }
  },

  "prod": {
    "services": {
      "backend": {
        "extends": {
          "main": {
            "env": {
              "ENVIRONMENT": "production"
            }
          }
        }
      },

      "frontend": {
        "extends": {
          "main": {
            "env": {
              "DEBUG_CLIENT": "false"
            }
          }
        }
      }
    }
  },

  "e2e": {
    "services": {
      "backend": {
        "extends": {
          "main": {
            "env": {
              "ENVIRONMENT": "e2e",
              "RANKED_CARD_TIMEOUT_SECONDS": "30"
            }
          },
          "postgres": {
            "env": {
              "POSTGRES_DB": "mesh_backend_e2e"
            }
          }
        },
        "publish": [
          "mailpit.endpoints.http"
        ]
      },

      "frontend": {
        "extends": {
          "main": {
            "env": {
              "DEBUG_CLIENT": "true"
            }
          }
        }
      },

      "tester": {
        "env": {
          "E2E_PROFILE": "global"
        }
      },

      "audit-sink": {
        "source": "./services/audit-sink"
      }
    }
  }
}
```

## 86. Mesh Example Evaluation

### Base roots

Base non-tester roots are:

```text
backend
frontend
gateway
```

Tester is excluded until global E2E.

### Frontend source rewrite

Standalone frontend originally has:

```text
frontend.source.main
    -> requirement frontend.source.backend
```

Mesh applies:

```json
{
  "source.backend": false,
  "gateway": "requirement"
}
```

Effective frontend graph becomes:

```text
frontend.source.main
    -> requirement mesh gateway
```

The source-local backend mock becomes unreachable and does not materialize.

Because merge happens before reference validation, the source's old backend URL may be replaced safely by:

```text
gateway.source.main.endpoints.http.public_url
```

### Gateway source rewrite

Standalone gateway source may contain:

```text
gateway.source.main
├── requirement -> gateway.source.frontend
└── requirement -> gateway.source.backend
```

Mesh prunes both local edges and adds:

```text
frontend
backend
```

Effective graph:

```text
gateway.source.main
├── requirement -> mesh frontend
└── requirement -> mesh backend
```

Gateway env resolves to the fellow mesh source mains:

```text
frontend.source.main.endpoints.http.network_url
backend.source.main.endpoints.http.network_url
```

### Requirement cycles

The example intentionally creates requirement-only cycles:

```text
frontend <-> gateway
backend  <-> gateway
```

These are legal because they create reachability but no startup/readiness ordering.

### Nested backend source graph

When mesh backend is evaluated, Builder enters:

```text
backend.source.main
```

and follows Backend's own effective source requisites, such as Postgres, Mailpit, migration jobs, or other source-local modules.

### Publication

Base mesh publishes:

```text
gateway.source.main.endpoints.http
backend.source.mailpit.endpoints.http
```

Therefore tester references:

```text
gateway.source.main.endpoints.http.public_url
backend.source.mailpit.endpoints.http.public_url
```

are valid.

### Array replacement

Base backend publish list:

```json
[
  "mailpit.endpoints.http"
]
```

Dev backend publish list:

```json
[
  "main.endpoints.http",
  "mailpit.endpoints.http"
]
```

Because arrays replace, the dev list is exactly the second array.

### Stage-added mesh root

`dev.services.inspector` is a top-level non-tester mesh service in the effective dev mesh, so it becomes a dev execution root.

This does not contradict the rule for build-local stage-added services: build-local additions still require requisite reachability from `main`.

### Global E2E

Composition order:

```text
source base
-> source prod
-> source e2e
-> mesh base
-> mesh prod
-> mesh e2e
```

`audit-sink` is introduced as a top-level E2E mesh service and is therefore an E2E root.

The global tester starts only after the complete effective graph is healthy/completed according to lifecycle semantics and all sourced mains are healthy.

---

# Part XXIV — Invalid Examples

## 87. Reference Without Requisite

Invalid:

```json
{
  "main": {
    "env": {
      "DATABASE_URL": "${postgres.endpoints.database.network_address}"
    },
    "requisites": {}
  }
}
```

`postgres` does not exist in main's effective requisite closure.

## 88. Pruned But Still Referenced

If mesh prunes:

```json
{
  "source.backend": false
}
```

but a surviving effective env still references source backend, validation fails.

If the reference is replaced by a higher-precedence effective value before validation, the stale lower-precedence reference is ignored.

## 89. Publish Without `publicPort`

Invalid source endpoint:

```json
{
  "http": {
    "service": "mailpit",
    "port": 8025,
    "primary": true,
    "scheme": "http"
  }
}
```

Mesh:

```json
{
  "publish": [
    "mailpit.endpoints.http"
  ]
}
```

Invalid because no effective `publicPort` exists.

## 90. Publish Unreachable Service

A source declares `debug-ui`, but source `main` does not reach it.

This is invalid:

```json
{
  "publish": [
    "debug-ui.endpoints.http"
  ]
}
```

`publish` never creates reachability.

## 91. Dependency/Prerequisite Conflict

Invalid effective graph:

```text
A -> X as dependency
B -> X as prerequisite
```

Builder MUST reject it.

## 92. Ordering Cycle

Invalid:

```text
A --dependency----> B
B --prerequisite-> A
```

Requirement-only cycles remain valid.

## 93. Illegal Compose Stage Replacement

Invalid:

```json
{
  "dev": {
    "services": {
      "postgres": {
        "compose": "./some-other-postgres.yml"
      }
    }
  }
}
```

## 94. Illegal Mesh Source Replacement

Invalid:

```json
{
  "dev": {
    "services": {
      "backend": {
        "source": "./another-backend"
      }
    }
  }
}
```

---

# Part XXV — Removed and Superseded V2 Concepts

## 95. Removed Build Concepts

V3 removes or supersedes:

```text
app
dependencies
dependsOn
test-e2e Dockerfile target
EXEC_MODE=e2e
provider substitution as the primary composition mechanism
automatic provider-to-service_healthy lifecycle transfer
```

Equivalent behavior is represented through:

```text
services.main
ordinary services
requisites
dependency
prerequisite
mesh source/extends
```

## 96. Removed Mesh Concepts

V3 removes or supersedes:

```text
path
top-level tester
mesh-level env field outside extends
dependencies provider map
dependsOn
mesh test stage
```

V3 uses:

```text
services.tester
source
extends
publish
requisites
```

---

# Part XXVI — Canonical Mental Model

## 97. Build

```text
services
├── main
│   ├── env
│   ├── endpoints
│   ├── requisites
│   └── override-compose
│
├── tester
│   ├── compose
│   ├── service
│   └── env
│
└── ordinary services
    ├── compose
    ├── service?        # required when endpoint-less
    ├── env
    ├── endpoints
    └── requisites
```

## 98. Requisite Semantics

```text
requirement
    = reachable/materialized

dependency
    = reachable/materialized
    + target healthy before consumer proceeds

prerequisite
    = reachable/materialized
    + target successfully completed before consumer proceeds

false
    = delete inherited requisite edge
```

## 99. Mesh

```text
services
├── tester
│
├── backend
│   ├── source
│   ├── extends
│   └── publish
│
├── frontend
│   ├── source
│   ├── extends
│   └── publish
│
└── gateway
    ├── source
    ├── extends
    └── publish
```

## 100. Configuration Versus Graph

```text
references
    = consume values
    = never create requisites

requisites
    = graph existence/order

publish
    = expose already reachable endpoint

stages
    = transform declarations before validation

extends
    = transform imported source services

source
    = import independently runnable build
```

## 101. Compiler Principle

The central V3 compilation rule is:

```text
MERGE FIRST
    ↓
VALIDATE EFFECTIVE REFERENCES
    ↓
EVALUATE GRAPH
    ↓
MATERIALIZE
```

Builder never resolves or rejects a reference solely because it existed in a lower-precedence configuration that no longer survives.

---

# Part XXVII — Final V3 Invariants

1. Everything in a build is under `services`.
2. `main` and `tester` are reserved special service names.
3. `main` is the standalone graph root.
4. Only `main` receives `EXEC_MODE` and `INFRA_MODE`.
5. Valid `EXEC_MODE` values are `dev`, `test`, and `prod`.
6. Main Dockerfile targets are `dev`, `test`, and `prod`.
7. E2E is a configuration overlay, not an execution mode.
8. Tester is a separate Compose-backed service and runs only during E2E.
9. Tester requires `compose`, `service`, and optional `env`.
10. Ordinary services are Compose-backed atomic modules.
11. Ordinary services may be endpoint-less.
12. Endpoint-less ordinary services require top-level `service`.
13. Endpoint-bearing ordinary services use the primary endpoint's `service` as lifecycle representative.
14. Exactly one endpoint is primary when an endpoint collection exists.
15. `requirement` creates reachability only.
16. `dependency` creates reachability plus health ordering.
17. `prerequisite` creates reachability plus successful-completion ordering.
18. `false` deletes an inherited requisite edge.
19. Requirement-only cycles are valid.
20. Dependency/prerequisite ordering cycles are invalid.
21. A target cannot be both dependency- and prerequisite-classified.
22. Isolated execution does not traverse requisites.
23. Integrated build execution starts at `main`.
24. Every effective non-tester top-level mesh service is a mesh root.
25. Fellow mesh requisites resolve to the target source `main` and its effective tree.
26. Mesh service imports use `source`.
27. Imported source overrides live under `extends`.
28. `extends` modifies only existing source services.
29. Existing `source` and `compose` values are immutable.
30. Build stages are `dev`, `prod`, `test`, and `e2e`.
31. Mesh stages are `dev`, `prod`, and `e2e`.
32. E2E structured inheritance is `base -> prod -> e2e`.
33. Objects recursively merge.
34. Non-object values replace.
35. Arrays replace.
36. Stage-added build-local services require requisite reachability.
37. Stage-added top-level mesh services become mesh roots.
38. References never create requisites.
39. Self-reference is always permitted.
40. Cross-service references require effective requisite visibility.
41. Effective merging happens before reference validation.
42. `.endpoints.` remains explicit in endpoint references.
43. Cross-source references use `<mesh>.source.<service>.endpoints...`.
44. Mesh publish selectors omit `source` and are source-relative.
45. Mesh source endpoints are private by default.
46. Publish requires reachability and `publicPort`.
47. Publish never creates reachability.
48. `.env.dev`, `.env.prod`, `.env.test`, `.env.e2e`, and `.env.e2e-tester` retain their defined roles.
49. Normal services do not automatically receive main `.env.<stage>` files.
50. Builder-owned env is authoritative.
51. Main dev/prod runtime must have a healthcheck.
52. Dependency targets require healthchecks.
53. Prerequisites must exit successfully.
54. Tester waits for the complete effective graph to be healthy or successfully completed as appropriate.
55. Main specifically must be healthy before tester starts.
56. Mesh test Phase 1 excludes tester and sequentially runs standalone tests for base/root source services.
57. Mesh test Phase 2 runs global production-shaped E2E.
58. There is no `mesh.json.test` stage and no separate user-facing mesh E2E lifecycle.
59. Compose project/service/network namespacing is Builder-owned.
60. Build args are supplied through main `override-compose`.
61. V3 validation is fail-fast and is performed against the final effective composition.

---

# End of Specification
