# Step 2: Stage Merging, Mesh Extends, and Provenance Tracking

This document details the second phase of implementing first-class `buildArgs`: stage overlay merging, E2E inheritance chains, mesh extends composition, and diagnostic origin tracking.

---

## 1. Standalone Stage Overlay Merging

### 1.1 Provenance Tracking in [`src/core/config/resolveBuildStage.ts`](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/src/core/config/resolveBuildStage.ts)

Builder must track the exact declaration file and JSON path of every surviving build-arg key so that downstream diagnostics report the correct authoring location.

Update `resolveBuildStage`:

```typescript
export function resolveBuildStage(build: BuildJson, stage: Environment, sourceFile: string): EffectiveBuildConfig {
  const services = structuredClone(build.services) as unknown as Record<string, Record<string, unknown>>;
  const origins = new Map<string, Origin>();
  const envOrigins = new Map<string, Map<string, Origin>>();
  const buildArgsOrigins = new Map<string, Map<string, Origin>>(); // NEW
  const requisiteOrigins = new Map<string, Map<string, Origin>>();
  const layers: EffectiveBuildConfig["layers"] = [];
  const deletedRequisiteTargets: { target: string; path: string }[] = [];

  const record = (name: string, entry: Record<string, unknown>, layer: "base" | Environment) => {
    const where = layer === "base" ? `services.${name}` : `${layer}.services.${name}`;
    const origin = originFor(sourceFile, where, layer);
    origins.set(name, origin);

    // Track env origins
    const env = envOrigins.get(name) ?? new Map<string, Origin>();
    for (const key of Object.keys((entry.env as Record<string, string>) ?? {})) {
      env.set(key, originFor(sourceFile, `${where}.env.${key}`, layer));
    }
    envOrigins.set(name, env);

    // Track buildArgs origins (NEW)
    const args = buildArgsOrigins.get(name) ?? new Map<string, Origin>();
    for (const key of Object.keys((entry.buildArgs as Record<string, string>) ?? {})) {
      args.set(key, originFor(sourceFile, `${where}.buildArgs.${key}`, layer));
    }
    buildArgsOrigins.set(name, args);

    // Track requisite origins...
  };

  for (const [name, value] of Object.entries(services).sort(([a], [b]) => a.localeCompare(b))) {
    record(name, value, "base");
  }
  layers.push({ stage: "base", services: structuredClone(services), origin: originFor(sourceFile, "services", "base") });

  for (const overlayStage of stageOverlayChain(stage)) {
    const patches = (build[overlayStage]?.services ?? {}) as Record<string, Record<string, unknown>>;
    for (const [name, patch] of Object.entries(patches).sort(([a], [b]) => a.localeCompare(b))) {
      const current = services[name];
      const where = `${overlayStage}.services.${name}`;
      if (!current && (name === "main" || name === "tester")) fail(sourceFile, stage, where, "Required special service is missing from base");
      // ... validations ...
      services[name] = current ? applyServiceOverlay(current, patch) : structuredClone(patch);
      record(name, patch, overlayStage);
    }
    layers.push({ stage: overlayStage, services: structuredClone(patches), origin: originFor(sourceFile, `${overlayStage}.services`, overlayStage) });
  }

  // Ensure defaults on services.main:
  for (const [name, value] of Object.entries(services)) {
    // ...
    value.env ??= {};
    if (name === "main") {
      value.buildArgs ??= {}; // NEW
    }
    value.endpoints ??= {};
    value.requisites ??= {};
    value.kind = name === "main" ? "main" : "ordinary";
  }

  return {
    name: build.name,
    services: services as unknown as Record<string, EffectiveService | TesterService>,
    layers,
    origins,
    envOrigins,
    buildArgsOrigins, // NEW
    requisiteOrigins,
    sourceFile,
    projectDir: path.dirname(sourceFile)
  };
}
```

### 1.2 Object Merging & E2E Structured Inheritance

Because `mergeEffectiveObject` in [`src/core/config/stageMerge.ts`](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/src/core/config/stageMerge.ts) recursively merges nested plain objects, `buildArgs` naturally benefits from key-level merging:
- Stage keys overwrite base keys with the same name.
- Non-overwritten base keys are preserved.
- In `stage === "e2e"`, `stageOverlayChain("e2e")` evaluates `["prod", "e2e"]`. Thus:
  ```text
  base.buildArgs -> prod.buildArgs -> e2e.buildArgs
  ```
  `prod` patches `base`, and `e2e` patches the result of `prod`, achieving exact spec compliance (§9.4).

---

## 2. Mesh Extends Resolution

### 2.1 Applying Mesh `extends.main.buildArgs` in [`src/core/mesh/applyMeshExtends.ts`](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/src/core/mesh/applyMeshExtends.ts)

When mesh extends layers are applied to imported services:
1. `applyServiceOverlay` merges `patch.buildArgs` into `build.services[name].buildArgs`.
2. `build.buildArgsOrigins` records mesh-authored keys with `scope: "mesh"`. This scope tag is essential because in mesh composition, mesh-authored build arguments take precedence over source `override-compose` build arguments!

Update `applyMeshExtends`:

```typescript
export function applyMeshExtends(mesh: EffectiveMeshConfig, builds: Map<string, EffectiveBuildConfig>, stage: string): void {
  for (const [root, build] of builds) {
    const entry = mesh.services[root]!;
    for (const layer of entry.extendsLayers) {
      for (const [name, patch] of Object.entries(layer.patches).sort(([a], [b]) => a.localeCompare(b))) {
        const old = build.services[name];
        const origin: Origin = { ...layer.origin, meshRoot: root, configPath: `${layer.origin.configPath}.${name}` };
        // ... validations ...

        const canonicalPatch = structuredClone(patch);
        // ... requisite rewrites ...

        const merged = applyServiceOverlay(old as EffectiveService & Record<string, unknown>, canonicalPatch) as EffectiveService;
        build.services[name] = merged;

        // Record env origins...
        const env = build.envOrigins.get(name) ?? new Map<string, Origin>();
        for (const key of Object.keys((patch.env as Record<string, string>) ?? {})) {
          env.set(key, { ...origin, configPath: `${origin.configPath}.env.${key}` });
        }
        build.envOrigins.set(name, env);

        // Record buildArgs origins (NEW)
        const args = build.buildArgsOrigins.get(name) ?? new Map<string, Origin>();
        for (const key of Object.keys((patch.buildArgs as Record<string, string>) ?? {})) {
          args.set(key, { ...origin, configPath: `${origin.configPath}.buildArgs.${key}` });
        }
        build.buildArgsOrigins.set(name, args);

        // Record requisite origins...
        // ...
      }
    }
  }
}
```

### 2.2 Mesh Stage Inheritance

In `resolveMeshStage.ts`, `meshStageOverlayChain("e2e")` returns `["prod", "e2e"]`.
Thus, in mesh E2E:
```text
mesh base -> mesh prod -> mesh e2e
```
All layers are appended into `extendsLayers` in order, and `applyMeshExtends` applies them sequentially, guaranteeing that `mesh e2e` overrides `mesh prod`, which in turn overrides `mesh base`.

---

## 3. Merge Test Specifications (`BAR10` – `BAR11`)

Add targeted unit tests in `tests/v3/buildArgs.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import path from "node:path";
import { resolveBuildStage } from "../../src/core/config/resolveBuildStage.js";
import type { BuildJson } from "../../src/types/index.js";

describe("V3.1.0 buildArgs stage merging & inheritance", () => {
  const dummyFile = path.resolve("test-build.json");

  it("[BAR10] merges buildArgs keys across base and stage overlays", () => {
    const build: BuildJson = {
      name: "merge-test",
      services: {
        main: {
          buildArgs: {
            BASE: "base-val",
            OVERRIDDEN: "base-val"
          }
        },
        tester: { compose: "t.yml", service: "t" }
      },
      dev: {
        services: {
          main: {
            buildArgs: {
              OVERRIDDEN: "dev-val",
              NEW_IN_DEV: "dev-new"
            }
          }
        }
      }
    };

    const resolved = resolveBuildStage(build, "dev", dummyFile);
    const main = resolved.services.main as any;
    expect(main.buildArgs).toEqual({
      BASE: "base-val",
      OVERRIDDEN: "dev-val",
      NEW_IN_DEV: "dev-new"
    });

    // Check origin tracking
    const mainOrigins = resolved.buildArgsOrigins.get("main")!;
    expect(mainOrigins.get("BASE")?.configPath).toBe("services.main.buildArgs.BASE");
    expect(mainOrigins.get("OVERRIDDEN")?.configPath).toBe("dev.services.main.buildArgs.OVERRIDDEN");
    expect(mainOrigins.get("NEW_IN_DEV")?.configPath).toBe("dev.services.main.buildArgs.NEW_IN_DEV");
  });

  it("[BAR11] E2E inherits prod structured buildArgs before e2e (base -> prod -> e2e)", () => {
    const build: BuildJson = {
      name: "e2e-inheritance-test",
      services: {
        main: {
          buildArgs: {
            LEVEL: "base",
            PRESERVED: "from-base"
          }
        },
        tester: { compose: "t.yml", service: "t" }
      },
      prod: {
        services: {
          main: {
            buildArgs: {
              LEVEL: "prod",
              PROD_FLAG: "true"
            }
          }
        }
      },
      e2e: {
        services: {
          main: {
            buildArgs: {
              LEVEL: "e2e"
            }
          }
        }
      }
    };

    const resolved = resolveBuildStage(build, "e2e", dummyFile);
    const main = resolved.services.main as any;
    expect(main.buildArgs).toEqual({
      LEVEL: "e2e",           // overridden by e2e
      PROD_FLAG: "true",      // inherited from prod
      PRESERVED: "from-base"  // inherited from base
    });

    const mainOrigins = resolved.buildArgsOrigins.get("main")!;
    expect(mainOrigins.get("LEVEL")?.configPath).toBe("e2e.services.main.buildArgs.LEVEL");
    expect(mainOrigins.get("PROD_FLAG")?.configPath).toBe("prod.services.main.buildArgs.PROD_FLAG");
    expect(mainOrigins.get("PRESERVED")?.configPath).toBe("services.main.buildArgs.PRESERVED");
  });
});
```
