# Plan 01 — Stage Inheritance, Environment Precedence, and Immutable Dependency Implementations

## Scope

This plan fixes the configuration/composition layer first. Do not begin the test-pipeline/tester changes in Plan 02 until this plan is green.

Fix IDs:

- G01 — build E2E inheritance.
- G02 — mesh E2E inheritance.
- G03 — E2E app `EXEC_MODE`.
- G04 — exact ordered application environment/override precedence.
- G05 — dependency `compose` immutability.
- G09 — root mesh service minimum.

Primary source files:

```text
src/core/config/stageMerge.ts
src/core/config/types.ts
src/core/config/resolveBuildStage.ts
src/core/config/resolveMeshStage.ts
src/core/composition/types.ts
src/core/composition/compileServiceComposition.ts
src/core/mesh/v2/compileMeshComposition.ts
src/core/mesh/runners/runMeshTestUnit.ts
src/core/mesh/checkers/checkMeshServices.ts
src/core/mesh/meshSchema.ts
scripts/generate-schemas.ts
schemas/mesh-schema.json
```

No source file should be deleted.

---

# 1. Add one canonical stage-chain helper

## Bug

Build and mesh resolvers currently use only `config[stage]`. E2E therefore resolves base -> e2e instead of base -> prod -> e2e.

## Red test first

Edit `tests/v2/stageResolution.test.ts` and add both tests before production code changes:

```ts
it("resolves build e2e as base -> prod -> e2e", () => {
  const result = resolveBuildStage({
    app: { env: { BASE: "base", VALUE: "base" } },
    prod: { app: { env: { PROD: "prod", VALUE: "prod" } } },
    e2e: { app: { env: { E2E: "e2e", VALUE: "e2e" } } },
  }, "e2e", "build.json");

  expect(result.app.env).toMatchObject({
    BASE: "base",
    PROD: "prod",
    E2E: "e2e",
    VALUE: "e2e",
  });
});

it("resolves mesh e2e as base -> prod -> e2e", () => {
  const result = resolveMeshStage({
    services: {
      api: { path: "./api", env: { BASE: "base", VALUE: "base" } },
    },
    prod: {
      services: {
        api: { env: { PROD: "prod", VALUE: "prod" } },
        worker: { path: "./worker" },
      },
    },
    e2e: {
      services: {
        api: { env: { E2E: "e2e", VALUE: "e2e" } },
      },
    },
  }, "e2e", "mesh.json");

  expect(result.services.api.env).toMatchObject({
    BASE: "base",
    PROD: "prod",
    E2E: "e2e",
    VALUE: "e2e",
  });
  expect(result.services).toHaveProperty("worker");
});
```

### Expected red state

Both fail because `PROD` and `worker` are absent.

If they do not fail, inspect the actual checkout before changing code; do not apply a duplicate fix.

## Code change

Edit `src/core/config/stageMerge.ts`.

Replace the current file with a formatted implementation containing the existing helpers plus this exported function:

```ts
import type { Environment } from "../../types/index.js";

export function stageOverlayChain(stage: Environment): readonly Environment[] {
  switch (stage) {
    case "dev":
      return ["dev"];
    case "prod":
      return ["prod"];
    case "test":
      return ["test"];
    case "e2e":
      return ["prod", "e2e"];
  }
}

export function unionStable<T>(
  base: readonly T[] = [],
  overlay: readonly T[] = [],
): T[] {
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

Do not create separate build/mesh stage-chain logic. Both resolvers must import this one function.

---

# 2. Preserve ordered build layers in `EffectiveBuildConfig`

## Why this is required

A final `app.env` map is still useful for semantic validation, but it cannot represent:

```text
prod app.env
-> prod override env
-> e2e app.env
-> e2e override env
```

The effective config therefore needs both:

1. the fully merged effective values; and
2. ordered source-layer metadata used by the compiler.

## Edit `src/core/config/types.ts`

Add:

```ts
import type {
  AppEndpoint,
  BuildJson,
  DependencyConfig,
  DependencyEndpoint,
  Environment,
} from "../../types/index.js";

