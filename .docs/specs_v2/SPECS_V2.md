# Builder Configuration Specification V2

**Status:** Final architecture specification  
**Files covered:** `build.json`, `mesh.json`  
**Compatibility:** V2 is intentionally breaking relative to Builder V1/V1.2. Legacy fields are rejected; Builder does not silently translate them.

---

## 1. Purpose and ownership

Builder has two configuration layers:

- **`build.json` is service truth.** It describes one independently runnable application, its logical dependencies, endpoints, stage configuration, and service-level E2E tester environment.
- **`mesh.json` is composition truth.** It composes independently runnable services, binds logical dependency slots to mesh providers, defines cross-service lifecycle ordering, selects host publication, and defines the global E2E tester.

Core invariants:

1. configuration is explicit and deterministic;
2. invalid or unresolved declarations fail before runtime whenever possible;
3. application code must not know whether an integrated dependency is production infrastructure, an emulator, a mock service, or another mesh service;
4. environment/reference wiring does not imply lifecycle ordering;
5. logical dependency identity is separate from concrete provider identity;
6. dependency Compose files never control host publication directly;
7. mesh is private-by-default and may publish only endpoints already made publishable by `build.json`;
8. E2E applications execute as production applications;
9. E2E testers are separate, test-aware black-box processes;
10. services remain independently runnable and testable outside a mesh.

---

# 2. Execution model

## 2.1 Runtime variables

### `EXEC_MODE`

Application values:

```text
dev
test
prod
```

Meaning:

- `dev` — development execution;
- `test` — unit/isolated test execution;
- `prod` — production-equivalent execution.

`EXEC_MODE=e2e` is reserved for E2E tester processes. Applications under E2E run with `EXEC_MODE=prod`.

### `INFRA_MODE`

Application values:

```text
isolated
integrated
```

Meaning:

- `isolated` — no external dependency containers are materialized; the application selects in-process stubs/mocks;
- `integrated` — dependencies are consumed through their normal network/service interfaces.

Builder injects the mode. The application is responsible for interpreting it.

E2E testers do **not** receive `INFRA_MODE`.

---

## 2.2 Standalone service matrix

| Operation | App/runner target | `EXEC_MODE` | `INFRA_MODE` | Env file |
|---|---|---|---|---|
| service dev | `dev` | `dev` | `isolated` | `.env.dev` |
| service dev `--full` | `dev` | `dev` | `integrated` | `.env.dev` |
| service prod | `prod` | `prod` | `integrated` | `.env.prod` |
| unit/isolated test | `test` | `test` | `isolated` | `.env.test` |
| service E2E app | `prod` | `prod` | `integrated` | `.env.e2e` |
| service E2E tester | `test-e2e` | `e2e` | — | `.env.e2e-tester` |

Service `make test` semantics are always:

```text
1. unit / isolated test
2. service E2E
```

Phase 2 runs only if Phase 1 succeeds.

---

## 2.3 Mesh matrix

| Operation | App target | `EXEC_MODE` | `INFRA_MODE` | App env |
|---|---|---|---|---|
| mesh dev | `dev` | `dev` | `integrated` | each service `.env.dev` |
| mesh prod | `prod` | `prod` | `integrated` | each service `.env.prod` |
| global E2E apps | `prod` | `prod` | `integrated` | each service `.env.e2e` |
| global E2E tester | `test-e2e` | `e2e` | — | root `.env.e2e-tester` |

Provided dependencies use their mesh providers. Unprovided dependencies use the service-owned integrated dependency implementation.

---

## 2.4 E2E inheritance

Structured E2E configuration is production-shaped:

```text
base
  -> prod
    -> e2e
```

This applies independently to:

- service-level E2E through `build.json`;
- global E2E through `mesh.json`.

E2E therefore starts from the production topology and may then apply controlled test overrides.

Allowed E2E changes include:

- stage-only dependencies or services;
- dependency-provider overrides;
- inspection infrastructure such as Mailpit;
- fixture/support services;
- E2E-specific endpoint/credential values;
- additional publication of endpoints already made publishable by `build.json`.

Production-shaped does **not** mean production values.

The application still runs:

```text
target=prod
EXEC_MODE=prod
INFRA_MODE=integrated
```

and must continue using the same integrated application adapters.

---

## 2.5 Global `make test`

Global testing has exactly two phases.

### Phase 1 — Independent service tests

For every service declared in root `mesh.json.services`, in deterministic sequential order:

```text
run semantic equivalent of that service's own make test
  -> unit / isolated test
  -> service E2E
  -> full teardown
```

Rules:

- services are never tested concurrently;
- phase 1 uses each root service's original path. Mesh service env, stage overlays, dependency bindings, lifecycle edges, and publication selections are not applied to either standalone test phase.
- any failure stops the pipeline;
- after each service, its application, dependencies, tester, networks, host ports, and temporary runtime state are torn down;
- services introduced only by stage overlays are not Phase-1 members unless they also exist in root `services`.

### Phase 2 — Global E2E

After all Phase-1 service tests pass:

```text
start clean mesh:
base
  -> prod
    -> e2e

then run global E2E tester
```

No Phase-1 runtime state may leak into Phase 2.

Builder may invoke the underlying service lifecycle directly. It does not need to literally execute `make test`; semantic equivalence is the requirement.

---

# 3. Service independence

Every mesh service is treated as an independently owned project.

Builder does not require Git submodules, `.gitmodules`, or a specific repository layout. Monorepos, worktrees, fixtures, and submodules are all valid as long as service independence is preserved.

Canonical project convention:

```bash
make dev
make prod
make test
```

These Make targets are a developer-interface convention, not a Builder schema requirement.

---

# 4. Fail-fast contract

Any declared configuration that cannot be validated or resolved must fail.

Builder must not guess, coerce, silently omit, silently remap, or weaken readiness.

Examples:

- invalid JSON/YAML;
- missing files;
- project-escaping paths;
- unsupported/legacy fields;
- non-string `env` values;
- invalid endpoint/service identifiers;
- unresolved references;
- URL references without a scheme;
- `public_*` references to unpublished endpoints;
- invalid provider bindings;
- lifecycle cycles;
- missing required healthchecks;
- forbidden dependency Compose host ports;
- fixed host-port collisions;
- stage-only references used where unavailable;
- references to a substituted local dependency implementation.

Errors should identify the source file, logical path, offending value/reference, active composition, and reason where applicable.

Builder-created readiness edges use `service_healthy`; there is no `service_started` fallback.

---

# 5. Identifiers

Dependency keys, endpoint keys, and top-level mesh service names use:

```text
^[a-z][a-z0-9-]*$
```

Reserved top-level mesh service names:

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

Invalid/reserved names fail; Builder does not rewrite them.

---

# 6. Composition modules

Builder internally reasons about:

- **app** — the application built from the service Dockerfile;
- **dependency** — a logical dependency backed by a dependency Compose implementation;
- **tester** — a finite E2E caller.

There is no sidecar role.

A dependency Compose file is an atomic implementation unit and may contain multiple Compose services.

---

# 7. Endpoint model

## 7.1 App endpoint

```ts
type AppEndpoint = {
  port: number;
  publicPort?: number | "AUTO";
  primary?: boolean;
  scheme?: string;
};
```

## 7.2 Dependency endpoint

```ts
type DependencyEndpoint = {
  service: string;
  port: number;
  publicPort?: number | "AUTO";
  primary?: boolean;
  scheme?: string;
};
```

Dependency endpoint `service` is always explicit. Builder never infers it.

## 7.3 Port semantics

```text
port       = container/network port
publicPort = host/machine publication intent
```

`publicPort`:

- omitted — not host-publishable;
- number — fixed host port;
- `"AUTO"` — Builder allocates an available host port.

Valid numeric ports are `1..65535`.

## 7.4 Primary endpoint

For any non-empty endpoint collection, exactly one effective endpoint must declare:

```json
"primary": true
```

Omission means `false`.

For app endpoints, the primary endpoint's `port` becomes Builder-owned application `PORT`.

For dependency endpoints, `primary` is canonical endpoint metadata only. It does not select a principal Compose service or change readiness.

## 7.5 Scheme

Optional `scheme` must match:

```text
^[A-Za-z][A-Za-z0-9+.-]*$
```

