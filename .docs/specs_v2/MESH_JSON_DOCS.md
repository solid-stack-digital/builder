# `mesh.json` V2 — Complete Field Reference

This document is the normative field-by-field reference for Builder V2 `mesh.json`.

For the complete architecture and execution model, see `SPECS_V2.md`.

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

Effective stage inheritance:

```text
dev  = base -> dev
prod = base -> prod
e2e  = base -> prod -> e2e
```

Canonical global `make test` uses the two-phase execution model described later; it does not replace each service's own test lifecycle with a separate integrated mesh-test topology.

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

Points editors/tooling to the Builder V2 mesh JSON Schema.

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

Defines the mesh project identity used by Builder-generated Compose projects and diagnostics.

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

Typical stage project identities may derive from this name.

If omitted, Builder may derive the base identity from the mesh directory name.

Does not create a service or endpoint.

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

At least one root service.

### Purpose

Defines the independently runnable application services that make up the mesh.

### Example

```json
{
  "services": {
    "backend": {
      "path": "./services/backend",
      "env": {
        "SERVICE_NAME": "backend"
      }
    },
    "frontend": {
      "path": "./services/frontend"
    }
  }
}
```

### Service-name grammar

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

### Side effects

Each root entry:

- loads another independently runnable service project;
- gives that service its authoritative mesh identity;
- participates in mesh dependency binding, lifecycle, publication, and diagnostics;
- is a Phase-1 service during global `make test`.

Services added only by stage overlays are **not** Phase-1 members unless they also exist in root `services`.

### Repository layout

Builder does not require Git submodules.

Every service is nevertheless treated as an independent project with its own `build.json`, Dockerfile contract, and standalone lifecycle.

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

Points to the service directory containing that service's `build.json`.

### Example

```json
"backend": {
  "path": "./services/backend"
}
```

### Side effects

Builder loads the service's own build configuration and Dockerfile contract.

The service remains responsible for its own local/default dependencies.

Path must satisfy Builder path-safety rules.

### Stage behavior

A stage may override an inherited path.

A service introduced for the first time by a stage must provide `path`.

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

## 4.2 `services.<name>.dependencies`

### Type

```ts
Record<string, string>
```

### Required

No.

### Purpose

Binds a logical dependency slot declared by the consumer service's effective `build.json.dependencies` to a concrete top-level mesh service.

### Shape

```text
key   = consumer logical dependency slot
value = top-level mesh provider service
```

### Example

