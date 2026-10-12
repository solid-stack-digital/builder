# Solid Stack Builder V2 Migration — Plan 02
## Standalone Service Composition, Dependency Bundles, Health-Gated Lifecycle, Override Compose, and Service E2E

**Implementation order:** 2 of 4  
**Depends on:** Plan 01  
**Blocks:** Plan 03 and final cleanup in Plan 04  
**Primary files replaced:** `src/core/compileEnvironment.ts` plus service composition helpers  
**Normative sources:** `SPECS_V2.md` sections on execution model, dependency composition, health, override Compose, endpoint publication, and service E2E; `BUILD_JSON_DOCS.md` in full.

---

# Edit-location convention

The current repository snapshot is a concatenated source export, so physical line numbers in that snapshot are not stable source-file line numbers and would become wrong immediately after Plan 01 edits. This plan therefore uses **deterministic edit locators** instead: exact file path + exported symbol/function + old field/snippet, or `replace whole file`. Treat those locators as the required edit location. For every whole-file replacement, delete the entire current file contents first; for partial edits, search the exact symbol/snippet named by the step and edit only that block. Do not search for a nearby “similar” implementation and leave the named block untouched.

---

# 1. Objective

Replace the current standalone compiler's V1 model—hardcoded port `3000`, root `port`, dependency `path/service/port/ports`, first-service fallback, env-to-build-arg injection, `service_started` downgrade, prod inheritance into E2E—with a V2 compiler that first constructs an explicit effective service composition and only then renders Compose YAML.

At the end of this plan these commands must compile the V2 model correctly:

```text
builder service up dev
builder service up dev --full
builder service up prod
builder service up test-unit
builder service up test-e2e
builder service up test
```

`service up test` remains the orchestration of `test-unit` followed by `test-e2e`, stopping if unit tests fail.

---

# 2. Required execution matrix

Implement this table literally:

| command/compiler stage | Dockerfile target for app | runtime config stage | local dependency materialization | service tester |
|---|---|---|---|---|
| `service up dev` | `dev` | `dev` | no | no |
| `service up dev --full` | `dev` | `dev` | yes | no |
| `service up prod` | `prod` | `prod` | yes | no |
| `service up test-unit` / compiler `test` | `test` | `test` | no | no |
| `service up test-e2e` / compiler `e2e` | app=`prod` | `e2e` | yes | `test-e2e` |

Builder-owned runtime values:

```text
EXEC_MODE=dev|prod|test|e2e
INFRA_MODE=isolated|integrated
PORT=<primary app endpoint container port>    only when app endpoints exist
```

Do **not** inject `PUBLIC_PORT`.

Do **not** load `.env.prod` or `prod.app.env` during E2E.

---

# 3. Exact target module layout

Create:

```text
src/core/composition/
  types.ts
  loadCompose.ts
  composePaths.ts
  composeEnvironment.ts
  validateDependencyCompose.ts
  namespaceDependencyCompose.ts
  validateOverrideCompose.ts
  dependencyLifecycle.ts
  serviceEndpoints.ts
  compileServiceComposition.ts
```

Replace:

```text
src/core/compileEnvironment.ts
```

Update:

```text
src/core/compileApplicationEnv.ts
src/core/runners/runDev.ts
src/core/runners/runProd.ts
src/core/runners/runTestUnit.ts
src/core/runners/runTestE2e.ts
src/core/runners/runTest.ts              verification only; behavior should remain unit -> E2E
templates/docker/docker-compose.base.yml
templates/docker/docker-compose.dev.yml
templates/docker/docker-compose.prod.yml
templates/docker/docker-compose.test.yml
templates/docker/docker-compose.e2e.yml
src/core/templates.ts
```

Stop importing `templates/docker/docker-compose.standalone.yml` in this plan. Plan 04 deletes the physical file after the import removal and updates prepublish checks.

---

# 4. Add `src/core/composition/types.ts`

Use plain JavaScript object shapes compatible with `yaml.stringify`; do not create a second YAML AST system.

Create these internal contracts:

```ts
import type { Environment } from "../../types/index.js";
import type { EffectiveBuildConfig, ResolvedEndpoint } from "../config/types.js";

export interface ComposeService {
  [key: string]: unknown;
  build?: unknown;
  image?: string;
  command?: unknown;
  entrypoint?: unknown;
  environment?: Record<string, string> | string[];
  env_file?: unknown;
  ports?: unknown[];
  networks?: unknown;
  depends_on?: unknown;
  healthcheck?: unknown;
  volumes?: unknown[];
  configs?: unknown;
  secrets?: unknown;
  links?: unknown[];
  volumes_from?: unknown[];
  network_mode?: string;
  privileged?: boolean;
  container_name?: string;
}

export interface ComposeDocument {
  name?: string;
  services: Record<string, ComposeService>;
  volumes?: Record<string, unknown>;
  networks?: Record<string, unknown>;
  configs?: Record<string, unknown>;
  secrets?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface MaterializedDependency {
  key: string;
  composePath: string;
  compose: ComposeDocument;
  serviceNameMap: Map<string, string>;
  endpointOwnerMap: Map<string, string>;
  endpointOwners: Set<string>;
  endpoints: Record<string, ResolvedEndpoint>;
}

export interface ServiceExecutionProfile {
  configStage: Environment;
  appTarget: "dev" | "test" | "prod";
  runtimeStage: Environment;
  integrated: boolean;
  includeTester: boolean;
  testerTarget?: "test-e2e";
}

export interface CompiledServiceComposition {
  compose: ComposeDocument;
  effectiveBuild: EffectiveBuildConfig;
  endpoints: {
    app: Record<string, ResolvedEndpoint>;
    dependencies: Record<string, Record<string, ResolvedEndpoint>>;
  };
  projectName: string;
  testerServiceName?: string;
}
```

