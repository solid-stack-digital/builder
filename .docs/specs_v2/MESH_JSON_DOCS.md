# `mesh.json` V2 — Complete Field Reference

This document is the normative field-by-field reference for Builder V2 `mesh.json`.

For the full architecture, including `build.json`, dependency Compose behavior, endpoint semantics, lifecycle, publication, port allocation, and migration rules, see `SPECS_V2.md`.

---

# 1. Complete shape

```ts
type MeshJsonV2 = {
  $schema?: string;
  name?: string;

  tester?: {
    compose: string;
    service: string;
    env?: Record<string, string>;
  };

  services: Record<string, MeshService>;

  dev?: MeshStage;
  prod?: MeshStage;
  test?: MeshStage;
  e2e?: MeshStage;
};

type MeshService = {
  path: string;
  env?: Record<string, string>;
  dependencies?: Record<string, string>;
  dependsOn?: string[];
  publish?: string[];
};

type MeshStage = {
  services?: Record<string, MeshServiceStageOverlay>;
};

type MeshServiceStageOverlay = {
  path?: string;
  env?: Record<string, string>;
  dependencies?: Record<string, string>;
  dependsOn?: string[];
  publish?: string[];
};
```

For a service added for the first time inside a stage, the effective service still needs a valid `path`.

---

# 2. Top-level fields

## 2.1 `$schema`

### Type

```ts
string | undefined
```

### Required

No.

### Purpose

Points editor/tooling support to the Builder V2 mesh JSON Schema.

### Example

```json
{
  "$schema": "https://example.invalid/mesh-v2.schema.json",
  "services": {
    "backend": {
      "path": "./services/backend"
    }
  }
}
```

### Side effects

None at runtime.

---

## 2.2 `name`

### Type

```ts
string | undefined
```

### Required

No.

### Purpose

Defines the base identity of the composed mesh.

### Example

```json
{
  "name": "fullstack",
  "services": {
    "backend": {
      "path": "./services/backend"
    }
  }
}
```

### Side effects

Used for generated Docker Compose project names and diagnostics.

Typical stage identities:

```text
dev  -> fullstack
prod -> fullstack-prod
test -> fullstack-test
e2e  -> fullstack-e2e
```

If omitted, Builder may retain the current directory-basename fallback for the mesh project identity.

`name` does not create a mesh service and cannot be used as an endpoint reference by itself.

---

# 3. `services`

## 3.1 `services`

### Type

```ts
Record<string, MeshService>
```

### Required

Yes.

### Minimum

At least one effective service.

### Purpose

Defines independently runnable application services participating in the mesh.

### Example

```json
{
  "services": {
    "backend": {
      "path": "./services/backend"
    },
    "frontend": {
      "path": "./services/frontend"
    }
  }
}
```

### Service-name rules

Every top-level service key must match:

```text
^[a-z][a-z0-9-]*$
```

Reserved names:

```text
app
dependencies
tester
services
dev
prod
test
e2e
```

Examples of valid names:

```text
backend
users-api
payments-v2
gateway
```

Invalid examples:

```text
Backend
users_api
backend.api
services
tester
```

### Side effects

Each service points to another independently runnable project with its own `build.json`.

Builder composes that project according to the active mesh stage.

The mesh service key is the authoritative mesh identity used in:

- direct endpoint references;
- `dependencies` provider mappings;
- `dependsOn`;
- generated internal naming;
- diagnostics.

---

# 4. Mesh service fields

## 4.1 `services.<name>.path`

### Type

```ts
string
```

### Required

Yes in the effective service definition.

### Purpose

Points to the service directory containing that service’s `build.json`.

### Example

```json
"backend": {
  "path": "./services/backend"
}
```

### Side effects

Builder loads:

```text
./services/backend/build.json
```

and the Dockerfile declared by that build config.

Builder applies the active build-stage overlay corresponding to the active mesh stage.

The path must resolve within the allowed mesh project boundary according to Builder path-safety rules.

### Stage behavior

A stage may replace `path`.

For a stage-added service, `path` is required.

Example:

```json
"e2e": {
  "services": {
    "fake-payments": {
      "path": "./testing/fake-payments"
    }
  }
}
```

---

## 4.2 `services.<name>.env`

### Type

```ts
Record<string, string>
```

### Required

No.

### Purpose

