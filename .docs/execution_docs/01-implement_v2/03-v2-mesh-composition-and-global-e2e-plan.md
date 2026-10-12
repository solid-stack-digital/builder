# Solid Stack Builder V2 Migration — Plan 03
## Mesh Composition, Logical Dependency Substitution, Publication, Cross-Service References, Lifecycle, and Global E2E

**Implementation order:** 3 of 4  
**Depends on:** Plans 01 and 02  
**Blocks:** final validation/removal in Plan 04  
**Primary file replaced:** `src/core/mesh/compileMeshEnvironment.ts`  
**Normative sources:** `SPECS_V2.md` mesh/substitution/publication/test sections and `MESH_JSON_DOCS.md` in full.

---

# Edit-location convention

The current repository snapshot is a concatenated source export, so physical line numbers in that snapshot are not stable source-file line numbers and would become wrong immediately after Plan 01 edits. This plan therefore uses **deterministic edit locators** instead: exact file path + exported symbol/function + old field/snippet, or `replace whole file`. Treat those locators as the required edit location. For every whole-file replacement, delete the entire current file contents first; for partial edits, search the exact symbol/snippet named by the step and edit only that block. Do not search for a nearby “similar” implementation and leave the named block untouched.

---

# 1. Objective

Replace the current V1/V1.2 mesh compiler with the V2 composition model:

```text
mesh service
  -> independently runnable service project/build.json
  -> optional logical dependency substitutions
  -> optional composition-owned env
  -> explicit top-level lifecycle dependsOn
  -> explicit endpoint publication
```

The mesh compiler must no longer own endpoint port numbers, service healthcheck configuration, `preservePort`, `provideDependency`, `replaceMocks`, or `envOverrides`.

At the end of this plan:

- mesh services run from each service's V2 `build.json`;
- logical dependency slots can be replaced atomically by top-level mesh providers;
- endpoint references transparently follow substitutions;
- mesh host exposure is private by default and controlled only by `publish`;
- fixed/AUTO ports use one mesh-global namespace;
- every generated lifecycle edge uses `service_healthy`;
- global E2E uses the root `tester.compose` and explicit `tester.service` as a host-networked black-box runner;
- mesh unit testing uses only the `test` overlay and isolated service test targets;
- mesh full test runs unit tests first, then one global E2E composition.

---

# 2. Current mesh behavior to delete

Delete all behavior in the existing `compileMeshEnvironment.ts` that does any of the following:

- reads root `mesh.dependencies`;
- reads mesh service `port` or `preservePort`;
- reads `provideDependency` or `replaceMocks`;
- reads mesh service `envOverrides`;
- reads mesh service `healthcheck`;
- assumes app network URL is `http://<service>:3000`;
- uses old `${service.network_url}` / `${service.public_url}` syntax;
- selects dependency implementation service from dependency-level `service`, dependency key, or first service;
- synthesizes TCP healthchecks;
- downgrades `service_healthy` to `service_started`;
- takes mesh tester from `tester.path` or `tester.dockerfile`;
- chooses the first tester Compose service as runner;
- host-networks every tester helper service;
- compiles global E2E as mesh `prod` with `includeTester: true`;
- exposes a service merely because its build config has a public port.

These are not compatibility paths. Remove them.

---

# 3. Exact target module layout

Create:

```text
src/core/mesh/v2/
  types.ts
  loadMeshServices.ts
  substitution.ts
  meshReferences.ts
  publication.ts
  lifecycle.ts
  compileMeshTester.ts
  compileMeshComposition.ts
```

Replace:

```text
src/core/mesh/compileMeshEnvironment.ts
```

Update:

```text
src/core/mesh/runners/runMeshDev.ts
src/core/mesh/runners/runMeshProd.ts
src/core/mesh/runners/runMeshTest.ts
src/core/mesh/runners/runMeshTestUnit.ts
src/core/mesh/runners/runMeshTestE2e.ts
src/core/mesh/checkers/checkMesh.ts             Plan 04 completes checker refactor
src/core/mesh/MeshRunOptions.ts                 remove obsolete silenceWarnings
```

In `src/core/mesh/MeshRunOptions.ts`, delete the current `silenceWarnings?: boolean` field. V2 tester reference violations are hard errors, so this switch has no V2 behavior. Keep `projectDir`, `debug`, `detach`, `dryRun`, and `skipChecks`.

---

# 4. Add `src/core/mesh/v2/types.ts`

Create internal mesh compilation types:

```ts
import type { ComposeDocument } from "../../composition/types.js";
import type {
  EffectiveBuildConfig,
  EffectiveMeshConfig,
  ResolvedEndpoint,
} from "../../config/types.js";
import type { ParsedBuilderReference } from "../../config/references.js";

export interface LoadedMeshService {
  name: string;
  path: string;
  absolutePath: string;
  buildJsonPath: string;
  effectiveBuild: EffectiveBuildConfig;
  meshEnv: Record<string, string>;
  dependencyBindings: Record<string, string>;
  dependsOn: string[];
  publish: string[];
}

export interface DependencyBinding {
  consumerService: string;
  logicalDependency: string;
  providerService: string;
}

export interface EffectivePublication {
  logicalPath: string;
  ownerMeshService: string;
  target: "app" | "dependency";
  dependency?: string;
  endpoint: string;
}

export interface MeshEndpointRegistry {
  app: Record<string, Record<string, ResolvedEndpoint>>;
  dependencies: Record<string, Record<string, Record<string, ResolvedEndpoint>>>;
}

export interface CompiledMeshComposition {
  compose: ComposeDocument;
  effectiveMesh: EffectiveMeshConfig;
  loadedServices: Record<string, LoadedMeshService>;
  endpoints: MeshEndpointRegistry;
  projectName: string;
  testerServiceName?: string;
}
```

`ParsedBuilderReference` is owned by `src/core/config/references.ts`; do not duplicate it in mesh types.

---

# 5. Mesh stage execution contract

Implement this exact table:

| mesh command | effective mesh overlay | service build overlay | app target | runtime stage | service local deps | global tester |
|---|---|---|---|---|---|---|
| `mesh up dev` | `mesh.dev` | `build.dev` | `dev` | `dev` | integrated unless substituted | no |
| `mesh up prod` | `mesh.prod` | `build.prod` | `prod` | `prod` | integrated unless substituted | no |
| `mesh test-unit` | `mesh.test` | `build.test` | `test` | `test` | isolated | no |
| `mesh test-e2e` | `mesh.e2e` | `build.e2e` | `prod` | `e2e` | integrated unless substituted | yes |
| `mesh test` | first mesh test-unit, then mesh test-e2e | as above | as above | as above | as above | E2E phase only |

Do not inherit `mesh.prod` or `build.prod` runtime overlays into E2E. The app image target is prod, but runtime configuration is E2E.

---

# 6. Add `src/core/mesh/v2/loadMeshServices.ts`

Export:

```ts
export function loadEffectiveMeshServices(
  meshDir: string,
  effectiveMesh: EffectiveMeshConfig,
  stage: "dev" | "prod" | "test" | "e2e",
): Record<string, LoadedMeshService>
```

For each effective mesh service, in alphabetical order:

1. resolve `service.path` relative to mesh root using `resolveInsideProject`;
2. require it to be a directory;
3. require `<serviceDir>/build.json`;
4. load raw V2 build JSON;
5. resolve the same active stage using `resolveBuildStage`;
6. store the effective build;
7. copy effective mesh service env/dependency bindings/dependsOn/publish into the loaded record.

`build.json.name` does not rename the mesh service. Use the `mesh.json` service key as authoritative identity everywhere in mesh mode.

A stage-added mesh service is treated identically after stage resolution; its effective `path` must already have been validated.

---

# 7. Validate mesh dependency bindings before composition

Create `src/core/mesh/v2/substitution.ts`.

Export:

```ts
export function buildDependencyBindings(
  services: Record<string, LoadedMeshService>,
  stage: string,
  meshJsonPath: string,
): DependencyBinding[]
```

For each:

```json
"frontend": {
  "dependencies": {
    "backend": "therealbackend"
  }
}
```

validate exactly:

1. consumer `frontend` exists;
2. logical dependency key `backend` exists in `frontend.effectiveBuild.dependencies`;
3. provider `therealbackend` exists as effective top-level mesh service;
4. provider may be same project path as another service only if service keys are distinct; lifecycle self-edge is determined by mesh identity, not filesystem path;
5. binding causes complete local implementation suppression for that logical slot;
6. no endpoint mapping/remapping field exists; endpoint names must match when used.

Return one binding record per map entry.

Do not require the provider to duplicate unused local dependency endpoints.

---

# 8. Atomic suppression rule

For a bound consumer dependency slot, suppress all local implementation artifacts before composing the consumer:

```text
all dependency Compose services
all companion services
all dependency-owned volumes
all dependency-owned networks
all dependency-owned configs
all dependency-owned secrets
all host publication candidates for those local endpoints
all local lifecycle edges from/to that dependency implementation
```

Keep the logical dependency **contract** in the consumer's effective build config so its env references remain valid and can resolve through the provider.

Do not materialize part of a local dependency because the provider lacks an unused endpoint.

---

# 9. Add `src/core/mesh/v2/meshReferences.ts`

This module resolves both direct top-level mesh references and logical service-dependency references after substitutions/publication/port allocation have been determined.

Export:

```ts
export interface MeshReferenceContext {
  services: Record<string, LoadedMeshService>;
  bindings: Map<string, string>; // key: consumer::logicalDep -> provider
  endpoints: MeshEndpointRegistry;
  stage: string;
  meshJsonPath: string;
}

export function collectMeshReferenceUsages(...): ParsedBuilderReference[];
export function resolveMeshEnvMap(...): Record<string, string>;
export function resolveServiceBuildEnvThroughMesh(...): Record<string, string>;
```

## 9.1 Direct references

Support only:

```text
${backend.app.endpoints.http.network_url}
${frontend.dependencies.payments-api.endpoints.http.public_url}
```

No `services.` prefix.

## 9.2 Build-local references inside a mesh service

A service's own build config keeps build grammar:

```text
${dependencies.backend.endpoints.http.network_url}
```

When compiling that service inside the mesh:

- if the logical slot is local, resolve to its local dependency endpoint;
- if the slot is substituted, resolve to provider service app endpoint with the same endpoint name;
- app self references stay on the consumer app endpoint.

Do not rewrite the source string in `build.json`; only resolve its effective runtime value.

---

# 10. Reference-driven provider compatibility

Provider compatibility is based only on actual effective endpoint usages, not full structural equality.

Before rendering, collect Builder references from all effective user-owned env maps participating in this mesh stage:

```text
consumer effective build app.env
effective env of retained local dependencies
mesh service env
global mesh tester env during e2e
```

Do not include service-level `build.json.tester.env` because service-level testers are not part of global mesh runtime.

For every usage that reaches a substituted dependency slot:

```text
<consumer>.dependencies.<logicalDep>.endpoints.<endpoint>.<property>
```

map it to:

```text
<provider>.app.endpoints.<sameEndpoint>.<property>
```

and validate property-specific requirements:

| property | provider requirement |
|---|---|
| `network_host` | endpoint exists |
| `network_port` | endpoint exists |
| `network_address` | endpoint exists |
| `network_url` | endpoint exists + scheme |
| `public_host` | endpoint exists + effectively published |
| `public_port` | endpoint exists + effectively published |
| `public_address` | endpoint exists + effectively published |
| `public_url` | endpoint exists + scheme + effectively published |

Do not compare the local mock's container port to provider port. They may differ.

Do not compare public ports.

Do not require provider endpoints that are not actually used by the effective composition.

---

# 11. Add `src/core/mesh/v2/publication.ts`

Export:

```ts
export function resolveMeshPublication(
  services: Record<string, LoadedMeshService>,
  bindings: Map<string, string>,
  stage: string,
  meshJsonPath: string,
): EffectivePublication[]
```

## 11.1 Allowed publish syntax only

```text
app.endpoints.<endpoint>
dependencies.<dependency>.endpoints.<endpoint>
```

Reject everything else.

## 11.2 App publish validation

For `app.endpoints.http`:

- app endpoint must exist in service effective build;
- endpoint must define `publicPort` numeric or AUTO;
- otherwise fail before allocation.

## 11.3 Local dependency publish validation

For `dependencies.payments.endpoints.admin`:

- logical dependency exists;
- effective endpoint exists;
- dependency has non-empty effective endpoints and therefore is materializable;
- dependency is **not** substituted;
- endpoint has `publicPort`;
- otherwise fail.

## 11.4 Substituted local publish error

If consumer logical dependency is substituted, this is invalid:

```text
frontend.publish -> dependencies.backend.endpoints.http
```

Error must tell the user to publish:

```text
providerService.publish -> app.endpoints.http
```

instead.

## 11.5 Private by default

An endpoint declaring:

```json
"publicPort": "AUTO"
```

but absent from effective mesh `publish`:

- does not reserve a port;
- does not allocate AUTO;
- has no `public_*` values;
- remains internal only.

---

# 12. Mesh-global host-port allocation

After all publication targets are validated and before reference interpolation:

1. collect only actually published endpoints;
2. create `PortIntent` records;
3. order exactly:
   1. mesh service names alphabetically;
   2. app endpoints alphabetically;
   3. then local dependencies alphabetically;
   4. dependency endpoints alphabetically;
4. call shared `allocateHostPorts(meshDir, stage, intents)`.

Because `allocateHostPorts` reserves all fixed ports before AUTO, fixed publication collision is deterministic and cannot be hidden by order.

Logical cache keys in mesh mode must include top-level mesh identity:

```text
backend.app.endpoints.http
frontend.dependencies.payments.endpoints.admin
```

Do not use generated Compose service names as cache keys.

---

# 13. Mesh service Compose names and networking

Top-level app Compose service name must be exactly the mesh service key:

```text
backend
frontend
users-api
gateway
```

This makes direct mesh network references deterministic.

Create one global bridge network:

```text
mesh
```

Attach every top-level app service to it.

For each mesh service that retains one or more local dependency implementations, create one private bridge network:

```text
mesh--<mesh-service-name>
```

Attach:

- that top-level app service;
- all endpoint-owner services of that service's local dependencies;
- any companion services that already need connectivity to those owners through dependency-owned networks remain on their preserved namespaced networks as well.

It is acceptable to attach all services in each retained local dependency bundle to the consumer-private network for simplicity and deterministic internal communication. Do that uniformly rather than conditionally guessing which companions require access.

No user may reference `mesh--...` directly.

---

# 14. Dependency namespacing in mesh mode

Call Plan 02's atomic namespace function with this prefix:

```text
svc--<consumer-mesh-service>--dep--<logical-dependency>
```

Examples:

```text
svc--frontend--dep--firebase--firebase-emulator
svc--users-api--dep--firebase--firebase-emulator
```

These remain distinct even when both dependency Compose files contain service `firebase-emulator`, volume `data`, network `default`, config `config`, or secret `secret`.

Provider substitution removes the consumer's entire corresponding `svc--...--dep--...` bundle.

