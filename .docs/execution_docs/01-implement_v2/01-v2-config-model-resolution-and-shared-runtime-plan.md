# Solid Stack Builder V2 Migration — Plan 01
## Configuration Model, Effective-Stage Resolution, Endpoint References, Lifecycle Graphs, and Host-Port Allocation

**Implementation order:** 1 of 4  
**Depends on:** nothing  
**Blocks:** Plans 02, 03, and 04  
**Normative sources:** `SPECS_V2.md`, `BUILD_JSON_DOCS.md`, `MESH_JSON_DOCS.md`  
**Rule:** If this plan conflicts with any implementation detail in the current code, the V2 documents win. V1/V1.2 compatibility is not retained.

---

# Edit-location convention

The current repository snapshot is a concatenated source export, so physical line numbers in that snapshot are not stable source-file line numbers and would become wrong immediately after Plan 01 edits. This plan therefore uses **deterministic edit locators** instead: exact file path + exported symbol/function + old field/snippet, or `replace whole file`. Treat those locators as the required edit location. For every whole-file replacement, delete the entire current file contents first; for partial edits, search the exact symbol/snippet named by the step and edit only that block. Do not search for a nearby “similar” implementation and leave the named block untouched.

---

# 1. Objective

Replace the current V1/V1.2 configuration model with the exact V2 structural model and introduce the shared resolution primitives that both standalone service compilation and mesh compilation will consume.

At the end of this plan:

1. `build.json` and `mesh.json` parse only V2 fields.
2. Every Builder-managed `env` value is a string; no coercion exists.
3. Build and mesh stage overlays resolve deterministically.
4. Named endpoints and endpoint properties are represented explicitly.
5. Builder references are parsed/validated centrally.
6. Dependency and mesh lifecycle cycles are detected centrally.
7. fixed and `"AUTO"` host ports can be allocated deterministically and cached under `.builder`.
8. callers receive structured fail-fast configuration errors with source/path/stage context.
9. no compiler needs to infer a dependency service, endpoint, scheme, port, provider, or publication state.

Do **not** implement final Compose materialization in this plan. That belongs to Plans 02 and 03.

---

# 2. Current-state defects this plan removes

The current Builder has configuration types and schemas that still expose the V1 contract:

- root `port`;
- `envOverrides`;
- `overrides`;
- `composeFiles`;
- `services` in `build.json`;
- `policy` / `policies`;
- dependency `path`, `service`, `port`, `ports`;
- mesh `port`, `preservePort`, `provideDependency`, `replaceMocks`, `envOverrides`, `healthcheck`;
- mesh tester `path`, `dockerfile`, `envOverrides`, and policy fields.

The current code also allows later compiler stages to compensate for missing semantic information. V2 forbids that. All logical identity must be explicit before Compose generation.

The following files are therefore replaced, not incrementally patched:

- `src/types/index.ts`
- `src/core/buildSchema.ts`
- `src/core/mesh/types.ts`
- `src/core/mesh/meshSchema.ts`
- `src/utils/getBuildJson.ts`
- `src/core/mesh/getMeshJson.ts`

---

# 3. Exact target module layout

Create this shared configuration package:

```text
src/core/config/
  constants.ts
  types.ts
  stageMerge.ts
  resolveBuildStage.ts
  resolveMeshStage.ts
  endpointProperties.ts
  references.ts
  lifecycleGraph.ts
  hostPorts.ts
  pathSafety.ts
```

Create these errors:

```text
src/errors/ConfigError.ts
src/errors/PortConflictError.ts
```

Do not create another competing configuration abstraction elsewhere.

---

# 4. Replace `src/types/index.ts`

## 4.1 Delete the legacy configuration types

Delete these existing types/interfaces completely:

```text
BuildDependency
BuildOverride
BuildPolicyConfig
legacy BuildJson shape
```

Also remove every public field that mentions:

```text
port
policy
policies
composeFiles
overrides
services
envOverrides
dependency.path
dependency.service
dependency.port
dependency.ports
tester.envOverrides
```

Keep CLI/runtime option types, but remove the `integrated` alias from `ServiceUpOptions`; only `full` remains for `service up dev --full`.

## 4.2 Replace the exported configuration types with this shape

Use these exact public contracts:

