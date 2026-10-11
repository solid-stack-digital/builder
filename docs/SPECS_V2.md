# Builder Configuration Specification V2

**Status:** Final architecture specification  
**Files covered:** `build.json`, `mesh.json`  
**Compatibility:** V2 is intentionally breaking relative to the current Builder V1/V1.2 schema. Legacy fields are rejected; Builder does not silently translate them.

---

## 1. Purpose

Builder V2 has two configuration layers with deliberately different responsibilities:

- **`build.json` is service truth.** It describes one independently runnable application, the infrastructure dependency contracts it can consume, its endpoints, stage-specific service configuration, and its service-level E2E tester environment.
- **`mesh.json` is composition truth.** It composes independently runnable services, binds logical dependency slots to concrete mesh providers, defines cross-service environment wiring and lifecycle ordering, selects host publication, and defines the global black-box E2E tester.

The architecture is designed around the following invariants:

1. configuration is explicit and deterministic;
2. invalid or unresolved configuration fails before runtime whenever possible;
3. application code does not know whether integrated infrastructure is a local emulator/mock substitute or a production service;
4. environment wiring does not imply lifecycle ordering;
5. logical dependency identity is separate from concrete provider identity;
6. host exposure is controlled by Builder configuration, never by arbitrary dependency Compose `ports`;
7. E2E testers are true black-box clients and can only rely on host-published endpoints;
8. Docker/Compose implementation details remain behind Builder’s stable configuration contracts.

---

# 2. Core concepts

## 2.1 Composition module

Builder internally reasons about composition modules. V2 has three relevant roles:

- **app** — the application defined by a service’s Dockerfile;
- **dependency** — an infrastructure module backed by a Docker Compose file;
- **tester** — a finite E2E caller.

There is no sidecar role in V2.

A dependency Compose file may contain multiple Docker Compose services. The entire file is treated as one atomic implementation unit.

---

## 2.2 Declaration versus materialization

Declaring a dependency does not mean it runs in every stage.

A dependency with no effective endpoints is inert and is not materialized.

For a service-level build:

| Execution | App target | Runtime stage | `INFRA_MODE` | Local dependencies |
|---|---|---|---|---|
| `builder service up dev` | `dev` | `dev` | `isolated` | not materialized |
| `builder service up dev --full` | `dev` | `dev` | `integrated` | materialized |
| `builder service up prod` | `prod` | `prod` | `integrated` | materialized |
| `builder service up test-unit` | `test` | `test` | `isolated` | not materialized |
| `builder service up test-e2e` | app=`prod`, tester=`test-e2e` | `e2e` | `integrated` | materialized |
| `builder service up test` | orchestrates unit, then E2E | stage-specific | stage-specific | stage-specific |

`builder service up test` runs the isolated/unit stage first. If that fails, E2E does not run.

For mesh execution, `dev`, `prod`, and global `e2e` are integrated compositions. Mesh `test-unit` runs services in their isolated test mode. Mesh `test` orchestrates isolated service tests and then global E2E.

---

# 3. Fail-fast contract

Builder V2 is fail-fast.

Any **declared** configuration that cannot be validated or resolved must produce an error. Builder must not guess, coerce, silently omit, silently remap, or weaken a requested invariant.

Examples of compile/configuration-time failures include:

- missing files;
- paths escaping their allowed project root;
- invalid JSON/YAML;
- invalid field types;
- unsupported/legacy fields;
- non-string `env` values;
- invalid endpoint names or service references;
- unresolved endpoint references;
- references to unavailable `public_*` properties;
- missing endpoint schemes when a URL property is requested;
- invalid mesh provider bindings;
- dependency cycles;
- missing required healthchecks;
- forbidden dependency Compose host ports;
- fixed host-port collisions;
- use of a stage-only declaration from a stage where it does not exist;
- use of a substituted local dependency as though it were still materialized.

Errors should identify, where applicable:

- source file;
- logical configuration path;
- offending value;
- referenced object;
- active stage/composition;
- reason resolution failed.

No `service_started` fallback is permitted where V2 specifies `service_healthy`.