Builder does not maintain a protocol whitelist.

---

# 8. Endpoint properties

Exposed properties:

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

```text
network_address = network_host:network_port
network_url     = scheme://network_host:network_port
public_address  = public_host:public_port
public_url      = scheme://public_host:public_port
```

Current default `public_host`:

```text
127.0.0.1
```

`network_url` and `public_url` require `scheme`.

`public_*` exists only when the endpoint is effectively published.

---

# 9. Publication

## 9.1 Standalone

A materialized endpoint with `publicPort` is automatically host-published in standalone service execution.

## 9.2 Mesh

Mesh is host-private by default.

`publicPort` in `build.json` grants publication capability. `mesh.json.publish` selects actual exposure.

```text
build.json publicPort = may be published, and on which host-port policy
mesh.json publish      = publish it in this mesh
```

Mesh cannot invent publication capability.

If a mesh `publish` entry targets an endpoint without `publicPort`, compilation fails.

Mesh cannot change `port`, `publicPort`, `scheme`, or endpoint identity.

A retained local dependency endpoint may be published by the consuming mesh service.

A substituted local dependency is absent and cannot be published through the consumer; publish the provider app endpoint on the provider service instead.

---

# 10. Builder references

## 10.1 In `build.json`

```text
${app.endpoints.<endpoint>.<property>}
${dependencies.<dependency>.endpoints.<endpoint>.<property>}
```

## 10.2 In `mesh.json`

Where a mesh field supports Builder references, direct service references use:

```text
${<mesh-service>.app.endpoints.<endpoint>.<property>}
${<mesh-service>.dependencies.<dependency>.endpoints.<endpoint>.<property>}
```

There is no `services.` prefix.

Mesh service `env` and global `tester.env` may consume these references.

References resolve after effective stage inheritance, dependency substitution, publication resolution, fixed-port reservation, and AUTO allocation.

Unresolved references fail.

---

# 11. Environment model

Every JSON `env` map is:

```ts
Record<string, string>
```

No coercion is performed.

Environment ownership is consumer-side:

- `app.env` configures the application at service level;
- `dependencies.<name>.env` configures a dependency implementation;
- `mesh.json services.<name>.env` applies composition-level overrides to that app;
- `build.json.tester.env` configures the service E2E tester;
- `mesh.json.tester.env` configures the global E2E tester.

There is no `injects`.

## 11.1 Mesh service environment

`mesh.json` may define:

```text
services.<name>.env
<stage>.services.<name>.env
```

Both are strict `Record<string, string>` maps.

Mesh env is an intentional composition-level override mechanism. It may override service-level application env when the composition requires it.

Logical dependency/provider bindings remain the preferred mechanism for dependency relationships, but mesh env remains available for composition-specific application configuration.

Environment references do not imply lifecycle ordering.

## 11.2 Application env precedence

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

For standalone execution, the two mesh layers are simply absent.

For service-level E2E, low to high:

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

`.env.prod` is **not** merged into `.env.e2e`.

E2E inherits production structured overlays, not the production env file.

Builder-owned keys are authoritative. If a lower/user-controlled layer attempts to set a Builder-owned key, Builder fails instead of silently accepting it.

## 11.3 Tester env precedence

Low to high:

```text
.env.e2e-tester
-> tester.env
-> Builder internal tester environment
```

For service E2E, `tester.env` means `build.json.tester.env`.

For global E2E, it means `mesh.json.tester.env`.

`.env.e2e` and `.env.e2e-tester` are separate and are never implicitly merged.

Tester Builder-owned values are authoritative.

## 11.4 Build arguments

Runtime `env` is not automatically copied into Docker build args.

Use stage `override-compose` `services.app.build.args` for build-time values.

---

# 12. Stage overlay semantics

General rules:

- maps/objects deep-merge;
- scalar stage values replace the inherited scalar unless explicitly immutable;
- omitted fields inherit;
- stage-only entries are added;
- arrays normally replace.

Explicit union-merge arrays:

- dependency `dependsOn`;
- mesh service `dependsOn`;
- mesh service `publish`.

Union order is inherited entries first, then stage entries, exact duplicates removed.

No generic deletion syntax exists in V2.