```ts
export type Environment = "dev" | "test" | "e2e" | "prod";

export const SERVICE_STAGES = [
  "dev",
  "prod",
  "test",
  "test-unit",
  "test-e2e",
] as const;

export type ServiceStage = (typeof SERVICE_STAGES)[number];

export type PublicPort = number | "AUTO";

export interface AppEndpoint {
  port: number;
  publicPort?: PublicPort;
  primary?: boolean;
  scheme?: string;
}

export interface DependencyEndpoint extends AppEndpoint {
  service: string;
}

export interface AppConfig {
  env?: Record<string, string>;
  endpoints?: Record<string, AppEndpoint>;
}

export interface DependencyConfig {
  compose: string;
  env?: Record<string, string>;
  endpoints?: Record<string, DependencyEndpoint>;
  dependsOn?: string[];
}

export interface TesterConfig {
  env?: Record<string, string>;
}

export interface AppStageConfig {
  env?: Record<string, string>;
  endpoints?: Record<string, Partial<AppEndpoint>>;
}

export interface DependencyStageConfig {
  compose?: string;
  env?: Record<string, string>;
  endpoints?: Record<string, Partial<DependencyEndpoint>>;
  dependsOn?: string[];
}

export interface BuildStageConfig {
  "override-compose"?: string;
  app?: AppStageConfig;
  dependencies?: Record<string, DependencyStageConfig>;
}

export interface BuildJson {
  $schema?: string;
  name?: string;
  dockerfile?: string;
  app: AppConfig;
  dependencies?: Record<string, DependencyConfig>;
  tester?: TesterConfig;
  dev?: BuildStageConfig;
  prod?: BuildStageConfig;
  test?: BuildStageConfig;
  e2e?: BuildStageConfig;
}

export interface ServiceUpOptions {
  projectDir?: string;
  debug?: boolean;
  detach?: boolean;
  dryRun?: boolean;
  skipChecks?: boolean;
  silenceWarnings?: boolean;
  full?: boolean;
}

export interface ServiceDownOptions {
  projectDir?: string;
  volumes?: boolean;
  debug?: boolean;
}
```

Preserve any unrelated public types that already exist in `src/types/index.ts`.

---

# 5. Replace `src/core/mesh/types.ts`

Delete the current mesh healthcheck/config aliases and all V1 mesh fields.

Replace the file with:

```ts
export interface MeshTesterConfig {
  compose: string;
  service: string;
  env?: Record<string, string>;
}

export interface MeshServiceConfig {
  path: string;
  env?: Record<string, string>;
  dependencies?: Record<string, string>;
  dependsOn?: string[];
  publish?: string[];
}

export interface MeshServiceStageOverlay {
  path?: string;
  env?: Record<string, string>;
  dependencies?: Record<string, string>;
  dependsOn?: string[];
  publish?: string[];
}

export interface MeshStageConfig {
  services?: Record<string, MeshServiceStageOverlay>;
}

export interface MeshConfig {
  $schema?: string;
  name?: string;
  tester?: MeshTesterConfig;
  services: Record<string, MeshServiceConfig>;
  dev?: MeshStageConfig;
  prod?: MeshStageConfig;
  test?: MeshStageConfig;
  e2e?: MeshStageConfig;
}

export type MeshConfigStage = "dev" | "prod" | "test" | "e2e";
export type MeshCompositionStage = "dev" | "prod" | "e2e";

export const MESH_COMMAND_STAGES = [
  "dev",
  "prod",
  "test",
  "test-unit",
  "test-e2e",
] as const;

export type MeshCommandStage = (typeof MESH_COMMAND_STAGES)[number];
```

Do **not** call `test-unit` or `test-e2e` JSON overlay names. The configuration overlays are only `dev`, `prod`, `test`, and `e2e`.

---

# 6. Add `src/core/config/constants.ts`

Create the file with these exported constants:

```ts
export const BUILDER_IDENTIFIER_PATTERN = /^[a-z][a-z0-9-]*$/;
export const ENDPOINT_SCHEME_PATTERN = /^[A-Za-z][A-Za-z0-9+.-]*$/;
export const DEPENDENCY_REFERENCE_PATTERN = /^dependencies\.([a-z][a-z0-9-]*)$/;

export const ENDPOINT_PROPERTIES = [
  "network_host",
  "network_port",
  "network_address",
  "network_url",
  "public_host",
  "public_port",
  "public_address",
  "public_url",
] as const;

export const PUBLIC_ENDPOINT_PROPERTIES = new Set([
  "public_host",
  "public_port",
  "public_address",
  "public_url",
]);

export const NETWORK_ENDPOINT_PROPERTIES = new Set([
  "network_host",
  "network_port",
  "network_address",
  "network_url",
]);

export const URL_ENDPOINT_PROPERTIES = new Set([
  "network_url",
  "public_url",
]);

export const RESERVED_MESH_SERVICE_NAMES = new Set([
  "app",
  "dependencies",
  "tester",
  "services",
  "dev",
  "prod",
  "test",
  "e2e",
]);

export const PUBLIC_HOST = "127.0.0.1";
export const AUTO_PORT_CACHE_VERSION = 1;
export const AUTO_PORT_CACHE_RELATIVE_PATH = ".builder/ports-v2.json";
export const AUTO_PORT_SCAN_START = 20000;
```

Do not make these values user-configurable.

---

# 7. Replace `src/core/buildSchema.ts`

Replace the whole file. Do not preserve legacy schema fragments.

Use strict Zod objects everywhere so every removed V1/V1.2 key is rejected automatically.

The implementation must have the following schema composition:

```ts
import { z } from "zod";
import {
  BUILDER_IDENTIFIER_PATTERN,
  ENDPOINT_SCHEME_PATTERN,
} from "./config/constants.js";

const identifierSchema = z
  .string()
  .regex(BUILDER_IDENTIFIER_PATTERN, "must match ^[a-z][a-z0-9-]*$");

const envSchema = z.record(z.string(), z.string());

const portSchema = z.number().int().min(1).max(65535);
const publicPortSchema = z.union([portSchema, z.literal("AUTO")]);

export const appEndpointSchema = z
  .object({
    port: portSchema,
    publicPort: publicPortSchema.optional(),
    primary: z.boolean().optional(),
    scheme: z.string().regex(ENDPOINT_SCHEME_PATTERN).optional(),
  })
  .strict();

export const dependencyEndpointSchema = appEndpointSchema
  .extend({
    service: z.string().min(1),
  })
  .strict();

export const dependencySchema = z
  .object({
    compose: z.string().min(1),
    env: envSchema.optional(),
    endpoints: z.record(identifierSchema, dependencyEndpointSchema).optional(),
    dependsOn: z.array(z.string()).optional(),
  })
  .strict();

const appStageEndpointSchema = appEndpointSchema.partial().strict();
const dependencyStageEndpointSchema = dependencyEndpointSchema.partial().strict();

const dependencyStageSchema = z
  .object({
    compose: z.string().min(1).optional(),
    env: envSchema.optional(),
    endpoints: z.record(identifierSchema, dependencyStageEndpointSchema).optional(),
    dependsOn: z.array(z.string()).optional(),
  })
  .strict();

export const buildStageSchema = z
  .object({
    "override-compose": z.string().min(1).optional(),
    app: z
      .object({
        env: envSchema.optional(),
        endpoints: z.record(identifierSchema, appStageEndpointSchema).optional(),
      })
      .strict()
      .optional(),
    dependencies: z.record(identifierSchema, dependencyStageSchema).optional(),
  })
  .strict();

export const buildJsonSchema = z
  .object({
    $schema: z.string().optional(),
    name: z.string().optional(),
    dockerfile: z.string().min(1).optional(),
    app: z
      .object({
        env: envSchema.optional(),
        endpoints: z.record(identifierSchema, appEndpointSchema).optional(),
      })
      .strict(),
    dependencies: z.record(identifierSchema, dependencySchema).optional(),
    tester: z
      .object({
        env: envSchema.optional(),
      })
      .strict()
      .optional(),
    dev: buildStageSchema.optional(),
    prod: buildStageSchema.optional(),
    test: buildStageSchema.optional(),
    e2e: buildStageSchema.optional(),
  })
  .strict();
```

## 7.1 Do not put effective-stage invariants in the raw schema

The raw stage endpoint fields are partial by design. Enforce these only after overlay resolution:

- an effective app endpoint needs `port`;
- an effective dependency endpoint needs `service` and `port`;
- a base/stage-added effective dependency that is materialized needs `compose`;
- every non-empty effective endpoint collection has exactly one `primary: true`;
- dependency `dependsOn` entries use `dependencies.<name>`;
- cycles and references are valid for the active stage.

This separation is mandatory because a stage overlay can legitimately contain only `publicPort` for an endpoint declared in base.

---

# 8. Replace `src/core/mesh/meshSchema.ts`

Replace the whole file; remove `meshHealthcheckSchema` and every V1 field.

Implement:

```ts
import { z } from "zod";
import {
  BUILDER_IDENTIFIER_PATTERN,
  RESERVED_MESH_SERVICE_NAMES,
} from "../config/constants.js";

const identifierSchema = z
  .string()
  .regex(BUILDER_IDENTIFIER_PATTERN, "must match ^[a-z][a-z0-9-]*$");

const serviceNameSchema = identifierSchema.refine(
  (name) => !RESERVED_MESH_SERVICE_NAMES.has(name),
  { message: "is reserved and cannot be used as a mesh service name" },
);

const envSchema = z.record(z.string(), z.string());

export const meshServiceSchema = z
  .object({
    path: z.string().min(1),
    env: envSchema.optional(),
    dependencies: z.record(identifierSchema, serviceNameSchema).optional(),
    dependsOn: z.array(serviceNameSchema).optional(),
    publish: z.array(z.string()).optional(),
  })
  .strict();

const meshServiceStageOverlaySchema = z
  .object({
    path: z.string().min(1).optional(),
    env: envSchema.optional(),
    dependencies: z.record(identifierSchema, serviceNameSchema).optional(),
    dependsOn: z.array(serviceNameSchema).optional(),
    publish: z.array(z.string()).optional(),
  })
  .strict();

const meshStageSchema = z
  .object({
    services: z.record(serviceNameSchema, meshServiceStageOverlaySchema).optional(),
  })
  .strict();

export const meshSchema = z
  .object({
    $schema: z.string().optional(),
    name: z.string().optional(),
    tester: z
      .object({
        compose: z.string().min(1),
        service: z.string().min(1),
        env: envSchema.optional(),
      })
      .strict()
      .optional(),
    services: z.record(serviceNameSchema, meshServiceSchema),
    dev: meshStageSchema.optional(),
    prod: meshStageSchema.optional(),
    test: meshStageSchema.optional(),
    e2e: meshStageSchema.optional(),
  })
  .strict();
```

Also validate dependency map **keys** later against each consumer service's effective `build.json.dependencies`; the mesh schema cannot know those keys by itself.

---

# 9. Add `src/errors/ConfigError.ts`

