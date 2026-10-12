# `build.json` V2 — Complete Field Reference

This document is the normative field-by-field reference for Builder V2 `build.json`.

For the full execution model and cross-file architecture, see `SPECS_V2.md`.

---

# 1. Complete shape

```ts
type BuildJsonV2 = {
  $schema?: string;
  name?: string;
  dockerfile?: string;

  app: {
    env?: Record<string, string>;
    endpoints?: Record<string, AppEndpoint>;
  };

  dependencies?: Record<string, DependencyConfig>;

  tester?: {
    env?: Record<string, string>;
  };

  dev?: BuildStage;
  prod?: BuildStage;
  test?: BuildStage;
  e2e?: BuildStage;
};

type AppEndpoint = {
  port: number;
  publicPort?: number | "AUTO";
  primary?: boolean;
  scheme?: string;
};

type DependencyConfig = {
  compose: string;
  env?: Record<string, string>;
  endpoints?: Record<string, DependencyEndpoint>;
  dependsOn?: string[];
};

type DependencyEndpoint = {
  service: string;
  port: number;
  publicPort?: number | "AUTO";
  primary?: boolean;
  scheme?: string;
};

type BuildStage = {
  "override-compose"?: string;

  app?: {
    env?: Record<string, string>;
    endpoints?: Record<string, Partial<AppEndpoint>>;
  };

  dependencies?: Record<string, DependencyStageOverlay>;
};

type DependencyStageOverlay = {
  // Allowed only when this stage introduces a dependency
  // that does not already exist in inherited configuration.
  compose?: string;

  env?: Record<string, string>;
  endpoints?: Record<string, Partial<DependencyEndpoint>>;
  dependsOn?: string[];
};
```

Effective stage inheritance:

```text
dev  = base -> dev
prod = base -> prod
test = base -> test
e2e  = base -> prod -> e2e
```

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

Points editors/tooling to the Builder JSON Schema.

### Example