export interface EffectiveBuildLayer {
  stage: "base" | Environment;
  appEnv: Record<string, string>;
  overrideCompose?: string;
}
```

Then change `EffectiveBuildConfig` to:

```ts
export interface EffectiveBuildConfig
  extends Omit<
    BuildJson,
    "dev" | "prod" | "test" | "e2e" | "dependencies" | "app"
  > {
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

  tester?: { env: Record<string, string> };

  /** Ordered source layers used to compile exact runtime precedence. */
  layers: EffectiveBuildLayer[];
}
```

Delete the old singular:

```ts
overrideCompose?: string;
```

No caller may rely on a singular effective override after this change.

---

# 3. Rewrite `resolveBuildStage()` to apply the full chain and reject compose replacement

## Current location

`src/core/config/resolveBuildStage.ts`, current lines 9–37.

## Red tests for dependency immutability

Replace the existing `STG-009` in `tests/conformance/03-stages.test.ts` with:

```ts
it("STG-009 rejects replacing an inherited dependency Compose implementation", () => {
  const config: any = {
    app: {},
    dependencies: {
      db: dep("a.yml", "owner"),
    },
    e2e: {
      dependencies: {
        db: { compose: "b.yml" },
      },
    },
  };

  expect(() => resolveBuildStage(config, "e2e", "build.json"))
    .toThrow(/e2e\.dependencies\.db\.compose|inherited|replace/i);
});
```

Add:

```ts
it("allows compose when a stage introduces a new dependency", () => {
  const result = resolveBuildStage({
    app: {},
    e2e: {
      dependencies: {
        mailpit: {
          compose: "mailpit.yml",
          endpoints: {
            smtp: {
              service: "mailpit",
              port: 1025,
              primary: true,
              scheme: "smtp",
            },
          },
        },
      },
    },
  } as any, "e2e", "build.json");

  expect(result.dependencies.mailpit.compose).toBe("mailpit.yml");
});

it("rejects e2e replacement of a dependency introduced by prod", () => {
  const config: any = {
    app: {},
    prod: {
      dependencies: {
        db: {
          compose: "prod-db.yml",
          endpoints: {
            api: { service: "db", port: 5432, primary: true },
          },
        },
      },
    },
    e2e: {
      dependencies: {
        db: { compose: "other.yml" },
      },
    },
  };

  expect(() => resolveBuildStage(config, "e2e", "build.json"))
    .toThrow(/e2e\.dependencies\.db\.compose|inherited|replace/i);
});
```

The first and third tests must fail against the current resolver because it replaces `compose`.

## Replace resolver merge algorithm

Do not patch only `const overlay`. Rewrite the merge section so every stage in `stageOverlayChain(stage)` is applied in sequence.

Use this structure:

```ts
import { stageOverlayChain, mergeStringMap, unionStable } from "./stageMerge.js";