Create a structured configuration error so all later compilers can satisfy V2's diagnostic contract.

```ts
import { ScriptError, type ScriptErrorOptions } from "./ScriptError.js";

export interface ConfigErrorContext {
  sourceFile?: string;
  configPath?: string;
  value?: unknown;
  referencedObject?: string;
  stage?: string;
  composition?: "service" | "mesh";
  reason: string;
}

export class ConfigError extends ScriptError {
  readonly context: ConfigErrorContext;

  constructor(context: ConfigErrorContext, options?: ScriptErrorOptions) {
    const details = [
      context.sourceFile ? `source=${context.sourceFile}` : undefined,
      context.configPath ? `path=${context.configPath}` : undefined,
      context.stage ? `stage=${context.stage}` : undefined,
      context.composition ? `composition=${context.composition}` : undefined,
      context.referencedObject ? `reference=${context.referencedObject}` : undefined,
      context.value !== undefined ? `value=${JSON.stringify(context.value)}` : undefined,
    ].filter(Boolean);

    super(
      `${context.reason}${details.length ? ` (${details.join(", ")})` : ""}`,
      options,
    );
    this.name = "ConfigError";
    this.context = context;
  }
}
```

Do not catch this and replace it with generic `ScriptError` later. Preserve it to the CLI boundary.

---

# 10. Add `src/errors/PortConflictError.ts`

```ts
import { ConfigError } from "./ConfigError.js";

export class PortConflictError extends ConfigError {
  readonly port: number;
  readonly firstOwner: string;
  readonly secondOwner: string;

  constructor(port: number, firstOwner: string, secondOwner: string, stage: string) {
    super({
      sourceFile: "Builder effective composition",
      configPath: "publicPort",
      value: port,
      stage,
      reason: `Host port ${port} is claimed by both ${firstOwner} and ${secondOwner}. Builder does not remap fixed public ports.`,
    });
    this.name = "PortConflictError";
    this.port = port;
    this.firstOwner = firstOwner;
    this.secondOwner = secondOwner;
  }
}
```

Use this class only for configuration-level fixed-port collisions. Keep the existing runtime `ScriptError` path for an already occupied fixed/resolved host port; `PortConflictError` is reserved for configuration-level collisions between two logical endpoint claims.

---

# 11. Add `src/core/config/types.ts`

This file contains only **resolved/internal** types. Do not expose generated Compose names in public configuration types.

Implement at minimum:

```ts
import type {
  AppEndpoint,
  BuildJson,
  DependencyConfig,
  DependencyEndpoint,
} from "../../types/index.js";
import type { MeshConfig, MeshServiceConfig } from "../mesh/types.js";

export interface EffectiveBuildConfig
  extends Omit<BuildJson, "dev" | "prod" | "test" | "e2e" | "dependencies" | "app"> {
  app: {
    env: Record<string, string>;
    endpoints: Record<string, AppEndpoint>;
  };
  dependencies: Record<
    string,
    Omit<DependencyConfig, "env" | "endpoints" | "dependsOn"> & {
      env: Record<string, string>;
      endpoints: Record<string, DependencyEndpoint>;
      dependsOn: string[];
    }
  >;
  tester?: {
    env: Record<string, string>;
  };
  overrideCompose?: string;
}

export interface EffectiveMeshConfig
  extends Omit<MeshConfig, "dev" | "prod" | "test" | "e2e" | "services"> {
  services: Record<
    string,
    Omit<MeshServiceConfig, "env" | "dependencies" | "dependsOn" | "publish"> & {
      env: Record<string, string>;
      dependencies: Record<string, string>;
      dependsOn: string[];
      publish: string[];
    }
  >;
}

export interface ResolvedEndpoint {
  logicalPath: string;
  networkHost: string;
  networkPort: number;
  scheme?: string;
  publicHost?: string;
  publicPort?: number;
  effectivelyPublished: boolean;
}

export interface EndpointUsage {
  expression: string;
  ownerService?: string;
  dependency?: string;
  endpoint: string;
  property: EndpointProperty;
  sourcePath: string;
}

export type EndpointProperty =
  | "network_host"
  | "network_port"
  | "network_address"
  | "network_url"
  | "public_host"
  | "public_port"
  | "public_address"
  | "public_url";
```

Add additional internal fields only if Plans 02/03 require them; do not reintroduce V1 concepts.

---

# 12. Add `src/core/config/stageMerge.ts`

Implement explicit merging instead of a generic library merge. The V2 array exceptions are too specific for generic deep merge.

Create:

```ts
export function unionStable<T>(base: readonly T[] = [], overlay: readonly T[] = []): T[] {
  return [...new Set([...base, ...overlay])];
}

export function mergeStringMap(
  base: Record<string, string> | undefined,
  overlay: Record<string, string> | undefined,
): Record<string, string> {
  return { ...(base ?? {}), ...(overlay ?? {}) };
}

export function mergeRecordOfObjects<T extends Record<string, unknown>>(
  base: Record<string, T> | undefined,
  overlay: Record<string, Partial<T>> | undefined,
): Record<string, T | Partial<T>> {
  const result: Record<string, T | Partial<T>> = { ...(base ?? {}) };
  for (const [key, value] of Object.entries(overlay ?? {})) {
    result[key] = { ...(result[key] ?? {}), ...value };
  }
  return result;
}
```