Keep this internal; do not export from package root.

---

# 5. Add an execution-profile function in `compileServiceComposition.ts`

Implement:

```ts
function getExecutionProfile(
  stage: Environment,
  full: boolean,
): ServiceExecutionProfile {
  switch (stage) {
    case "dev":
      return {
        configStage: "dev",
        appTarget: "dev",
        runtimeStage: "dev",
        integrated: full,
        includeTester: false,
      };
    case "prod":
      return {
        configStage: "prod",
        appTarget: "prod",
        runtimeStage: "prod",
        integrated: true,
        includeTester: false,
      };
    case "test":
      return {
        configStage: "test",
        appTarget: "test",
        runtimeStage: "test",
        integrated: false,
        includeTester: false,
      };
    case "e2e":
      return {
        configStage: "e2e",
        appTarget: "prod",
        runtimeStage: "e2e",
        integrated: true,
        includeTester: true,
        testerTarget: "test-e2e",
      };
  }
}
```

There must be no fallback/default branch that guesses a mode.

---

# 6. Add `src/core/composition/loadCompose.ts`

Export:

```ts
export function loadComposeDocument(
  absolutePath: string,
  context: {
    sourceFile: string;
    configPath: string;
    stage: string;
    composition: "service" | "mesh";
  },
): ComposeDocument
```

Behavior:

1. require the file to exist and be a regular file;
2. read UTF-8;
3. parse with `yaml.parse`;
4. parse with `parseAllDocuments`; require exactly one YAML document and reject multi-document dependency/override/tester Compose files;
5. root must be an object;
6. `services` when required is validated by the caller;
7. preserve unknown legitimate Compose keys—the parser is not a complete Compose schema validator;
8. throw `ConfigError` with file/path/stage on parsing errors.

Do not invoke `docker compose config` here; this loader must remain pure enough for unit tests. Final Compose validation can happen after Builder renders the complete file.

---

# 7. Add `src/core/composition/composePaths.ts`

Dependency Compose files can contain relative `build.context`, `build.dockerfile`, `env_file`, and bind paths that were originally relative to the dependency Compose file's directory. Once the document is inlined into the generated composition, those paths must still resolve to the same filesystem locations.

Create:

```ts
export function rebaseComposePaths(
  document: ComposeDocument,
  composeFilePath: string,
  outputProjectDir: string,
): ComposeDocument
```

## 7.1 Rebase at minimum

For every service:

- `build: "./path"`;
- `build.context`;
- `build.dockerfile` relative to the original build context;
- `env_file` string, list of strings, and long form `{path, required}`;
- bind mounts in short syntax when source is relative;
- long-form volume `type: bind` `source`;
- file-backed `configs` / `secrets` definitions at top level.

Resolve each relative Compose-owned path against the directory of the dependency Compose file, then emit a POSIX-normalized path relative to `outputProjectDir` when the target is inside it; otherwise emit the normalized absolute path. Do not impose a new project-boundary restriction on generic Compose-owned build contexts/binds beyond V2's explicit host-root-mount prohibition. The Builder-managed `dependencies.<name>.compose` path itself must still stay inside the service project boundary.

Do not rewrite named volumes as filesystem paths.

Reject any resolved path that violates the service project boundary rules specified for Builder-managed dependency content.

---

# 8. Add `src/core/composition/composeEnvironment.ts`

Normalize Compose environment to a map before Builder applies precedence.

Export:

```ts
export function normalizeComposeEnvironment(
  value: unknown,
  context: string,
): Record<string, string>;

export function mergeComposeEnvironment(
  service: ComposeService,
  overlay: Record<string, string>,
): void;
```

Rules:

- map `{A: 1}` from arbitrary Compose is normalized using Docker Compose scalar-string semantics only when it originated in raw Compose; Builder JSON env remains strict strings;
- list entries `KEY=value` become key/value;
- pass-through list entry `KEY` is preserved only if Compose semantics are required; do not use it for Builder-owned keys;
- Builder overlay wins over raw dependency Compose env when applying `dependency.env`;
- internal Builder app env is applied last and must never be overwritten.

The V2 no-coercion rule applies to Builder JSON, not generic third-party Compose YAML. Do not reject legal Compose scalar representations merely because YAML parsed a number.

---

# 9. Add `src/core/composition/validateDependencyCompose.ts`

Export:

```ts
export function validateDependencyCompose(
  dependencyKey: string,
  dependency: EffectiveBuildConfig["dependencies"][string],
  document: ComposeDocument,
  context: {
    composePath: string;
    stage: Environment;
  },
): void
```

This function's path/configuration and forbidden-Compose-feature validation must run for every effective dependency. Endpoint-owner existence and owner-health requirements apply when the dependency has endpoints and can be materialized. During `builder check`, Plan 04 runs the same validation for every stage.

## 9.1 Required validations

For every effective dependency Compose document, reject the forbidden escape hatches in section 9.2 for every service that exists. If `dependency.endpoints` is non-empty:

1. Compose `services` must exist and have at least one service.
2. For every endpoint:
   - `endpoint.service` must exactly match a Compose service key;
   - never infer dependency key, first service, first healthy service, or image name;
   - that owner service must define an enabled valid Compose `healthcheck`.
3. One healthcheck satisfies any number of endpoints on the same owner service.

## 9.2 Forbidden dependency Compose escape hatches

Reject any service with:

```text
ports
network_mode: host
privileged: true
container_name
```

Reject host-root bind mounts, including at least these equivalent representations:

```text
/:/anything
/:/anything:ro
source: /
target: /host
```

Do not reject ordinary bind mounts under the project boundary.

## 9.3 Healthcheck validity

Reject:

- `healthcheck.disable: true`;
- `healthcheck.test: ["NONE"]`;
- missing `test` where Compose requires one;
- obviously empty test arrays/strings.

Accept ordinary CMD/CMD-SHELL healthchecks.

Do not synthesize a healthcheck from endpoint port.

## 9.4 Inert dependencies

If effective endpoints are absent/empty, do not load/materialize its Compose merely for runtime. It is inert. Structural path checking can still be performed by Plan 04 validation if the user supplied `compose`, but execution must not materialize it.

---

# 10. Add `src/core/composition/namespaceDependencyCompose.ts`

This is a critical V2 component. Replace the old service-only renamer with atomic dependency implementation namespacing.

Export:

```ts
export interface NamespaceDependencyOptions {
  dependencyKey: string;
  namespacePrefix: string;
  document: ComposeDocument;
}

export function namespaceDependencyCompose(
  options: NamespaceDependencyOptions,
): {
  document: ComposeDocument;
  serviceNameMap: Map<string, string>;
  volumeNameMap: Map<string, string>;
  networkNameMap: Map<string, string>;
  configNameMap: Map<string, string>;
  secretNameMap: Map<string, string>;
}
```

## 10.1 Naming convention

Use these generated names. They are private implementation details and must never be referenced in user JSON:

Standalone dependency:

```text
dep--<dependency-key>--<original-service>
dep--<dependency-key>--volume--<original>
dep--<dependency-key>--network--<original>
dep--<dependency-key>--config--<original>
dep--<dependency-key>--secret--<original>
```

Plan 03 supplies a prefix containing the mesh service identity to avoid cross-consumer collisions.

Do not truncate unless Docker Compose name limits require it. If a length limit is reached, use deterministic `prefix + short sha256` rather than nondeterministic IDs.

## 10.2 Rewrite all dependency-owned service references

Rewrite at minimum:

- `services` keys;
- `depends_on` array and map keys;
- `links` service portion before optional alias;
- `network_mode: "service:<name>"`;
- `volumes_from` service portion;
- named-volume short syntax source;
- long-form volume source for `type: volume`;
- service network keys;
- service config source keys;
- service secret source keys;
- top-level `volumes` keys;
- top-level `networks` keys;
- top-level `configs` keys;
- top-level `secrets` keys.

Preserve aliases when syntax supports them.

## 10.3 Do not rename external resources

If a top-level named volume/network/config/secret is explicitly `external: true`, do not change the external resource's `name` value. The local Compose key still must be namespaced to avoid collision; references are rewritten to that local key.

## 10.4 No partial materialization

Return the whole dependency Compose implementation after namespacing. Do not filter to endpoint owner services. Companion services and resources are part of the atomic implementation.

---

# 11. Add `src/core/composition/serviceEndpoints.ts`

This module derives deterministic endpoint records before env interpolation.

Export helpers:

```ts
export function buildStandaloneAppEndpoints(...): Record<string, ResolvedEndpoint>;
export function buildStandaloneDependencyEndpoints(...): Record<string, ResolvedEndpoint>;
```

## 11.1 App endpoint host

Standalone app network host is exactly:

```text
app
```

Container port is endpoint `port`.

## 11.2 Dependency endpoint host

For a dependency endpoint, network host is the generated service name from the namespace map for its explicit `endpoint.service`.

Compute this generated host even in isolated stages, so `network_*` can resolve from the declared contract without materializing the dependency. Do not create a service merely for this resolution.

## 11.3 Publication

Standalone publication rule:

- app endpoint with numeric/AUTO `publicPort` => effectively published;
- materialized local dependency endpoint with numeric/AUTO `publicPort` => effectively published;
- dependency endpoint in isolated stage => not effectively published even if `publicPort` exists because its implementation is not running;
- absent `publicPort` => private.

All public hosts resolve to `127.0.0.1`.

Pass every effectively published endpoint to `allocateHostPorts`.

---

# 12. Add `src/core/composition/validateOverrideCompose.ts`

A build stage's `override-compose` is an app-only escape hatch with explicit V2 limits.

Export:

```ts
export interface PreparedAppOverride {
  app: ComposeService;
  resources: Pick<ComposeDocument, "volumes" | "networks" | "configs" | "secrets">;
}

export function validateAndPrepareAppOverride(
  document: ComposeDocument,
  context: { file: string; stage: Environment },
): PreparedAppOverride
```

## 12.1 Exact accepted shape

The override Compose file must contain exactly one service key:

```yaml
services:
  app:
    ...
```

Top-level `volumes`, `networks`, `configs`, and `secrets` are allowed only as resources consumed by `services.app`; the override is still not allowed to introduce another service. Namespace every override-owned resource before merging it into the generated composition using prefix:

```text
app-override--<stage>--volume--<name>
app-override--<stage>--network--<name>
app-override--<stage>--config--<name>
app-override--<stage>--secret--<name>
```

Rewrite the app's named-volume/network/config/secret references to the generated keys. Preserve an external resource's configured external `name`, exactly as for dependency resources. Reject a top-level override resource that is not referenced by `services.app`; this prevents the app override from acting as a hidden infrastructure declaration system.

When merging app networks, **union** override networks with Builder-required networks. An override may add app network attachments but may not detach the app from the standalone default network or, in Plan 03 mesh mode, Builder's global/private networks.

## 12.2 Explicitly reject app override fields

Reject if `services.app` contains:

- `ports`;
- `depends_on`;
- `network_mode`;
- `container_name`;
- `privileged`;
- `build.target`;
- `build.dockerfile`;
- a build context that changes the Builder-owned service project context;
- Builder-owned internal env keys (`EXEC_MODE`, `INFRA_MODE`, and `PORT` when a primary endpoint exists);
- `healthcheck.disable` in any form;
- `healthcheck.test` in any form, including `["NONE"]`; the Dockerfile owns the readiness command and an override may adjust only timing/retry fields.

The override may set:

- volumes;
- command;
- entrypoint;
- user;
- labels;
- build args;
- app environment;
- healthcheck timing fields only: `interval`, `timeout`, `retries`, `start_period`, and `start_interval`; the override may not contain `healthcheck.test` or `healthcheck.disable`, so it cannot replace the Dockerfile-owned readiness test;
- other app-container-local Compose options that do not alter Builder endpoint/lifecycle ownership.

Do not allow the override to define endpoints or host publication. Those belong to `build.json`.

---

# 13. Add `src/core/composition/dependencyLifecycle.ts`

Export:

```ts
export function applyDependencyLifecycle(
  app: ComposeService,
  materialized: Record<string, MaterializedDependency>,
  effectiveBuild: EffectiveBuildConfig,
): void
```

## 13.1 App automatic lifecycle

For every materialized dependency:

1. collect all **distinct** generated service names that own one or more effective dependency endpoints;
2. add to `app.depends_on`:

```yaml
<generated-owner>:
  condition: service_healthy
```

Do this whether or not app env references the dependency.

There is no `app.dependsOn` configuration.

## 13.2 Dependency-to-dependency module lifecycle

For each materialized source dependency `A` with:

```json
"dependsOn": ["dependencies.B"]
```

add a health edge from **every distinct endpoint-owning service of A** to **every distinct endpoint-owning service of B**:

```yaml
services:
  <A-owner>:
    depends_on:
      <B-owner>:
        condition: service_healthy
```

Preserve existing dependency-internal Compose `depends_on` entries. If an exact target already exists, Builder's required `service_healthy` condition wins unless the existing condition is equally strong.

Never emit `service_started` as Builder-generated fallback.

The semantic stage resolver from Plan 01 has already rejected inert target dependencies and cycles.

---

# 14. Implement `src/core/composition/compileServiceComposition.ts`

This is the new standalone compiler engine.

Export:

```ts
export interface CompileServiceCompositionOptions {
  full?: boolean;
  silenceWarnings?: boolean;
  externalAppEnv?: Record<string, string>;
  namespacePrefix?: string;
  meshMode?: boolean;
  publishFilter?: Set<string>;
  suppressDependencies?: Set<string>;
  deferReferenceResolution?: boolean;
  projectNameOverride?: string;
}

export function compileServiceComposition(
  stage: Environment,
  projectDir: string,
  options?: CompileServiceCompositionOptions,
): CompiledServiceComposition
```

The `externalAppEnv`, `meshMode`, `publishFilter`, `suppressDependencies`, `deferReferenceResolution`, and project-name override are internal hooks for Plan 03. They must not be exposed as CLI configuration.

## 14.1 Exact standalone compilation order

Implement in this order. Do not reorder phases.

### Phase A — input, effective stage, and static template seed

1. resolve absolute service directory;
2. `getBuildJson`;
3. `resolveBuildStage(build, stage, buildJsonPath)`;
4. get execution profile;
5. resolve Dockerfile path inside project;
6. load the packaged `docker-compose.base.yml` and exactly one packaged stage template (`dev`, `prod`, `test`, or `e2e`) through the existing template loader/Compose merge utility; this merged object is the static seed for the generated composition;
7. for `meshMode: true`, discard the service-level `tester` from the E2E template because global mesh E2E owns its own root tester;
8. calculate project identity:
   - base = `build.name ?? basename(projectDir)`;
   - dev = base;
   - prod = `${base}-prod`;
   - test = `${base}-test`;
   - e2e = `${base}-e2e`.

### Phase B — validate declared dependency implementations

For each effective dependency, including inert dependencies:

1. require a non-empty effective `compose` (already guaranteed by Plan 01 semantic resolution);
2. resolve `compose` inside service root and require the declared file to exist;
3. load/rebase the Compose document for validation;
4. when endpoints are non-empty, validate endpoint owners, owner healthchecks, and the full dependency Compose runtime restrictions;
5. compute deterministic namespace maps for endpoint-bearing dependencies.

Do this even if the current stage is isolated so declared paths, endpoint ownership, and reference contracts fail early. An inert dependency still has a valid declared Compose implementation but is never merged into runtime output. Do **not** add any dependency Compose implementation to output unless the profile is integrated and its effective endpoints are non-empty.

### Phase C — determine local materialization