---

# 4. Identifier rules

Configuration keys used in Builder reference paths use:

```text
^[a-z][a-z0-9-]*$
```

This applies to:

- dependency keys;
- endpoint keys;
- top-level mesh service names.

Top-level mesh service names additionally reserve these structural identifiers:

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

Reserved or invalid mesh service names are errors. Builder does not rename them.

---

# 5. Endpoint model

## 5.1 App endpoint

An application endpoint has this shape:

```ts
type AppEndpoint = {
  port: number;
  publicPort?: number | "AUTO";
  primary?: boolean;
  scheme?: string;
};
```

## 5.2 Dependency endpoint

A dependency endpoint additionally identifies the exact Compose service that owns the endpoint:

```ts
type DependencyEndpoint = {
  service: string;
  port: number;
  publicPort?: number | "AUTO";
  primary?: boolean;
  scheme?: string;
};
```

`service` is required even when the dependency Compose file contains only one service.

Builder never infers a dependency endpoint’s Compose service.

## 5.3 Ports

`port` is always the container/network port.

`publicPort` is the host/machine port intent:

- omitted — the endpoint is not host-publishable in standalone mode and cannot be selected for mesh host publication;
- number — fixed host port;
- `"AUTO"` — Builder allocates a stable available host port.

Valid numeric ports are `1..65535`.

## 5.4 Primary endpoint

If an endpoint collection is non-empty, exactly one effective endpoint must have:

```json
"primary": true
```

Omission means `false`.

For `app.endpoints`, the primary endpoint is the canonical application endpoint and its `port` becomes Builder’s application `PORT` value.

For dependency endpoints, `primary` is canonical/default endpoint metadata for tooling and diagnostics. It does **not** create a dependency-level “principal service” and does not change health/readiness semantics.

## 5.5 Scheme

`scheme` is optional and must match:

```text
^[A-Za-z][A-Za-z0-9+.-]*$
```

Builder does not maintain a protocol whitelist.

A URL property cannot be resolved without `scheme`.

---

# 6. Endpoint properties and references

The only exposed endpoint properties are:

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

Semantics:

- `network_host` — internal Docker-reachable host/DNS name;
- `network_port` — endpoint `port`;
- `network_address` — `network_host:network_port`;
- `network_url` — `scheme://network_host:network_port`;
- `public_host` — host machine address, currently `127.0.0.1`;
- `public_port` — effective host port;
- `public_address` — `public_host:public_port`;
- `public_url` — `scheme://public_host:public_port`.

`network_url` and `public_url` require `scheme`.

`public_*` exists only when the endpoint is **effectively published**.

### Standalone effective publication

In standalone service execution, a materialized endpoint with `publicPort` is effectively published automatically.

### Mesh effective publication

In mesh execution, `publicPort` only makes an endpoint eligible for publication. `mesh.json` must additionally select that endpoint through `publish`.

Therefore:

```text
build.json publicPort = publication capability/port intent
mesh.json publish      = actual mesh host exposure
```

---

# 7. Builder reference grammar

## 7.1 Inside `build.json`

App endpoint:

```text
${app.endpoints.<endpoint>.<property>}
```

Dependency endpoint:

```text
${dependencies.<dependency>.endpoints.<endpoint>.<property>}
```

Examples:

```text
${app.endpoints.http.public_url}
${dependencies.redis.endpoints.redis.network_host}
${dependencies.firebase.endpoints.firestore.network_url}
```

## 7.2 Inside `mesh.json`

Direct top-level app endpoint:

```text
${<mesh-service>.app.endpoints.<endpoint>.<property>}
```

Effective dependency slot endpoint:

```text
${<mesh-service>.dependencies.<dependency>.endpoints.<endpoint>.<property>}
```

Examples:

```text
${backend.app.endpoints.http.network_url}
${frontend.dependencies.payments-api.endpoints.http.public_url}
```

There is no `services.` prefix.

## 7.3 Resolution behavior

References may appear inside larger strings:

```text
${backend.app.endpoints.http.network_url}/v1
```

Builder resolves references only after:

1. base configuration is parsed;
2. the active stage overlay is applied;
3. effective services/dependencies/endpoints are known;
4. mesh substitutions are applied;
5. publication is determined;
6. fixed public ports are reserved;
7. `"AUTO"` public ports are allocated.

An unresolved declared reference is an error.

A `public_*` reference to an endpoint that is not effectively published is an error.

A `*_url` reference to an endpoint without `scheme` is an error.

For Builder-managed JSON `env` fields, `${...}` is Builder reference syntax. Literal dollar interpolation should be escaped using the Builder/Compose-compatible literal-dollar form (`$$`) where required.

---

# 8. Environment model

Every Builder `env` map is:

```ts
Record<string, string>
```

Numbers, booleans, arrays, objects, and null values are invalid. Builder does not coerce them to strings.

Environment ownership is consumer-side:

- `app.env` defines values the app consumes;
- `dependencies.<name>.env` configures that dependency implementation;
- mesh service `env` configures that mesh app service;
- tester `env` configures that tester.

There is no `injects` feature.

Environment references do **not** imply lifecycle dependencies.

## 8.1 App environment precedence

Low to high:

1. `.env.<stage>`;
2. `build.json` base `app.env`;
3. `build.json` active-stage `app.env`;
4. active-stage project `override-compose` app environment;
5. `mesh.json` base service `env`;
6. `mesh.json` active-stage service `env`;
7. Builder internal base Compose environment;
8. Builder internal active-stage Compose environment.

Mesh layers only exist during mesh execution.

Builder-owned internal keys are authoritative. If a lower/user-controlled layer attempts to define a key that Builder itself owns, Builder fails instead of silently overriding it.

Known Builder-owned values include execution/infrastructure mode values such as `EXEC_MODE` and `INFRA_MODE`, and application `PORT` when an app primary endpoint exists. Ownership is determined by Builder’s internal composition, not by a user-configurable reserved-key list.

## 8.2 E2E environment selection

E2E is its own runtime stage.

E2E:

- builds/runs the application using the `prod` Dockerfile target;
- sets runtime execution stage to `e2e`;
- uses E2E configuration;
- does **not** inherit `.env.prod`;
- does **not** inherit `prod.app.env`;
- does **not** inherit `mesh.prod` merely because it uses the production image target.

Build target selection and runtime-stage selection are separate concepts.

## 8.3 Build arguments

`env` is runtime environment configuration.

Builder V2 does not implicitly turn every `env` value into a Docker build argument.

When an application needs build-time arguments, use the active stage’s `override-compose` file and its `services.app.build.args`.

---

# 9. Stage overlay semantics

Both configuration files use non-destructive stage overlays.

General rules:

- objects/maps deep-merge;
- scalar stage values replace matching base scalar values;
- omitted fields inherit base values;
- stage-only map entries are added;
- arrays normally replace wholesale.

Explicit array exceptions:

- `build.json` dependency `dependsOn` — union merge;
- `mesh.json` service `dependsOn` — union merge;
- `mesh.json` service `publish` — union merge.

Union order is:

1. base entries in base order;
2. stage entries in stage order;
3. exact duplicates removed.

There is no deletion/removal syntax in V2.

Validation occurs against the **effective active-stage composition**, not merely the unmerged source fragments.

---

# 10. `build.json` model

Canonical top-level shape:

```json
{
  "$schema": "...",
  "name": "example-service",
  "dockerfile": "Dockerfile",

  "app": {
    "env": {},
    "endpoints": {}
  },

  "dependencies": {},

  "tester": {
    "env": {}
  },

  "dev": {},
  "prod": {},
  "test": {},
  "e2e": {}
}
```

Detailed field documentation is in `BUILD_JSON_DOCS.md`.

---

# 11. Application Dockerfile contract

Builder keeps the existing multi-stage Dockerfile contract and tightens health readiness.

The application Dockerfile path defaults to `Dockerfile` unless `build.json.dockerfile` specifies another relative path.

Required target aliases:

```text
dev
test
test-e2e
prod
```