The concrete stage resolvers below must handle nested endpoint maps; do not assume a single shallow object spread is enough.

---

# 13. Add `src/core/config/resolveBuildStage.ts`

This is the only function that turns raw `BuildJson` plus `dev|prod|test|e2e` into an effective service configuration.

Export:

```ts
export function resolveBuildStage(
  build: BuildJson,
  stage: Environment,
  sourceFile: string,
): EffectiveBuildConfig
```

## 13.1 Exact merge algorithm

Perform these operations in this order:

1. `overlay = build[stage] ?? {}`.
2. Start effective app env with `build.app.env ?? {}` then overlay `overlay.app?.env` keywise.
3. Start effective app endpoints with deep copies of `build.app.endpoints ?? {}`.
4. For each stage app endpoint:
   - if base endpoint exists, shallow-merge endpoint scalar fields;
   - otherwise add a new endpoint from the stage declaration.
5. Start effective dependencies with deep copies of base dependencies.
6. For every stage dependency:
   - if absent in base, create it from the stage declaration;
   - if present, scalar `compose` replaces only when supplied;
   - `env` keywise merges;
   - endpoints deep merge by endpoint name and scalar field;
   - `dependsOn` uses `unionStable(base, overlay)`.
7. Root `tester` does not receive a stage overlay.
8. Map raw `overlay["override-compose"]` into internal `overrideCompose`.
9. Remove the raw `dev`, `prod`, `test`, and `e2e` objects from the returned effective object.
10. Run `validateEffectiveBuildConfig` described below.

There is no deletion syntax. A `null` is rejected by Zod before this function is called.

## 13.2 Add effective semantic validation in the same module

Create private helpers:

```ts
function assertExactlyOnePrimary(...): void
function assertEffectiveAppEndpoints(...): void
function assertEffectiveDependencies(...): void
function assertDependencyDependsOnSyntax(...): void
```

Rules:

- empty endpoint map => no primary required;
- non-empty => **exactly one** `primary === true`;
- effective app endpoint must have integer port `1..65535`;
- effective dependency endpoint must have non-empty `service` and port `1..65535`;
- every effective dependency, including an inert dependency with zero endpoints, must have a non-empty effective `compose` because the effective result must satisfy the full `DependencyConfig` contract; zero endpoints changes materialization, not configuration shape;
- `dependsOn` entry must match `dependencies.<identifier>`;
- self dependency fails;
- missing dependency target fails;
- target with zero effective endpoints fails because it is inert;
- dependency cycles fail through `assertAcyclicGraph` from `lifecycleGraph.ts`;
- an inert dependency may exist if nobody lifecycle-depends on it.

The effective validator must include source=`build.json`, logical configuration path, stage, and offending reference in every `ConfigError`.

---

# 14. Add `src/core/config/resolveMeshStage.ts`

Export:

```ts
export function resolveMeshStage(
  mesh: MeshConfig,
  stage: MeshConfigStage,
  sourceFile: string,
): EffectiveMeshConfig
```

## 14.1 Exact merge semantics

For each service key in the union of base services and `mesh[stage]?.services`:

- `path`: overlay scalar wins; stage-added service must end with path;
- `env`: keywise merge;
- `dependencies`: keywise merge; overlay provider wins for same logical key;
- `dependsOn`: stable union;
- `publish`: stable union.

Do not implement service deletion.

After merge:

- validate every effective service name against the identifier regex and reserved-name set;
- require at least one effective service **after** the active stage overlay is applied; base `services: {}` is structurally valid when the active stage adds services;
- require every effective service path;
- each explicit `dependsOn` target must exist, not be self;
- run cycle detection for explicit `dependsOn` here;
- provider/substitution edges are not yet known to this function and are added in Plan 03 before the final lifecycle graph cycle check.

Do not merge `mesh.prod` into `mesh.e2e`.

---

# 15. Replace `src/utils/getBuildJson.ts`

Remove `normalizeDependsOn` and all mutation of legacy `services`.

The file must:

1. resolve `<project>/build.json`;
2. fail if missing;
3. parse JSON;
4. call `buildJsonSchema.safeParse`;
5. convert Zod issues into one `ConfigError` per load operation with the issue paths included;
6. return `result.data` typed as `BuildJson`.

Use the actual absolute build JSON path in diagnostics.

Do not silently accept legacy fields. Because the schema is `.strict()`, a current V1 file must now fail.

Suggested body after JSON parse:

```ts
const result = buildJsonSchema.safeParse(parsed);
if (!result.success) {
  const reason = result.error.issues
    .map((issue) => `${issue.path.join(".") || "<root>"}: ${issue.message}`)
    .join("; ");
  throw new ConfigError({
    sourceFile: buildJsonPath,
    configPath: "<root>",
    composition: "service",
    reason: `Invalid build.json: ${reason}`,
  });
}
return result.data;
```

---

# 16. Replace `src/core/mesh/getMeshJson.ts`