Adds or overrides runtime environment on that mesh service’s app container.

### Example

```json
"gateway": {
  "path": "./services/gateway",
  "env": {
    "FRONTEND_URL": "${frontend.app.endpoints.http.network_url}",
    "BACKEND_URL": "${backend.app.endpoints.http.network_url}"
  }
}
```

### Side effects

This env layer is applied **after** the target service’s `build.json` app env and active build-stage env.

Base mesh env overrides build-level env for the same key.

Active mesh-stage env overrides base mesh env.

Builder internal environment remains authoritative above both.

### Important architectural rule

Prefer service `build.json` for environment that belongs to the service’s own logical dependency contract.

For example, if frontend already has:

```text
${dependencies.backend.endpoints.http.network_url}
```

in its own `build.json`, do not restate the same URL in mesh env.

Instead use:

```json
"frontend": {
  "path": "./services/frontend",
  "dependencies": {
    "backend": "backend"
  }
}
```

Mesh `env` is most useful for composition-owned configuration, such as gateway routing or mesh-specific feature flags.

### Supported references

Direct top-level app:

```text
${backend.app.endpoints.http.network_url}
```

Effective dependency slot of a mesh service:

```text
${frontend.dependencies.payments-api.endpoints.http.public_url}
```

No `services.` prefix is allowed.

### Non-side effect

An env reference does not create lifecycle ordering.

If gateway must wait for backend, declare `dependsOn`.

---

## 4.3 `services.<name>.dependencies`

### Type

```ts
Record<string, string>
```

### Required

No.

### Purpose

Binds a logical dependency slot declared by that service’s effective `build.json` to a concrete top-level mesh service.

### Shape

```text
key   = logical dependency slot
value = concrete top-level mesh provider service name
```

### Example

Frontend `build.json`:

```json
{
  "dependencies": {
    "backend": {
      "compose": ".docker/dependencies/mock-backend.compose.yml",
      "endpoints": {
        "http": {
          "service": "mock-backend",
          "port": 3000,
          "primary": true,
          "scheme": "http"
        }
      }
    }
  },
  "app": {
    "env": {
      "BACKEND_URL": "${dependencies.backend.endpoints.http.network_url}"
    }
  }
}
```

Mesh:

```json
"frontend": {
  "path": "./services/frontend",
  "dependencies": {
    "backend": "therealbackend"
  }
},
"therealbackend": {
  "path": "./services/backend"
}
```

### Side effects

The logical slot:

```text
frontend.dependencies.backend
```

is fulfilled by:

```text
therealbackend.app
```

The frontend’s original env reference remains unchanged.

Builder automatically creates the frontend-to-provider health lifecycle edge.

The frontend’s local `backend` dependency Compose implementation is completely suppressed.

### Atomic suppression

Substitution suppresses all local implementation pieces for that dependency:

- selected/endpoint-owning services;
- companion services;
- local volumes;
- configs;
- secrets;
- local dependency resources.

### Validation

Builder fails if:

- the key is not declared in the consumer’s effective `build.json.dependencies`;
- the provider service does not exist in the effective mesh;
- the provider binding participates in a lifecycle cycle;
- an actually used logical endpoint cannot be satisfied by the provider.

### Provider endpoint mapping

Logical dependency endpoint:

```text
dependencies.backend.endpoints.http
```

maps to:

```text
therealbackend.app.endpoints.http
```

Endpoint names must match.

Builder does not guess mappings.

### Compatibility behavior

The provider does not need to duplicate the full endpoint set of the local dependency.

Only actual effective references/usages must resolve.

For example, if the consumer only uses:

```text
dependencies.backend.endpoints.http.network_url
```

then the provider only needs a usable app endpoint named `http`.

Unused local `metrics` or `debug` endpoints need not exist on the provider.

### Port behavior

Provider port values may differ from the local dependency.

Example:

```text
local mock http port: 3000
real provider http port: 8080
```

is valid because Builder resolves the provider endpoint dynamically.

---

## 4.4 `services.<name>.dependsOn`

### Type

```ts
string[]
```

### Required

No.

### Purpose

Defines explicit top-level mesh lifecycle ordering.

### Example

```json
"gateway": {
  "path": "./services/gateway",
  "dependsOn": [
    "frontend",
    "backend"
  ]
}
```

### Side effects