export function resolveBuildStage(
  build: BuildJson,
  stage: Environment,
  sourceFile: string,
): EffectiveBuildConfig {
  const context = (
    configPath: string,
    value: unknown,
    reason: string,
    referencedObject?: string,
  ): ConfigError => new ConfigError({
    sourceFile,
    configPath,
    stage,
    composition: "service",
    value,
    ...(referencedObject ? { referencedObject } : {}),
    reason,
  });

  const appEnv = { ...(build.app.env ?? {}) };
  const appEndpoints: Record<string, any> = structuredClone(
    build.app.endpoints ?? {},
  );

  const dependencies: Record<string, any> = {};
  for (const [name, dep] of Object.entries(build.dependencies ?? {})) {
    dependencies[name] = {
      ...dep,
      env: { ...(dep.env ?? {}) },
      endpoints: structuredClone(dep.endpoints ?? {}),
      dependsOn: [...(dep.dependsOn ?? [])],
    };
  }

  const layers: EffectiveBuildLayer[] = [
    {
      stage: "base",
      appEnv: { ...(build.app.env ?? {}) },
    },
  ];

  for (const overlayStage of stageOverlayChain(stage)) {
    const overlay = build[overlayStage];
    if (!overlay) continue;

    if (overlay.app?.env) {
      Object.assign(appEnv, overlay.app.env);
    }

    for (const [name, endpoint] of Object.entries(
      overlay.app?.endpoints ?? {},
    )) {
      appEndpoints[name] = {
        ...(appEndpoints[name] ?? {}),
        ...endpoint,
      };
    }

    for (const [name, patch] of Object.entries(overlay.dependencies ?? {})) {
      const inherited = dependencies[name];

      if (inherited && patch.compose !== undefined) {
        throw context(
          `${overlayStage}.dependencies.${name}.compose`,
          patch.compose,
          "A stage cannot replace the Compose implementation of an inherited dependency",
          `dependencies.${name}`,
        );
      }

      const next = inherited ?? {
        compose: undefined,
        env: {},
        endpoints: {},
        dependsOn: [],
      };

      if (!inherited && patch.compose !== undefined) {
        next.compose = patch.compose;
      }

      next.env = mergeStringMap(next.env, patch.env);

      for (const [endpointName, endpointPatch] of Object.entries(
        patch.endpoints ?? {},
      )) {
        next.endpoints[endpointName] = {
          ...(next.endpoints[endpointName] ?? {}),
          ...endpointPatch,
        };
      }

      next.dependsOn = unionStable(next.dependsOn, patch.dependsOn);
      dependencies[name] = next;
    }

    layers.push({
      stage: overlayStage,
      appEnv: { ...(overlay.app?.env ?? {}) },
      ...(overlay["override-compose"]
        ? { overrideCompose: overlay["override-compose"] }
        : {}),
    });
  }

  const effective = {
    ...build,
    app: {
      env: appEnv,
      endpoints: appEndpoints,
    },
    dependencies,
    tester: build.tester
      ? { env: { ...(build.tester.env ?? {}) } }
      : undefined,
    layers,
  } as EffectiveBuildConfig;

  delete (effective as any).dev;
  delete (effective as any).prod;
  delete (effective as any).test;
  delete (effective as any).e2e;

  // Keep the existing effective validation block below this point.
  ...
}
```

### Important implementation details

1. `layers` includes only overlays that exist plus the base layer.
2. The base layer contains base `app.env` and no override.
3. For E2E, layer order is exactly:

```text
base
prod (if present)
e2e (if present)
```

4. A `prod` dependency added during E2E resolution exists before the `e2e` patch is processed. Therefore an `e2e` `compose` for that same dependency is correctly rejected.
5. Keep the existing final primary endpoint validation, dependency endpoint validation, lifecycle validation, unknown/inert/self/cycle validation.
6. Change no dependency endpoint/publication semantics here.

## Additional direct stage tests

In `tests/v2/stageResolution.test.ts`, add coverage that E2E inherits:

- a prod-only app endpoint;
- prod dependency env;
- a prod-only dependency;
- prod dependency `dependsOn` additions;
- and lets e2e scalar fields win where both set the same endpoint metadata/env value.

Use distinct sentinel keys so inheritance is proven rather than inferred from a shared final value.

---

# 4. Rewrite `resolveMeshStage()` using the same stage chain

## Current location

`src/core/config/resolveMeshStage.ts`, current lines 7–14.

## Required merge semantics

For a service already present:

- `path`: later defined scalar wins;
- `env`: keywise merge;
- `dependencies`: keywise merge, later provider wins for same logical slot;
- `dependsOn`: stable union;
- `publish`: stable union.

A stage-added service is created when first seen and must have a path by the time final validation runs.

## Concrete replacement structure

```ts
import { mergeStringMap, stageOverlayChain, unionStable } from "./stageMerge.js";