Use the same loading contract as `getBuildJson`, but with `meshSchema` and composition=`mesh`.

Do not call the old `checkMeshJson` from `getMeshJson`; that old checker mixes parsing with V1 provider-cycle semantics. Plan 04 replaces it.

`getMeshJson` must return the structurally valid raw V2 configuration only.

---

# 17. Add `src/core/config/pathSafety.ts`

Centralize project-boundary checks. Export:

```ts
export function resolveInsideProject(
  projectDir: string,
  relativePath: string,
  context: { sourceFile: string; configPath: string; stage?: string },
): string
```

Rules:

1. reject empty path;
2. resolve against `projectDir`;
3. use the existing `isPathInside` utility;
4. if the result escapes the project directory, throw `ConfigError`;
5. the function does not require the file to exist; callers perform existence checks with a more specific message.

Use this helper for:

- `dockerfile`;
- dependency `compose`;
- stage `override-compose`;
- mesh service `path` relative to mesh root;
- mesh tester `compose`.

---

# 18. Add `src/core/config/lifecycleGraph.ts`

Create one reusable cycle detector.

```ts
export type LifecycleGraph = Map<string, Set<string>>;

export function assertAcyclicGraph(
  graph: LifecycleGraph,
  context: { sourceFile: string; stage: string; composition: "service" | "mesh" },
): void
```

Implement DFS with `visiting`/`visited`. When a cycle is found, report the exact path:

```text
A -> B -> C -> A
```

Do not auto-break or ignore duplicate edges. Duplicate edges can collapse naturally in `Set`.

This helper will be called by:

- `resolveBuildStage` for dependency module `dependsOn`;
- `resolveMeshStage` for explicit top-level `dependsOn`;
- Plan 03 after automatic substitution edges are added.

---

# 19. Add `src/core/config/endpointProperties.ts`

This module converts one resolved endpoint into one requested property. It must not parse reference syntax.

Export:

```ts
export function resolveEndpointProperty(
  endpoint: ResolvedEndpoint,
  property: EndpointProperty,
  context: { sourceFile: string; configPath: string; stage: string },
): string
```

Exact semantics:

```ts
switch (property) {
  case "network_host":
    return endpoint.networkHost;
  case "network_port":
    return String(endpoint.networkPort);
  case "network_address":
    return `${endpoint.networkHost}:${endpoint.networkPort}`;
  case "network_url":
    requireScheme();
    return `${endpoint.scheme}://${endpoint.networkHost}:${endpoint.networkPort}`;
  case "public_host":
    requirePublished();
    return endpoint.publicHost!;
  case "public_port":
    requirePublished();
    return String(endpoint.publicPort!);
  case "public_address":
    requirePublished();
    return `${endpoint.publicHost}:${endpoint.publicPort}`;
  case "public_url":
    requirePublished();
    requireScheme();
    return `${endpoint.scheme}://${endpoint.publicHost}:${endpoint.publicPort}`;
}
```

`requirePublished()` means all of these are true:

- `effectivelyPublished === true`;
- `publicHost` exists;
- numeric resolved `publicPort` exists.

Do not use default `http` when `scheme` is missing.

---

# 20. Add `src/core/config/references.ts`

This is the only parser for Builder `${...}` references.

## 20.1 Supported build reference grammar

```text
${app.endpoints.<endpoint>.<property>}
${dependencies.<dependency>.endpoints.<endpoint>.<property>}
```

## 20.2 Supported mesh reference grammar

```text
${<service>.app.endpoints.<endpoint>.<property>}
${<service>.dependencies.<dependency>.endpoints.<endpoint>.<property>}
```

There is no `services.` prefix.

## 20.3 Required exports

```ts
export type ReferenceScope = "build" | "mesh";

export interface ParsedBuilderReference {
  raw: string;
  scope: ReferenceScope;
  meshService?: string;
  target: "app" | "dependency";
  dependency?: string;
  endpoint: string;
  property: EndpointProperty;
}

export function collectBuilderReferences(
  value: string,
  scope: ReferenceScope,
  sourcePath: string,
): ParsedBuilderReference[];

export function interpolateBuilderReferences(
  value: string,
  scope: ReferenceScope,
  resolve: (ref: ParsedBuilderReference) => string,
): string;

