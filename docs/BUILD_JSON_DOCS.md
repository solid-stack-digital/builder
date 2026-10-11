# `build.json` V2 — Complete Field Reference

This document is the normative field-by-field reference for Builder V2 `build.json`.

For cross-file architecture, lifecycle, endpoint resolution, publication, namespacing, and migration rules, see `SPECS_V2.md`.

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

  dependencies?: Record<string, DependencyStageConfig>;
};

type DependencyStageConfig = {
  compose?: string;
  env?: Record<string, string>;
  endpoints?: Record<string, Partial<DependencyEndpoint>>;
  dependsOn?: string[];
};
```

For a dependency added for the first time inside a stage, the effective stage result must still satisfy the full `DependencyConfig` contract. For example, a stage-added materialized dependency needs `compose`, and every newly added endpoint needs `service` and `port`.

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

Points editors and tooling to the Builder JSON Schema.

### Example

```json
{
  "$schema": "https://example.invalid/build-v2.schema.json",
  "app": {}
}
```

### Side effects

None at runtime.

Builder does not derive environment, ports, dependency behavior, or stages from `$schema`.

### Validation

Must be a string if present.

---

## 2.2 `name`

### Type

```ts
string | undefined
```

### Required

No.

### Purpose

Provides a stable human-readable project/service identity for standalone Builder execution.

### Example

```json
{
  "name": "users-api",
  "app": {}
}
```

### Side effects

When provided, Builder uses it as the base standalone project identity for generated Compose project names and diagnostics.

Typical stage project names are derived from it:

```text
dev  -> users-api
prod -> users-api-prod
test -> users-api-test
e2e  -> users-api-e2e
```

If omitted, Builder retains the current contract of deriving the base project identity from the service directory basename.

In mesh mode, the `mesh.json` service key is the authoritative mesh identity; `build.json.name` does not rename the mesh service.

### Use case

Give a service a deterministic standalone identity even if the folder name changes.

### Example

```json
{
  "name": "billing-api",
  "app": {
    "endpoints": {
      "http": {
        "port": 3000,
        "primary": true,
        "scheme": "http"
      }
    }
  }
}
```

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

Selects the application Dockerfile used by Builder.

### Example

```json
{
  "dockerfile": ".docker/Dockerfile",
  "app": {}
}
```

### Side effects

Builder uses this Dockerfile for all application targets:

```text
dev
test
test-e2e
prod
```

The path must stay inside the service project boundary.

The Dockerfile must satisfy the V2 application Dockerfile contract:

- required targets: `dev`, `test`, `test-e2e`, `prod`;
- `dev` has a foreground default `CMD`;
- `test` is a finite test runner;
- `test-e2e` is a finite E2E runner;
- `prod` is the production runtime;
- hardcoded Dockerfile `EXPOSE` is forbidden;
- `dev` must define/inherit `HEALTHCHECK`;
- `prod` must define/inherit `HEALTHCHECK`;
- `prod` retains artifact-isolation expectations such as `COPY --from=...`;
- app runtime processes must not daemonize/background themselves.

### Use case

Keep the application Dockerfile under a `.docker` directory.

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

Defines configuration owned by the application itself.

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

`app` is compiled into the single Builder-managed application service.

There is no `app.dependsOn`. The app automatically depends on all materialized dependencies in integrated compositions.

There is no `app.port` shortcut. Ports exist only under named endpoints.

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
      "LOG_LEVEL": "info",
      "BACKEND_URL": "${dependencies.backend.endpoints.http.network_url}",
      "REDIS_HOST": "${dependencies.redis.endpoints.redis.network_host}"
    }
  }
}
```

### Valid values

Every value must be a string.

Valid:

```json
{
  "PORT_NAME": "api",
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

Builder does not coerce non-string values.

### Supported Builder references

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

Values are added to the app runtime environment.

They do **not** automatically become Docker build arguments.

If the service is part of a mesh, mesh service `env` may override the same key later according to precedence.

An endpoint reference does not create a lifecycle edge.

Example:

```json
"BACKEND_URL": "${dependencies.backend.endpoints.http.network_url}"
```

does not itself mean “wait for backend.” Local dependency lifecycle is automatic because it is a dependency; mesh service lifecycle is controlled by substitution and/or mesh `dependsOn`.

### Precedence

For app runtime env, low to high:

1. `.env.<stage>`;
2. base `app.env`;
3. active-stage `app.env`;
4. active-stage `override-compose` app environment;
5. mesh base service `env`;
6. mesh active-stage service `env`;
7. Builder internal base env;
8. Builder internal active-stage env.

If a user layer attempts to define a Builder-owned internal key, Builder fails.

### Use case

Configure the app without requiring it to know where its dependency implementation came from.

---

## 3.3 `app.endpoints`

### Type

```ts
Record<string, AppEndpoint>
```

### Required

No.

### Purpose

Declares named network endpoints exposed by the app container.

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

### Endpoint key rules

Endpoint keys use:

```text
^[a-z][a-z0-9-]*$
```

Examples:

```text
http
grpc
metrics
admin-http
```

### Side effects

Each endpoint becomes available through Builder endpoint references.

In standalone execution:

- if `publicPort` is absent, endpoint remains host-private;
- if `publicPort` is numeric, Builder publishes it on that fixed host port;
- if `publicPort` is `"AUTO"`, Builder allocates and publishes a stable available host port.

In mesh execution, `publicPort` alone does not expose the endpoint. The mesh service must also include:

```text
app.endpoints.<name>
```

in `publish`.

### Primary invariant

If `app.endpoints` is non-empty, exactly one effective endpoint must have:

```json
"primary": true
```

The primary app endpoint determines Builder’s application `PORT`.

If `app.endpoints` is omitted or empty, Builder does not inject a primary endpoint `PORT`; the app healthcheck must use an application-appropriate readiness strategy.

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

`network_port` resolves to this value.

If the endpoint is primary, Builder uses this value as the app’s Builder-owned `PORT`.

The field does not publish a host port.

---

## 4.2 `app.endpoints.<name>.publicPort`

### Type

```ts
number | "AUTO" | undefined
```

### Required

No.

### Purpose

Declares host-publication capability and desired host-port behavior.

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

- numeric => Builder binds that host port;
- `"AUTO"` => Builder allocates a stable available port;
- omitted => no host publication.

Mesh:

- numeric or `"AUTO"` only makes the endpoint eligible;
- the mesh service must also publish `app.endpoints.<name>`;
- non-published endpoints do not reserve or allocate host ports.

A fixed collision fails. Builder never silently remaps it.

### Use case

Expose the service to a browser, external client, local developer, or black-box E2E tester.

---

## 4.3 `app.endpoints.<name>.primary`

### Type

```ts
boolean | undefined
```

### Required

No.

### Default

`false`.

### Purpose

Marks the canonical app endpoint.

### Example

```json
"http": {
  "port": 3000,
  "primary": true,
  "scheme": "http"
}
```

### Side effects

Exactly one primary is required when the endpoint collection is non-empty.

The primary endpoint’s `port` becomes the Builder-owned app `PORT`.

`primary` does not automatically make an endpoint public.

---

## 4.4 `app.endpoints.<name>.scheme`

### Type

```ts
string | undefined
```

### Required

No.

### Validation

```text
^[A-Za-z][A-Za-z0-9+.-]*$
```

### Examples

```text
http
https
ws
wss
grpc
redis
postgresql
smtp
```

### Purpose

Enables URL construction.

### Side effects

Without `scheme`, these fail:

```text
network_url
public_url
```

Host/port/address properties remain usable.

### Example

```json
"grpc": {
  "port": 50051,
  "scheme": "grpc"
}
```

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

Declares logical infrastructure dependencies and their local/default Compose implementations.

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

### Dependency key rules

Keys use:

```text
^[a-z][a-z0-9-]*$
```

### Important semantic rule

A dependency is not one Docker service.

It is:

```text
logical slot
  + Compose implementation bundle
  + endpoint declarations
```

There is no dependency-level `service` field.

### Materialization side effect

A dependency with no effective endpoints is not materialized.

A dependency with effective endpoints is materialized only when the active execution uses integrated infrastructure.

---

## 5.2 `dependencies.<name>.compose`

### Type

```ts
string
```

### Required

Yes for a base dependency or stage-added dependency.

### Purpose

Points to the dependency implementation’s Docker Compose YAML.

### Example

```json
"firebase": {
  "compose": ".docker/dependencies/firebase.compose.yml"
}
```

### Side effects

When materialized, Builder loads the Compose file as one atomic dependency implementation.

All services/resources in the dependency Compose implementation may be materialized.

Builder namespaces the implementation to avoid collisions.

When the dependency is substituted by a mesh provider, the entire local Compose implementation is suppressed.

### Compose file restrictions

Dependency Compose may contain multiple services.

It must not use:

```yaml
services:
  something:
    ports:
      - "8080:8080"