Builder health-gates gateway on the app health of:

```text
frontend
backend
```

The dependent service does not start as ready before those upstream services satisfy their required Docker healthchecks.

All Builder lifecycle edges use:

```yaml
condition: service_healthy
```

There is no `service_started` fallback.

### Health source

For mesh `dev`, target services use the required `dev` Dockerfile healthcheck.

For mesh `prod` and `e2e`, target services use the required `prod` Dockerfile healthcheck.

### Validation

Errors:

- unknown service;
- self-dependency;
- cycle.

### Relationship to dependency substitution

If:

```json
"frontend": {
  "dependencies": {
    "backend": "backend"
  }
}
```

then Builder already creates:

```text
frontend -> backend
```

for lifecycle.

Adding `"backend"` again to frontend `dependsOn` is redundant.

### Stage merge

`dependsOn` union-merges with base.

Base:

```json
"dependsOn": [
  "backend"
]
```

E2E:

```json
"dependsOn": [
  "wiremock"
]
```

Effective E2E:

```json
[
  "backend",
  "wiremock"
]
```

Exact duplicates are removed.

### Non-side effect

Cross-service env references do not create `dependsOn`.

---

## 4.5 `services.<name>.publish`

### Type

```ts
string[]
```

### Required

No.

### Purpose

Selects which endpoints from this service’s effective build composition are actually exposed to the host in mesh mode.

### Allowed target forms

App endpoint:

```text
app.endpoints.<endpoint>
```

Local dependency endpoint:

```text
dependencies.<dependency>.endpoints.<endpoint>
```

### Example

```json
"frontend": {
  "path": "./services/frontend",
  "publish": [
    "app.endpoints.http",
    "dependencies.payments-api.endpoints.http"
  ]
}
```

### Side effects

Each selected endpoint becomes effectively host-published, assuming the corresponding build endpoint has a `publicPort`.

Only then are its `public_*` properties available.

### Critical rule

`mesh.json` never chooses the host port itself.

The endpoint’s `build.json` owns:

```text
port
publicPort
scheme
endpoint identity
```

`mesh.json` only chooses whether to publish it.

### Failure conditions

Builder fails if:

- target syntax is invalid;
- endpoint does not exist;
- endpoint has no `publicPort`;
- local dependency is not materialized;
- local dependency has been substituted by a mesh provider.

### Substituted dependency example

This is invalid if `frontend.dependencies.backend` is substituted:

```json
"frontend": {
  "publish": [
    "dependencies.backend.endpoints.http"
  ]
}
```

The local dependency implementation no longer exists.

Instead publish on the provider:

```json
"backend": {
  "publish": [
    "app.endpoints.http"
  ]
}
```

### Private-by-default behavior

Without `publish`, a mesh endpoint remains host-private even if its `build.json` declares:

```json
"publicPort": "AUTO"
```

No host port is allocated for that non-published mesh endpoint.

### Stage merge

`publish` union-merges with base.

Base:

```json
"publish": [
  "app.endpoints.http"
]
```

E2E:

```json
"publish": [
  "app.endpoints.metrics"
]
```

Effective E2E:

```json
[
  "app.endpoints.http",
  "app.endpoints.metrics"
]
```

V2 has no removal syntax.

---

# 5. `tester`

## 5.1 `tester`

### Type

```ts
{
  compose: string;
  service: string;
  env?: Record<string, string>;
}
```

### Required

No for ordinary dev/prod/unit operation.

Required when global mesh E2E execution is requested.

### Purpose

Defines the global black-box E2E test runner.

### Example

```json
"tester": {
  "compose": "./e2e/docker-compose.yml",
  "service": "tester",
  "env": {
    "SYSTEM_URL": "${gateway.app.endpoints.http.public_url}"
  }
}
```

### Side effects

The global tester is only materialized during global E2E execution.

It is not part of mesh dev, prod, or ordinary unit-test runtime.

There are no stage-specific tester overlays.

---

## 5.2 `tester.compose`

### Type

```ts
string
```

### Required

Yes when `tester` exists.

### Purpose

Points directly to the Docker Compose file that implements the global E2E tester.

### Example

```json
"tester": {
  "compose": "./e2e/docker-compose.yml",
  "service": "tester"
}
```

### Side effects

Builder loads the Compose file during global E2E.