Materialize a dependency iff all are true:

```text
profile.integrated === true
effective dependency has >=1 endpoint
dependency is not in options.suppressDependencies
```

Standalone calls never pass suppressions. Plan 03 does for substituted logical dependencies.

When materialized:

- namespace the entire dependency Compose;
- apply dependency env to **every** service in its implementation;
- retain all companion services/resources;
- merge into final Compose document with collision assertions.

### Phase D — endpoint publication + port allocation

For standalone mode:

- app endpoint with `publicPort` is published;
- materialized dependency endpoint with `publicPort` is published.

For mesh mode, Plan 03 supplies `publishFilter`; `publicPort` by itself is not sufficient.

Gather only effective published intents and call `allocateHostPorts`.

### Phase E — build resolved endpoint registry

Build:

```text
app.endpoints.*
dependencies.<dep>.endpoints.*
```

with network host, container port, scheme, and effective public data.

For a suppressed dependency in mesh mode, do not resolve it locally; Plan 03 inserts provider-backed logical endpoint resolution.

### Phase F — resolve user env layers

Standalone app env precedence before override/internal:

```text
1 .env.<runtimeStage>              represented as Compose env_file
2 base app.env
3 active-stage app.env            already merged by effective stage resolver
4 override-compose app environment
5 externalAppEnv                  only Plan 03 mesh base/stage layer
6 Builder internal env
```

Because effectiveBuild.app.env already represents layers 2+3, interpolate its reference values against endpoint registry now unless `deferReferenceResolution` is true.

Do not parse `.env.<stage>` yourself into the Builder reference engine. Compose owns dotenv file loading. Builder-owned JSON env takes precedence by emitting explicit `environment` map.

### Phase G — app service

Create one Builder-managed service named `app` in standalone mode.

Set at minimum:

```yaml
services:
  app:
    build:
      context: .
      dockerfile: <effective dockerfile path if non-default>
      target: <profile.appTarget>
    env_file:
      - path: .env.<runtimeStage>
        required: false
    environment:
      EXEC_MODE: <runtimeStage>
      INFRA_MODE: isolated|integrated
```

If primary app endpoint exists, add:

```yaml
PORT: "<primary container port>"
```

Apply app endpoint `ports` only from resolved publication records.

For dev only, preserve the current Builder source-mount behavior exactly:

```yaml
volumes:
  - .:/app
  - /app/node_modules
```

Do not apply dev volumes to prod/test/E2E unless the existing intended template contract says so.

### Phase H — override Compose

If `effectiveBuild.overrideCompose` exists:

1. resolve and load it;
2. validate via `validateAndPrepareAppOverride`;
3. namespace and merge the prepared override's app-owned volumes/networks/configs/secrets into the generated top-level resources;
4. merge allowed app fields into generated app service;
5. explicit override `environment` wins over build app env;
6. reapply Builder internal env after merge so Builder-owned values remain authoritative;
7. reassert Builder build context/dockerfile/target and all Builder-required network attachments;
8. endpoint-generated ports remain Builder-owned and cannot be replaced.

### Phase I — lifecycle

If integrated:

- apply dependency module health edges;
- app health-depends on every distinct local endpoint owner.

If isolated:

- no local dependencies are in output;
- app has no generated dependency `depends_on`.

### Phase J — service E2E tester

Only for stage `e2e`, execute section 16 below.

### Phase K — final validation and output object

- assert no generated fixed port duplicates;
- ensure no unresolved reference tokens remain in Builder-managed JSON env;
- return `CompiledServiceComposition` object;
- YAML serialization happens in `compileEnvironment.ts` wrapper.

---

# 15. Builder-owned internal env collision validation

Before merging any user-controlled app environment, reject attempts to set reserved runtime keys.

Always reserved:

```text
EXEC_MODE
INFRA_MODE
```

Conditionally reserved when app has a primary endpoint:

```text
PORT
```

Check all user layers that Builder can inspect:

- base/stage `app.env`;
- override Compose app `environment`;
- mesh app env in Plan 03.

`.env.<stage>` cannot be reliably statically enumerated through Compose without loading it. During compilation, parse the dotenv file if it exists solely to detect reserved-key ownership; fail if it sets these keys. Do not otherwise use parsed dotenv values to perform Builder reference interpolation.

Do not silently overwrite a user-defined reserved key.

---

# 16. Service-level E2E tester implementation

During standalone `stage === "e2e"`, create one service named exactly:

```text
tester
```

The tester uses the same project Dockerfile:

```yaml
services:
  tester:
    build:
      context: .
      dockerfile: <same effective Dockerfile>
      target: test-e2e
    network_mode: host
    depends_on:
      app:
        condition: service_healthy
```

## 16.1 Tester environment

Source only from:

```text
build.json.tester.env
```

Use `assertTesterReferencesArePublic` first.

Resolve references against the E2E effective endpoint registry.

A public dependency endpoint referenced by the tester must:

- be materialized;
- have `publicPort`;
- therefore be effectively published in standalone E2E.

An app endpoint referenced by tester must have `publicPort`.

Do not set the old hardcoded:

```text
API_URL=http://localhost:${PUBLIC_PORT:-3000}
```

unless the user explicitly defines `API_URL` in `tester.env` with a valid Builder reference.

## 16.2 Tester lifecycle

Tester waits on the app with `condition: service_healthy` only.

The app Dockerfile `prod` stage healthcheck is the readiness source because the E2E app target is `prod`.