export function assertTesterReferencesArePublic(
  env: Record<string, string>,
  scope: ReferenceScope,
  sourcePrefix: string,
): void;
```

## 20.4 Escaping

Treat `$$` as a literal dollar escape. A sequence beginning `$$` must not become a Builder reference.

Recommended deterministic parser:

1. temporarily replace every `$$` with a sentinel that cannot occur in JSON env text;
2. scan `${...}`;
3. validate each body against exactly one grammar;
4. resolve/interpolate;
5. restore sentinel to `$`.

Do not pass unrecognized `${...}` through silently. In Builder-managed JSON `env`, `${...}` is Builder syntax, so invalid grammar is a configuration error.

## 20.5 Tester restriction

`assertTesterReferencesArePublic` must reject references whose property is any `network_*` value before actual endpoint lookup.

Use it for both:

- `build.json.tester.env`;
- `mesh.json.tester.env`.

---

# 21. Interpretation to use for network references in isolated service stages

Use this exact behavior throughout Plans 02 and 03 so the implementer does not need to decide it later:

- `network_*` is resolvable from an **effective declared endpoint contract** even when a local dependency is not materialized in an isolated stage.
- the generated network host is the same deterministic host name that would be used if the dependency were materialized;
- this does **not** materialize the dependency and does **not** create a lifecycle edge;
- `public_*` remains unavailable unless the endpoint is actually effectively published in the active composition.

Reason: the normative V2 examples place dependency `network_*` references in base `app.env` while ordinary `service up dev` and `test-unit` remain isolated. Treating those base declarations as invalid merely because the implementation is currently inert would make the canonical V2 configuration unusable in isolated stages.

Do not extend this rule to `public_*`.

---

# 22. Add `src/core/config/hostPorts.ts`

Keep the compiler API synchronous. Do not introduce an async `get-port` dependency and do not make `compileEnvironment`/`compileMeshEnvironment` Promise-returning merely for port allocation.

## 22.1 Cache format

Use private file:

```text
<project>/.builder/ports-v2.json
```

Serialize:

```json
{
  "version": 1,
  "allocations": {
    "logical.endpoint.path": 20123
  }
}
```

The exact filename is private implementation detail, but fix it to this name in this migration so tests are deterministic.

## 22.2 Required types and exports

```ts
export interface PortIntent {
  logicalPath: string;
  requested: number | "AUTO";
}

export interface AllocatedPort {
  logicalPath: string;
  port: number;
}