A separate internal build stage such as `builder` is allowed but is not a required alias.

Normative contract:

1. `dev` exists and has a default foreground `CMD`;
2. `test` exists and is a finite unit/integration test runner;
3. `test-e2e` exists and is a finite service-level E2E test runner;
4. `prod` exists and is a production runtime stage;
5. hardcoded Dockerfile `EXPOSE` is forbidden; Builder owns endpoint/port composition;
6. background-process daemonization patterns are forbidden for app runtime stages;
7. `prod` must use artifact isolation (`COPY --from=...`) consistent with the retained current contract;
8. `dev` must define/inherit a valid Docker `HEALTHCHECK`;
9. `prod` must define/inherit a valid Docker `HEALTHCHECK`;
10. `test` and `test-e2e` do not require healthchecks because they are finite runners.

When app endpoints exist, the primary app endpoint’s `port` is injected as Builder-owned `PORT`. Healthchecks for network applications should probe readiness using that effective port rather than assuming a hardcoded port.

Missing required app healthchecks are errors. Builder does not synthesize a fallback readiness check.

---

# 12. Dependency model

A dependency is **not** a single service and has no dependency-level `service` selector in V2.

Canonical concept:

```text
logical dependency
    -> one Compose implementation file
    -> zero or more declared logical endpoints
    -> each endpoint explicitly points to the Compose service that owns it
```

Example:

```json
{
  "firebase": {
    "compose": ".docker/dependencies/firebase.compose.yml",
    "env": {
      "GCLOUD_PROJECT": "example"
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
  }
}
```

## 12.1 No endpoints means no materialization

If a dependency’s effective endpoint collection is absent or empty, Builder does not materialize that dependency.

A `dependsOn` relationship or other configuration that requires an inert/unmaterialized dependency is invalid.

## 12.2 Atomic Compose implementation

When a dependency is materialized:

- all Compose services in its dependency Compose file are materialized;
- all dependency-owned resources required by those services are materialized;
- Builder namespaces the implementation as one unit;
- endpoint-owning services are attached/reachable through the appropriate Builder network;
- internal Compose relationships are rewritten consistently.

When a dependency is substituted by a mesh provider:

- none of the local dependency Compose services are materialized;
- none of its local volumes/configs/secrets/resources are materialized;
- the entire local implementation is suppressed atomically.

## 12.3 Multi-service Compose files

Dependency Compose files may contain one or many services.

Every endpoint requires an explicit `service` field naming an existing service from that Compose file.

Extra Compose services that own no Builder endpoint are implementation details.

## 12.4 Dependency environment

`dependencies.<name>.env` applies to every service in that dependency’s atomic Compose implementation. Stage dependency `env` overlays merge by key.

A dependency Compose file may still define its own service environment/env-file configuration. Builder dependency `env` is the Builder-controlled module-level overlay.

---

# 13. Dependency Compose contract

A dependency’s `compose` path points to a Docker Compose YAML file relative to the service directory.

The path must remain inside the service project boundary.

The Compose file:

- must contain at least one service if the dependency is materialized;
- may use `image:` or `build:` internally;
- may define multiple services;
- may define volumes/configs/secrets/internal networks;
- may define internal `depends_on`;
- must not publish host ports directly;
- must not use `network_mode: host`;
- must not use `privileged: true`;
- must not hardcode globally conflicting `container_name`;
- must not mount the host root filesystem;
- must satisfy Builder’s namespacing/merge contract.

`services.*.ports` inside dependency Compose is a validation error. Builder does not strip or reinterpret it.

Host publication is controlled only by endpoint `publicPort` and, in a mesh, `publish`.

Builder namespaces dependency-owned objects and rewrites relevant internal references, including service names and references such as:

- `depends_on`;
- `links`;
- `network_mode: service:...` where supported by the dependency contract;
- `volumes_from`;
- named volumes;
- configs;
- secrets;
- dependency-owned networks where necessary.

The exact generated Compose names are Builder implementation details; user configuration must rely on endpoint references, not generated names.

---

# 14. Dependency health/readiness contract

For every effective dependency endpoint:

```text
endpoint
  -> endpoint.service
  -> matching service in dependency Compose
  -> service must define a valid Compose healthcheck
```

If multiple endpoints point to the same Compose service, one service healthcheck satisfies all of them.

If endpoints point to different services, each distinct endpoint-owning service requires its own healthcheck.

Builder defines dependency readiness as:

```text
all distinct endpoint-owning services are healthy
```

Missing healthchecks are validation errors.

Auxiliary Compose services that own no Builder endpoint do not receive an additional Builder healthcheck requirement unless the dependency’s own Compose lifecycle requires it.

Builder does not synthesize dependency healthchecks.

---

# 15. Automatic app dependency lifecycle

The app does not declare `app.dependsOn`.

`app.dependsOn` is forbidden.

In an integrated composition, the app automatically depends on every materialized local dependency.

Because a dependency can expose endpoints from multiple Compose services, Builder implements this as health-gated relationships from the app to every distinct endpoint-owning service of each materialized dependency:

```text
app
  -> dependency endpoint-owner A (service_healthy)
  -> dependency endpoint-owner B (service_healthy)
  -> ...
```

This is lifecycle ordering only. It is independent of environment references.

---

# 16. Dependency-to-dependency lifecycle

A dependency may declare:

```json
"dependsOn": [
  "dependencies.postgres",
  "dependencies.redis"
]
```

Rules:

- only dependency modules may use build-level `dependsOn`;
- references use fully qualified `dependencies.<name>`;
- self-reference is invalid;
- missing/unmaterialized targets are invalid;
- cycles are invalid;
- `dependsOn` does not create environment values;
- environment references do not create `dependsOn`.

For local dependency modules, Builder health-gates each distinct endpoint-owning service of the dependent module on the readiness services of the target dependency. Auxiliary services remain governed by the dependency Compose file’s own internal lifecycle rules.

`dependsOn` stage arrays union-merge with base.

All Builder-generated lifecycle edges use:

```yaml
condition: service_healthy
```

There is no `service_started` fallback.

---

# 17. Project stage override Compose

A build stage may declare:

```json
"override-compose": ".docker/overrides/docker-compose.dev.override.yml"
```

This is a string path relative to the service project.

Its purpose is to express stage-specific app container details that do not belong in the JSON abstraction, such as:

- development volumes;
- command overrides;
- Docker build args;
- app environment values;
- other permitted app runtime Compose details.

The override is an **app override**, not a second dependency/service declaration system.

V2 restrictions:

- it may not introduce arbitrary additional services;
- stage-only infrastructure must be declared through stage `dependencies`;
- it may not publish host ports;
- it may not redefine Builder endpoint ownership;
- it may not override Builder-owned environment keys;
- it may not create app lifecycle `depends_on`;
- it may not replace Builder’s app build target;
- it may not replace the Dockerfile contract;
- it may not replace required app healthchecks with a weaker/missing readiness model.

Builder validates the override before composition.

---

# 18. Service-level E2E tester

`build.json.tester` contains only tester `env`.

The actual service-level tester comes from the application Dockerfile’s `test-e2e` target.

During `builder service up test-e2e`:

1. the application runs from the `prod` target;
2. the application runtime stage is `e2e`;
3. integrated dependencies are materialized;
4. the tester runs from `test-e2e`;
5. the tester runs with host networking;
6. the tester waits for the app’s healthcheck;
7. the tester’s exit code is the E2E command result.

The service-level tester is a black-box client.

Builder rejects `network_*` endpoint references in tester `env`. Use effectively published `public_*` properties.

---

# 19. `mesh.json` model

Canonical shape:

```json
{
  "$schema": "...",
  "name": "fullstack",

  "tester": {
    "compose": "./e2e/docker-compose.yml",
    "service": "tester",
    "env": {}
  },

  "services": {},

  "dev": {},
  "prod": {},
  "test": {},
  "e2e": {}
}
```

Detailed field documentation is in `MESH_JSON_DOCS.md`.

---

# 20. Mesh service composition

A mesh service points to an independently runnable service directory containing its own `build.json`.