Do not require a healthcheck on the finite tester.

## 16.3 Tester host networking

Do not attach tester to generated bridge networks. It acts as an external-style client through `public_*` endpoints.

---

# 17. Environment reference resolution in dependency `env`

Dependency `env` applies to **every** service in that dependency's atomic Compose implementation.

For each effective dependency env value:

1. parse as build-scope references;
2. resolve references against effective app/dependency endpoint contracts;
3. do not create lifecycle edges from these references;
4. when the dependency is materialized, inject the resolved map into every generated service in that implementation;
5. when dependency is not materialized, validation still checks reference grammar and target existence, but no runtime environment is emitted.

If dependency A's env references dependency B and ordering is required, the user must also declare `A.dependsOn: ["dependencies.B"]`.

---

# 18. Host publication rendering

Render ports in long syntax or unambiguous short syntax. Use long syntax to avoid YAML number/string ambiguity:

```yaml
ports:
  - target: 3000
    published: 20123
    host_ip: 127.0.0.1
    protocol: tcp
```

Apply the mapping to the **endpoint-owning service**:

- app endpoint -> `services.app`;
- dependency endpoint -> generated dependency owner service.

If one owner service has multiple published endpoints, append multiple mappings.

Reject duplicate mappings that claim the same host port even if they belong to the same service but different logical endpoints.

Do not infer TCP/UDP configuration from `scheme`; V2 endpoint `scheme` is URL construction metadata, not transport protocol selection. Use TCP Compose publication for V2 unless a future spec adds protocol.

---

# 19. Resource merge rules

When materializing multiple dependency bundles into one standalone Compose document:

1. app service exists first;
2. dependency bundles are processed alphabetically by dependency key for deterministic output;
3. each bundle has already been namespaced;
4. service/resource key collision after namespacing is an internal Builder error—fail rather than overwrite;
5. top-level external resource declarations retain their external names but local keys are unique;
6. dependency Compose root `name` is ignored; standalone generated composition owns project `name`;
7. dependency Compose root `version` if present is discarded as obsolete Compose metadata;
8. reject a dependency Compose root-level `include` directive with `ConfigError`; V2 dependency `compose` must directly describe the atomic implementation Builder can fully namespace. Do not partially expand or partially materialize Compose includes.

---

# 20. Replace `src/core/compileEnvironment.ts`

Delete the current file body including:

- `extractOverrides`;
- `extractBuildDeps`;
- root `buildJson.port` logic;
- hardcoded `PORT=3000`;
- `PUBLIC_PORT` logic;
- old dependency port injection;
- old URL registry;
- fallback dependency service selection;
- automatic env -> build args;
- prod overlay use during E2E;
- health downgrade behavior;
- legacy template merge assumptions.

Replace with a thin wrapper:

```ts
import { stringify } from "yaml";
import type { Environment } from "../types/index.js";
import { compileServiceComposition } from "./composition/compileServiceComposition.js";

export interface CompileEnvironmentOptions {
  silenceWarnings?: boolean;
  full?: boolean;
}

export const compileEnvironment = (
  stage: Environment,
  projectDir: string = process.cwd(),
  options: CompileEnvironmentOptions = {},
): string => {
  const result = compileServiceComposition(stage, projectDir, {
    full: Boolean(options.full),
    silenceWarnings: options.silenceWarnings,
  });
  return stringify(result.compose);
};
```

Keep it synchronous.

---

# 21. Update `src/core/compileApplicationEnv.ts`

Preserve the public function name and return shape.

The existing method of sending the final generated YAML to:

```text
docker compose ... config --format json
```

must remain: it gives the same resolved runtime environment Compose will use and avoids a second dotenv implementation.

Changes:

- no assumptions about `PUBLIC_PORT`;
- no old V1 interpolation logic;
- `--full` remains usable for dev export;
- E2E now reflects `.env.e2e` + E2E app env, not prod inheritance;
- Builder endpoint interpolation has already happened before this function receives YAML.

Add a test that app env values containing literal `$` survive the Compose round-trip.

---

# 22. Simplify Docker Compose templates

The new compiler owns endpoints and internal env. Templates must stop encoding V1 port behavior.

## 22.1 `templates/docker/docker-compose.base.yml`

Keep only stable app container defaults:

```yaml
services:
  app:
    build:
      context: .
    init: true
    logging:
      driver: json-file
      options:
        max-size: 10m
        max-file: "3"
```

## 22.2 `templates/docker/docker-compose.dev.yml`

Use:

```yaml
services:
  app:
    build:
      target: dev
    env_file:
      - path: .env.dev
        required: false
    volumes:
      - .:/app
      - /app/node_modules
```

Remove hardcoded `INFRA_MODE`, `EXEC_MODE`, and ports from the template. Compiler injects them.

## 22.3 `templates/docker/docker-compose.prod.yml`

```yaml
services:
  app:
    build:
      target: prod
    env_file:
      - path: .env.prod
        required: false
```

## 22.4 `templates/docker/docker-compose.test.yml`

```yaml
services:
  app:
    build:
      target: test
    env_file:
      - path: .env.test
        required: false
```

## 22.5 `templates/docker/docker-compose.e2e.yml`

Retain the E2E structural template, but remove the hardcoded API URL and use this exact content:

```yaml
services:
  app:
    build:
      target: prod
    env_file:
      - path: .env.e2e
        required: false
  tester:
    build:
      context: .
      target: test-e2e
    network_mode: host
```