export function resolveMeshStage(
  mesh: MeshConfig,
  stage: MeshConfigStage,
  sourceFile: string,
): EffectiveMeshConfig {
  const services: Record<string, any> = {};

  for (const [name, service] of Object.entries(mesh.services)) {
    services[name] = {
      path: service.path,
      env: { ...(service.env ?? {}) },
      dependencies: { ...(service.dependencies ?? {}) },
      dependsOn: [...(service.dependsOn ?? [])],
      publish: [...(service.publish ?? [])],
    };
  }

  for (const overlayStage of stageOverlayChain(stage)) {
    for (const [name, patch] of Object.entries(
      mesh[overlayStage]?.services ?? {},
    )) {
      const prior = services[name] ?? {
        path: undefined,
        env: {},
        dependencies: {},
        dependsOn: [],
        publish: [],
      };

      services[name] = {
        path: patch.path ?? prior.path,
        env: mergeStringMap(prior.env, patch.env),
        dependencies: {
          ...(prior.dependencies ?? {}),
          ...(patch.dependencies ?? {}),
        },
        dependsOn: unionStable(prior.dependsOn, patch.dependsOn),
        publish: unionStable(prior.publish, patch.publish),
      };
    }
  }

  // Validate the final effective service set exactly as today.
  ...
}
```

Keep:

- effective path required;
- identifier/reserved-name validation;
- unknown/self/cyclic `dependsOn` validation;
- final graph validation.

## Tests to add/replace

### Replace `STG-021`

Use distinct keys:

```ts
it("STG-021 inherits mesh.prod before mesh.e2e", () => {
  const root = meshFixture({
    services: { api: { path: "api", env: { BASE: "yes" } } },
    prod: {
      services: {
        api: { env: { PROD: "yes", VALUE: "prod" } },
        prodOnly: { path: "prod-only" },
      },
    },
    e2e: {
      services: {
        api: { env: { E2E: "yes", VALUE: "e2e" } },
      },
    },
    tester: { compose: "t.yml", service: "runner" },
  }, {
    api: { app: {} },
    prodOnly: { app: {} },
  }, {
    "t.yml": { services: { runner: { image: "alpine" } } },
  });

  const result = compileMesh("e2e", root);
  expect(env(result.compose.services.api)).toMatchObject({
    BASE: "yes",
    PROD: "yes",
    E2E: "yes",
    VALUE: "e2e",
  });
  expect(result.compose.services).toHaveProperty("prodOnly");
});
```

Also test:

- prod provider binding inherited by e2e;
- e2e provider binding overrides the same prod logical dependency key;
- prod `dependsOn` plus e2e `dependsOn` union;
- prod `publish` plus e2e `publish` union;
- prod path override inherited when e2e does not replace it;
- prod-added service can be overlaid by e2e without repeating path.

---

# 5. Separate app execution mode from dotenv/config stage

## Edit `src/core/composition/types.ts`

Replace:

```ts
export interface ServiceExecutionProfile {
  configStage: Environment;
  appTarget: "dev" | "test" | "prod";
  runtimeStage: Environment;
  integrated: boolean;
  attachTester: boolean;
  testerTarget?: "test-e2e";
}
```

with:

```ts
export interface ServiceExecutionProfile {
  configStage: Environment;
  envStage: Environment;
  appTarget: "dev" | "test" | "prod";
  execMode: "dev" | "test" | "prod";
  infraMode: "isolated" | "integrated";
  attachTester: boolean;
  testerTarget?: "test-e2e";
}
```

Do not encode `integrated` as a boolean once the explicit `infraMode` is available; this prevents app execution state and infrastructure state from being conflated.

## Edit `getExecutionProfile()` in `compileServiceComposition.ts`

Replace with:

```ts
function getExecutionProfile(
  stage: Environment,
  full: boolean,
): ServiceExecutionProfile {
  switch (stage) {
    case "dev":
      return {
        configStage: "dev",
        envStage: "dev",
        appTarget: "dev",
        execMode: "dev",
        infraMode: full ? "integrated" : "isolated",
        attachTester: false,
      };

    case "prod":
      return {
        configStage: "prod",
        envStage: "prod",
        appTarget: "prod",
        execMode: "prod",
        infraMode: "integrated",
        attachTester: false,
      };

    case "test":
      return {
        configStage: "test",
        envStage: "test",
        appTarget: "test",
        execMode: "test",
        infraMode: "isolated",
        attachTester: false,
      };

    case "e2e":
      return {
        configStage: "e2e",
        envStage: "e2e",
        appTarget: "prod",
        execMode: "prod",
        infraMode: "integrated",
        attachTester: true,
        testerTarget: "test-e2e",
      };
  }
}
```

## Replace all uses

In `compileServiceComposition.ts`:

```diff
- profile.runtimeStage
+ profile.envStage       // only for .env.<stage>
```

and:

```diff
- EXEC_MODE: profile.runtimeStage
- INFRA_MODE: profile.integrated ? "integrated" : "isolated"
+ EXEC_MODE: profile.execMode
+ INFRA_MODE: profile.infraMode
```

and:

```diff
- if (profile.integrated)
+ if (profile.infraMode === "integrated")
```

The app `env_file` for E2E must remain `.env.e2e`, while its `EXEC_MODE` becomes `prod`.

## Red test

Before changing code:

```ts
it("runs E2E app as production code while using E2E dotenv/config", () => {
  const root = project({
    app: {},
    prod: { app: { env: { PROD_LAYER: "yes" } } },
    e2e: { app: { env: { E2E_LAYER: "yes" } } },
  });

  const app = compileServiceComposition("e2e", root).compose.services.app!;

  expect(app.build).toMatchObject({ target: "prod" });
  expect(app.env_file).toEqual([{ path: ".env.e2e", required: false }]);
  expect(app.environment).toMatchObject({
    EXEC_MODE: "prod",
    INFRA_MODE: "integrated",
    PROD_LAYER: "yes",
    E2E_LAYER: "yes",
  });
});
```

Current code must fail on `EXEC_MODE` and `PROD_LAYER`.

---

# 6. Replace single app-environment outputs with ordered environment layers

## Edit `src/core/composition/types.ts`

Add:

```ts
export type AppEnvironmentLayer =
  | {
      kind: "build-json";
      stage: "base" | Environment;
      configPath: string;
      values: Record<string, string>;
    }
  | {
      kind: "override-compose";
      stage: Environment;
      sourceFile: string;
      configPath: string;
      values: ComposeEnvironmentMap;
    };