---

# 15. Compose each top-level service through the shared service compiler

Do not reimplement standalone service configuration merging in the mesh compiler.

Call `compileServiceComposition` with internal mesh hooks.

For mesh `dev` service `frontend`:

```ts
compileServiceComposition("dev", frontendDir, {
  full: true,
  meshMode: true,
  projectNameOverride: meshProjectName,
  namespacePrefix: "svc--frontend--dep--",
  suppressDependencies: new Set(boundLogicalDependencyKeys),
  publishFilter: resolvedPublishTargetsForFrontend,
  externalAppEnv: effectiveMesh.services.frontend.env,
  deferReferenceResolution: true,
});
```

Equivalent stage calls:

- mesh prod -> service stage `prod`, integrated;
- mesh e2e -> service stage `e2e`, integrated;
- mesh unit tests are not compiled into one network composition; section 26 handles them.

## 15.1 Required adaptation of shared service compiler

When `meshMode === true`:

- emit top-level app under caller-chosen mesh service name instead of standalone `app` when merged;
- no standalone publication merely from publicPort; use `publishFilter`;
- do not create service-level `tester` in mesh runtime;
- do not assign standalone project `name` per fragment;
- dependency generated hostnames use mesh consumer namespace;
- build env reference resolution is deferred until provider substitutions and mesh publication are available;
- mesh env is applied after build app env and build override Compose env, before Builder internal env.

Do not expose these options in public CLI flags.

---

# 16. App environment precedence in mesh mode

Implement exact low-to-high order:

```text
1 .env.<active runtime stage>
2 build base app.env
3 build active-stage app.env
4 build active-stage override-compose app environment
5 mesh base service env
6 mesh active-stage service env
7 Builder internal base env
8 Builder internal active-stage env
```

Because `resolveMeshStage` already merged base/stage mesh env, pass it as one layer after build override Compose.

Reserved Builder keys still fail if supplied by any inspectable user layer.

For E2E:

```text
.env.e2e
build base app.env
build e2e app.env
build e2e override-compose app env
mesh base service env
mesh e2e service env
Builder internal values
```

Never load `build.prod`, `.env.prod`, or `mesh.prod` runtime env as inherited E2E layers.

---

# 17. Add `src/core/mesh/v2/lifecycle.ts`

Build one top-level service graph combining explicit and automatic provider edges.

Export:

```ts
export interface MeshLifecycleEdge {
  consumer: string;
  provider: string;
  source: "dependsOn" | "dependency-binding";
}

export function buildMeshLifecycleEdges(...): MeshLifecycleEdge[];
export function applyMeshLifecycleEdges(...): void;
```

## 17.1 Explicit edges

For:

```json
"gateway": {
  "dependsOn": ["frontend", "backend"]
}
```

add:

```text
gateway -> frontend
gateway -> backend
```

## 17.2 Automatic substitution edge

For:

```json
"frontend": {
  "dependencies": { "backend": "backend" }
}
```

add:

```text
frontend -> backend
```

even if no env reference uses backend.

## 17.3 Merge and cycle validation

Union exact duplicate edges. Build a graph with both edge types and run `assertAcyclicGraph` **again** after bindings are known.

A cycle that exists only because of provider substitution must fail.

## 17.4 Render health-only lifecycle

Every top-level edge becomes:

```yaml
<consumer>:
  depends_on:
    <provider>:
      condition: service_healthy
```

No `service_started` fallback.

Provider/top-level app health comes from:

- Dockerfile `dev` target for mesh dev;
- Dockerfile `prod` target for mesh prod/e2e.

Do not synthesize Compose healthchecks. Docker Compose will use the healthcheck inherited from the built image.

---

# 18. Build dependency `dependsOn` when slots are substituted

The service build model can contain dependency module ordering. In a mesh, a dependency target may itself be substituted.

Use these exact semantics:

Suppose consumer `frontend` has retained local dependency `realtime`:

```json
"realtime": {
  "dependsOn": ["dependencies.redis"]
}
```

and mesh binds:

```json
"frontend": {
  "dependencies": {
    "redis": "shared-redis-api"
  }
}
```

Then:

- local `realtime` remains materialized;
- local `redis` implementation is suppressed;
- every endpoint-owning service of local `realtime` receives `depends_on: shared-redis-api -> service_healthy`.

If the **source** dependency module itself is substituted, none of its local module lifecycle edges are emitted because its entire local implementation is absent.

If both source and target are local, use Plan 02 local owner-to-owner edges.

If target provider is a top-level mesh service, attach the source local owner service to global `mesh` network as needed for the health dependency resolution and provider access; it may remain on consumer-private network too.

This rule prevents module-level `dependsOn` from silently disappearing during provider substitution.

---

# 19. Cross-service direct references do not create lifecycle

For mesh env:

```json
"gateway": {
  "env": {
    "BACKEND_URL": "${backend.app.endpoints.http.network_url}"
  }
}
```

resolve the address, but do not add `gateway -> backend` automatically.

If readiness ordering is required, user declares:

```json
"dependsOn": ["backend"]
```