Consumer build:

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
{
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
}
```

### Side effects

For `frontend`:

```text
logical dependency slot backend
-> top-level mesh service backend
-> backend.app endpoint with matching endpoint name
```

Builder:

- suppresses frontend's local `backend` dependency Compose implementation atomically;
- resolves logical dependency endpoint references against the provider;
- creates the consumer-to-provider health lifecycle edge automatically.

### No dependency classification

Builder does **not** distinguish `third-party` from `fellow-service` dependencies as schema types.

Any declared logical dependency may be explicitly satisfied by a mesh provider.

If no provider is supplied, the service-owned local integrated dependency implementation remains in use.

### Validation

Builder fails if:

- the dependency key is not declared by the consumer's effective `build.json`;
- the provider service does not exist in the effective mesh;
- the provider relationship creates a lifecycle cycle;
- an actually consumed endpoint/property cannot be satisfied by the provider.

### Reference-driven compatibility

If the consumer uses only:

```text
${dependencies.backend.endpoints.http.network_url}
```

the provider needs only a compatible app endpoint named `http` with the properties needed for that reference.

Provider ports do not need to equal local mock ports.

Unused endpoint-set equality is not required.

Builder does not guess endpoint-name remappings.

---

## 4.3 `services.<name>.dependsOn`

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

The dependent app is health-gated on the target app services.

Builder uses:

```yaml
condition: service_healthy
```

There is no `service_started` fallback.

### Health source

- mesh dev => provider app `dev` healthcheck;
- mesh prod => provider app `prod` healthcheck;
- global E2E => provider app `prod` healthcheck.

### Validation

Fails on:

- missing target;
- self-dependency;
- lifecycle cycle.

### Relationship to substitution

If:

```json
"frontend": {
  "dependencies": {
    "backend": "backend"
  }
}
```

Builder already creates the frontend-to-backend lifecycle edge.

Adding `backend` again to `frontend.dependsOn` is redundant.

### Stage merge

`dependsOn` union-merges:

```text
inherited entries
-> stage additions
-> exact duplicates removed
```

---

## 4.4 `services.<name>.publish`

### Type

```ts
string[]
```

### Required

No.

### Purpose

Selects which already-publishable endpoints are actually exposed to the host by this mesh.

### Allowed target forms

App endpoint:

```text
app.endpoints.<endpoint>
```

Retained local dependency endpoint:

```text
dependencies.<dependency>.endpoints.<endpoint>
```

### Example

```json
"frontend": {
  "path": "./services/frontend",
  "publish": [
    "app.endpoints.http",
    "dependencies.payments-api.endpoints.admin"
  ]
}
```

### Side effects

Each selected endpoint becomes effectively host-published.

Its `public_*` properties become available.

### Build remains authoritative

Mesh does **not** decide endpoint definition or publication capability.

`build.json` owns:

```text
port
publicPort
scheme
endpoint identity
```

Mesh only selects whether an already-publishable endpoint is exposed.

### Critical validation

Builder fails if:

- target syntax is invalid;
- endpoint does not exist;
- endpoint has no `publicPort`;
- local dependency is not materialized;
- local dependency was substituted by a mesh provider.

Therefore this is invalid if build endpoint lacks `publicPort`:

```json
"publish": [
  "app.endpoints.metrics"
]
```

Mesh cannot turn a private-only build endpoint into a public endpoint.

### Substituted dependency

If consumer dependency `backend` is substituted, this is invalid:

```json
"publish": [
  "dependencies.backend.endpoints.http"
]
```

The local dependency implementation no longer exists.

Publish on the provider service instead:

```json
"backend": {
  "publish": [
    "app.endpoints.http"
  ]
}
```

### Private-by-default

A build endpoint having:

```json
"publicPort": "AUTO"
```

does not expose it in mesh mode by itself.

Without `publish`:

```text
network_* available
public_* unavailable
no host port allocated
```

### Stage merge

`publish` union-merges with inherited values.

There is no stage removal syntax.

---

# 5. Mesh service environment

## 5.1 `services.<name>.env`

### Type

```ts
Record<string, string>
```

### Required

No.

### Purpose

Adds composition-level runtime environment to that mesh service's application container.

### Example

```json
"gateway": {
  "path": "./services/gateway",
  "env": {
    "FRONTEND_URL": "${frontend.app.endpoints.http.network_url}",
    "BACKEND_URL": "${backend.app.endpoints.http.network_url}",
    "LOG_LEVEL": "debug"
  }
}
```

### Side effects

Mesh env overlays the target service's build-owned application env.

All values must be strings.

Supported Builder endpoint references may be used.

An env reference does **not** create lifecycle ordering. Use `dependsOn` or dependency substitution when readiness ordering is required.

### Recommended use

Use service-owned logical dependency slots for dependency relationships whenever that models the relationship cleanly.

Mesh env remains intentionally available for composition-specific configuration, gateway/routing values, feature flags, or any other application environment that the composition needs to override.

## 5.2 `<stage>.services.<name>.env`

Stage service env is also allowed.

It keywise-merges over base mesh service env.

For example:

```json
{
  "services": {
    "backend": {
      "path": "./services/backend",
      "env": {
        "LOG_LEVEL": "info",
        "FEATURE_X": "off"
      }
    }
  },

  "prod": {
    "services": {
      "backend": {
        "env": {
          "LOG_LEVEL": "warn"
        }
      }
    }
  },

  "e2e": {
    "services": {
      "backend": {
        "env": {
          "LOG_LEVEL": "debug",
          "FEATURE_X": "on"
        }
      }
    }
  }
}
```

Effective E2E mesh env:

```json
{
  "LOG_LEVEL": "debug",
  "FEATURE_X": "on"
}
```

because E2E inheritance is:

```text
base -> prod -> e2e
```

## 5.3 Complete app env precedence

For ordinary mesh execution, low to high:

```text
.env.<stage>
-> build.json base app.env
-> build.json active-stage app.env
-> active-stage override-compose app environment
-> mesh.json base services.<name>.env
-> mesh.json active-stage services.<name>.env
-> Builder internal base environment
-> Builder internal active-stage environment
```

For global E2E, low to high:

```text
.env.e2e
-> build.json base app.env
-> build.json prod app.env
-> build.json prod override-compose app environment
-> build.json e2e app.env
-> build.json e2e override-compose app environment
-> mesh.json base services.<name>.env
-> mesh.json prod.services.<name>.env
-> mesh.json e2e.services.<name>.env
-> Builder internal base environment
-> Builder internal E2E environment
```

`.env.prod` is not merged into `.env.e2e`.

Builder-owned internal values remain authoritative.

---

# 6. `tester`

## 6.1 `tester`

### Type

```ts
{
  compose: string;
  service: string;
  env?: Record<string, string>;
}
```

### Required

No for ordinary mesh dev/prod.

Required when global E2E execution is requested.

### Purpose

Defines the global black-box E2E tester.

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

Tester is materialized only during global E2E.

No stage-specific tester overlay exists.

---

## 6.2 `tester.compose`

### Type

```ts
string
```

### Required

Yes when `tester` exists.

### Purpose

Points directly to the global tester Compose file.

### Example

```json
"tester": {
  "compose": "./e2e/docker-compose.yml",
  "service": "tester"
}
```

### Side effects

The Compose file owns the tester implementation, including its build context and helper services.

There is no `tester.path` or `tester.dockerfile` field in `mesh.json`.

The selected tester runner's effective execution target is `test-e2e`.

Tester Compose may include helper services.

---

## 6.3 `tester.service`

### Type

```ts
string
```

### Required

Yes when `tester` exists.

### Purpose

Names the finite E2E runner service inside `tester.compose`.

### Example

Tester Compose:

```yaml
services:
  setup:
    image: alpine

  playwright:
    build:
      context: .
      target: test-e2e
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

