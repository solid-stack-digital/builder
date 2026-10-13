# 01 — Configuration guards, types, and generated schemas

Paths are repository-relative. Snippets are proposed implementation, not changes already made.

## C01 — Reject the legacy root field everywhere configuration enters the system

- **Change:** Remove `test` from `meshSchema`; add a dedicated root-field guard; call it in `getMeshJson` immediately after JSON parsing and at the start of `resolveMeshStage` for direct in-memory callers.
- **Why:** The user explicitly requires an error. Removing execution alone would leave an accepted, misleading configuration namespace. `.strict()` alone produces generic diagnostics and does not protect direct resolver calls.
- **Current behavior:** `meshSchema` accepts `{test:{}}` and populated overlays. The loader returns them. Resolving `prod` silently disregards `test`, while resolving `test` applies it. `--skip-checks` bypasses preflight but still loads this accepted config.
- **Expected behavior:** The existence of an own root property `test` throws `ConfigError` with `sourceFile`, `configPath: "test"`, `composition: "mesh"`, and a migration explanation. No field is stripped, ignored, renamed, or translated. Inactive `test` is still invalid.
- **Failing-before test:** T01 in document 03: loading an otherwise valid fixture with `test: {}` must throw `ConfigError`; current source returns normally. T02 checks direct resolution of a valid `prod` composition containing legacy `test`; current source silently succeeds. T03 checks `meshSchema.safeParse(...).success === false`; currently true for valid object overlays.

### Files and exact edit points

1. New `src/core/config/meshStageContract.ts`: shared diagnostic and guards (also used by C02).
2. `src/core/mesh/meshSchema.ts`: delete only `test: meshStageSchema.optional()` from the root strict object. Keep stage and service `.strict()` and all nested validation.
3. `src/core/mesh/getMeshJson.ts`: call the guard after successful `JSON.parse` and before `meshSchema.safeParse`.
4. `src/core/config/resolveMeshStage.ts`: call the guard before inspecting `mesh.services`; the narrower TypeScript type does not protect JavaScript or `as any` callers.

Proposed new module:

```ts
import { ConfigError } from "../../errors/ConfigError.js";
import {
  MESH_CONFIG_STAGES,
  type MeshConfigStage,
} from "../mesh/types.js";

export const REMOVED_MESH_TEST_MESSAGE =
  "mesh.json.test is no longer supported. A mesh has no test topology. " +
  "Put service-owned isolated test settings in build.json.test; " +
  "put global E2E topology settings in mesh.json.e2e. " +
  "The mesh test command runs independent service tests, then global E2E.";

export function assertNoLegacyMeshTest(
  input: unknown,
  sourceFile: string,
): void {
  if (
    input !== null &&
    typeof input === "object" &&
    !Array.isArray(input) &&
    Object.prototype.hasOwnProperty.call(input, "test")
  ) {
    throw new ConfigError({
      sourceFile,
      configPath: "test",
      composition: "mesh",
      reason: REMOVED_MESH_TEST_MESSAGE,
    });
  }
}

export function assertMeshConfigStage(
  stage: unknown,
  sourceFile: string,
): asserts stage is MeshConfigStage {
  if (
    typeof stage !== "string" ||
    !(MESH_CONFIG_STAGES as readonly string[]).includes(stage)
  ) {
    throw new ConfigError({
      sourceFile,
      configPath: "<stage>",
      composition: "mesh",
      reason:
        "Unsupported mesh configuration stage. Supported stages: dev, prod, e2e. " +
        "test is a pipeline command, not a mesh configuration stage.",
    });
  }
}

export function meshStageOverlayChain(
  stage: MeshConfigStage,
): readonly MeshConfigStage[] {
  return stage === "e2e" ? ["prod", "e2e"] : [stage];
}
```

The legacy-field guard deliberately does not attach `value: input.test`: `ConfigError` serializes values, which could expose credentials in old env maps. Do not include raw config in the error cause or log it separately. Presence-based detection covers `null`, `false`, `0`, `""`, `[]`, `{}`, populated objects, and an own `undefined` value for in-memory calls. JSON cannot encode `undefined`; test that case directly, not through `JSON.stringify`.