```json
{
  "$schema": "https://example.invalid/build-v2.schema.json",
  "app": {}
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

Provides a stable standalone project/service identity.

### Example

```json
{
  "name": "users-api",
  "app": {}
}
```

### Side effects

Builder uses it as the base standalone Compose project identity and in diagnostics.

If omitted, Builder may derive the base identity from the service directory name.

In mesh mode, the `mesh.json` service key is the authoritative mesh identity.

---

## 2.3 `dockerfile`

### Type

```ts
string | undefined
```

### Required

No.

### Default

```text
Dockerfile
```

relative to the service directory.

### Purpose

Selects the application Dockerfile.

### Example

```json
{
  "dockerfile": ".docker/Dockerfile",
  "app": {}
}
```

### Side effects

The Dockerfile must provide these target aliases:

```text
dev
test
test-e2e
prod
```

Runtime contract:

| Target | Purpose |
|---|---|
| `dev` | development application |
| `test` | finite unit/isolated test runner |
| `test-e2e` | finite service E2E tester |
| `prod` | production-equivalent application |

Additional requirements:

- `dev` has a foreground default command;
- `prod` has a foreground runtime;
- `dev` must define/inherit a valid `HEALTHCHECK`;
- `prod` must define/inherit a valid `HEALTHCHECK`;
- hardcoded Dockerfile `EXPOSE` is forbidden;
- production artifact-isolation requirements remain in force;
- Builder does not synthesize missing healthchecks.

The path must remain inside the service project.

---

# 3. `app`

## 3.1 `app`

### Type

```ts
{
  env?: Record<string, string>;
  endpoints?: Record<string, AppEndpoint>;
}
```

### Required

Yes.

### Purpose

Defines application-owned runtime configuration and endpoints.

### Example

```json
{
  "app": {
    "env": {
      "LOG_LEVEL": "info"
    },
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

### Side effects

Builder compiles this into the application container.

There is no `app.port`.

There is no `app.dependsOn`; app lifecycle toward materialized local dependencies is automatic.

---

## 3.2 `app.env`

### Type

```ts
Record<string, string>
```

### Required

No.

### Purpose

Defines runtime environment consumed by the application.

### Example

```json
{
  "app": {
    "env": {
      "BACKEND_URL": "${dependencies.backend.endpoints.http.network_url}",
      "REDIS_HOST": "${dependencies.redis.endpoints.redis.network_host}"
    }
  }
}
```

### Validation

Every value must already be a string.

Valid:

```json
{
  "RETRIES": "3",
  "FEATURE_ENABLED": "true"
}
```

Invalid:

```json
{
  "RETRIES": 3,
  "FEATURE_ENABLED": true
}
```

Builder does not coerce values.

### References

Supported Builder references:

```text
${app.endpoints.<endpoint>.<property>}
${dependencies.<dependency>.endpoints.<endpoint>.<property>}
```

Example:

```json
{
  "app": {
    "env": {
      "SELF_URL": "${app.endpoints.http.network_url}",
      "FIRESTORE_URL": "${dependencies.firebase.endpoints.firestore.network_url}"
    }
  }
}
```

### Side effects

The values become app runtime environment.

They do **not** automatically become Docker build arguments.

Environment references do not create lifecycle edges.

### Complete application env precedence

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

For standalone execution, the mesh layers are absent.

### Service E2E precedence

Service E2E structured config inherits:

```text
base -> prod -> e2e
```

Low to high:

```text
.env.e2e
-> base app.env
-> prod app.env
-> prod override-compose app environment
-> e2e app.env
-> e2e override-compose app environment
-> Builder internal base environment
-> Builder internal E2E environment
```

### Global E2E precedence

When this service is run inside global E2E, low to high:

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

`.env.prod` is **not** merged into `.env.e2e`.

The production structured stage is inherited; the env-file source remains E2E-specific.

Mesh service env is an intentional composition-level override and may override service-level app env.

### Builder-owned keys

If a user-controlled layer attempts to set a Builder-owned runtime key such as `EXEC_MODE`, `INFRA_MODE`, or Builder-owned `PORT`, Builder fails rather than silently accepting the conflict.

---

## 3.3 `app.endpoints`

### Type

```ts
Record<string, AppEndpoint>
```

### Required

No.

### Purpose

Declares named network endpoints exposed by the application container.

### Example

```json
{
  "app": {
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
    }
  }
}
```

### Endpoint key grammar

```text
^[a-z][a-z0-9-]*$
```

### Side effects

Every endpoint gains Builder endpoint properties.

Standalone:

- no `publicPort` => host-private;
- numeric `publicPort` => published on that fixed host port;
- `"AUTO"` => Builder allocates a stable available host port.

Mesh:

- `publicPort` only makes the endpoint publishable;
- the mesh must also list `app.endpoints.<name>` in `publish`.

### Primary invariant

If the effective endpoint collection is non-empty, exactly one endpoint must have:

```json
"primary": true
```

Its `port` becomes Builder-owned application `PORT`.

---

# 4. App endpoint fields

## 4.1 `app.endpoints.<name>.port`

### Type

```ts
number
```

### Required

Yes for a newly declared endpoint.

### Range

```text
1..65535
```

### Meaning

Container/network port.

### Example

```json
"http": {
  "port": 3000,
  "primary": true,
  "scheme": "http"
}
```

### Side effects

Resolves as `network_port`.

If primary, becomes Builder-owned application `PORT`.

Does not itself publish a host port.

---

## 4.2 `app.endpoints.<name>.publicPort`

### Type

```ts
number | "AUTO" | undefined
```

### Required

No.

### Meaning

Host-publication capability and host-port policy.

### Fixed example

```json
"http": {
  "port": 3000,
  "publicPort": 8080,
  "primary": true,
  "scheme": "http"
}
```

### AUTO example

```json
"http": {
  "port": 3000,
  "publicPort": "AUTO",
  "primary": true,
  "scheme": "http"
}
```

### Side effects

Standalone:

- number => fixed host binding;
- `"AUTO"` => stable Builder allocation;
- omitted => not host-published.

Mesh:

- number/`"AUTO"` => endpoint is eligible for `publish`;
- omitted => `mesh.publish` targeting it is an error.

Fixed collisions fail. Builder never silently remaps a fixed port.

---

## 4.3 `app.endpoints.<name>.primary`

### Type

```ts
boolean | undefined
```

### Default

`false`.

### Purpose

Marks the canonical app endpoint.

### Side effects

Exactly one primary is required for a non-empty effective app endpoint collection.

The primary endpoint's `port` becomes Builder-owned `PORT`.

Does not imply host publication.

---

## 4.4 `app.endpoints.<name>.scheme`

### Type

```ts
string | undefined
```

### Validation

```text
^[A-Za-z][A-Za-z0-9+.-]*$
```

### Purpose

Enables URL construction.

Examples:

```text
http
https
ws
grpc
redis
postgresql
smtp
```

### Side effects

Without `scheme`, these fail:

```text
network_url
public_url
```

Host/port/address properties remain usable.

---

# 5. `dependencies`

## 5.1 `dependencies`

### Type

```ts
Record<string, DependencyConfig>
```

### Required

No.

### Purpose

Declares logical dependency slots and their service-owned local/default Compose implementations.

### Example

```json
{
  "dependencies": {
    "redis": {
      "compose": ".docker/dependencies/redis.compose.yml",
      "endpoints": {
        "redis": {
          "service": "redis",
          "port": 6379,
          "primary": true,
          "scheme": "redis"
        }
      }
    }
  }
}
```

### Dependency key grammar

```text
^[a-z][a-z0-9-]*$
```

### Important semantics

A dependency is:

```text
logical slot
+ one Compose implementation bundle
+ zero or more endpoint declarations
```

There is no dependency-level `service`.

Builder does not classify dependencies as `third-party` or `fellow-service`.

If no mesh provider is supplied, the local implementation is used when integrated.

If a mesh provider is supplied, the local implementation is atomically suppressed.

### Materialization

A dependency with no effective endpoints is inert and is not materialized.

A dependency with effective endpoints is materialized only in integrated execution.

---

## 5.2 `dependencies.<name>.compose`

### Type

```ts
string
```

### Required

Yes for a base dependency.

Also required when a stage introduces a new dependency not already present in inherited configuration.

### Purpose

Points to the dependency's Docker Compose implementation.

### Example

```json
"firebase": {
  "compose": ".docker/dependencies/firebase.compose.yml"
}
```

### Side effects

When materialized:

- the Compose implementation is loaded atomically;
- all implementation services/resources may participate;
- Builder namespaces dependency-owned objects;
- internal references are rewritten consistently.

When substituted by a mesh provider, the entire local implementation is suppressed.

### Stage immutability

A base/inherited dependency's `compose` field cannot be replaced by a later stage.

This is invalid:

```json
{
  "dependencies": {
    "redis": {
      "compose": ".docker/dependencies/redis.compose.yml"
    }
  },
  "e2e": {
    "dependencies": {
      "redis": {
        "compose": ".docker/dependencies/different-redis.compose.yml"
      }
    }
  }
}
```

A stage may define `compose` only for a dependency that does not yet exist in inherited configuration.

### Compose restrictions

Dependency Compose may contain multiple services and internal resources.

It must not:

- publish `services.*.ports`;
- use `network_mode: host`;
- use `privileged: true`;
- hardcode globally conflicting `container_name`;
- mount the host root filesystem.

Host publication belongs to Builder endpoint configuration.

### Path safety

Path is relative to the service project and may not escape it.

---

## 5.3 `dependencies.<name>.env`

### Type

```ts
Record<string, string>
```

### Required

No.

### Purpose

Applies Builder-controlled runtime environment to the dependency implementation.

### Example

```json
"firebase": {
  "compose": ".docker/dependencies/firebase.compose.yml",
  "env": {
    "GCLOUD_PROJECT": "demo-project"
  }
}
```

### Side effects

The map applies to every service in that dependency's atomic Compose implementation.

Stage overlays merge by key.

Values may use Builder references.

Environment references do not create `dependsOn`.

---

## 5.4 `dependencies.<name>.endpoints`

### Type

```ts
Record<string, DependencyEndpoint>
```

### Required

No.

### Purpose

Defines the dependency's logical network surface.

### Example

```json
"firebase": {
  "compose": ".docker/dependencies/firebase.compose.yml",
  "endpoints": {
    "firestore": {
      "service": "firebase-emulator",
      "port": 8080,
      "primary": true,
      "scheme": "http"
    },
    "auth": {
      "service": "firebase-emulator",
      "port": 9099,
      "scheme": "http"
    },
    "ui": {
      "service": "firebase-ui",
      "port": 4000,
      "publicPort": "AUTO",
      "scheme": "http"
    }
  }
}
```

### Side effects

No effective endpoints => dependency is inert.

Every endpoint owner service must exist in the dependency Compose file.

Every distinct endpoint owner service must define a valid Compose healthcheck.

When materialized, the app automatically health-depends on all distinct endpoint-owning services.

### Primary invariant

Exactly one effective endpoint must have `primary: true` when the collection is non-empty.

Dependency primary does not select a principal service.

---

# 6. Dependency endpoint fields

## 6.1 `dependencies.<dep>.endpoints.<name>.service`

### Type

```ts
string
```

### Required

Yes for every newly declared dependency endpoint.

### Purpose

Names the exact Compose service that owns this endpoint.

### Example

```json
"firestore": {
  "service": "firebase-emulator",
  "port": 8080,
  "primary": true,
  "scheme": "http"
}
```

### Side effects

Builder uses the service for:

- internal network/DNS resolution;
- health readiness;
- app lifecycle edges;
- dependency-to-dependency lifecycle;
- host binding when published.

The named service must exist and must have a valid healthcheck.

Builder never guesses the service, even for single-service Compose files.

---

## 6.2 `dependencies.<dep>.endpoints.<name>.port`

### Type

```ts
number
```

### Required

Yes for a new endpoint.

### Meaning

Container/network port on the endpoint-owning Compose service.

### Side effects

Used by `network_port`, address/URL construction, and host binding if published.

Does not itself publish the endpoint.

---

## 6.3 `dependencies.<dep>.endpoints.<name>.publicPort`

Same type and publication semantics as app endpoint `publicPort`.

### Standalone

If the dependency is materialized, the endpoint is host-published.

### Mesh

The endpoint is only eligible for publication.

The consuming mesh service must explicitly list:

```text
dependencies.<dep>.endpoints.<name>
```

in `publish`.

If the dependency is substituted, the local endpoint is absent and cannot be published through the consumer.

---

## 6.4 `dependencies.<dep>.endpoints.<name>.primary`

### Type

```ts
boolean | undefined
```

### Default

`false`.

### Side effects

Exactly one primary is required for a non-empty effective dependency endpoint collection.

It does not select a principal Compose service and does not change readiness.

---

## 6.5 `dependencies.<dep>.endpoints.<name>.scheme`

Same validation and URL semantics as app endpoint `scheme`.

---

# 7. `dependencies.<name>.dependsOn`

### Type

```ts
string[]
```

### Required

No.

### Purpose

Defines dependency-module lifecycle ordering.

### Syntax

```text
dependencies.<dependency-name>
```

### Example

```json
"realtime": {
  "compose": ".docker/dependencies/realtime.compose.yml",
  "dependsOn": [
    "dependencies.redis",
    "dependencies.firebase"
  ],
  "endpoints": {
    "ws": {
      "service": "realtime",
      "port": 7000,
      "primary": true,
      "scheme": "ws"
    }
  }
}
```

### Side effects

The dependent dependency's endpoint-owning services are health-gated on the target dependency's readiness services.

Builder-generated edges use:

```yaml
condition: service_healthy
```

No `service_started` fallback exists.

### Validation

Fails on:

- unknown dependency;
- inert/unmaterialized target;
- self-dependency;
- cycle.

### Stage merge

`dependsOn` union-merges.

Inherited entries come first; stage additions follow; exact duplicates are removed.

---

# 8. `tester`

## 8.1 `tester`

### Type

```ts
{
  env?: Record<string, string>;
}
```

### Required

No.

### Purpose

Configures the service-level E2E tester from the Dockerfile `test-e2e` target.

### Example

```json
{
  "tester": {
    "env": {
      "APP_URL": "${app.endpoints.http.public_url}"
    }
  }
}
```

### Side effects

Service E2E execution is:

```text
app:
  target=prod
  EXEC_MODE=prod
  INFRA_MODE=integrated
  env file=.env.e2e
  structured config=base -> prod -> e2e

tester:
  target=test-e2e
  EXEC_MODE=e2e
  no INFRA_MODE
  env file=.env.e2e-tester
```

The tester runs as a host-networked black-box client and determines the service E2E result.

---

## 8.2 `tester.env`

### Type

```ts
Record<string, string>
```

### Required

No.

### Purpose

Adds runtime env for the service-level E2E tester.

### Example

```json
"tester": {
  "env": {
    "APP_URL": "${app.endpoints.http.public_url}"
  }
}
```

### Precedence

Low to high:

```text
.env.e2e-tester
-> build.json tester.env
-> Builder internal tester environment
```

Builder-owned tester values are authoritative.

### Endpoint restriction

Tester is host-networked.

These endpoint properties are forbidden in tester env:

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

A referenced public endpoint must actually be published in standalone E2E.

### `INFRA_MODE`

Builder does not inject `INFRA_MODE` into the tester.

---

# 9. Stage fields

Builder supports:

```text
dev
prod
test
e2e
```

Each stage is a structured overlay.

---

## 9.1 `dev`

### Purpose

Development-stage overlay.

### Effective config

```text
base -> dev
```

### Runtime

Standalone normal dev:

```text
target=dev
EXEC_MODE=dev
INFRA_MODE=isolated
.env.dev
```

Standalone dev `--full`:

```text
target=dev
EXEC_MODE=dev
INFRA_MODE=integrated
.env.dev
```

### Example

```json
"dev": {
  "override-compose": ".docker/overrides/docker-compose.dev.override.yml",
  "app": {
    "env": {
      "LOG_LEVEL": "debug"
    }
  }
}
```

---

## 9.2 `prod`

### Purpose

Production-stage overlay.

### Effective config

```text
base -> prod
```

### Runtime

```text
target=prod
EXEC_MODE=prod
INFRA_MODE=integrated
.env.prod
```

### E2E side effect

`prod` is inherited by E2E structured configuration:

```text
base -> prod -> e2e
```

The E2E env file is still `.env.e2e`, not `.env.prod`.

---

## 9.3 `test`

### Purpose

Unit/isolated test-stage overlay.

### Effective config

```text
base -> test
```

### Runtime

```text
target=test
EXEC_MODE=test
INFRA_MODE=isolated
.env.test
```

Local dependency containers are not materialized.

---

## 9.4 `e2e`

### Purpose

Applies controlled service-E2E overrides on top of the production-shaped structured configuration.

### Effective config

```text
base -> prod -> e2e
```

### App runtime

```text
target=prod
EXEC_MODE=prod
INFRA_MODE=integrated
.env.e2e
```

### Tester runtime

```text
target=test-e2e
EXEC_MODE=e2e
no INFRA_MODE
.env.e2e-tester
```

### Allowed E2E changes

May include:

- additional dependencies;
- endpoint metadata overrides;
- dependency env overrides;
- E2E-specific app env;
- E2E override Compose;
- inspection/support infrastructure such as Mailpit.

Application code still behaves as production code.

---

# 10. Stage child fields

## 10.1 `<stage>.override-compose`

### Type

```ts
string
```

### Required

No.

### Purpose

Points to a stage-specific app Compose override.

### Example

```json
"dev": {
  "override-compose": ".docker/overrides/docker-compose.dev.override.yml"
}
```

### Typical uses

- development bind mounts;
- command overrides;
- Docker build args;
- stage-specific app environment;
- permitted app runtime details.

### Restrictions

It may not:

- add arbitrary additional services;
- publish host ports;
- define app `depends_on`;
- redefine endpoints;
- override Builder-owned env;
- replace the Builder-selected target;
- weaken/remove required healthchecks.

Use stage `dependencies` for stage-only infrastructure.

### E2E order

For service E2E:

```text
prod override-compose
-> e2e override-compose
```

---

## 10.2 `<stage>.app`

### Type

```ts
{
  env?: Record<string, string>;
  endpoints?: Record<string, Partial<AppEndpoint>>;
}
```

### Purpose

Overlays inherited app config.

### Merge

Maps deep-merge.

Scalars replace inherited scalar values.

Omitted fields inherit.

For E2E, inherited state already includes `prod`.

---

## 10.3 `<stage>.app.env`

Same type/reference rules as base `app.env`.

Merges keywise.

For E2E:

```text
base app.env
-> prod app.env
-> e2e app.env
```

with corresponding override Compose layers applied in stage order.

---

## 10.4 `<stage>.app.endpoints`

### Type

```ts
Record<string, Partial<AppEndpoint>>
```

### Purpose

Modifies inherited endpoints or adds stage-only endpoints.

### Example

```json
"e2e": {
  "app": {
    "endpoints": {
      "debug": {
        "port": 9229,
        "publicPort": "AUTO",
        "scheme": "http"
      }
    }
  }
}
```

The final effective collection must still satisfy the exactly-one-primary invariant.

A base reference to a stage-only endpoint fails in stages where the endpoint does not exist.

---

## 10.5 `<stage>.dependencies`

### Type

```ts
Record<string, DependencyStageOverlay>
```

### Purpose

Overlays inherited dependencies or adds stage-only dependencies.

### Example: override inherited dependency env

```json
"e2e": {
  "dependencies": {
    "firebase": {
      "env": {
        "GCLOUD_PROJECT": "orders-e2e"
      }
    }
  }
}
```

### Example: add E2E-only dependency

```json
"e2e": {
  "dependencies": {
    "mailpit": {
      "compose": ".docker/dependencies/mailpit.compose.yml",
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
    }
  }
}
```

Stage-added dependencies exist only in effective stages that inherit them.

For E2E, dependencies added under `prod` are inherited before the `e2e` overlay.

---

## 10.6 `<stage>.dependencies.<name>.compose`

### Type

```ts
string
```

### Allowed usage

Only when the stage introduces a dependency that does not already exist in inherited configuration.

### Example

```json
"e2e": {
  "dependencies": {
    "mailpit": {
      "compose": ".docker/dependencies/mailpit.compose.yml"
    }
  }
}
```

### Forbidden usage

A stage may not replace the Compose implementation of an inherited dependency.

### Side effect

This preserves one local/default Compose implementation per logical dependency while still allowing stage-only dependency modules.

---

## 10.7 `<stage>.dependencies.<name>.env`

Same shape as base dependency `env`.

Merges keywise over inherited dependency env.

---

## 10.8 `<stage>.dependencies.<name>.endpoints`

### Type

```ts
Record<string, Partial<DependencyEndpoint>>
```

### Purpose

Modify inherited endpoint metadata or add stage-only endpoints.

New endpoint must resolve required fields `service` and `port`.

Every effective endpoint owner must exist and have a healthcheck.

---

## 10.9 `<stage>.dependencies.<name>.dependsOn`

Same syntax as base dependency `dependsOn`.

Union-merges with inherited values.

---

# 11. Endpoint property table

Given:

```json
"http": {
  "port": 3000,
  "publicPort": 8080,
  "primary": true,
  "scheme": "http"
}
```

| Property | Example | Requires scheme | Requires publication |
|---|---|---:|---:|
| `network_host` | `app` / internal DNS | No | No |
| `network_port` | `3000` | No | No |
| `network_address` | `app:3000` | No | No |
| `network_url` | `http://app:3000` | Yes | No |
| `public_host` | `127.0.0.1` | No | Yes |
| `public_port` | `8080` | No | Yes |
| `public_address` | `127.0.0.1:8080` | No | Yes |
| `public_url` | `http://127.0.0.1:8080` | Yes | Yes |

Dependency internal hosts are generated after namespacing. Never hardcode generated Compose names.

---

# 12. Complete example

```json
{
  "$schema": "https://example.invalid/build-v2.schema.json",
  "name": "orders-api",
  "dockerfile": "Dockerfile",

  "app": {
    "env": {
      "FIRESTORE_URL": "${dependencies.firebase.endpoints.firestore.network_url}",
      "REDIS_URL": "${dependencies.redis.endpoints.redis.network_url}"
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
    }
  },

  "dependencies": {
    "firebase": {
      "compose": ".docker/dependencies/firebase.compose.yml",
      "env": {
        "GCLOUD_PROJECT": "orders-local"
      },
      "endpoints": {
        "firestore": {
          "service": "firebase-emulator",
          "port": 8080,
          "primary": true,
          "scheme": "http"
        },
        "ui": {
          "service": "firebase-ui",
          "port": 4000,
          "publicPort": "AUTO",
          "scheme": "http"
        }
      }
    },

    "redis": {
      "compose": ".docker/dependencies/redis.compose.yml",
      "endpoints": {
        "redis": {
          "service": "redis",
          "port": 6379,
          "primary": true,
          "scheme": "redis"
        }
      }
    }
  },

  "tester": {
    "env": {
      "API_URL": "${app.endpoints.http.public_url}"
    }
  },

  "dev": {
    "override-compose": ".docker/overrides/docker-compose.dev.override.yml",
    "app": {
      "env": {
        "LOG_LEVEL": "debug"
      }
    }
  },

  "prod": {
    "override-compose": ".docker/overrides/docker-compose.prod.override.yml",
    "app": {
      "env": {
        "LOG_LEVEL": "info"
      }
    }
  },

  "test": {
    "app": {
      "env": {
        "LOG_LEVEL": "silent"
      }
    }
  },

  "e2e": {
    "override-compose": ".docker/overrides/docker-compose.e2e.override.yml",
    "app": {
      "env": {
        "SMTP_HOST": "${dependencies.mailpit.endpoints.smtp.network_host}",
        "SMTP_PORT": "${dependencies.mailpit.endpoints.smtp.network_port}"
      }
    },
    "dependencies": {
      "firebase": {
        "env": {
          "GCLOUD_PROJECT": "orders-e2e"
        }
      },

      "mailpit": {
        "compose": ".docker/dependencies/mailpit.compose.yml",
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
      }
    }
  }
}
```

Effective E2E application behavior:

```text
structured config = base -> prod -> e2e
target            = prod
EXEC_MODE         = prod
INFRA_MODE        = integrated
env file          = .env.e2e
```

Effective service E2E tester behavior:

```text
target            = test-e2e
EXEC_MODE         = e2e
INFRA_MODE        = not set
env file          = .env.e2e-tester
```

---

# 13. Removed fields

| Removed V1/V1.2 field | V2 replacement |
|---|---|
| root `port` | `app.endpoints.<name>.publicPort` |
| `envOverrides` | `app.env` |
| `overrides` | stage object + `<stage>.override-compose` |
| `composeFiles` | explicit dependencies / stage override |
| root `services` | dependencies / mesh composition |
| `policy`, `policies` | Builder-owned validation |
| dependency `path` | dependency `compose` |
| dependency `service` | endpoint-level `service` |
| dependency `port` | endpoint `port` / `publicPort` |
| dependency `ports` | named endpoints |
| `injects` | consumer-owned `env` |
| `sidecars` | ordinary dependencies, including E2E-only dependencies |

Builder performs no automatic legacy translation.

---

# 14. Summary

`build.json` answers:

```text
What is this independently runnable service?
What app environment does it consume?
What endpoints does the app expose?
What logical dependencies exist?
How is each local/default dependency implemented?
Which Compose service owns each dependency endpoint?
What must be healthy before the app/dependency proceeds?
What changes in dev/prod/test/e2e?
What can be host-published?
What environment does the service E2E tester receive?
```

It does not decide which mesh service fulfills a logical slot or which endpoints a mesh actually publishes. Those are `mesh.json` responsibilities.