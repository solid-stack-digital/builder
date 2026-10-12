# 01 — Resolve only the winning application environment value for each key

## Bug report

**Bug.** Builder resolves a lower-precedence `app.env` endpoint reference even when a later layer replaces the same environment key with a valid literal. The compiler then rejects a valid effective configuration. This occurs in standalone `base -> dev`, `base -> prod -> e2e`, override Compose environment precedence, and mesh service environment precedence.

**Why it is a bug.** V2 §11.2 defines application environment precedence and explicitly makes mesh service env an override. V2 §12 says maps merge by key and validation runs against the **final effective composition**. Build JSON §3.2 and Mesh JSON §5.3 give the same layer order. In the final map, the replaced reference does not exist. Rejecting it prevents documented stage and mesh overrides from fulfilling their role. An unresolved reference that remains the winning value must still fail under V2 §4.

**Observed behavior.** Five independent red cases in the [exact reproduction source](reproductions/v213-audit.test.ts.txt) throw `Unknown app endpoint reference` or `Referenced endpoint does not exist` from a lower layer. The control with an unresolved *effective* value passes because it correctly throws. Current checkout: `f4098f5073e224d1e0541388f6a71bcd20614fbb`.

**Root cause.** [compileServiceComposition.ts](/home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/src/core/composition/compileServiceComposition.ts:56) resolves every layer in sequence and calls `resolveAppLayers()` once **before** override Compose layers are added. [resolveMeshAppEnvironment.ts](/home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/src/core/mesh/v2/resolveMeshAppEnvironment.ts:4) likewise resolves every build layer before mesh env is applied. The mesh composer, explicit test-stage runner, and test-stage checker all call that helper.

**Expected behavior.** For each app environment key, identify the final provider in the active precedence chain, then resolve only that value. Preserve the source path of the winning value for diagnostics. Preserve explicit rejection of Builder-owned keys in *any* user layer; this is a separate authority rule and must not be skipped merely because another layer overwrites the key. An effective invalid reference still throws.

## Test gate: do this before source edits

From the repository root, install the supplied test artifact once:

```bash
cp -n .docs/execution_docs/02-implement_v2.1.0/bug-fix-plans-3/reproductions/v213-audit.test.ts.txt tests/conformance/v213-audit.test.ts
pnpm exec vitest run tests/conformance/v213-audit.test.ts -t V213-001
```

Expected **red** before a fix: five `V213-001 ignores...` cases fail with an error referring to `app.endpoints.missing.network_url`; the `V213-001 control rejects unresolved effective reference` case passes. Representative test:

```ts
it("V213-001 ignores overwritten base app reference in standalone stage", () => {
  const root = fixture({
    app: { env: { URL: "${app.endpoints.missing.network_url}" } },
    dev: { app: { env: { URL: "http://local" } } },
  });
  expect(compileService("dev", root).compose.services.app?.environment)
    .toMatchObject({ URL: "http://local" });
});
```

The artifact also covers `prod -> e2e`, an override Compose value, an internal mesh build-stage value, and a mesh service env value. If all five assertions already pass on the implementer's branch, **do not apply this fix**; record the commit and test output. If failure is caused by fixture setup, Docker, imports, or syntax, repair the test harness and rerun before deciding. Proceed only on the specified wrong-reference failures.

## Implementation steps and code

### 1. Select winning keys without resolving values

Add `src/core/composition/selectAppEnvironmentEntries.ts`. This helper models only the precedence of already-ordered application layers. It intentionally does not validate Builder-owned keys; existing ownership checks stay in their current locations.

```ts
import type { AppEnvironmentLayer } from "./types.js";

export function selectAppEnvironmentEntries(
  layers: readonly AppEnvironmentLayer[],
  laterKeys: ReadonlySet<string> = new Set(),
): Map<string, AppEnvironmentLayer> {
  const winners = new Map<string, AppEnvironmentLayer>();
  for (const layer of layers) {
    for (const key of Object.keys(layer.values)) winners.set(key, layer);
  }
  for (const key of laterKeys) winners.delete(key);
  return winners;
}
```

### 2. Resolve standalone values after all override layers are known

In `compileServiceComposition.ts`, import the selector. Replace the current `resolveAppLayers` loop with a loop over selected winners. Use the winning layer's existing diagnostic context:

```ts
const resolveAppLayers = (): ComposeEnvironmentMap => {
  const result: ComposeEnvironmentMap = {};
  const laterKeys = new Set(Object.keys(options.externalAppEnv ?? {}));
  for (const [key, layer] of selectAppEnvironmentEntries(appEnvironmentLayers, laterKeys)) {
    if (layer.kind === "build-json") {
      const context = {
        sourceFile: buildPath,
        configPath: layer.configPath,
        stage,
        composition: "service" as const,
      };
      result[key] = resolveEnv({ [key]: layer.values[key]! }, registry, context)[key]!;
    } else {
      result[key] = layer.values[key]!; // null is meaningful to Compose
    }
  }
  return result;
};
```

The current app seed calls `resolveAppLayers()` before processing override Compose. Remove only that early resolution. Seed `app.environment` with the external and Builder internal values, then retain the existing final `resolveAppLayers()` call after the override loop:

```ts
app.environment = {
  ...(options.externalAppEnv
    ? Object.fromEntries(Object.entries(options.externalAppEnv)
        .map(([key, value]) => [key, value.replace(/\$/g, "$$$$")]))
    : {}),
  ...internal,
};
```

This does not change Docker target, env-file selection, or valid value precedence. Keep `assertNoBuilderOwnedEnvKeys` on every declared build layer and the override-owned key checks as they are.

### 3. Use the same winner rule in mesh composition and tooling

In `src/core/mesh/v2/resolveMeshAppEnvironment.ts`, add an optional `laterKeys` parameter and resolve only the selected winner for each key. Preserve `null` from override Compose values and the original `configPath` for winning build JSON values.

```ts
export function resolveMeshAppEnvironmentLayers(
  serviceName: string,
  layers: AppEnvironmentLayer[],
  context: MeshReferenceContext,
  laterKeys: ReadonlySet<string> = new Set(),
): ComposeEnvironmentMap {
  const result: ComposeEnvironmentMap = {};
  for (const [key, layer] of selectAppEnvironmentEntries(layers, laterKeys)) {
    if (layer.kind === "build-json") {
      result[key] = resolveServiceBuildEnvThroughMesh(
        serviceName,
        { [key]: layer.values[key]! },
        context,
        `services.${serviceName}.${layer.configPath}`,
      )[key]!;
    } else {
      result[key] = layer.values[key]!;
    }
  }
  return result;
}
```

Update **all three callers**, not just normal mesh compilation:

```ts
// compileMeshComposition.ts: resolve the higher mesh layer first.
const meshEnv = resolveMeshEnvMap(fragment.externalAppEnvironment ?? {}, refContext,
  `services.${name}.env`);
const serviceEnv = resolveMeshAppEnvironmentLayers(name, fragment.appEnvironmentLayers,
  refContext, new Set(Object.keys(meshEnv)));

// checkMeshServices.ts, explicit test-stage branch:
resolveMeshAppEnvironmentLayers(name, fragment.appEnvironmentLayers, ctx,
  new Set(Object.keys(svc.meshEnv)));

// runMeshTestUnit.ts:
const resolvedBuild = resolveMeshAppEnvironmentLayers(name,
  compiled.appEnvironmentLayers, refCtx, new Set(Object.keys(svc.meshEnv)));
```

Keep the mesh env's own resolution/validation call; a bad reference in its winning value must fail. Keep the final merge order `serviceEnv -> meshEnv -> Builder internal`. Do not suppress dependency env reference validation: dependency env has its own effective merge and ownership.

## Green checks and stop rules

1. Rerun the exact `-t V213-001` gate. All six selected cases must pass. If one still fails on a lower layer, trace which call site resolved it; do not weaken the expected result.
2. Add a positive control where a valid base value is replaced by a stage value, then by override Compose, then by mesh env. Assert the final env equals the highest-precedence value and a second unrelated key survives.
3. Add a negative control where the winning stage or mesh value itself contains an unresolved endpoint reference. It must still fail with the winning source path.
4. Add a control with `EXEC_MODE` in an overridden lower layer. It must still fail as Builder-owned. Add an override Compose `null` env entry that masks a bad lower reference and verify Compose receives `null` for that key.
5. Run `pnpm exec vitest run tests/conformance/v213-audit.test.ts tests/conformance/09-mesh-env.test.ts tests/v2/compileApplicationEnv.test.ts`, then `pnpm typecheck` and the full suite.

After the final test passes, retain the regression file in `tests/conformance/`. Do not make a schema change for this behavior; it is effective-layer evaluation, not JSON shape.

## Implementation record — 2026-10-13

The V213-001 regression failed prior to source changes because `compileServiceComposition` and `resolveMeshAppEnvironment` resolved each application environment layer in sequence rather than resolving only the winning layer per environment key according to V2 precedence. Consequently, invalid or dangling references in lower layers (such as base `app.env`) failed compilation even when explicitly overridden by stage values, override Compose environment, or mesh service environment.

1. Added `src/core/composition/selectAppEnvironmentEntries.ts` which iterates active layers in precedence order and eliminates keys defined in `laterKeys` (e.g. external app env or mesh env).
2. Updated `src/core/composition/compileServiceComposition.ts` to use `selectAppEnvironmentEntries` when executing `resolveAppLayers()`, deferring resolution until all override Compose layers have been incorporated.
3. Updated `src/core/mesh/v2/resolveMeshAppEnvironment.ts` and its three callers (`compileMeshComposition.ts`, `checkMeshServices.ts`, and `runMeshTestUnit.ts`) to pass higher-precedence `meshEnv` keys into `resolveMeshAppEnvironmentLayers` as `laterKeys`.

The test suite in `tests/conformance/v213-audit.test.ts` covers:
- Standalone base reference overwritten by stage env.
- Prod app reference overwritten in e2e stage.
- Build reference replaced by active override Compose env.
- Overwritten base app reference in mesh.
- Build reference replaced by mesh service env.
- Control: unresolved reference in effective winning layer still rejected.
- Control: full precedence chain override and independent key preservation.
- Control: unresolved reference in winning mesh value rejected with source path.
- Control: Builder-owned key rejection even when overwritten.
- Control: override Compose `null` entry masking a lower reference.

Validation: All V213-001 tests and related mesh/compile env suites passed.