Example:

```json
"backend": {
  "path": "./services/backend"
}
```

Cross-service direct references use the actual mesh service name:

```text
${backend.app.endpoints.http.network_url}
```

There is no `services.backend...` reference form.

Mesh service `env` configures that service’s app container. It does not configure the service’s local dependency Compose services.

Environment wiring does not imply startup ordering.

---

# 21. Logical dependency substitution

A service may bind a logical dependency slot from its `build.json` to a concrete mesh service:

```json
"frontend": {
  "path": "./services/frontend",
  "dependencies": {
    "backend": "therealbackend"
  }
}
```

Here:

- `backend` is the frontend’s logical dependency slot;
- `therealbackend` is the concrete provider.

The frontend can keep:

```text
${dependencies.backend.endpoints.http.network_url}
```

in its own `build.json`.

Builder resolves it through:

```text
frontend dependency slot backend
    -> mesh provider therealbackend
    -> therealbackend.app.endpoints.http
```

The consumer does not restate its dependency environment just because the provider changes.

## 21.1 Substitution validation

Builder fails if:

- the dependency key is not declared by the consumer’s effective `build.json`;
- the provider top-level mesh service does not exist;
- substitution creates an invalid lifecycle cycle;
- an actually consumed endpoint/property cannot be satisfied by the provider.

## 21.2 Substitution suppresses local implementation

When a logical dependency is substituted:

- its local dependency Compose file is not materialized;
- its companion services are not materialized;
- its local resources are not materialized;
- the provider app service becomes the lifecycle provider.

## 21.3 Lifecycle transfer

Substitution automatically creates the consumer-to-provider health dependency.

It is unnecessary to duplicate the same provider in mesh `dependsOn`.

---

# 22. Reference-driven provider compatibility

A replacement provider does **not** need to expose the exact full endpoint set declared by the local/default dependency.

Compatibility is determined by actual effective references/usages.

Example consumer usage:

```text
${dependencies.backend.endpoints.http.network_url}
```

If `backend` is bound to `therealbackend`, Builder must be able to resolve:

```text
therealbackend.app.endpoints.http.network_url
```

Requirements are property-specific:

- `network_host`, `network_port`, `network_address` — endpoint must exist;
- `network_url` — endpoint must exist and have `scheme`;
- `public_host`, `public_port`, `public_address` — endpoint must exist and be effectively published;
- `public_url` — endpoint must exist, have `scheme`, and be effectively published.

Extra endpoints on either the logical local dependency or the provider are irrelevant unless actually referenced.

Provider ports do not need to equal local dependency ports.

Provider scheme is resolved from the provider endpoint; Builder does not require exact endpoint-object equality and does not guess endpoint-name mappings.

Endpoint names are contractually significant: logical endpoint `http` maps only to provider app endpoint `http`.

---

# 23. Mesh lifecycle ordering

A mesh service may declare:

```json
"dependsOn": [
  "frontend",
  "backend"
]
```

Every target must be an effective top-level mesh service.

The dependent service is health-gated on each target app service.

Rules:

- unresolved targets fail;
- self-dependencies fail;
- cycles fail;
- environment references do not create edges;
- `dependsOn` does not create environment values;
- substitution-created edges are automatic and need not be duplicated;
- stage `dependsOn` union-merges with base.

All lifecycle edges use `service_healthy`.

Mesh app health comes from the target service Dockerfile’s required `dev` or `prod` healthcheck depending on the active execution.

---

# 24. Mesh publication

Mesh is host-private by default.

A build endpoint may declare `publicPort`, but that does not publish it in mesh mode.

A mesh service explicitly publishes endpoints:

```json
"publish": [
  "app.endpoints.http",
  "dependencies.payments-api.endpoints.http"
]
```

Allowed publish targets are endpoints within that service’s effective composition:

```text
app.endpoints.<endpoint>
dependencies.<dependency>.endpoints.<endpoint>
```

Rules:

- the endpoint must exist;
- the endpoint must have `publicPort`;
- the dependency endpoint must belong to a materialized local dependency;
- a substituted local dependency cannot be published through the consumer;
- publish the provider’s app endpoint on the provider mesh service instead;
- mesh cannot change `port`, `publicPort`, `scheme`, or endpoint definitions;
- stage `publish` union-merges with base.

Only effectively published endpoints expose `public_*`.

---

# 25. Global mesh tester

Canonical tester:

```json
"tester": {
  "compose": "./e2e/docker-compose.yml",
  "service": "tester",
  "env": {
    "SYSTEM_URL": "${gateway.app.endpoints.http.public_url}"
  }
}
```

`compose` is required and points directly to the tester Compose file.

`service` is required and identifies the finite black-box test-runner service inside that Compose file.

`env` is optional and applies to the selected tester service.

The tester has no stage-specific overlay. `dev.tester`, `prod.tester`, `test.tester`, and `e2e.tester` are invalid.

The global tester exists only during global E2E execution.

Builder behavior:

1. load the tester Compose file;
2. validate the selected tester service exists;
3. materialize the tester Compose implementation needed by the runner;
4. force the selected runner to host-network black-box execution;
5. inject `tester.env`;
6. health-gate the runner on effective top-level mesh application services;
7. use the selected runner service as the E2E exit-code source.

Because the selected runner is host-networked, Builder rejects `network_*` endpoint references in `tester.env`.

The tester must use effectively published `public_*` endpoints.

There is no `tester.path`, `tester.dockerfile`, or tester policy field in V2. The tester Compose file owns its build/Dockerfile details.

---

# 26. Mesh stages

Mesh has:

```text
dev
prod
test
e2e
```

Each stage may overlay only `services`.

A stage may:

- modify an existing service;
- add a top-level service absent from base;
- add/override service `env`;
- add/override logical dependency bindings;
- add lifecycle `dependsOn`;
- add `publish` entries;
- replace scalar service fields such as `path` when explicitly provided.

For a stage-added service, `path` is required in the effective service definition.

There is no stage service removal syntax.

The active mesh stage is validated after overlay resolution.

---

# 27. Host-port allocation

## 27.1 Fixed ports

All fixed effective public ports are reserved before AUTO allocation.

Two simultaneously published endpoints cannot claim the same fixed host port.

A collision is a `PortConflictError`-class configuration failure and identifies both logical endpoint paths.

Builder does not silently remap fixed ports.

## 27.2 AUTO ports

`"AUTO"` means:

- allocate an available host port;
- prefer a previously cached port for the same logical endpoint;
- reuse it only if it is currently available and not reserved by another endpoint;
- otherwise scan deterministically for another available port;
- update the cache.

Builder stores AUTO allocation state under the existing gitignored `.builder` directory.

The `.builder` cache is disposable. Deleting it may change AUTO host ports but does not invalidate configuration.

Exact cache filename, serialization, locking strategy, and scan starting port are Builder-private implementation details and are not part of the JSON contract.

## 27.3 Deterministic allocation order

When compiling a mesh:

1. normalize the entire effective mesh;
2. reserve every fixed published host port;
3. sort top-level mesh services alphabetically;
4. within a service, process app endpoints first;
5. then dependencies alphabetically;
6. within each dependency, process endpoints alphabetically;
7. allocate AUTO ports in that order.

Allocation order is not startup order.

## 27.4 Mesh-global namespace

Mesh has one global host-port namespace.

Two independent standalone services may each validly declare the same fixed host port. The conflict exists only when they are composed in a mesh and both endpoints are actually published.

Non-published mesh endpoints do not allocate or reserve host ports.

---

# 28. Namespacing and collision isolation

Dependency Compose implementations are namespaced per consuming service/dependency so companion names do not collide.

Builder must consistently namespace and rewrite dependency-owned service/resource references.

For example, two different dependency Compose files may both contain a service named `helper`; the compiled composition must keep them distinct.

The generated names are not a public API.

Configuration must use logical Builder references rather than generated Compose service names.

---

# 29. Secrets

Builder V2 is not a secrets manager.

There is no first-class `secrets` field in `build.json` or `mesh.json`.