Loader placement:

```ts
// Keep existing read/JSON parse error handling.
let parsed: unknown;
try {
  parsed = JSON.parse(content);
} catch (err: unknown) {
  throw new ScriptError(
    `Failed to parse mesh.json at ${meshPath}: ${errorMessage(err)}`,
  );
}
assertNoLegacyMeshTest(parsed, meshPath);
const result = meshSchema.safeParse(parsed);
// Preserve the existing schema failure branch and successful return.
```

Do not place the guard inside the JSON parse `try`: that would catch `ConfigError` and incorrectly relabel it a syntax error.

Schema API contract: exported `meshSchema.parse` throws Zod's validation error and `safeParse` returns `success: false`; this is intentional. File loading and direct resolver entry points provide the richer `ConfigError`. Keep the schema a strict Zod object instead of wrapping it in effects solely to change the message: schema generation currently depends on its serializable shape.

### Validation entry points to cover

| Entry | Required outcome |
|---|---|
| `getMeshJson(root)` | Targeted field error before referenced service directories are touched |
| `checkMesh(root)` | Same field error before `checkInfra` or tester validation |
| `compileMeshComposition("dev"/"prod"/"e2e", root)` | Same error; no allocated ports/cache or service loading |
| `compileMeshEnvironment(...)` | Same error before Docker Compose validation |
| `runMeshServiceTests(...)` / `runMeshTest(...)` | Same error before any standalone service lifecycle |
| `runMeshTestE2e(...)` | Same error before missing-tester or runtime work |
| `handleMeshUp(stage, {skipChecks:true})` for supported commands | Same error; skipping checks never means skipping config validation |
| `resolveMeshStage(raw, "prod", file)` | Reject even without loader/schema invocation |
| `meshSchema.parse` / generated schema | Reject root field as an additional property |

Cleanup is deliberately different: `down` must remain able to recover saved resources when current configuration is invalid. Catching a configuration error only to recover by saved project identity is not acceptance of `mesh.test` as runnable configuration. Document this recovery-only exception; do not require `down` to strand resources by propagating the field error.

## C02 — Separate mesh configuration stages from service stages and command names

- **Change:** Narrow `MeshConfig` and `MeshConfigStage`; remove the obsolete field from effective mesh type omissions; use the mesh-only inheritance chain and runtime guard.
- **Why:** Shared build-stage enumeration currently lets a mesh resolve `test`. TypeScript must make accidental reintroduction a compile error, and runtime must reject untyped calls clearly.
- **Current behavior:** `MeshConfigStage` includes four values, `MeshConfig.test` is optional, and `resolveMeshStage` calls shared `stageOverlayChain` whose return type includes service `test`.
- **Expected behavior:** Exactly three mesh stages at type and runtime boundaries. Build stage resolution retains all four values. E2E still merges base, prod, e2e in order; stable unions and lifecycle checks remain unchanged.
- **Failing-before test:** T04: `resolveMeshStage({services:{api:{path:"api"}}}, "test" as any, "mesh.json")` must throw a `ConfigError` explaining pipeline versus config stage; current code succeeds. T05: compile-time `@ts-expect-error` assignments for `MeshConfigStage = "test"` and `MeshConfig.test` must be consumed; currently the directives are unused and typecheck fails.

Proposed declarations in `src/core/mesh/types.ts`:

```ts
export interface MeshConfig {
  $schema?: string;
  name?: string;
  tester?: MeshTesterConfig;
  services: Record<string, MeshServiceConfig>;
  dev?: MeshStageConfig;
  prod?: MeshStageConfig;
  e2e?: MeshStageConfig;
}
export const MESH_CONFIG_STAGES = ["dev", "prod", "e2e"] as const;
export type MeshConfigStage = (typeof MESH_CONFIG_STAGES)[number];
export type MeshCompositionStage = MeshConfigStage;
export const MESH_COMMAND_STAGES = ["dev", "prod", "test", "test-e2e"] as const;
export type MeshCommandStage = (typeof MESH_COMMAND_STAGES)[number];
```

Retain the other service/tester interfaces and options in that file. In `src/core/config/types.ts`, change only the effective mesh omission to:

```ts
export interface EffectiveMeshConfig
  extends Omit<MeshConfig, "dev" | "prod" | "e2e" | "services"> {
  // Keep the existing normalized services member unchanged.
}
```

`resolveMeshStage` entry and iteration:

```ts
assertNoLegacyMeshTest(mesh, sourceFile);
assertMeshConfigStage(stage, sourceFile);
// Existing root checks and base cloning follow.
for (const overlayStage of meshStageOverlayChain(stage)) {
  // Keep the existing merge body; mesh[overlayStage] now has only valid keys.
}
// Keep path, identifier, graph and cycle validation unchanged.
const { dev: _dev, prod: _prod, e2e: _e2e, ...base } = mesh;
return { ...base, services } as EffectiveMeshConfig;
```

Import `mergeStringMap` and `unionStable` from `stageMerge.ts` as before, but import the mesh chain/guards from `meshStageContract.ts`. Remove the old `delete result.test`; incoming legacy fields must have failed before this point. Do not merely delete the field from the returned object.

`loadEffectiveMeshServices` already takes `MeshConfigStage`; narrowing the alias propagates automatically. `compileMeshComposition` and `compileMeshEnvironment` already take only `dev | prod | e2e`. Their calls flow into the guarded resolver, so do not add a fallback mapping `test -> e2e`. An untyped caller passing `test` must receive a domain error.

Leave shared `stageMerge.ts` untouched: `stageOverlayChain("test")` remains necessary for `build.json`.

## C03 — Keep published JSON Schema synchronized

- **Change:** Update mesh stage iteration in `scripts/generate-schemas.ts`, regenerate `schemas/mesh-schema.json`, and narrow mesh-specific schema tests.
- **Why:** Removing the runtime schema property alone leaves the generator indexing `undefined.properties` for `test`, and a stale published schema would keep offering the forbidden field to editors.
- **Current behavior:** The generator decorates `dev`, `prod`, `test`, `e2e`; generated mesh schema includes root `test`. `tests/schema-generation.test.ts` assumes four mesh stages.
- **Expected behavior:** Mesh schema declares only `dev`, `prod`, `e2e` with strict root additional properties; the build schema still declares `test`. Service-name restrictions, root minimum, binding-target restrictions and lifecycle-target restrictions survive regeneration.
- **Failing-before test:** T06: assert generated `MeshJsonV2.properties` has no `test`; current committed schema fails. Add an exact supported mesh stage list assertion and retain the build `test` positive control.

Update generator loop:

```ts
import { MESH_CONFIG_STAGES } from "../src/core/mesh/types.js";
// Existing zodToJsonSchema conversion and root minProperties stay.
for (const object of [
  root,
  ...MESH_CONFIG_STAGES.map(stage => root.properties[stage]),
]) {
  // Keep existing propertyNames, dependency values, dependsOn.items decoration.
}
```

Regenerate with `pnpm build:schemas`. Do not manually patch JSON or remove every textual `test` occurrence: `test` remains in the reserved service-name enum.

Update `tests/schema-generation.test.ts` to iterate literal `["dev", "prod", "e2e"]` and explicitly assert missing root `test`. Prefer independent literal expectations in tests over reading only production constants: a bug adding `test` to the constant must not make both generator and test accept it.

Add in `tests/v2/generatedSchemas.test.ts`:

```ts
it("publishes three mesh overlays while preserving build.test", () => {
  const mesh = read("mesh-schema.json").definitions.MeshJsonV2;
  const build = read("build-schema.json").definitions.BuildJsonV2;
  expect(Object.keys(mesh.properties).sort()).toEqual([
    "$schema", "dev", "e2e", "name", "prod", "services", "tester",
  ]);
  expect(mesh.additionalProperties).toBe(false);
  expect(build.properties.test).toBeDefined();
  for (const stage of ["dev", "prod", "e2e"]) {
    expect(mesh.properties[stage].additionalProperties).toBe(false);
  }
});
```

Re-run generation and confirm the second generation has no diff. Build schema should have no semantic diff for this change. A source-to-generated equivalence test may use existing `zod-to-json-schema`; do not add an Ajv dependency merely to inspect this schema.