Build stage chains:

```text
dev  = base -> dev
prod = base -> prod
test = base -> test
e2e  = base -> prod -> e2e
```

Mesh stage chains:

```text
dev  = base -> dev
prod = base -> prod
e2e  = base -> prod -> e2e
```

Validation runs against the final effective composition.

---

# 13. `build.json`

Canonical shape:

```json
{
  "$schema": "...",
  "name": "service",
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

See `BUILD_JSON_DOCS.md` for every field.

---

# 14. Application Dockerfile contract

Default Dockerfile path:

```text
Dockerfile
```

Required target aliases:

```text
dev
test
test-e2e
prod
```

Normative requirements:

1. `dev` is the development app runtime and has a foreground default command;
2. `test` is a finite unit/isolated test runner;
3. `test-e2e` is a finite service E2E tester;
4. `prod` is the production-equivalent app runtime;
5. hardcoded Dockerfile `EXPOSE` is forbidden;
6. app runtime stages must not daemonize/background the main process;
7. `prod` retains the production artifact-isolation contract;
8. `dev` must define/inherit a valid Docker `HEALTHCHECK`;
9. `prod` must define/inherit a valid Docker `HEALTHCHECK`;
10. finite `test`/`test-e2e` runners do not require healthchecks.

Builder does not synthesize missing app healthchecks.

---

# 15. Dependency model

A dependency is:

```text
logical dependency slot
  -> one local/default Compose implementation
  -> zero or more named endpoints
  -> each endpoint explicitly selects its owning Compose service
```

There is no dependency-level `service` field.

Builder has no first-class `third-party` versus `fellow-service` dependency type.

Those terms are descriptive vocabulary only.

Composition determines behavior:

```text
no mesh provider
-> use service-owned local dependency implementation when integrated

mesh provider supplied
-> suppress local implementation
-> provider satisfies logical dependency slot
```

Any declared logical dependency may be substituted by an explicit mesh provider.

---

# 16. Dependency materialization

A dependency with no effective endpoints is inert and is not materialized.

When a local dependency is materialized:

- its entire Compose implementation is materialized atomically;
- all owned services/resources required by that implementation are namespaced;
- endpoint-owning services become the externally addressable logical surface;
- internal Compose references are rewritten consistently.

When substituted by a mesh provider:

- no local dependency Compose service is materialized;
- no local dependency resource is materialized;
- the entire local implementation is suppressed atomically.

---

# 17. Dependency Compose contract

A dependency `compose` path is relative to the service project.

A materialized dependency Compose file:

- must contain services;
- may use `image:` or `build:`;
- may contain multiple services;
- may define volumes/configs/secrets/internal networks;
- may define internal `depends_on`;
- must not contain `services.*.ports`;
- must not use host networking;
- must not use `privileged: true`;
- must not hardcode globally conflicting `container_name`;
- must not mount the host root filesystem.

Host publication belongs to Builder endpoints, never dependency Compose `ports`.

Builder namespaces dependency-owned services/resources and rewrites supported internal references.

Generated names are implementation details, not public API.

---

# 18. Dependency Compose across stages

A base dependency's `compose` implementation is immutable across stages.

Stages may change:

- dependency env;
- endpoint metadata;
- lifecycle relations.

A stage may provide `compose` only when introducing a dependency that does not already exist in the inherited configuration.

Because E2E inherits `prod`, an E2E stage may add new E2E-only dependencies while retaining inherited production dependencies.

---

# 19. Dependency readiness

Every materialized dependency endpoint points to a Compose service.

That service must define a valid Compose healthcheck.

If multiple endpoints use the same service, one healthcheck satisfies them.

Dependency readiness means:

```text
all distinct endpoint-owning services are healthy
```

Missing required healthchecks fail.

Builder does not synthesize dependency healthchecks.

---

# 20. Lifecycle

## 20.1 App to local dependencies

`app.dependsOn` is forbidden.

In integrated execution, the app automatically health-depends on every distinct endpoint-owning service of every materialized local dependency.

## 20.2 Dependency to dependency

A dependency may declare:

```json
"dependsOn": [
  "dependencies.redis"
]
```

Rules:

- dependency modules only;
- fully qualified `dependencies.<name>`;
- unresolved/self/cyclic targets fail;
- target must be materialized;
- lifecycle does not create env;
- env references do not create lifecycle.

Builder-generated edges use `service_healthy`.

## 20.3 Mesh service lifecycle

A mesh service may explicitly declare:

```json
"dependsOn": ["backend"]
```

Dependency substitution also transfers lifecycle automatically from consumer to provider.

Unresolved/self/cyclic service graphs fail.

---

# 21. Project stage override Compose

A build stage may declare:

```json
"override-compose": ".docker/overrides/docker-compose.e2e.override.yml"
```

This is an app override mechanism for details such as:

- volumes;
- commands;
- build args;
- app environment;
- other permitted app runtime Compose settings.

It may not:

- introduce arbitrary extra services;
- publish host ports;
- define app `depends_on`;
- redefine Builder endpoint ownership;
- override Builder-owned env;
- replace the Builder-selected app target;
- weaken/remove required healthchecks.

Stage-only infrastructure belongs in stage `dependencies`.

For E2E, both inherited `prod` override Compose and `e2e` override Compose participate, in that order.

---

# 22. Service-level E2E tester

`build.json.tester` contains only:

```json
{
  "env": {}
}
```

The runner is the service Dockerfile `test-e2e` target.

Service E2E:

```text
app:
  target=prod
  EXEC_MODE=prod
  INFRA_MODE=integrated
  env=.env.e2e
  structured config=base -> prod -> e2e