```

Then replace these fields in `CompiledServiceComposition`:

```ts
buildJsonAppEnvironment?: Record<string, string>;
overrideComposeAppEnvironment?: ComposeEnvironmentMap;
```

with:

```ts
appEnvironmentLayers: AppEnvironmentLayer[];
```

Keep:

```ts
builderInternalEnvironment?: Record<string, string>;
externalAppEnvironment?: Record<string, string>;
dependencyEnvironments?: Record<string, Record<string, string>>;
```

`externalAppEnvironment` is mesh service env and is intentionally a later layer.

---

# 7. Compile every inherited override Compose in stage order

## Current problem

`compileServiceComposition()` currently has one block:

```ts
if (effective.overrideCompose) {
  ...
}
```

It must become an ordered loop over `effective.layers`.

## Refactor strategy

### 7.1 Keep the final effective app/dependency structures

Continue using `effective.app.endpoints` and `effective.dependencies` for:

- endpoint validation;
- endpoint resolution;
- dependency materialization;
- lifecycle;
- publication capability;
- primary `PORT`.

### 7.2 Build `appEnvironmentLayers`

Immediately after endpoint registry setup:

```ts
const appEnvironmentLayers: AppEnvironmentLayer[] = [];

for (const layer of effective.layers) {
  if (Object.keys(layer.appEnv).length > 0) {
    appEnvironmentLayers.push({
      kind: "build-json",
      stage: layer.stage,
      configPath:
        layer.stage === "base"
          ? "app.env"
          : `${layer.stage}.app.env`,
      values: { ...layer.appEnv },
    });
  }
}
```

Do not resolve Builder endpoint references yet when `deferReferenceResolution` is true.

### 7.3 Apply override documents inside the same layer loop

Factor the existing singular override logic into a local function or private helper, e.g.:

```ts
function applyOverrideComposeLayer(
  layer: EffectiveBuildLayer,
  ...
): void
```

For every `layer.overrideCompose`:

1. resolve path relative to service root;
2. load YAML;
3. rebase app override paths;
4. validate with `validateAndPrepareAppOverride()` using the **originating layer stage**;
5. merge namespaced resources;
6. capture normalized `services.app.environment` into `appEnvironmentLayers` immediately after that stage's JSON layer;
7. merge permitted non-environment app service properties into the current app;
8. keep Builder-owned build context, Dockerfile and target authoritative;
9. keep Builder-owned `env_file` authoritative;
10. keep Builder-owned lifecycle `depends_on` authoritative.

### 7.4 Environment must not be merged by the generic service spread

Before generic service merge:

```ts
const preparedApp = { ...prepared.app };
delete preparedApp.environment;
delete preparedApp.build;
```

Then merge:

```ts
const merged: ComposeService = {
  ...app,
  ...preparedApp,
};
```

Environment is assembled later exclusively from ordered layers. This prevents accidental double application.

### 7.5 Build args behavior across two override files

Use a deterministic helper:

```ts
function mergeBuildArgs(
  current: unknown,
  incoming: unknown,
): unknown {
  if (
    current && typeof current === "object" && !Array.isArray(current) &&
    incoming && typeof incoming === "object" && !Array.isArray(incoming)
  ) {
    return { ...(current as object), ...(incoming as object) };
  }
  return incoming;
}
```

For each override:

```ts
if (overrideBuild.args !== undefined) {
  appBuild.args = mergeBuildArgs(appBuild.args, overrideBuild.args);
}
```

Object-form args therefore merge keywise in file order; list/scalar-compatible representations use later-file replacement. `context`, Dockerfile and target remain Builder-owned.

### 7.6 Network/resource behavior

Keep the existing resource namespace identity containing the originating stage:

```ts
["service", resourceNamespace, "override", layer.stage, kind, name]
```

This allows both prod and e2e overrides to define same logical resource names without generated-name collisions.

For app network membership, union normalized networks from prior app state and each override rather than discarding prior override networks.

---

# 8. Assemble standalone app environment in exact order

## Add helper inside `compileServiceComposition.ts` or a focused module

Use:

```ts
function resolveStandaloneAppEnvironmentLayers(
  layers: AppEnvironmentLayer[],
  registry: (ref: ParsedBuilderReference) => string,
): ComposeEnvironmentMap {
  const result: ComposeEnvironmentMap = {};

  for (const layer of layers) {
    if (layer.kind === "build-json") {
      Object.assign(
        result,
        resolveEnv(layer.values, registry, layer.configPath),
      );
    } else {
      Object.assign(result, layer.values);
    }
  }

  return result;
}
```

If reference resolution is deferred for mesh compilation, do not call this helper; retain raw layers in the returned fragment.

## Final standalone environment

After all override layers are collected:

```ts
const layeredAppEnv = options.deferReferenceResolution
  ? {}
  : resolveStandaloneAppEnvironmentLayers(appEnvironmentLayers, registry);