The Compose file owns its own Docker build configuration, including:

- build context;
- Dockerfile path;
- target;
- helper test services if needed.

There is no `tester.dockerfile` field in `mesh.json`.

### Multi-service tester Compose

The tester Compose file may contain multiple services.

`tester.service` tells Builder which one is the actual finite runner whose exit code determines E2E success.

Builder materializes the tester implementation needed by that runner and collision-checks any resulting host exposure.

---

## 5.3 `tester.service`

### Type

```ts
string
```

### Required

Yes when `tester` exists.

### Purpose

Identifies the actual E2E runner service inside `tester.compose`.

### Example

Tester Compose:

```yaml
services:
  setup:
    image: alpine

  playwright:
    build:
      context: .
```

Mesh:

```json
"tester": {
  "compose": "./e2e/docker-compose.yml",
  "service": "playwright"
}
```

### Side effects

Builder:

- validates that `playwright` exists;
- uses it as the E2E exit-code source;
- applies `tester.env` to it;
- forces the selected runner into host-network black-box execution;
- removes dependence on internal Docker DNS for the runner;
- health-gates the runner on effective top-level application services.

### Healthcheck

The tester runner is finite and does not require a healthcheck.

---

## 5.4 `tester.env`

### Type

```ts
Record<string, string>
```

### Required

No.

### Purpose

Defines runtime environment for the selected global E2E runner.

### Example

```json
"tester": {
  "compose": "./e2e/docker-compose.yml",
  "service": "tester",
  "env": {
    "SYSTEM_URL": "${gateway.app.endpoints.http.public_url}",
    "FRONTEND_URL": "${frontend.app.endpoints.http.public_url}"
  }
}
```

### Critical host-network rule

The global E2E runner is intentionally a true external-style client.

Builder rejects endpoint references using:

```text
network_host
network_port
network_address
network_url
```

inside `tester.env`.

Use effective public properties:

```text
public_host
public_port
public_address
public_url
```

### Side effects

A tester public reference forces the referenced endpoint to already be validly published by mesh configuration.

The tester itself does not publish the target endpoint.

If the endpoint is not in `publish`, the reference fails.

### Why this matters

A global tester must interact with the system in the same way an external client does rather than bypassing routing or Docker host publication through internal service DNS.

---

# 6. Root stages

Mesh supports exactly:

```text
dev
prod
test
e2e
```

Each stage contains only:

```json
{
  "services": {}
}
```

No stage may contain a `tester`.

---

## 6.1 `dev`

### Type

`MeshStage`

### Purpose

Overlays the mesh for development composition.

### Example

```json
"dev": {
  "services": {
    "backend": {
      "env": {
        "LOG_LEVEL": "debug"
      }
    }
  }
}
```

### Side effects

Top-level mesh app services run using Dockerfile `dev`.

Mesh application services operate in integrated composition because they are actually composed together and/or with their local dependencies.

The service’s own `build.json.dev` overlay is also applied.

Mesh `dev` env is higher precedence than build `dev` env.

---

## 6.2 `prod`

### Type

`MeshStage`

### Purpose

Overlays production mesh composition.

### Example

```json
"prod": {
  "services": {
    "backend": {
      "env": {
        "LOG_LEVEL": "info"
      }
    }
  }
}
```

### Side effects

Top-level apps use Dockerfile `prod`.

The service’s own `build.json.prod` overlay is applied.

`mesh.prod` is not automatically inherited by E2E.

---

## 6.3 `test`

### Type

`MeshStage`

### Purpose

Provides mesh-level overlay data for test-stage orchestration.

### Example

```json
"test": {
  "services": {
    "backend": {
      "env": {
        "LOG_LEVEL": "silent"
      }
    }
  }
}
```

### Side effects

During isolated/unit mesh testing, services use their `test` Dockerfile target and service `build.json.test` configuration.

Mesh test env can be applied to the corresponding service test process where Builder is executing that service under mesh orchestration.

Cross-service network endpoint references are not usable in an isolated test process unless Builder is compiling a corresponding integrated test composition; unresolved references fail rather than being guessed.

---

## 6.4 `e2e`

### Type

`MeshStage`

### Purpose

Defines the effective global E2E composition.

### Example