The only automatic top-level lifecycle edge is dependency-slot substitution.

---

# 20. Build the mesh endpoint registry

After service fragments, bindings, publication, and ports are known, construct:

```text
endpoints.app[meshService][appEndpoint]
endpoints.dependencies[meshService][logicalDependency][dependencyEndpoint]
```

## 20.1 App endpoint network host

Top-level app endpoint:

```text
network_host = <mesh service key>
network_port = build app endpoint.port
```

## 20.2 Retained local dependency endpoint

Use generated namespaced endpoint owner service from that consumer's dependency bundle.

## 20.3 Substituted logical dependency endpoint

Do not duplicate a fake local endpoint record. Resolve the logical path dynamically to provider app endpoint of same endpoint name.

For user-facing error paths, keep consumer logical path in the diagnostic, then mention provider target.

---

# 21. Render mesh publication

For each `EffectivePublication`:

- app publication: append host mapping to top-level mesh app service;
- retained local dependency publication: append mapping to exact generated endpoint owner service;
- no other service receives that mapping.

Use the long-form host mapping from Plan 02 with `host_ip: 127.0.0.1`.

A provider app endpoint can be published only through the provider's own mesh service `publish` list.

---

# 22. Add `src/core/mesh/v2/compileMeshTester.ts`

Global tester is completely separate from service-level tester.

Export:

```ts
export interface CompiledMeshTester {
  services: Record<string, ComposeService>;
  volumes?: Record<string, unknown>;
  networks?: Record<string, unknown>;
  configs?: Record<string, unknown>;
  secrets?: Record<string, unknown>;
  runnerServiceName: string;
}

export function compileMeshTester(
  meshDir: string,
  tester: MeshTesterConfig,
  endpointRegistry: MeshEndpointRegistry,
  effectiveTopLevelApps: string[],
  stage: "e2e",
): CompiledMeshTester
```

## 22.1 Load and validate exact tester service

1. resolve `tester.compose` inside mesh project boundary;
2. parse Compose;
3. require `services`;
4. require exact `tester.service` key;
5. do not infer first service;
6. finite runner does not require healthcheck.

## 22.2 Materialize runner implementation closure

The spec permits tester Compose to contain setup/helper services. Materialize the implementation needed by the selected runner.

Use deterministic closure:

Start with selected runner. Recursively include services referenced by:

- `depends_on`;
- `links`;
- `volumes_from`;
- `network_mode: service:<name>`.

Then include every top-level named volume/network/config/secret referenced by any included service.

Do not automatically include unrelated Compose services merely because they exist in tester Compose.

If a helper depends on another helper, recurse.

## 22.3 Namespace tester implementation

Use generated prefix:

```text
mesh-tester--<original-service>
mesh-tester--volume--<name>
mesh-tester--network--<name>
mesh-tester--config--<name>
mesh-tester--secret--<name>
```

Reuse the same internal reference-rewrite logic as dependency namespacing; do not fork an incomplete renamer.

## 22.4 Host-network only the selected runner

For generated runner:

```yaml
network_mode: host
```

Remove `networks` from runner because host networking and bridge networks cannot coexist.

Do **not** force helper services to host network.

If runner declares `ports`, fail: a host-network runner cannot retain Builder-ambiguous port mappings.

Helper services may retain their own explicit ports from tester Compose because tester Compose owns its implementation; include those host mappings in final static collision checks against Builder endpoint publication.

## 22.5 Tester env

Apply `tester.env` to selected runner only, not helpers.

Before resolving:

- reject every `network_*` Builder endpoint reference;
- public reference must target an endpoint already effectively published by mesh service `publish`;
- tester does not publish endpoints implicitly.

## 22.6 Tester lifecycle

Selected runner waits for every effective top-level application service:

```yaml
runner:
  depends_on:
    backend: { condition: service_healthy }
    frontend: { condition: service_healthy }
    gateway: { condition: service_healthy }
```

Preserve runner's internal helper `depends_on` entries after namespacing.

Do not gate on every local dependency service separately; each app already has its own dependency readiness graph. Global tester waits on top-level apps.

## 22.7 Exit-code source

Return the namespaced selected runner service name. `runMeshTestE2e` must use it for Compose `--exit-code-from`.

Do not hardcode `tester`.

---

# 23. Add `src/core/mesh/v2/compileMeshComposition.ts`

Export:

```ts
export function compileMeshComposition(
  stage: "dev" | "prod" | "e2e",
  meshDir: string,
): CompiledMeshComposition
```

## 23.1 Exact phase order

Implement in this exact order:

### Phase 1 — raw/effective mesh

- load V2 mesh;
- resolve active mesh stage;
- determine mesh project name.

### Phase 2 — load effective service builds

- resolve effective service list including stage-added services;
- load and resolve each service's same build stage.

### Phase 3 — validate provider bindings

- logical keys exist on consumer effective build;
- provider service exists;
- build binding records;
- mark local dependency suppressions.

### Phase 4 — compile service fragments without final env reference interpolation

- compile each service through shared Plan 02 engine;
- integrate retained local dependencies;
- suppress substituted local dependency bundles atomically;
- use mesh identity and namespaces;
- no host publication yet except tracking candidate endpoint definitions.