tester:
  target=test-e2e
  EXEC_MODE=e2e
  no INFRA_MODE
  env=.env.e2e-tester
```

The tester is host-networked and black-box.

Tester endpoint references must use effective `public_*`; `network_*` endpoint references are invalid.

---

# 23. `mesh.json`

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
  "e2e": {}
}
```

Mesh service fields are:

```text
path
env
dependencies
dependsOn
publish
```

`env` is a composition-level application environment override.

See `MESH_JSON_DOCS.md` for every field.

---

# 24. Mesh dependency substitution

Example:

```json
"frontend": {
  "path": "./services/frontend",
  "dependencies": {
    "backend": "backend"
  }
}
```

Meaning:

```text
consumer logical slot backend
-> top-level mesh provider backend
-> provider app endpoint with matching logical endpoint name
```

Effects:

- local dependency implementation is atomically suppressed;
- consumer logical references resolve against the provider;
- consumer health-depends on the provider automatically.

Builder does not classify the slot as third-party or fellow-service and does not restrict substitution by category.

---

# 25. Reference-driven provider compatibility

Provider compatibility is based on actually consumed endpoint properties, not exact endpoint-set equality.

For a logical use:

```text
${dependencies.backend.endpoints.http.network_url}
```

the provider must satisfy:

```text
provider.app.endpoints.http.network_url
```

Property requirements:

- `network_host`, `network_port`, `network_address` — endpoint exists;
- `network_url` — endpoint exists + scheme;
- `public_host`, `public_port`, `public_address` — endpoint exists + effective publication;
- `public_url` — endpoint exists + scheme + effective publication.

Extra unused endpoints on either side are irrelevant.

Provider ports need not equal local dependency ports.

Endpoint names are significant; Builder does not guess remappings.

---

# 26. Mesh stages

## Dev

Effective configuration:

```text
base -> dev
```

Every app:

```text
target=dev
EXEC_MODE=dev
INFRA_MODE=integrated
.env.dev
```

## Prod

Effective configuration:

```text
base -> prod
```

Every app:

```text
target=prod
EXEC_MODE=prod
INFRA_MODE=integrated
.env.prod
```

## E2E

Effective configuration:

```text
base -> prod -> e2e
```

Every app:

```text
target=prod
EXEC_MODE=prod
INFRA_MODE=integrated
.env.e2e
```

E2E may add services, override provider bindings, add lifecycle edges, and publish additional already-publishable endpoints.

The global tester is then executed.

## Test command (no mesh overlay)

`mesh.json` supports `dev`, `prod`, and `e2e` overlays only. A root `test` field is rejected, including an empty object and when `--skip-checks` is used. `build.json.test` remains supported.