```json
"e2e": {
  "services": {
    "fake-payments": {
      "path": "./testing/fake-payments"
    },
    "frontend": {
      "dependencies": {
        "payments-api": "fake-payments"
      }
    }
  }
}
```

### Side effects

Apps are built from their Dockerfile `prod` targets but run with E2E runtime configuration.

Each service’s own `build.json.e2e` overlay is applied.

`mesh.e2e` is applied.

`mesh.prod` is not inherited.

The root global tester is materialized.

---

# 7. Stage service overlays

## 7.1 `<stage>.services`

### Type

```ts
Record<string, MeshServiceStageOverlay>
```

### Required

No.

### Purpose

Modifies existing services or adds stage-only top-level services.

### Example

```json
"e2e": {
  "services": {
    "wiremock": {
      "path": "./testing/wiremock"
    },
    "gateway": {
      "dependsOn": [
        "wiremock"
      ]
    }
  }
}
```

### Side effects

Stage-added services participate in:

- reference resolution;
- provider binding;
- lifecycle graph validation;
- publication;
- port allocation;
- global E2E readiness where applicable.

### No removal semantics

V2 does not support:

```text
remove
disabled
delete
null-to-delete
```

Omitted base services remain present.

---

## 7.2 `<stage>.services.<name>.path`

### Type

```ts
string | undefined
```

### Purpose

Overrides the base service path or supplies the path for a stage-added service.

### Example

```json
"e2e": {
  "services": {
    "fake-payments": {
      "path": "./testing/fake-payments"
    }
  }
}
```

### Side effects

The active stage loads the build config from the effective path.

For a new stage-only service, the effective result must contain `path`.

---

## 7.3 `<stage>.services.<name>.env`

Same type and rules as base service `env`.

### Merge

Keywise merge.

Base:

```json
"env": {
  "LOG_LEVEL": "info",
  "FEATURE": "on"
}
```

E2E:

```json
"env": {
  "LOG_LEVEL": "debug"
}
```

Effective:

```json
{
  "LOG_LEVEL": "debug",
  "FEATURE": "on"
}
```

### Side effects

Stage env has higher precedence than base mesh env.

Builder internal env remains higher than both.

---

## 7.4 `<stage>.services.<name>.dependencies`

### Type

```ts
Record<string, string>
```

### Merge

Keywise merge.

### Example

Base:

```json
"dependencies": {
  "backend": "backend"
}
```

E2E:

```json
"dependencies": {
  "payments-api": "fake-payments"
}
```

Effective E2E:

```json
{
  "backend": "backend",
  "payments-api": "fake-payments"
}
```

### Conflict behavior

If the stage supplies the same logical dependency key as base, the stage provider wins.

Example:

Base:

```json
"payments-api": "payments"
```

E2E:

```json
"payments-api": "fake-payments"
```

Effective E2E provider:

```text
fake-payments
```

### Side effects

Changing a provider:

- suppresses the local dependency implementation;
- points logical endpoint resolution at the new provider;
- changes the automatic lifecycle provider edge.

---

## 7.5 `<stage>.services.<name>.dependsOn`

Union-merges with base.

### Example

Base:

```json
"dependsOn": [
  "backend"
]
```

Stage:

```json
"dependsOn": [
  "wiremock"
]
```

Effective:

```json
[
  "backend",
  "wiremock"
]
```

### Side effects

All effective targets must exist and be healthy before the dependent app is allowed to proceed according to Builder lifecycle ordering.

---

## 7.6 `<stage>.services.<name>.publish`

Union-merges with base.

### Example

Base:

```json
"publish": [
  "app.endpoints.http"
]
```

E2E:

```json
"publish": [
  "app.endpoints.metrics"
]
```

Effective:

```json
[
  "app.endpoints.http",
  "app.endpoints.metrics"
]
```

### Side effects

Every effective publish entry participates in host-port resolution for that stage.

Because V2 has no removal semantics, a base-published endpoint remains published in later stage overlays.

---

# 8. Direct mesh endpoint references

## 8.1 App endpoint

```text
${<service>.app.endpoints.<endpoint>.<property>}
```

Example:

```text
${backend.app.endpoints.http.network_url}
```

---

## 8.2 Service dependency endpoint

```text
${<service>.dependencies.<logical-dependency>.endpoints.<endpoint>.<property>}
```

Example:

```text
${frontend.dependencies.payments-api.endpoints.http.public_url}
```