app.environment = {
  ...layeredAppEnv,
  ...escapedExternalAppEnv,
  ...internal,
};
```

For standalone execution, `externalAppEnv` should normally be empty.

## Required E2E precedence test

Create a fixture where the **same key** changes at every structured layer:

```text
base app.env                 VALUE=base-json
prod app.env                 VALUE=prod-json
prod override env            VALUE=prod-override
e2e app.env                  VALUE=e2e-json
e2e override env             VALUE=e2e-override
```

Expected final `VALUE`:

```text
e2e-override
```

Also use distinct sentinels at each layer so the test proves all layers participated.

Then create a second fixture where e2e override omits `VALUE`; expected final is `e2e-json`, proving the prod override does **not** incorrectly beat later E2E JSON.

This second case is critical; a naive final-map implementation can pass the first case while still being wrong.

---

# 9. Assemble mesh app environment from ordered service layers, then mesh env

## Current location

`src/core/mesh/v2/compileMeshComposition.ts`, current environment section beginning with:

```ts
const buildEnv = resolveServiceBuildEnvThroughMesh(
  name,
  fragment.buildJsonAppEnvironment ?? {},
  ...
);
...
app.environment = {
  ...buildEnv,
  ...(fragment.overrideComposeAppEnvironment ?? {}),
  ...meshEnv,
  ...(fragment.builderInternalEnvironment ?? {}),
};
```

Replace this single-map logic.

## Add a local resolver

```ts
function resolveMeshAppEnvironmentLayers(
  serviceName: string,
  layers: AppEnvironmentLayer[],
  context: MeshReferenceContext,
): ComposeEnvironmentMap {
  const result: ComposeEnvironmentMap = {};

  for (const layer of layers) {
    if (layer.kind === "build-json") {
      Object.assign(
        result,
        resolveServiceBuildEnvThroughMesh(
          serviceName,
          layer.values,
          context,
          `services.${serviceName}.${layer.configPath}`,
        ),
      );
    } else {
      Object.assign(result, layer.values);
    }
  }

  return result;
}
```

Then:

```ts
const serviceOwnedEnv = resolveMeshAppEnvironmentLayers(
  name,
  fragment.appEnvironmentLayers,
  refContext,
);

const meshEnv = resolveMeshEnvMap(
  fragment.externalAppEnvironment ?? {},
  refContext,
  `services.${name}.env`,
);

app.environment = {
  ...serviceOwnedEnv,
  ...meshEnv,
  ...(fragment.builderInternalEnvironment ?? {}),
};
```

Because `resolveMeshStage()` already resolves base -> prod -> e2e mesh env keywise, applying its final `svc.meshEnv` after all service-owned layers gives the required global E2E result:

```text
service layers
-> base mesh env
-> prod mesh env
-> e2e mesh env
-> internal
```

No separate mesh-env layer array is required for correctness because no override-Compose layer interleaves between mesh env stages.

---

# 10. Update test-stage/checker consumers of the changed fragment shape

Two current consumers directly read `buildJsonAppEnvironment` and `overrideComposeAppEnvironment`:

```text
src/core/mesh/runners/runMeshTestUnit.ts
src/core/mesh/checkers/checkMeshServices.ts
```

They must use the same ordered-layer resolution helper as mesh compilation.

Do **not** duplicate the loop three times. Export the layer resolver from a focused module if necessary, e.g.:

```text
src/core/mesh/v2/resolveMeshAppEnvironment.ts
```

If you add that file, its API should be:

```ts
export function resolveMeshAppEnvironmentLayers(
  serviceName: string,
  layers: AppEnvironmentLayer[],
  context: MeshReferenceContext,
): ComposeEnvironmentMap;
```

Use it from:

- `compileMeshComposition.ts`;
- `runMeshTestUnit.ts`;
- `checkMeshServices.ts`.

This keeps explicit `mesh up test-unit` validation behavior consistent with dev/prod/e2e composition.

---

# 11. Preserve exact dotenv behavior

Do not merge `.env.prod` into `.env.e2e`.

In `compileServiceComposition.ts`, set app `env_file` using only `profile.envStage`:

```ts
const appEnvFile = `.env.${profile.envStage}`;