Canonical global test behavior is the two-phase process in Section 2.5.

---

# 27. Mesh publication and AUTO ports

Mesh publication may target:

```text
app.endpoints.<endpoint>
dependencies.<dependency>.endpoints.<endpoint>
```

The dependency form is valid only for a retained/materialized local dependency.

`publish` cannot expose an endpoint lacking `publicPort`.

AUTO allocation:

1. normalize the effective composition;
2. reserve all fixed published ports;
3. process top-level services alphabetically;
4. within a service, process app endpoints first;
5. process dependencies alphabetically;
6. process dependency endpoints alphabetically;
7. allocate/reuse AUTO ports deterministically.

AUTO cache lives under gitignored `.builder`.

The cache is disposable.

Exact cache file format, locking, scan start, and serialization are Builder implementation details.

Mesh has one global host-port namespace for actually published endpoints.

---

# 28. Global mesh tester

Canonical:

```json
"tester": {
  "compose": "./e2e/docker-compose.yml",
  "service": "tester",
  "env": {
    "SYSTEM_URL": "${gateway.app.endpoints.http.public_url}"
  }
}
```

Rules:

- root-only; no stage-specific tester overlay;
- `compose` required;
- `service` required;
- selected runner must execute as the tester's `test-e2e` target/equivalent finite runner;
- runner receives `EXEC_MODE=e2e`;
- runner receives no `INFRA_MODE`;
- runner receives root `.env.e2e-tester`;
- `tester.env` overlays that file;
- Builder internal tester env has final authority;
- runner is host-networked;
- runner uses public endpoints only;
- selected runner exit code determines global E2E success.

Tester Compose may include helper services.

---

# 29. Global test isolation

Phase-1 service tests are sequential.

After each service test lifecycle, Builder tears down all runtime resources associated with that service test.

Before Phase 2, no Phase-1 application, dependency, tester, network, port reservation, or temporary runtime composition remains active.

Failures also trigger teardown of the active composition.

---

# 30. Host-port conflicts

All fixed effective published ports reserve before AUTO allocation.

Two simultaneously published fixed endpoints cannot claim the same host port.

Conflict is a fail-fast `PortConflictError`-class failure identifying both endpoint paths.

Two independently run standalone services may validly use the same fixed host port; conflict exists only when the endpoints are simultaneously published in the same composition.

---

# 31. Secrets

Builder is not a secrets manager.

There is no first-class Builder `secrets` field.

Use:

- stage env files;
- CI/CD injection;
- external secret systems;
- dependency Compose secrets where appropriate.

---

# 32. Removed V1/V1.2 fields

## `build.json`

Rejected:

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

dependencies.<name>.path
dependencies.<name>.service
dependencies.<name>.port
dependencies.<name>.ports
```

Replacements include:

```text
app.endpoints
app.env
<stage>.override-compose
dependencies.<name>.compose
dependencies.<name>.endpoints.<endpoint>.service
dependencies.<name>.endpoints.<endpoint>.port
dependencies.<name>.endpoints.<endpoint>.publicPort
```

## `mesh.json`

Rejected:

```text
root dependencies
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
services.<name>.env
services.<name>.dependencies
services.<name>.dependsOn
services.<name>.publish
tester.compose
tester.service
tester.env
```

No legacy field is silently translated.

---

Root `mesh.json.test` was removed in V2.2. Move service-owned isolated settings to `build.json.test` and global E2E topology settings to `mesh.json.e2e` as appropriate. No automatic translation is performed.

# 33. Canonical E2E model

```text
SERVICE E2E

build config:
  base
    -> prod
      -> e2e

app:
  target=prod
  EXEC_MODE=prod
  INFRA_MODE=integrated
  .env.e2e

tester:
  target=test-e2e
  EXEC_MODE=e2e
  no INFRA_MODE
  .env.e2e-tester


GLOBAL E2E

mesh config:
  base
    -> prod
      -> e2e

every app:
  target=prod
  EXEC_MODE=prod
  INFRA_MODE=integrated
  own .env.e2e

global tester:
  target=test-e2e
  EXEC_MODE=e2e
  no INFRA_MODE
  root .env.e2e-tester
```

This execution model is normative for Builder V2.