Sensitive values should come from stage env files, CI/CD injection, secret-management infrastructure, or Compose mechanisms that do not require committing secrets to Builder JSON.

Dependency Compose files may use Docker Compose secrets internally; Builder namespaces dependency-owned resources where required.

---

# 30. Removed V1/V1.2 fields

V2 rejects legacy configuration instead of translating it.

## 30.1 Removed from `build.json`

Rejected legacy fields include:

```text
port
envOverrides
overrides
composeFiles
services
policy
policies
injects
sidecars
```

Removed dependency shortcuts include:

```text
dependencies.<name>.path
dependencies.<name>.service
dependencies.<name>.port
dependencies.<name>.ports
```

Use:

```text
dependencies.<name>.compose
dependencies.<name>.endpoints.<endpoint>.service
dependencies.<name>.endpoints.<endpoint>.port
dependencies.<name>.endpoints.<endpoint>.publicPort
```

There is no root/app single-port shortcut.

Stage override syntax is:

```json
"override-compose": "path/to/file.yml"
```

not:

```json
"override": { "path": "..." }
```

## 30.2 Removed from `mesh.json`

Rejected legacy fields include:

```text
dependencies                 (root-level)
services.<name>.port
services.<name>.preservePort
services.<name>.provideDependency
services.<name>.replaceMocks
services.<name>.envOverrides
services.<name>.healthcheck
tester.path
tester.dockerfile
tester.envOverrides
tester.policy
inherit-published
```

Use:

```text
services.<name>.dependencies
services.<name>.env
services.<name>.publish
tester.compose
tester.service
tester.env
```

Mesh cannot override build endpoint declarations.

---

# 31. Canonical comprehensive `build.json`

```json
{
  "$schema": "https://example.invalid/build-v2.schema.json",
  "name": "frontend",
  "dockerfile": "Dockerfile",

  "app": {
    "env": {
      "BACKEND_URL": "${dependencies.backend.endpoints.http.network_url}",
      "REDIS_HOST": "${dependencies.redis.endpoints.redis.network_host}"
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
    "backend": {
      "compose": ".docker/dependencies/backend.compose.yml",
      "env": {
        "MODE": "mock"
      },
      "endpoints": {
        "http": {
          "service": "backend",
          "port": 3000,
          "primary": true,
          "scheme": "http"
        },
        "metrics": {
          "service": "backend-metrics",
          "port": 9090,
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

    "realtime": {
      "compose": ".docker/dependencies/realtime.compose.yml",
      "dependsOn": [
        "dependencies.redis"
      ],
      "env": {
        "REDIS_HOST": "${dependencies.redis.endpoints.redis.network_host}"
      },
      "endpoints": {
        "ws": {
          "service": "realtime",
          "port": 7000,
          "primary": true,
          "scheme": "ws"
        }
      }
    }
  },

  "tester": {
    "env": {
      "APP_URL": "${app.endpoints.http.public_url}"
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
    "override-compose": ".docker/overrides/docker-compose.test.override.yml"
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
      }
    }
  }
}
```

---

# 32. Canonical comprehensive `mesh.json`

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
        "FRONTEND_URL": "${frontend.app.endpoints.http.network_url}",
        "BACKEND_URL": "${backend.app.endpoints.http.network_url}"
      },
      "dependsOn": [
        "frontend",
        "backend"
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

# 33. Final architecture boundary

The V2 design intentionally reduces the number of overlapping configuration mechanisms:

```text
build.json
  = what one service is
  + what logical infrastructure it needs
  + its standalone/stage behavior

dependency Compose
  = how a local/default dependency implementation runs

mesh.json
  = which services are composed
  + which concrete services satisfy logical dependency slots
  + mesh lifecycle
  + host publication
  + global E2E tester

Dockerfile
  = how one app is built/run/tested

Builder
  = validation
  + stage overlay resolution
  + dependency substitution
  + namespacing
  + health-gated lifecycle
  + endpoint/property resolution
  + deterministic host-port allocation
  + final Compose compilation
```

This boundary is normative for V2.