app.env_file = [{
  path: options.meshMode
    ? path.posix.join(serviceContext, appEnvFile)
    : appEnvFile,
  required: false,
}];
```

For E2E this remains `.env.e2e` even though `execMode` is `prod`.

Add tests that create both `.env.prod` and `.env.e2e` and verify Compose uses only `.env.e2e` for the E2E app.

---

# 12. Validate Builder-owned app keys per layer

The existing `ownEnv(effective, stage)` validates only the final merged `effective.app.env`, which loses the source layer.

Refactor now so the later diagnostics work in Plan 03 is straightforward.

## Add reusable helper in Plan 02's new `builderEnvironment.ts`

If Plan 02 has not started yet, it is acceptable to add this file now:

```text
src/core/config/builderEnvironment.ts
```

API:

```ts
export const APP_BUILDER_KEYS = ["EXEC_MODE", "INFRA_MODE"] as const;

export function assertNoBuilderOwnedAppEnv(
  env: Record<string, unknown>,
  context: {
    sourceFile: string;
    configPath: string;
    stage: string;
    composition: "service" | "mesh";
    ownsPort: boolean;
  },
): void {
  const keys = [
    "EXEC_MODE",
    "INFRA_MODE",
    ...(context.ownsPort ? ["PORT"] : []),
  ];

  for (const key of keys) {
    if (key in env) {
      throw new ConfigError({
        sourceFile: context.sourceFile,
        configPath: `${context.configPath}.${key}`,
        stage: context.stage,
        composition: context.composition,
        value: env[key],
        reason: "User-controlled environment cannot set a Builder-owned application key",
      });
    }
  }
}
```

Call it for each JSON app layer before compiling values:

```text
app.env
prod.app.env
e2e.app.env
```

Continue using `validateAndPrepareAppOverride()` for override environment ownership, but extend its PORT check as today.

Continue scanning `.env.<envStage>` for Builder-owned keys.

Mesh service env remains validated in mesh compilation/checker.

---

# 13. Enforce at least one root mesh service

## Red tests

### Runtime schema

In `tests/conformance/01-config.test.ts` or `tests/v2/meshSchema.test.ts`:

```ts
it("rejects an empty root services map even when a stage adds a service", () => {
  const result = meshSchema.safeParse({
    services: {},
    e2e: {
      services: {
        fake: { path: "./fake" },
      },
    },
  });

  expect(result.success).toBe(false);
});
```

This must fail against current code because the schema accepts `{ services: {} }`.

### Generated schema

In `tests/v2/generatedSchemas.test.ts`:

```ts
it("requires at least one root mesh service in generated JSON Schema", () => {
  const schema = read("mesh-schema.json").definitions.MeshJsonV2;
  expect(schema.properties.services.minProperties).toBe(1);
});
```

## Runtime schema change

Edit `src/core/mesh/meshSchema.ts`:

```ts
const rootServicesSchema = z
  .record(serviceNameSchema, meshServiceSchema)
  .refine(
    services => Object.keys(services).length >= 1,
    { message: "must contain at least one root service" },
  );