This resolves through the service’s effective logical dependency slot.

If that slot is substituted, resolution follows the provider.

If it remains local, resolution follows the local dependency Compose endpoint.

---

## 8.3 Available properties

```text
network_host
network_port
network_address
network_url
public_host
public_port
public_address
public_url
```

Rules:

- URL requires endpoint `scheme`;
- public property requires effective mesh publication;
- missing/unresolved values fail.

---

# 9. Provider compatibility side effects

Suppose:

```json
"frontend": {
  "dependencies": {
    "backend": "therealbackend"
  }
}
```

and frontend build env uses only:

```text
${dependencies.backend.endpoints.http.network_url}
```

Then Builder checks only that the provider can satisfy:

```text
therealbackend.app.endpoints.http.network_url
```

The provider does not need local dependency endpoints such as:

```text
debug
metrics
admin
```

unless the effective composition actually references them.

### Property-specific validation

| Consumer property | Provider requirement |
|---|---|
| `network_host` | endpoint exists |
| `network_port` | endpoint exists |
| `network_address` | endpoint exists |
| `network_url` | endpoint exists + scheme |
| `public_host` | endpoint exists + effectively published |
| `public_port` | endpoint exists + effectively published |
| `public_address` | endpoint exists + effectively published |
| `public_url` | endpoint exists + scheme + effectively published |

### Not required

Provider endpoint:

- does not need same container port as local mock;
- does not need same public port;
- does not need the same unused extra endpoints.

### Required

Logical endpoint name must match provider app endpoint name exactly.

No endpoint remapping field exists in V2.

---

# 10. Publication and port allocation

## 10.1 Example

Backend build:

```json
{
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

Mesh without publish:

```json
"backend": {
  "path": "./services/backend"
}
```

Result:

```text
network_* available
public_* unavailable
no host port allocated
```

Mesh with publish:

```json
"backend": {
  "path": "./services/backend",
  "publish": [
    "app.endpoints.http"
  ]
}
```

Result:

```text
network_* available
AUTO host port allocated
public_* available
```

---

## 10.2 Fixed collision example

Service A:

```text
publicPort = 8080
```

Service B:

```text
publicPort = 8080
```

If both are published in the same effective mesh, Builder fails.

If neither or only one is published, there is no mesh host-port conflict from the non-published endpoint.

---

## 10.3 AUTO allocation

Builder:

1. resolves the effective mesh;
2. gathers only actually published endpoints;
3. reserves fixed public ports;
4. sorts mesh services alphabetically;
5. processes app endpoints;
6. processes dependencies alphabetically;
7. processes dependency endpoints alphabetically;
8. reuses valid cached AUTO ports where possible;
9. scans deterministically when reuse is impossible.

The cache lives under gitignored `.builder`.

Generated port numbers are implementation output, not configuration input.

---

# 11. Global tester example

```json
{
  "tester": {
    "compose": "./e2e/docker-compose.yml",
    "service": "playwright",
    "env": {
      "SYSTEM_URL": "${gateway.app.endpoints.http.public_url}"
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

Tester Compose:

```yaml
services:
  playwright:
    build:
      context: .
      dockerfile: Dockerfile
    command: ["pnpm", "test:e2e"]
```

### Resulting behavior

Builder:

- compiles gateway using E2E build/runtime rules;
- publishes gateway HTTP according to gateway `build.json.publicPort`;
- resolves `SYSTEM_URL` to host `127.0.0.1:<effective-port>`;
- runs `playwright` as host-networked black-box runner;
- waits for gateway health;
- exits according to `playwright` result.

---

# 12. Comprehensive example

```json
{
  "$schema": "https://example.invalid/mesh-v2.schema.json",
  "name": "fullstack",

  "tester": {
    "compose": "./e2e/docker-compose.yml",
    "service": "tester",
    "env": {
      "SYSTEM_URL": "${gateway.app.endpoints.http.public_url}",
      "FRONTEND_URL": "${frontend.app.endpoints.http.public_url}"
    }
  },

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
    },

    "users-api": {
      "path": "./services/users-api"
    },

    "gateway": {
      "path": "./services/gateway",
      "env": {
        "FRONTEND_URL": "${frontend.app.endpoints.http.network_url}",
        "BACKEND_URL": "${backend.app.endpoints.http.network_url}",
        "USERS_URL": "${users-api.app.endpoints.http.network_url}"
      },
      "dependsOn": [
        "frontend",
        "backend",
        "users-api"
      ],
      "publish": [
        "app.endpoints.http"
      ]
    }
  },

  "dev": {
    "services": {
      "backend": {
        "env": {
          "LOG_LEVEL": "debug"
        }
      }
    }
  },

  "prod": {
    "services": {
      "backend": {
        "env": {
          "LOG_LEVEL": "info"
        }
      }
    }
  },

  "test": {
    "services": {
      "backend": {
        "env": {
          "LOG_LEVEL": "silent"
        }
      }
    }
  },

  "e2e": {
    "services": {
      "fake-payments": {
        "path": "./testing/fake-payments"
      },

      "frontend": {
        "dependencies": {
          "payments-api": "fake-payments"
        }
      },

      "gateway": {
        "dependsOn": [
          "fake-payments"
        ],
        "publish": [
          "app.endpoints.metrics"
        ]
      }
    }
  }
}
```

---

# 13. Removed V1/V1.2 fields

V2 rejects old mesh configuration instead of translating it.

| Removed field | V2 replacement |
|---|---|
| root `dependencies` | service-local `build.json.dependencies` or top-level mesh service |
| service `port` | build endpoint `publicPort` + mesh `publish` |
| service `preservePort` | no equivalent; build owns port |
| service `provideDependency` | service `dependencies` |
| service `replaceMocks` | service `dependencies` |
| service `envOverrides` | service `env` |
| service `healthcheck` | Dockerfile healthcheck contract |
| tester `path` | tester `compose` |
| tester `dockerfile` | tester Compose owns build config |
| tester `envOverrides` | tester `env` |
| tester `policy` | Builder-owned validation |
| `inherit-published` | no field; publication is explicit and merged by stage |

There is no root mesh dependency namespace in V2.

---

# 14. Common patterns

## Bind a local mock slot to a real mesh service

```json
"services": {
  "backend": {
    "path": "./services/backend"
  },

  "frontend": {
    "path": "./services/frontend",
    "dependencies": {
      "backend": "backend"
    }
  }
}
```

Frontend build config keeps its own logical dependency env reference.

---

## Publish only the gateway

```json
"services": {
  "backend": {
    "path": "./services/backend"
  },

  "frontend": {
    "path": "./services/frontend"
  },

  "gateway": {
    "path": "./services/gateway",
    "publish": [
      "app.endpoints.http"
    ]
  }
}
```

Backend/frontend remain host-private even if their build configs contain `publicPort`.

---

## Publish a retained local dependency UI

```json
"frontend": {
  "path": "./services/frontend",
  "publish": [
    "app.endpoints.http",
    "dependencies.payments-api.endpoints.admin"
  ]
}
```

The local payments dependency must remain unsubstituted and its `admin` endpoint must have `publicPort` in frontend `build.json`.

---

## Stage-only provider

```json
"e2e": {
  "services": {
    "fake-payments": {
      "path": "./testing/fake-payments"
    },

    "frontend": {
      "dependencies": {
        "payments-api": "fake-payments"
      }
    }
  }
}
```

`fake-payments` does not exist in dev or prod.

---

## Composition-owned gateway wiring

```json
"gateway": {
  "path": "./services/gateway",
  "env": {
    "FRONTEND_URL": "${frontend.app.endpoints.http.network_url}",
    "BACKEND_URL": "${backend.app.endpoints.http.network_url}"
  },
  "dependsOn": [
    "frontend",
    "backend"
  ]
}
```

Env establishes addresses.

`dependsOn` establishes startup/readiness ordering.

---

# 15. Summary

`mesh.json` answers:

```text
Which independently runnable services participate?
Which service fulfills each logical dependency slot?
What composition-owned environment is applied?
Which top-level services must be healthy before another starts?
Which build-declared endpoints are actually published to the host?
What changes in dev/prod/test/e2e?
What global black-box E2E runner should execute?
```

It does not answer:

```text
What ports does an endpoint use?
What scheme does an endpoint use?
How is a local dependency implemented?
Which Compose service owns a dependency endpoint?
What is the app Dockerfile?
What environment belongs intrinsically to a service?
```

Those belong in the service’s `build.json`.