```

Host `ports` are forbidden.

It also may not use unsupported global/container escape hatches such as:

- `network_mode: host`;
- `privileged: true`;
- globally fixed `container_name`;
- host-root filesystem bind mounts.

Use endpoint `publicPort` for host exposure.

### Path rules

The path is relative to the service directory and must not escape that project boundary.

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

The map is applied to every service in the dependency’s atomic Compose implementation.

Stage dependency `env` merges by key over base dependency `env`.

Values may use Builder endpoint references.

Example:

```json
"realtime": {
  "env": {
    "REDIS_HOST": "${dependencies.redis.endpoints.redis.network_host}"
  }
}
```

An env reference does not create a dependency `dependsOn`.

If ordering is required, declare `dependsOn` explicitly.

### Use case

Apply one module-wide project ID, emulator setting, or shared connection configuration to every container belonging to a dependency implementation.

---

## 5.4 `dependencies.<name>.endpoints`

### Type

```ts
Record<string, DependencyEndpoint>
```

### Required

No.

### Purpose

Defines the logical network surface of the dependency.

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

If the effective collection is absent or empty, the dependency is inert and is not materialized.

Every endpoint must identify an actual service in the dependency Compose file.

Every distinct Compose service referenced by at least one endpoint must define a valid Compose healthcheck.

When materialized, the app automatically health-depends on every distinct endpoint-owning service.

### Primary invariant

If the endpoint collection is non-empty, exactly one effective endpoint must have `primary: true`.

Dependency primary is canonical endpoint metadata only. It does not select a lifecycle service.

---

# 6. Dependency endpoint fields

## 6.1 `dependencies.<dep>.endpoints.<name>.service`

### Type

```ts
string
```

### Required

Yes for a newly declared dependency endpoint.

### Purpose

Names the exact Docker Compose service that owns the endpoint.

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

Builder validates that the named service exists in the dependency Compose file.

Builder uses that service to determine:

- internal network host/DNS resolution;
- endpoint readiness;
- app lifecycle dependencies;
- dependency-to-dependency lifecycle relationships;
- host port binding when published.

The referenced Compose service must have a healthcheck.

### Failure example

Endpoint:

```json
"ui": {
  "service": "firebase-ui",
  "port": 4000
}
```

but Compose has no `firebase-ui` service.

Result: fail-fast configuration error.

### Important

Builder never falls back to “the first Compose service” and never infers from the dependency name.

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

Used for:

```text
network_port
network_address
network_url
```

and for host mapping when the endpoint is effectively published.

It does not itself create host publication.

---

## 6.3 `dependencies.<dep>.endpoints.<name>.publicPort`

Same type and general semantics as app endpoint `publicPort`.

### Standalone side effect

If the dependency is materialized, the endpoint is published to the host.

### Mesh side effect

The endpoint is only eligible for mesh publication. The consuming mesh service must explicitly include:

```text
dependencies.<dep>.endpoints.<name>
```

in its `publish` array.

If the dependency is substituted by a top-level mesh service, this local endpoint cannot be published through the consumer. Publish the provider app endpoint instead.

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

It does not choose a principal Compose service.

It does not change which services are required to be healthy.

---

## 6.5 `dependencies.<dep>.endpoints.<name>.scheme`

Same rules as app endpoint `scheme`.

Required only when a URL property is actually requested.

Example:

```json
"redis": {
  "service": "redis",
  "port": 6379,
  "primary": true,
  "scheme": "redis"
}
```

allows:

```text
${dependencies.redis.endpoints.redis.network_url}
```

---

# 7. `dependencies.<name>.dependsOn`

### Type

```ts
string[]
```

### Required

No.

### Purpose

Defines lifecycle ordering between dependency modules.

### Syntax

Every entry uses:

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

When `realtime` is materialized, Builder does not allow its endpoint-owning services to become the active dependency surface before the referenced dependency readiness services are healthy.

All Builder-generated edges use:

```yaml
condition: service_healthy
```

No `service_started` fallback exists.

### Validation

Errors:

- unknown dependency;
- target has no effective endpoints and therefore is not materialized;
- self-dependency;
- dependency cycle.

### Stage merge behavior

`dependsOn` is an exception to normal array replacement.

Base:

```json
"dependsOn": [
  "dependencies.redis"
]
```

E2E:

```json
"dependsOn": [
  "dependencies.mailpit"
]
```

Effective E2E:

```json
[
  "dependencies.redis",
  "dependencies.mailpit"
]
```

Exact duplicates are removed.

### Non-side effects

`dependsOn` does not create env values.

An env reference does not create `dependsOn`.

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

Configures the service-level E2E test runner from the application Dockerfile’s `test-e2e` target.

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

During `builder service up test-e2e`:

- app target = `prod`;
- app runtime stage = `e2e`;
- local integrated dependencies are materialized;
- tester target = `test-e2e`;
- tester runs with host networking;
- tester waits for app health;
- tester exit code becomes the E2E result.

`tester` is not materialized in dev, prod, or unit-test execution.

There is no tester path or tester Dockerfile field here; service-level E2E uses the same application Dockerfile contract.

---

## 8.2 `tester.env`

### Type

```ts
Record<string, string>
```

### Required

No.

### Purpose

Runtime environment for the service-level black-box E2E runner.

### Example

```json
"tester": {
  "env": {
    "APP_URL": "${app.endpoints.http.public_url}",
    "MAIL_UI": "${dependencies.mailpit.endpoints.http.public_url}"
  }
}
```

### Critical restriction

The service-level tester runs with host networking.

Therefore Builder rejects endpoint references using:

```text
network_host
network_port
network_address
network_url
```

inside `tester.env`.

Use:

```text
public_host
public_port
public_address
public_url
```

### Side effects

Any referenced public endpoint must actually be published in standalone E2E.

If it is not publishable/published, compilation fails before tests run.

---

# 9. Stage fields

Builder supports exactly these root stage overlays:

```text
dev
prod
test
e2e
```

Each has the same shape.

---

## 9.1 `dev`

### Type

`BuildStage`

### Purpose

Overrides service configuration for development runtime.

### Side effects

Used by both:

```text
builder service up dev
builder service up dev --full
```

Difference between them is infrastructure materialization:

- ordinary dev => isolated;
- `--full` => integrated.

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

### Type

`BuildStage`

### Purpose

Production-stage service configuration.

### Example

```json
"prod": {
  "override-compose": ".docker/overrides/docker-compose.prod.override.yml",
  "app": {
    "env": {
      "LOG_LEVEL": "info"
    }
  }
}
```

### Side effects

Uses Dockerfile `prod`.

Uses integrated infrastructure.

Does not automatically apply during E2E.

---

## 9.3 `test`

### Type

`BuildStage`

### Purpose

Configuration for the isolated/unit test stage.

### Example

```json
"test": {
  "app": {
    "env": {
      "TEST_TIMEOUT": "10000"
    }
  }
}
```

### Side effects

Used by the `test` Dockerfile target.

Local dependencies are not materialized.

`INFRA_MODE` is isolated.

---

## 9.4 `e2e`

### Type

`BuildStage`

### Purpose

Configuration for integrated service-level E2E runtime.

### Example

```json
"e2e": {
  "app": {
    "env": {
      "SMTP_HOST": "${dependencies.mailpit.endpoints.smtp.network_host}"
    }
  },
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

### Side effects

App image target is `prod`.

Runtime stage is still `e2e`.

E2E does not inherit `prod` config.

E2E local dependencies are materialized.

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

Points to an active-stage app Compose override file.

### Example

```json
"dev": {
  "override-compose": ".docker/overrides/docker-compose.dev.override.yml"
}
```

### Typical use cases

- development bind mounts;
- command override;
- build args;
- stage-specific app environment;
- permitted app runtime Compose details.

Example file:

```yaml
services:
  app:
    volumes:
      - .:/app
      - /app/node_modules
    build:
      args:
        NEXT_PUBLIC_MODE: development
```

### Side effects

Its app environment layer overrides `build.json` stage `app.env`.

In mesh mode, mesh env layers can override it later.

### Restrictions

The override file is not a generic service-definition escape hatch.

It may not:

- add arbitrary extra services;
- publish host ports;
- create app `depends_on`;
- replace Builder endpoint definitions;
- override Builder-owned environment keys;
- replace the Builder-selected target;
- remove/weaken required healthchecks.

Use stage `dependencies` for stage-only infrastructure.

---

## 10.2 `<stage>.app`

### Type

```ts
{
  env?: Record<string, string>;
  endpoints?: Record<string, Partial<AppEndpoint>>;
}
```

### Required

No.

### Purpose

Overlays the base app config.

### Merge behavior

Maps deep-merge.

Omitted fields inherit base.

Scalar fields replace base scalar values.

### Example

Base:

```json
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
```

Dev overlay:

```json
"dev": {
  "app": {
    "endpoints": {
      "http": {
        "publicPort": 3000
      }
    }
  }
}
```

Effective dev endpoint retains `port`, `primary`, and `scheme`, but uses fixed host port `3000`.

### Validation

The final effective stage configuration must satisfy all endpoint invariants.

---

## 10.3 `<stage>.app.env`

Same type and reference rules as base `app.env`.

### Merge behavior

Keywise merge.

Stage values win over base values.

Example:

Base:

```json
"env": {
  "LOG_LEVEL": "info",
  "FEATURE": "on"
}
```

Dev:

```json
"env": {
  "LOG_LEVEL": "debug"
}
```

Effective dev:

```json
{
  "LOG_LEVEL": "debug",
  "FEATURE": "on"
}
```

---

## 10.4 `<stage>.app.endpoints`

### Type

```ts
Record<string, Partial<AppEndpoint>>
```

### Purpose

Modify existing endpoints or add stage-only endpoints.

### Side effects

A stage-added public endpoint exists only in that effective stage.

A base env reference to a stage-only endpoint fails in stages where that endpoint does not exist.

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

The final effective endpoint collection must still have exactly one primary.

---

## 10.5 `<stage>.dependencies`

### Type

```ts
Record<string, DependencyStageConfig>
```

### Required

No.

### Purpose

Overlays existing dependencies or adds stage-only dependencies.

### Example: overlay existing dependency env

```json
"dev": {
  "dependencies": {
    "firebase": {
      "env": {
        "GCLOUD_PROJECT": "demo-dev"
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
        }
      }
    }
  }
}
```

### Side effects

Stage-added dependencies only exist in that stage.

Validation occurs after overlay merge.

If a base env reference requires a dependency that only exists in E2E, non-E2E stages fail. Put such references in the corresponding stage overlay instead.

---

## 10.6 `<stage>.dependencies.<name>.compose`

### Type

```ts
string
```

### Required

Only when the effective dependency would otherwise have no `compose`.

### Merge behavior

Scalar replacement.

If specified for an existing dependency, the active stage uses the stage Compose file.

### Side effect

Because the dependency Compose file is atomic, replacing `compose` replaces the local implementation bundle for that stage.

This does not introduce Dockerfile-like modes inside the dependency Compose file; it selects the stage’s effective dependency implementation.

---

## 10.7 `<stage>.dependencies.<name>.env`

Same shape as base dependency `env`.

Merges keywise.

Applied to all services in the effective dependency Compose implementation.

---

## 10.8 `<stage>.dependencies.<name>.endpoints`

### Type

```ts
Record<string, Partial<DependencyEndpoint>>
```

### Purpose

Modify an endpoint or add a stage-only dependency endpoint.

### Example

```json
"dev": {
  "dependencies": {
    "firebase": {
      "endpoints": {
        "ui": {
          "publicPort": 4000
        }
      }
    }
  }
}
```

### Validation

New endpoint => must resolve `service` and `port`.

Modified endpoint => missing fields inherit base.

Every effective endpoint owner service must exist and have a healthcheck.

---

## 10.9 `<stage>.dependencies.<name>.dependsOn`

Same syntax as base dependency `dependsOn`.

### Special merge

Union-merge instead of replacement.

Base:

```json
[
  "dependencies.redis"
]
```

Stage:

```json
[
  "dependencies.mailpit"
]
```

Effective:

```json
[
  "dependencies.redis",
  "dependencies.mailpit"
]
```

---

# 11. Endpoint property reference table

Given:

```json
"http": {
  "port": 3000,
  "publicPort": 8080,
  "primary": true,
  "scheme": "http"
}
```

possible properties are:

| Property | Example value | Requires scheme | Requires effective publication |
|---|---|---:|---:|
| `network_host` | `app` or generated internal DNS | No | No |
| `network_port` | `3000` | No | No |
| `network_address` | `app:3000` | No | No |
| `network_url` | `http://app:3000` | Yes | No |
| `public_host` | `127.0.0.1` | No | Yes |
| `public_port` | `8080` | No | Yes |
| `public_address` | `127.0.0.1:8080` | No | Yes |
| `public_url` | `http://127.0.0.1:8080` | Yes | Yes |

Dependency internal host values are generated from the endpoint-owning Compose service after Builder namespacing. Do not hardcode generated names; use references.

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
          "publicPort": "AUTO",
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
    },

    "worker-api": {
      "compose": ".docker/dependencies/worker.compose.yml",
      "dependsOn": [
        "dependencies.redis"
      ],
      "endpoints": {
        "http": {
          "service": "worker-api",
          "port": 7000,
          "primary": true,
          "scheme": "http"
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
    },
    "dependencies": {
      "firebase": {
        "env": {
          "GCLOUD_PROJECT": "orders-dev"
        },
        "endpoints": {
          "ui": {
            "publicPort": 4000
          }
        }
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
      },
      "worker-api": {
        "dependsOn": [
          "dependencies.mailpit"
        ]
      }
    }
  }
}
```

---

# 13. Removed fields and replacements

Builder V2 rejects these V1/V1.2 fields.

| Removed field | Replacement |
|---|---|
| root `port` | `app.endpoints.<name>.publicPort` |
| `envOverrides` | `app.env` |
| `overrides` | root stage objects + `<stage>.override-compose` |
| `composeFiles` | no generic merge list; use dependencies/stage override |
| `services` | no generic service injection; use dependencies |
| `policy`, `policies` | Builder-owned built-in validation |
| dependency `path` | dependency `compose` |
| dependency `service` | endpoint-level required `service` |
| dependency `port` | named endpoint `port` / `publicPort` |
| dependency `ports` | named endpoints |
| `injects` | consumer-owned `env` |
| `sidecars` | ordinary dependencies, including stage-only dependencies |

Builder performs no automatic V1-to-V2 translation.

---

# 14. Common patterns

## Internal-only dependency

```json
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
```

No `publicPort`, so Redis is not host-published.

---

## Debug UI available to the host

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
    "ui": {
      "service": "firebase-ui",
      "port": 4000,
      "publicPort": "AUTO",
      "scheme": "http"
    }
  }
}
```