### Phase 5 — collect effective reference usages

- build app env;
- retained dependency env;
- mesh service env;
- global tester env for E2E.

### Phase 6 — resolve publication declarations structurally

- validate publish target syntax/existence/publicPort/materialization/substitution;
- identify effectively published endpoints.

### Phase 7 — reserve fixed ports and allocate AUTO

- mesh-global deterministic order;
- update endpoint records with numeric public ports.

### Phase 8 — provider compatibility validation

Now public property requirements can be validated against effective publication.

### Phase 9 — construct final endpoint registry

- app/local/substituted logical resolution.

### Phase 10 — interpolate all Builder-managed env

Apply exact precedence and reference resolution.

### Phase 11 — build final lifecycle graph

- explicit mesh `dependsOn`;
- automatic substitution edges;
- dependency-module edges involving providers;
- cycle-check combined graph;
- emit only `service_healthy`.

### Phase 12 — compile global E2E tester if stage e2e

- tester required for global E2E execution;
- merge namespaced tester closure;
- collision-check tester helper host mappings.

### Phase 13 — final Compose validation

- one project name;
- no service/resource collisions;
- no unresolved Builder reference tokens in Builder-owned env;
- no duplicate host port mappings;
- output Compose object.

---

# 24. Mesh project naming

Base name:

```text
mesh.name ?? basename(meshDir)
```

Generated:

```text
dev  -> <base>
prod -> <base>-prod
e2e  -> <base>-e2e
```

For test-unit there is no single integrated mesh Compose project. Each service unit execution uses its own service test project identity while being driven from effective `mesh.test` configuration.

Persist actual integrated mesh project names in run state for down/cleanup.

---

# 25. Replace `src/core/mesh/compileMeshEnvironment.ts`

Delete the existing implementation and keep the current public result shape (`{ yaml, testerServiceName? }`) so the migration does not add an unrelated API break. Remove only the legacy `includeTester` behavior.

Use this exact public wrapper contract:

```ts
import { spawnSync } from "node:child_process";
import { stringify } from "yaml";
import { ScriptError } from "../../errors/ScriptError.js";
import { resolveProjectDir } from "../../utils/paths.js";
import { compileMeshComposition } from "./v2/compileMeshComposition.js";

export interface CompileMeshOptions {
  /** Internal/test convenience: skip the final `docker compose config` validation. */
  validateWithDocker?: boolean | undefined;
}

export interface CompileMeshResult {
  yaml: string;
  testerServiceName?: string | undefined;
}

export function compileMeshEnvironment(
  stage: "dev" | "prod" | "e2e",
  rawMeshDir: string = process.cwd(),
  options: CompileMeshOptions = {},
): CompileMeshResult {
  const meshDir = resolveProjectDir(rawMeshDir);
  const compiled = compileMeshComposition(stage, meshDir);
  const yaml = stringify(compiled.compose);

  if (options.validateWithDocker !== false) {
    const result = spawnSync(
      "docker",
      ["compose", "--project-directory", meshDir, "-f", "-", "config", "--quiet"],
      { cwd: meshDir, encoding: "utf-8", input: yaml },
    );
    if (result.error || result.status !== 0) {
      throw new ScriptError(
        `Generated mesh Compose configuration is invalid: ${result.error?.message ?? result.stderr ?? result.stdout}`,
        { cause: result.error },
      );
    }
  }

  return {
    yaml,
    ...(compiled.testerServiceName
      ? { testerServiceName: compiled.testerServiceName }
      : {}),
  };
}
```

Required API migration:

- delete `CompileMeshOptions.includeTester`;
- delete `CompileMeshOptions.silenceWarnings`; V2 turns invalid tester `network_*` references into errors, so there is no warning to silence;
- retain `validateWithDocker` because it is an implementation/test control and does not alter V2 configuration semantics;
- retain `CompileMeshResult.yaml` and `CompileMeshResult.testerServiceName` because the current public API already returns this object shape;
- `testerServiceName` is present only for stage `e2e`, and it is exactly `mesh.tester.service` after tester namespacing/compilation—not the first Compose service;
- do not accept or silently ignore `includeTester`. TypeScript callers must migrate, and untyped callers passing the property receive no behavior from it.

Update every internal caller to destructure `yaml` from the result rather than treating `compileMeshEnvironment()` as a string.

---

# 26. Implement mesh unit testing correctly

The current `runMeshTestUnit.ts` loops base mesh service paths and calls standalone `runTestUnit`, which does not fully account for stage-added mesh services or mesh test env. Replace its selection logic.

## 26.1 Resolve effective test mesh

In `runMeshTestUnit.ts`:

1. `getMeshJson(meshDir)`;
2. `resolveMeshStage(raw, "test")`;
3. load all effective service paths, including test-stage-added services;
4. process services alphabetically for deterministic logs.

## 26.2 Compile each service test with mesh test app env

Do **not** create a cross-service network composition.

For each effective service:

- compile service build stage `test`;
- target `test`;
- `INFRA_MODE=isolated`;
- no local dependency materialization;
- no provider substitution services;
- apply effective mesh service env as higher precedence app env.

Because this is isolated execution, reject mesh env references that require another top-level service or a public endpoint from another service. Do not invent a network endpoint for an absent service.

Build-local logical dependency `network_*` references may still resolve from their declared effective contracts per Plan 01's isolated-reference rule, but no dependency is materialized.

Run:

```text
docker compose up --build --abort-on-container-exit --exit-code-from app
```

for that service composition.

Stop on first nonzero status and return it.

---

# 27. Replace `src/core/mesh/runners/runMeshTest.ts`

Current behavior must not call standalone `runTest` for every mesh service, because that would execute every service's own E2E before global E2E.

Replace the body with:

```ts
export async function runMeshTest(options: MeshRunOptions): Promise<number> {
  const unitStatus = await runMeshTestUnit({ ...options, skipBanner: true });
  if (unitStatus !== 0) return unitStatus;
  return runMeshTestE2e({ ...options, skipBanner: true });
}
```

Keep clear user-facing phase banners:

```text
[1/2] MESH SERVICE UNIT/ISOLATED TESTS
[2/2] GLOBAL MESH E2E
```

If unit phase fails, do not compile/start global E2E.

---

# 28. Replace `src/core/mesh/runners/runMeshTestE2e.ts`

Change compilation from current `prod + includeTester` behavior to explicit E2E through the public compiler:

```ts
const { yaml, testerServiceName } = compileMeshEnvironment("e2e", meshDir);
```

Use `testerServiceName` as the Compose `--exit-code-from` value. Do not rediscover or infer the runner from generated YAML.

Require `mesh.tester` before starting. If absent:

```text
Global mesh E2E requires root mesh.json.tester { compose, service, env? }
```

Run Compose:

```text
up
--build
--abort-on-container-exit
--exit-code-from <result.testerServiceName>
```

Never hardcode `tester` because the selected service may be `playwright`, `cypress`, etc., and becomes namespaced.

Always teardown with volumes after global E2E as current behavior intends.

---

# 29. Update `runMeshDev.ts` and `runMeshProd.ts`

Keep runtime behavior but call the V2 compiler.

- dev -> `compileMeshEnvironment("dev")`;
- prod -> `compileMeshEnvironment("prod")`.

Keep final runtime OS-port collision checks on generated YAML as a second defense. They must report an occupied fixed/AUTO-resolved port, not remap it after compilation.

Do not pass `includeTester`.

---

# 30. Mesh publication examples to encode as regression tests

## 30.1 PublicPort without publish

Build:

```json
"http": {
  "port": 3000,
  "publicPort": "AUTO",
  "primary": true,
  "scheme": "http"
}
```

Mesh service without `publish`.

Assert:

```text
no service.ports entry
no AUTO cache allocation for this logical path
network_url available
public_url unavailable
```

## 30.2 Publish app endpoint

Mesh:

```json
"gateway": {
  "path": "./services/gateway",
  "publish": ["app.endpoints.http"]
}
```

Assert mapping on `services.gateway`, public URL `http://127.0.0.1:<allocated>`.

## 30.3 Publish retained local dependency endpoint

Assert mapping on exact generated local dependency owner service.

## 30.4 Publish substituted dependency local path

Must fail with provider publication guidance.

---

# 31. Provider substitution regression matrix

Create a frontend local mock dependency:

```json
"backend": {
  "compose": ".docker/mock-backend.yml",
  "endpoints": {
    "http": {
      "service": "mock-backend",
      "port": 3000,
      "primary": true,
      "scheme": "http"
    },
    "metrics": {
      "service": "mock-backend",
      "port": 9090,
      "scheme": "http"
    }
  }
}
```

Provider app only exposes:

```json
"http": {
  "port": 8080,
  "primary": true,
  "scheme": "http"
}
```

Consumer uses only `dependencies.backend.endpoints.http.network_url`.

Assert:

- substitution valid;
- local mock implementation completely absent;
- consumer URL resolves to `http://backend:8080`;
- provider need not expose `metrics`;
- consumer automatically depends on provider healthy.

Then add a `metrics` reference and assert failure because provider lacks that same logical endpoint name.

---

# 32. Provider public compatibility tests

Provider endpoint declares `publicPort: "AUTO"` but provider mesh service does not publish it.

Consumer reference:

```text
${dependencies.backend.endpoints.http.public_url}
```

must fail.

Add provider:

```json
"publish": ["app.endpoints.http"]
```

and same consumer ref must succeed.

This verifies publicPort eligibility is not mistaken for effective publication.

---

# 33. Lifecycle tests

Add tests for:

1. explicit `gateway -> backend` -> service_healthy;
2. binding `frontend.backend -> backend` -> automatic frontend -> backend healthy;
3. same edge both explicit and automatic -> one rendered edge;
4. explicit cycle -> fail;
5. substitution-only cycle -> fail;
6. mixed explicit + substitution cycle -> fail;
7. env cross-service ref without dependsOn -> no lifecycle edge;
8. local dependency module dependsOn substituted target -> local owner -> provider healthy;
9. no final YAML contains `condition: service_started`.