- validates the service exists;
- applies tester environment to it;
- runs it as the E2E exit-code source;
- gives it `EXEC_MODE=e2e`;
- does **not** inject `INFRA_MODE`;
- runs it as a host-networked black-box client;
- health-gates it on the effective top-level system applications.

Finite tester runner does not require a healthcheck.

---

## 6.4 `tester.env`

### Type

```ts
Record<string, string>
```

### Required

No.

### Purpose

Adds runtime environment for the global E2E runner.

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

### Precedence

Low to high:

```text
root .env.e2e-tester
-> mesh.json tester.env
-> Builder internal tester environment
```

`.env.e2e-tester` is separate from every service's `.env.e2e`.

They are never implicitly merged.

### Endpoint restrictions

Tester is host-networked.

These endpoint properties are invalid in tester env:

```text
network_host
network_port
network_address
network_url
```

Use:

```text
public_host
public_port
public_address
public_url
```

The referenced endpoint must already be effectively published.

Tester env does not itself publish anything.

---

# 7. Root stages

Mesh supports:

```text
dev
prod
test
e2e
```

Each stage has:

```ts
{
  services?: Record<string, MeshServiceStageOverlay>;
}
```

A stage may not contain `tester`.

---

## 7.1 `dev`

### Effective config

```text
base -> dev
```

### Runtime

Every effective app:

```text
target=dev
EXEC_MODE=dev
INFRA_MODE=integrated
env file=.env.dev
```

### Side effects

- all mesh apps run development execution;
- provided dependency slots resolve to mesh providers;
- unprovided dependencies use service-owned integrated implementations.

### Example

```json
"dev": {
  "services": {
    "frontend": {
      "publish": [
        "app.endpoints.http"
      ]
    }
  }
}
```

---

## 7.2 `prod`

### Effective config

```text
base -> prod
```

### Runtime

Every effective app:

```text
target=prod
EXEC_MODE=prod
INFRA_MODE=integrated
env file=.env.prod
```

### Side effects

Defines the production-shaped topology inherited by global E2E.

Example:

```json
"prod": {
  "services": {
    "frontend": {
      "dependencies": {
        "backend": "backend"
      }
    }
  }
}
```

---

## 7.3 `test`

### Purpose

A structured mesh test-stage namespace retained for explicit Builder test-stage tooling.

### Important global-test rule

Canonical global `make test` does **not** replace each service's own test lifecycle with one integrated `mesh test` topology.