The compiler must still explicitly inject tester env and health dependency.

## 22.6 `templates/docker/docker-compose.standalone.yml`

Stop using it. It currently owns the old one-port mapping and must not participate in V2.

Remove any import/use in `src/core/templates.ts`. Physical deletion is safe once `rg docker-compose.standalone` returns no runtime imports; perform final deletion in Plan 04.

---

# 23. Update service runners

## 23.1 `src/core/runners/runDev.ts`

Keep command semantics. Ensure only `options.full` is passed to compiler.

Remove any text mentioning old “mock dependency port” semantics. Banner may say:

```text
DEV environment (integrated local dependencies)
```

for `--full`.

Retain the existing runtime host-port occupancy preflight, but run it only after V2 fixed-port reservation and AUTO allocation have produced the final YAML. The preflight must inspect those final published host ports and fail when a fixed port is already occupied by another host process. It must never remap a fixed port. AUTO remapping belongs exclusively to the deterministic allocator in Plan 01 before YAML generation.

## 23.2 `src/core/runners/runProd.ts`

No semantic change to process lifecycle; it now receives V2 YAML.

## 23.3 `src/core/runners/runTestUnit.ts`

Keep:

```text
compileEnvironment("test")
--abort-on-container-exit
--exit-code-from app
```

The compiler now emits only app target `test`, isolated infrastructure.

## 23.4 `src/core/runners/runTestE2e.ts`

Keep:

```text
compileEnvironment("e2e")
--abort-on-container-exit
--exit-code-from tester
```

The generated tester is guaranteed to exist for service E2E because it comes from the application Dockerfile even if `build.json.tester` is absent; tester env is simply empty in that case.

## 23.5 `src/core/runners/runTest.ts`

Do not rewrite orchestration. Current desired behavior is already:

```text
unit -> if success -> E2E
```

Add/retain regression tests that E2E is not invoked after unit failure.

---

# 24. No automatic build args

Search the standalone compiler path for all writes to:

```text
services.app.build.args
```

Delete any code that copies `app.env`, old `envOverrides`, or internal runtime env into build args.

Only `override-compose` may explicitly provide build args because the user intentionally wrote Compose build configuration there.

Add a test:

```json
{
  "app": {
    "env": { "TOKEN": "runtime-only" }
  }
}
```

must produce:

```text
services.app.environment.TOKEN == runtime-only
services.app.build.args.TOKEN == undefined
```

---

# 25. Project name behavior

Use `build.json.name` when present. Otherwise use service directory basename.

Generated Compose `name`:

```text
dev  -> <base>
prod -> <base>-prod
test -> <base>-test
e2e  -> <base>-e2e
```

This project identity must also be what `runState` and teardown use.

Update `src/utils/runState.ts` if it currently derives names only from directory basename and would therefore fail to tear down a `build.json.name` project. The teardown candidate generator must load `build.json.name` when available or use the actual persisted run-state project name first.

---

# 26. Standalone dependency DNS and network model

Use the generated Compose project default network for standalone composition unless the dependency's own namespaced networks require additional attachment.

Rules:

- app remains on default network;
- every dependency service is on default network unless its `network_mode` explicitly chooses another allowed non-host mode;
- preserve dependency internal networks after namespacing;
- if a dependency service declares explicit networks, add the generated composition default network to each endpoint-owning service so the app can resolve it by generated service name;
- companion services that do not own endpoints need not be attached to default solely for app visibility; preserve their dependency-owned networks;
- endpoint owner's `network_host` is its generated service key, which Compose DNS resolves on the shared default network.

If an endpoint owner uses an incompatible `network_mode` that prevents bridge attachment, reject the dependency contract. Do not guess a reachable address.

---

# 27. Required standalone compiler tests

Rewrite `tests/compileEnvironment.test.ts` as V2 tests or replace it with:

```text
tests/v2/compileServiceComposition.test.ts
tests/v2/dependencyCompose.test.ts
tests/v2/serviceE2e.test.ts
```

Do not retain assertions against root `buildJson.port`, legacy dependency ports, or old URL syntax.

## 27.1 App endpoint tests

Test:

- arbitrary primary app port becomes internal `PORT`;
- multiple app endpoints render multiple host mappings when public;
- publicPort omitted means no host mapping;
- AUTO allocation maps to resolved numeric host port;
- primary need not be named `http`;
- URL uses configured scheme;
- no app endpoints means no `PORT` internal env;
- app network refs use `app:<containerPort>`.

## 27.2 Isolation/materialization tests

`dev`:

- no dependency services;
- `INFRA_MODE=isolated`;
- build target `dev`.

`dev --full`:

- all endpoint-bearing local dependency bundles materialized;
- `INFRA_MODE=integrated`;
- app depends on all distinct endpoint owner services healthy.

`test`:

- target `test`;
- no dependencies;
- no tester;
- isolated.

`prod`:

- target `prod`;
- dependencies integrated.

`e2e`:

- app target `prod`;
- runtime env `.env.e2e`, not `.env.prod`;
- build e2e overlay, not prod overlay;
- dependencies integrated;
- tester target `test-e2e` host network;
- tester depends on app healthy.

## 27.3 Multi-service dependency tests

Fixture dependency Compose:

```yaml
services:
  api:
    image: alpine
    healthcheck: { test: ["CMD", "true"] }
  metrics:
    image: alpine
    healthcheck: { test: ["CMD", "true"] }
  helper:
    image: alpine
volumes:
  data: {}
```