---

# 34. Global tester test matrix

Create tester Compose with:

```yaml
services:
  setup:
    image: alpine
  playwright:
    build:
      context: .
    depends_on:
      setup:
        condition: service_completed_successfully
  unrelated:
    image: alpine
```

Mesh tester:

```json
"tester": {
  "compose": "./e2e/docker-compose.yml",
  "service": "playwright",
  "env": {
    "SYSTEM_URL": "${gateway.app.endpoints.http.public_url}"
  }
}
```

Assert:

- selected runner exactly playwright;
- setup included through closure;
- unrelated absent;
- runner host-networked;
- setup not forced to host-network;
- `SYSTEM_URL` uses `127.0.0.1` + published gateway port;
- runner waits for all effective top-level apps healthy plus preserves setup dependency;
- runner exit-code service is generated namespaced playwright name;
- network URL in tester env fails;
- unpublished public URL fails;
- nonexistent tester.service fails;
- no healthcheck required for runner.

---

# 35. Stage overlay tests specific to mesh

Verify:

- dev build overlay + mesh dev overlay both apply;
- prod applies only prod;
- E2E applies build e2e + mesh e2e, not prod;
- stage-added E2E fake provider exists only E2E;
- E2E provider map can replace base provider for same logical key;
- `dependsOn` and `publish` union base then stage and deduplicate;
- no removal syntax;
- test-stage-added service participates in unit service loop;
- E2E-stage-added service participates in global tester readiness list.

---

# 36. Required test files

Create/rewrite:

```text
tests/v2/compileMeshComposition.test.ts
tests/v2/meshSubstitution.test.ts
tests/v2/meshPublication.test.ts
tests/v2/meshLifecycle.test.ts
tests/v2/meshTester.test.ts
tests/v2/meshRunners.test.ts
```

Delete `tests/mesh.test.ts` after moving its still-relevant CLI/checker assertions into the V2-specific files listed above. Do not keep a second legacy mesh suite.

---

# 37. Final grep gate for Plan 03

Run:

```bash
rg -n 'provideDependency|replaceMocks|preservePort|envOverrides|meshHealthcheck|includeTester|service_started|network_url\}\}|public_url\}\}|:3000' \
  src/core/mesh src/core/composition tests/v2
```

Expected:

- no runtime use of removed mesh fields;
- no `includeTester` runtime switch;
- no health downgrade;
- no old reference syntax;
- no generic hardcoded 3000.

Legacy strings may appear only in tests that assert they are rejected.

---

# 38. Completion gate

Run:

```bash
pnpm typecheck
pnpm vitest run tests/v2/compileMeshComposition.test.ts \
  tests/v2/meshSubstitution.test.ts \
  tests/v2/meshPublication.test.ts \
  tests/v2/meshLifecycle.test.ts \
  tests/v2/meshTester.test.ts \
  tests/v2/meshRunners.test.ts
```

Then dry-run a canonical V2 mesh:

```bash
pnpm builder mesh up dev --dry-run -C <mesh-fixture>
pnpm builder mesh up prod --dry-run -C <mesh-fixture>
pnpm builder mesh test-unit --dry-run -C <mesh-fixture>
pnpm builder mesh test-e2e --dry-run -C <mesh-fixture>
```

Inspect output for:

- explicit top-level mesh app service keys;
- correct local dependency namespaces;
- absent substituted dependency bundles;
- private-by-default endpoints;
- publication only where declared;
- health-only lifecycle;
- E2E runner selected from `tester.service`.

---

# 39. Definition of done

- [ ] mesh JSON service key is authoritative identity;
- [ ] same build stage overlay is applied for each active mesh stage;
- [ ] substitutions bind logical dependency slots, not raw Compose services;
- [ ] substitution atomically suppresses whole local dependency implementation;
- [ ] provider endpoint mapping is same-name only;
- [ ] compatibility is based on actually used endpoint/property references;
- [ ] provider container/public ports may differ from local mock;
- [ ] direct mesh refs use no `services.` prefix;
- [ ] cross-service env refs create no implicit lifecycle;
- [ ] substitution creates automatic consumer -> provider health lifecycle;
- [ ] explicit + automatic graph cycles fail;
- [ ] every generated lifecycle edge is `service_healthy`;
- [ ] no mesh healthcheck field or synthesized healthcheck remains;
- [ ] mesh endpoint publication is explicit and private by default;
- [ ] substituted local endpoints cannot be published from consumer;
- [ ] fixed/AUTO publication shares one mesh-global namespace;
- [ ] AUTO order exactly matches the V2 spec;
- [ ] mesh E2E uses e2e runtime overlay and prod app image target;
- [ ] global tester uses tester.compose + explicit tester.service;
- [ ] only selected tester runner is host-networked;
- [ ] tester may reference only effectively published public endpoints;
- [ ] mesh test runs isolated service unit tests then one global E2E;
- [ ] service-level E2E is not redundantly executed for every mesh service during `mesh test`.

Proceed to `04-v2-validation-cli-tests-schemas-and-legacy-removal-plan.md`.