Global test Phase 1 always runs every root service's semantic standalone `make test`.

Global test Phase 2 uses:

```text
base -> prod -> e2e
```

not `base -> test`.

---

## 7.4 `e2e`

### Purpose

Applies global-E2E-only overrides on top of production topology.

### Effective config

```text
base -> prod -> e2e
```

### App runtime

Every effective app:

```text
target=prod
EXEC_MODE=prod
INFRA_MODE=integrated
env file=<service>/.env.e2e
```

### Tester runtime

```text
target=test-e2e
EXEC_MODE=e2e
INFRA_MODE not set
env file=root .env.e2e-tester
```

### Allowed E2E composition changes

E2E may:

- add top-level services;
- override existing dependency-provider bindings;
- add lifecycle edges;
- publish additional endpoints that `build.json` already made publishable;
- change effective service paths if explicitly configured.

This supports inspection/test infrastructure and controlled substitutes while applications still execute as production applications.

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
```

---

# 8. Stage service overlays

## 8.1 `<stage>.services`

### Type

```ts
Record<string, MeshServiceStageOverlay>
```

### Required

No.

### Purpose

Modifies existing mesh services or adds stage-only services.

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

Stage-added services participate in effective:

- reference resolution;
- provider binding;
- lifecycle;
- publication;
- port allocation;
- global E2E readiness.

No generic service-removal syntax exists.

---

## 8.2 `<stage>.services.<name>.path`

### Type

```ts
string | undefined
```

### Purpose

Overrides inherited service path or supplies the path for a stage-added service.

### Validation

A newly added effective service must resolve a valid path.

---

## 8.3 `<stage>.services.<name>.env`

### Type

```ts
Record<string, string>
```

### Merge

Keywise merge over inherited mesh service env.

For E2E the mesh env chain is:

```text
base service env
-> prod service env
-> e2e service env
```

Stage values win for matching keys.

Environment references do not imply lifecycle ordering.

---

## 8.4 `<stage>.services.<name>.dependencies`

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

Prod:

```json
"dependencies": {
  "payments-api": "payments"
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

### Side effects

For a key overridden by the stage:

- prior provider binding is replaced;
- logical endpoint resolution follows the new provider;
- automatic lifecycle edge follows the new provider;
- local dependency remains suppressed because a provider still exists.

---

## 8.5 `<stage>.services.<name>.dependsOn`

Union-merges with inherited values.

Example:

```text
base: ["backend"]
e2e: ["wiremock"]

effective:
["backend", "wiremock"]
```

Every effective target must exist and become healthy.

---

## 8.6 `<stage>.services.<name>.publish`

Union-merges with inherited values.

Example:

```text
base: ["app.endpoints.http"]
e2e: ["app.endpoints.metrics"]

effective:
[
  "app.endpoints.http",
  "app.endpoints.metrics"
]
```

Every effective publish entry participates in host-port resolution.

Because V2 has no generic removal syntax, inherited publication remains unless a future explicit removal contract is introduced.

---

# 9. Mesh endpoint references

Where a mesh field supports Builder references, use:

## App endpoint

```text
${<service>.app.endpoints.<endpoint>.<property>}
```

Example:

```text
${gateway.app.endpoints.http.public_url}
```

## Effective dependency endpoint

```text
${<service>.dependencies.<logical-dependency>.endpoints.<endpoint>.<property>}
```

Example:

```text
${frontend.dependencies.payments-api.endpoints.http.public_url}
```

There is no `services.` prefix.

Current primary user is global `tester.env`.

---

# 10. Endpoint property requirements

| Property | Requirement |
|---|---|
| `network_host` | endpoint exists |
| `network_port` | endpoint exists |
| `network_address` | endpoint exists |
| `network_url` | endpoint exists + scheme |
| `public_host` | endpoint exists + effectively published |
| `public_port` | endpoint exists + effectively published |
| `public_address` | endpoint exists + effectively published |
| `public_url` | endpoint exists + scheme + effectively published |

Provider endpoint ports do not have to match local/default dependency ports.

Logical endpoint names must match exactly.

---

# 11. Publication and host ports

## 11.1 Example

Backend build endpoint:

```json
"http": {
  "port": 3000,
  "publicPort": "AUTO",
  "primary": true,
  "scheme": "http"
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

## 11.2 Fixed collision

If two actually published endpoints claim the same numeric `publicPort`, Builder fails.

A non-published endpoint does not reserve that mesh host port.

## 11.3 AUTO allocation

Builder:

1. resolves `base -> active stage`, or `base -> prod -> e2e`;
2. resolves provider substitutions;
3. gathers actually published endpoints;
4. reserves fixed public ports;
5. sorts top-level services alphabetically;
6. processes app endpoints first;
7. processes dependencies alphabetically;
8. processes dependency endpoints alphabetically;
9. reuses valid cached AUTO ports where possible;
10. scans deterministically when needed.

AUTO cache lives under gitignored `.builder`.

---

# 12. Global `make test`

Global test has exactly two phases.

## Phase 1 — Independent service tests

For every root `mesh.json.services` entry, sequentially:

```text
run semantic equivalent of service make test
  -> service unit / isolated
  -> service E2E
  -> teardown
```

Rules:

- deterministic sequential execution;
- no concurrency;
- any failure stops the pipeline;
- after each service, all app/dependency/tester/network/port/runtime state is torn down.

Stage-only services are not Phase-1 members unless they also exist in root `services`.

## Phase 2 — Global E2E

Start a clean effective mesh:

```text
base -> prod -> e2e
```

Every app:

```text
target=prod
EXEC_MODE=prod
INFRA_MODE=integrated
own .env.e2e
```

Then run global tester:

```text
target=test-e2e
EXEC_MODE=e2e
no INFRA_MODE
root .env.e2e-tester
```

No Phase-1 state may leak into Phase 2.

Builder may invoke the underlying service lifecycle directly; literal shell execution of each Make target is not required.

---

# 13. Complete example

```json
{
  "$schema": "https://example.invalid/mesh-v2.schema.json",
  "name": "fullstack",

  "tester": {
    "compose": "./e2e/docker-compose.yml",
    "service": "tester",
    "env": {
      "SYSTEM_URL": "${gateway.app.endpoints.http.public_url}"
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

    "gateway": {
      "path": "./services/gateway",
      "env": {
        "ROUTING_MODE": "mesh"
      },
      "dependencies": {
        "frontend": "frontend",
        "backend": "backend"
      },
      "publish": [
        "app.endpoints.http"
      ]
    }
  },

  "dev": {
    "services": {
      "frontend": {
        "publish": [
          "app.endpoints.metrics"
        ]
      }
    }
  },

  "prod": {
    "services": {
      "backend": {
        "env": {
          "LOG_LEVEL": "info"
        }
      },
      "gateway": {
        "dependsOn": [
          "frontend",
          "backend"
        ]
      }
    }
  },

  "e2e": {
    "services": {
      "backend": {
        "env": {
          "LOG_LEVEL": "debug"
        }
      },

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

Effective global E2E structured mesh:

```text
base
-> prod
-> e2e
```

The E2E provider override is intentional and allowed even though the topology begins from prod.

---

# 14. Removed V1/V1.2 fields

| Removed field | V2 replacement |
|---|---|
| root `dependencies` | service-local build dependency or top-level mesh service |
| service `port` | build endpoint `publicPort` + mesh `publish` |
| service `preservePort` | no equivalent; build owns endpoint port intent |
| service `provideDependency` | service `dependencies` |
| service `replaceMocks` | service `dependencies` |
| service `envOverrides` | service `env` |
| service `healthcheck` | app Dockerfile healthcheck |
| tester `path` | tester `compose` |
| tester `dockerfile` | tester Compose owns implementation |
| tester `envOverrides` | tester `env` |
| tester `policy` | Builder-owned validation |
| `inherit-published` | no field; publication explicitly stage-merges |

Builder performs no automatic legacy translation.

---

# 15. Summary

`mesh.json` answers:

```text
Which independent services participate?
Which top-level service fulfills each logical dependency slot?
What composition-level app environment overrides apply?
Which top-level services must be healthy before another proceeds?
Which build-declared endpoints are actually host-published?
What topology/configuration changes in dev/prod/e2e?
What global black-box E2E runner executes?
```

Service defaults remain in each service's `build.json` and env files, while mesh service `env` may intentionally override them for the active composition.