The app can use Firestore internally while the developer can open the UI on its allocated host port.

---

## E2E substitute using real adapter

```json
"e2e": {
  "app": {
    "env": {
      "SMTP_HOST": "${dependencies.mailpit.endpoints.smtp.network_host}",
      "SMTP_PORT": "${dependencies.mailpit.endpoints.smtp.network_port}"
    }
  },
  "dependencies": {
    "mailpit": {
      "compose": ".docker/dependencies/mailpit.compose.yml",
      "endpoints": {
        "smtp": {
          "service": "mailpit",
          "port": 1025,
          "primary": true,
          "scheme": "smtp"
        }
      }
    }
  }
}
```

The application still uses the real SMTP/Nodemailer integrated adapter. Only endpoint configuration changes.

---

## Service E2E tester

```json
"tester": {
  "env": {
    "API_URL": "${app.endpoints.http.public_url}"
  }
}
```

Correct because the tester is host-networked.

This is invalid:

```json
"tester": {
  "env": {
    "API_URL": "${app.endpoints.http.network_url}"
  }
}
```

Builder rejects it.

---

# 15. Summary

`build.json` answers:

```text
What is this service?
What runtime env does its app consume?
What named endpoints does its app expose?
What logical infrastructure dependencies can it use?
How are local/default dependencies implemented?
Which Compose service owns each dependency endpoint?
What must be healthy before the app/dependency starts?
What changes by dev/prod/test/e2e stage?
What public host exposure is possible in standalone execution?
What environment does the service-level E2E tester receive?
```

It does not answer:

```text
Which other top-level service should replace this dependency?
Which mesh endpoints should actually be host-published?
How are multiple independently runnable services composed?
What is the global E2E tester?
```

Those are `mesh.json` responsibilities.