export function allocateHostPorts(
  projectDir: string,
  stage: string,
  intentsInDeterministicOrder: readonly PortIntent[],
): Map<string, number>
```

## 22.3 Exact allocation algorithm

1. Build an empty `reservedByPort: Map<number,string>`.
2. First iterate **all** intents whose request is numeric, irrespective of the position of `AUTO` intents.
3. For each fixed number:
   - if already reserved, throw `PortConflictError` naming both logical paths;
   - reserve it.
4. Load cache if it exists and version is `1`; malformed cache is disposable: ignore it rather than invalidating configuration.
5. Iterate `AUTO` intents in the order supplied by the caller.
6. For each AUTO:
   - inspect cached port for its exact logical path;
   - reuse only if `1..65535`, not reserved, and currently available on `127.0.0.1`;
   - otherwise scan deterministically beginning at `20000` through `65535`, then `1024` through `19999`;
   - skip reserved or occupied ports;
   - reserve first available port and cache it;
   - if none exists, throw `ConfigError`.
7. Atomically persist cache by writing a sibling temp file then renaming.
8. Return mappings for both fixed and AUTO logical paths.

## 22.4 Synchronous OS availability test

Use a child Node process so this module remains synchronous. Implement private:

```ts
function isHostPortAvailableSync(port: number): boolean
```

Run `process.execPath` with a tiny `node:net` script that attempts to listen on `127.0.0.1:<port>`, exits `0` after successful bind/close, and exits nonzero on error.

Do not use `lsof`/`ss` because availability must remain cross-platform.

## 22.5 Caller-supplied ordering

For standalone service compilation in Plan 02, pass intents in:

1. app endpoints alphabetically;
2. dependencies alphabetically;
3. dependency endpoints alphabetically.

For mesh compilation in Plan 03, pass the exact normative order:

1. top-level mesh services alphabetically;
2. each service's app endpoints alphabetically;
3. dependencies alphabetically;
4. dependency endpoints alphabetically.

Only **effectively published** endpoints produce intents.

---

# 23. Effective endpoint utility contract

Do not let the standalone and mesh compilers each invent endpoint records.

Add helpers in `src/core/config/endpointProperties.ts` or a sibling internal section:

```ts
export function assertPrimaryEndpointInvariant(...): void;
export function getPrimaryEndpoint(...): [name: string, endpoint: AppEndpoint] | undefined;
```

`getPrimaryEndpoint` must assume the invariant is already validated. It returns `undefined` only for an empty endpoint collection.

Builder internal `PORT` is derived exclusively from this primary endpoint's **container `port`**, not `publicPort`.

---

# 24. Update `src/index.ts`

Keep current public compiler exports so downstream callers are not broken unnecessarily.

Add:

```ts
export { ConfigError } from "./errors/ConfigError.js";
export { PortConflictError } from "./errors/PortConflictError.js";
```

Continue exporting `buildJsonSchema` and `meshSchema` under their current names.

Do not publicly export internal namespace/resource names or AUTO cache implementation helpers.

---

# 25. Tests to add in this plan

Create these focused files now, before modifying the compilers:

```text
tests/v2/buildSchema.test.ts
tests/v2/meshSchema.test.ts
tests/v2/stageResolution.test.ts
tests/v2/references.test.ts
tests/v2/hostPorts.test.ts
```

## 25.1 `tests/v2/buildSchema.test.ts`

Required cases:

- accepts canonical minimal `{ "app": {} }`;
- accepts app endpoint with fixed publicPort;
- accepts AUTO;
- accepts arbitrary valid schemes (`grpc`, `redis`, `smtp`, `ws+unix` if regex-valid);
- rejects port `0`, `65536`, decimal, string number;
- rejects non-string env values;
- rejects invalid dependency/endpoint identifiers;
- dependency endpoint requires `service` in base;
- stage endpoint may be partial;
- root app required;
- rejects every legacy build field individually:
  - root `port`;
  - `envOverrides`;
  - `overrides`;
  - `composeFiles`;
  - `services`;
  - `policy`;
  - `policies`;
  - `injects`;
  - `sidecars`;
  - dependency `path`;
  - dependency-level `service`;
  - dependency-level `port`;
  - dependency-level `ports`;
  - tester `envOverrides`.

## 25.2 `tests/v2/meshSchema.test.ts`

Required cases:

- minimal one-service V2 mesh;
- all supported base service fields;
- all supported stage service overlay fields;
- tester `{compose,service,env}`;
- non-string env rejection;
- reserved top-level service names;
- invalid identifier casing/underscore/dot;
- `services: {}` accepted structurally when an active stage adds a valid service; effective stage with zero services rejected semantically;
- rejects every legacy mesh field individually:
  - root `dependencies`;
  - service `port`;
  - `preservePort`;
  - `provideDependency`;
  - `replaceMocks`;
  - `envOverrides`;
  - `healthcheck`;
  - tester `path`;
  - tester `dockerfile`;
  - tester `envOverrides`;
  - tester `policy`;
  - `inherit-published`;
  - stage-level `tester`.

## 25.3 `tests/v2/stageResolution.test.ts`

Verify:

- scalar endpoint override preserves omitted fields;
- env maps merge by key;
- stage-only endpoint is added;
- stage-only dependency is added;
- dependency `compose` scalar replaces;
- build dependency `dependsOn` union order is base then stage with duplicates removed;
- mesh service `dependsOn` and `publish` union similarly;
- mesh `dependencies` map merges by key and stage wins same key;
- no deletion via omission;
- app/dependency exact-one-primary invariant after merge;
- inert dependency allowed but cannot be target of `dependsOn`;
- dependency cycles detected;
- mesh explicit lifecycle cycles detected;
- E2E does not inherit prod overlay.

## 25.4 `tests/v2/references.test.ts`

Verify every property, embedded references inside larger strings, URL scheme requirement, public publication requirement, no `services.` mesh prefix, tester network ref rejection, `$$` literal escape, unresolved endpoint/service/dependency errors, and exact logical endpoint-name preservation.

## 25.5 `tests/v2/hostPorts.test.ts`

Use a temporary project directory and mock `node:child_process.spawnSync` with Vitest for deterministic availability results. Test:

- all fixed reservations processed before AUTO;
- fixed collision throws `PortConflictError` with both owners;
- stable cache reuse;
- cached occupied port is not reused;
- cache conflicting with a fixed reservation is not reused;
- deterministic scanning;
- deterministic caller order;
- malformed cache ignored;
- deleted cache changes nothing semantically besides possible AUTO values.

---

# 26. Files deliberately not deleted in this plan

Do not delete these yet because the current compilers still import them before Plans 02/03 land:

```text
src/utils/extractBuildDeps.ts
src/utils/extractOverrides.ts
src/utils/dependencyPorts.ts
src/utils/ymlMods/addDependenciesToAppService.ts
src/utils/ymlMods/renameServicesWithDependencies.ts
```

Plan 04 removes them after all imports are gone.

---

# 27. Completion gate for Plan 01

Run:

```bash
pnpm typecheck
pnpm vitest run tests/v2/buildSchema.test.ts \
  tests/v2/meshSchema.test.ts \
  tests/v2/stageResolution.test.ts \
  tests/v2/references.test.ts \
  tests/v2/hostPorts.test.ts
```

Do not proceed to Plan 02 until all are green.

Expected temporary condition after this plan: existing V1 example fixtures and old compiler tests may fail because the public schema is now intentionally breaking. That is acceptable only during the branch between Plan 01 and Plan 04. Do not weaken V2 parsing to make old fixtures pass.

---

# 28. Definition of done

Plan 01 is complete only when all of these statements are true:

- [ ] current V1/V1.2 keys fail structurally;
- [ ] `build.json.app` is required;
- [ ] build dependencies have `compose` and endpoint-level `service` only;
- [ ] mesh provider bindings use `services.<name>.dependencies` only;
- [ ] all env schemas enforce `Record<string,string>`;
- [ ] stage overlay merge semantics exactly match V2;
- [ ] effective primary invariants are enforced after merge;
- [ ] dependency lifecycle syntax and cycles are validated;
- [ ] mesh explicit lifecycle cycles are validated;
- [ ] endpoint property resolution has no protocol/port inference;
- [ ] tester references can use only public endpoint properties;
- [ ] fixed host-port conflicts identify both endpoint owners;
- [ ] AUTO allocation is cached, deterministic, availability-aware, and synchronous;
- [ ] errors carry source/path/stage/composition context;
- [ ] no public API exposes Builder-generated dependency service/resource names.

Once this gate is satisfied, continue directly with `02-v2-standalone-service-composition-plan.md`.