```

Then:

```diff
- services: z.record(serviceNameSchema, meshServiceSchema),
+ services: rootServicesSchema,
```

Do not apply the refinement to `meshStageSchema.services`.

## Generated schema change

`zod-to-json-schema` does not reliably serialize the record-count refinement. In `scripts/generate-schemas.ts`, after:

```ts
const root = (meshJsonSchema as any).definitions.MeshJsonV2;
```

add:

```ts
root.properties.services.minProperties = 1;
```

Then regenerate:

```bash
pnpm build:schemas
```

Never hand-edit `schemas/mesh-schema.json` without changing the generator.

---

# 14. Required conformance-test rewrites in this plan

## `tests/conformance/03-stages.test.ts`

Make these exact semantic changes:

### STG-009

Old: dependency Compose replacement succeeds.

New: inherited dependency Compose replacement fails.

### STG-018

Old expected:

```ts
EXEC_MODE: "e2e"
```

New expected:

```ts
EXEC_MODE: "prod",
INFRA_MODE: "integrated"
```

Also assert both prod-only and e2e-only structured env sentinels exist.

### STG-020

Rename from:

```text
excludes prod.app.env from E2E
```

to:

```text
inherits prod.app.env before e2e.app.env
```

Use:

```ts
expect(appEnv).toMatchObject({ BASE: "yes", PROD: "yes", E2E: "yes" });
```

and a collision key proving e2e wins.

### STG-021

Rename from excluding mesh prod to inheriting mesh prod before e2e.

### Add new IDs after existing catalog IDs

Add explicit cases for:

- prod override + e2e override both participate;
- e2e app JSON beats prod override for same key;
- e2e override beats e2e app JSON for same key;
- prod-added dependency inherited by e2e;
- e2e cannot replace prod-added dependency compose;
- prod-added mesh service inherited by e2e;
- prod binding inherited and e2e same-key binding replacement wins;
- prod/e2e `dependsOn` and `publish` stable unions.

If `catalog-coverage.test.ts` requires catalog IDs to be declared elsewhere, update that catalog in the same commit.

## `tests/conformance/06-service.test.ts`

Update:

- `SVC-005` app `EXEC_MODE` -> `prod`;
- `SVC-025` to prove prod config **is inherited** by E2E, including prod-only dependency materialization.

## `tests/conformance/09-mesh-env.test.ts`

Update:

- E2E app runtime -> `EXEC_MODE=prod`;
- prod mesh env must be present in E2E;
- add one full precedence case with base/prod/e2e service JSON, prod/e2e override Compose, base/prod/e2e mesh env, and Builder internal value protection.

## Unit/regression tests

Update:

```text
tests/v2/compileServiceComposition.test.ts
tests/compileEnvironment.test.ts
tests/docker-acceptance/env-roundtrip.test.ts
tests/conformance/05-lifecycle.test.ts
```

Search rather than relying only on this list:

```bash
rg -n 'EXEC_MODE.*e2e|ONLY_PROD.*Undefined|excludes prod|does not inherit prod' tests
```

Every application expectation must move to the final model.

---

# 15. Tests specifically proving env precedence rather than only final merging

Add a table-driven unit test in `tests/conformance/09-mesh-env.test.ts` or a new focused V2 test.

Construct these values:

| Layer | `VALUE` | Unique sentinel |
|---|---|---|
| `.env.e2e` | `dotenv` | `DOTENV_ONLY=yes` |
| base app.env | `base-json` | `BASE_JSON=yes` |
| prod app.env | `prod-json` | `PROD_JSON=yes` |
| prod override | `prod-override` | `PROD_OVERRIDE=yes` |
| e2e app.env | `e2e-json` | `E2E_JSON=yes` |
| e2e override | `e2e-override` | `E2E_OVERRIDE=yes` |
| mesh base env | `mesh-base` | `MESH_BASE=yes` |
| mesh prod env | `mesh-prod` | `MESH_PROD=yes` |
| mesh e2e env | `mesh-e2e` | `MESH_E2E=yes` |

For global E2E expected final:

```ts
VALUE === "mesh-e2e"
```

and every unique sentinel exists.

Then remove `VALUE` from mesh layers and prove `e2e-override` wins.

Then remove `VALUE` from e2e override and prove `e2e-json` wins over `prod-override`.

This three-case pattern prevents an incorrectly flattened implementation from passing.

For standalone service E2E, expected same service-owned sequence but no mesh sentinels.

---

# 16. Verification commands for Plan 01

Run narrow tests after each red/green cycle:

```bash
pnpm vitest run tests/v2/stageResolution.test.ts
pnpm vitest run tests/conformance/03-stages.test.ts
pnpm vitest run tests/v2/compileServiceComposition.test.ts
pnpm vitest run tests/conformance/06-service.test.ts
pnpm vitest run tests/conformance/09-mesh-env.test.ts
pnpm vitest run tests/v2/generatedSchemas.test.ts
```

Then:

```bash
pnpm typecheck
pnpm test:conformance
```

Only proceed to Plan 02 if:

- all E2E inheritance tests are green;
- no application expects `EXEC_MODE=e2e`;
- dependency Compose replacement is rejected;
- both override layers are proven in order;
- generated mesh schema has root `minProperties: 1`.

---

# 17. Plan 01 completion checklist

- [ ] one shared `stageOverlayChain()` exists;
- [ ] build E2E resolves base -> prod -> e2e;
- [ ] mesh E2E resolves base -> prod -> e2e;
- [ ] `EffectiveBuildConfig.layers` preserves base/prod/e2e app-env and override source order;
- [ ] singular `overrideCompose` removed from effective config;
- [ ] `CompiledServiceComposition` exposes ordered `appEnvironmentLayers`;
- [ ] standalone and mesh compilers resolve those layers in the same normative order;
- [ ] E2E app uses `appTarget=prod`, `execMode=prod`, `envStage=e2e`, `infraMode=integrated`;
- [ ] `.env.prod` is not loaded into E2E;
- [ ] prod override and e2e override both participate;
- [ ] e2e JSON env correctly beats prod override if e2e override does not set the key;
- [ ] inherited dependency `compose` replacement fails;
- [ ] stage-added dependency `compose` remains allowed;
- [ ] root mesh `services` minimum enforced by runtime and generated schema;
- [ ] `runMeshTestUnit` and `checkMeshServices` compile after the fragment API change;
- [ ] targeted V2/conformance tests and typecheck pass.