Declare endpoints owned by `api` and `metrics`.

Assert:

- all three services materialized;
- both endpoint owners must be healthy;
- helper remains present though not endpoint owner;
- volume is namespaced;
- app depends only on distinct endpoint owners, not helper;
- a dependency env map is on api, metrics, and helper.

## 27.4 No-service-inference tests

Declare endpoint `service: missing` while Compose has one service. Must fail. No fallback to first service.

Declare two Compose services but omit endpoint-level `service` in base. Schema must fail before compiler.

## 27.5 Dependency health tests

- owner missing healthcheck => fail;
- owner healthcheck disabled => fail;
- companion missing healthcheck => allowed if it owns no endpoint;
- two endpoints same owner => one app lifecycle edge;
- two endpoints different owners => two app health edges;
- never emit `service_started`.

## 27.6 Dependency Compose restriction tests

Fail on each:

- raw `ports`;
- `network_mode: host`;
- `privileged: true`;
- fixed `container_name`;
- host root bind short syntax;
- host root bind long syntax.

## 27.7 Dependency lifecycle tests

A depends on B:

- every A owner waits on every B owner healthy;
- existing internal `depends_on` preserved;
- no lifecycle generated from env references;
- missing/inert/self/cycle already fails in stage resolution.

## 27.8 Override Compose tests

Allow:

- volumes;
- command;
- environment;
- build args;
- healthcheck timing/retry fields without `test` or `disable`.

Reject:

- extra service;
- ports;
- depends_on;
- target override;
- dockerfile override;
- disabled health;
- Builder reserved env.

Verify override app env wins over base/stage app env but Builder internal env wins over override.

## 27.9 Env precedence tests

Create `.env.dev` with `VALUE=dotenv`; base app.env `VALUE=base`; dev app.env `VALUE=stage`; override Compose env `VALUE=override`.

Final runtime env must be `override`.

Plan 03 extends this with mesh base/stage layers.

## 27.10 E2E tester tests

- tester public app URL works;
- tester public dependency URL works if dependency endpoint publicPort exists;
- tester network ref fails;
- public ref to non-public endpoint fails;
- missing scheme with public_url fails;
- no configured tester env still creates finite test-e2e runner.

---

# 28. Exact legacy logic to remove from `compileEnvironment.ts`

Before deleting the old file, use `rg` to ensure the replacement eliminates these concepts:

```bash
rg -n 'buildJson\.port|PUBLIC_PORT|envOverrides|composeFiles|extractOverrides|extractBuildDeps|dependency\.port|dependency\.ports|serviceName|service_started|:3000|http://.*3000' src/core/compileEnvironment.ts src/core/composition
```

Expected after migration:

- no `buildJson.port`;
- no `PUBLIC_PORT`;
- no `envOverrides`;
- no `composeFiles`;
- no old extractors;
- no dependency root port fields;
- no dependency `serviceName`;
- no `service_started`;
- no hardcoded `3000` in generic compiler code;
- no hardcoded `http` default.

A `3000` value is allowed only inside a test fixture/example that explicitly declares an endpoint port.

---

# 29. Completion gate for Plan 02

Run:

```bash
pnpm typecheck
pnpm vitest run tests/v2/compileServiceComposition.test.ts \
  tests/v2/dependencyCompose.test.ts \
  tests/v2/serviceE2e.test.ts \
  tests/v2/references.test.ts \
  tests/v2/hostPorts.test.ts
```

Then run fixture dry-runs using V2 fixtures created for the tests:

```bash
pnpm builder service up dev --dry-run -C <v2-fixture>
pnpm builder service up dev --full --dry-run -C <v2-fixture>
pnpm builder service up prod --dry-run -C <v2-fixture>
pnpm builder service up test-unit --dry-run -C <v2-fixture>
pnpm builder service up test-e2e --dry-run -C <v2-fixture>
```

Do not proceed to Plan 03 if any final YAML contains `service_started`, inferred port `3000`, or old configuration fields.

---

# 30. Definition of done

- [ ] standalone compiler has no V1 config translation;
- [ ] application endpoints fully own container/public port declarations;
- [ ] dependency endpoint `service` selects the exact owner with no fallback;
- [ ] inert dependency has no runtime services;
- [ ] integrated dependency materialization is atomic;
- [ ] all dependency-owned services/resources are namespaced;
- [ ] all dependency-internal service/resource references are rewritten;
- [ ] dependency env applies to every service in the bundle;
- [ ] dependency Compose host ports and escape hatches fail;
- [ ] every endpoint-owning dependency service requires valid healthcheck;
- [ ] app automatically waits on every distinct endpoint owner with `service_healthy`;
- [ ] dependency module `dependsOn` gates owner surfaces with `service_healthy`;
- [ ] no `service_started` fallback exists;
- [ ] build JSON env never becomes Docker build args implicitly;
- [ ] override Compose is app-only and cannot take endpoint/lifecycle ownership;
- [ ] `.env.e2e`/build e2e overlay is independent of prod overlay;
- [ ] service E2E tester is host-networked and may use only public refs;
- [ ] fixed/AUTO publication maps ports to the actual endpoint owner;
- [ ] public host is `127.0.0.1`;
- [ ] compile API remains synchronous;
- [ ] `runTest` still stops before E2E on unit failure.

Continue with `03-v2-mesh-composition-and-global-e2e-plan.md`.
