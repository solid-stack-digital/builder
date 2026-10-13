# 02 — CLI, preflight, and cleanup

## C04 — Delete explicit mesh unit topology execution

- **Change:** Remove `mesh up test-unit` and `mesh down test-unit` from supported commands; delete the explicit mesh unit runner and its publication validator; keep canonical `mesh up test` and `mesh up test-e2e`.
- **Why:** The old command is the only execution point that applies `mesh.test` to isolated service runs. Keeping it with a new meaning would silently change user intent. Service-owned unit execution already exists.
- **Current behavior:** `handleMeshUp` calls `runMeshTestUnit`; that runner resolves `mesh.test`, loads effective stage services/paths, applies mesh env/publications to isolated build test containers, and creates mesh-prefixed test projects. `handleMeshDown` also accepts this command.
- **Expected behavior:** Both removed command invocations throw `ScriptError` before preflight/runtime/teardown. Help only lists supported mesh commands. The migration message directs unit-only requests to `builder service up/down test-unit -C <service>` and full testing to `builder mesh up test`.
- **Failing-before test:** T07: call `handleMeshUp("test-unit", {skipChecks:true,dryRun:true})` with old runner mocked to return zero; expect rejection and zero calls to every runner. Current code resolves zero and calls the old runner. T08: down rejects before teardown; current handler attempts teardown. T09: rendered mesh help must not advertise `test-unit`; current help does.

### File changes

| File | Edit |
|---|---|
| `src/commands/mesh/commands/up/handler.ts` | Remove `runMeshTestUnit` import and switch branch, use shared supported command list, remove `includeTestStage` argument, add targeted removed-command rejection |
| `src/commands/mesh/commands/up/command.ts` | Update description, examples and after-help; remove old overlay claims |
| `src/commands/mesh/commands/down/handler.ts` | Remove `test-unit` from accepted commands and add targeted error before side effects |
| `src/commands/mesh/commands/down/command.ts` | Ensure description/help list the actual supported set |
| `src/core/mesh/runners/runMeshTestUnit.ts` | Delete entire file |
| `src/core/mesh/v2/validateMeshTestStage.ts` | Delete entire file; `applyTestAppPublications` has no supported caller after C05 |
| `src/core/mesh/types.ts` | C02's new command constant |

The message may be inlined into the two handlers rather than creating a new CLI abstraction for two short branches. Proposed up handler flow:

```ts
const stage = (rawStage || "dev").toLowerCase();
if (stage === "test-unit") {
  throw new ScriptError(
    "mesh up test-unit is no longer supported because meshes have no test topology. " +
    "Use builder service up test-unit -C <service> for isolated tests, " +
    "or builder mesh up test for the complete test pipeline.",
  );
}
if (!(MESH_COMMAND_STAGES as readonly string[]).includes(stage)) {
  throw new ScriptError(
    `Unknown mesh stage: "${rawStage}". Supported stages: ${MESH_COMMAND_STAGES.join(", ")}`,
  );
}
const projectDir = resolveProjectDir(options.projectDir);
const runOptions = { ...options, projectDir };
if (!options.skipChecks) {
  checkMesh(projectDir, {
    requireTester: stage === "test" || stage === "test-e2e",
  });
}
switch (stage) {
  case "dev": return runMeshDev(runOptions);
  case "prod": return runMeshProd(runOptions);
  case "test": return runMeshTest(runOptions);
  case "test-e2e": return runMeshTestE2e(runOptions);
  default: throw new ScriptError(`Unsupported mesh command: ${stage}`);
}
```

Keep existing normalization, return statuses and flag forwarding. The default is still `dev`. Do not introduce a new `mesh up e2e` alias: JSON `e2e` and command `test-e2e` remain distinct.

For down, perform the same supported-name check before logging, `readRunState`, debug compilation or teardown. Its removed-command message should recommend `builder service down test-unit -C <service>` and `builder mesh down test` for canonical pipeline recovery.

Replacement mesh up after-help:

```text
Examples:
  $ builder mesh up dev
  $ builder mesh up prod
  $ builder mesh up test
  $ builder mesh up test-e2e

Mesh JSON overlays: dev, prod, e2e.
The test command runs each root service's standalone unit and service E2E
lifecycle sequentially, then runs global E2E on base -> prod -> e2e.
The test-e2e command runs only global E2E.
For a service's isolated tests: builder service up test-unit -C <service>.
```

Mentioning the valid **service** command in mesh help is allowed; tests must reject advertised **mesh** unit commands, not the substring `test-unit` everywhere.

Do not touch service up/down handlers or service stage constants. `src/index.ts` does not export `runMeshTestUnit`, so no public barrel removal is currently needed; verify with `rg` before committing.

## C05 — Remove mesh test preflight and retain standalone build test validation

- **Change:** Remove `includeTestStage` from `CheckMeshOptions`, `CheckMeshServicesOptions`, and all callers. Delete the isolated mesh validation branch. Always compile only dev, prod and e2e mesh compositions.
- **Why:** Validation must use the same supported topology set as execution. Ordinary mesh cross-service env must never be evaluated against a fake isolated mesh graph.
- **Current behavior:** Normal check uses three mesh stages, but optional `includeTestStage:true` adds a fourth path that applies mesh env and test publications. Up passes that option for explicit unit commands.
- **Expected behavior:** No fourth path or option remains. Every effective service still receives `checkInfra`, which validates its own `build.test`. Missing global tester remains allowed for ordinary checks/dev/prod and required for global E2E/full test when requested.
- **Failing-before test:** T10 compiles a `CheckMeshOptions`/checker options type contract containing `@ts-expect-error includeTestStage`; current type accepts it. An updated `tests/mesh-preflight-regression.test.ts` assertion requiring exactly `{requireTester: boolean}` also fails today because the handler includes `includeTestStage:false`. A valid mesh field guard integration test fails before C01 and ensures no old branch is reachable.

Replace `src/core/mesh/checkers/checkMeshServices.ts` with this shape:

```ts
import path from "node:path";
import pc from "picocolors";
import { resolveProjectDir } from "../../../utils/paths.js";
import { resolveMeshStage } from "../../config/resolveMeshStage.js";
import { checkInfra } from "../../checkers/checkInfra.js";
import { compileMeshComposition } from "../v2/compileMeshComposition.js";
import { loadEffectiveMeshServices } from "../v2/loadMeshServices.js";
import { MESH_CONFIG_STAGES, type MeshConfig } from "../types.js";

export function checkMeshServices(mesh: MeshConfig, meshDir: string): void {
  const root = resolveProjectDir(meshDir);
  const meshPath = path.join(root, "mesh.json");
  const checked = new Set<string>();
  for (const stage of MESH_CONFIG_STAGES) {
    const effective = resolveMeshStage(mesh, stage, meshPath);
    const services = loadEffectiveMeshServices(root, effective, stage);
    for (const [name, svc] of Object.entries(services)) {
      if (!checked.has(svc.absolutePath)) {
        console.log(pc.cyan(`\n🔍 Checking mesh service ${name}...`));
        checkInfra(svc.absolutePath);
        checked.add(svc.absolutePath);
      }
    }
    compileMeshComposition(stage, root, {
      validationMode: true,
      allowMissingTester: true,
    });
  }
}
```

Keep existing per-effective-path deduplication. In `checkMesh.ts`, retain only `requireTester` in `CheckMeshOptions` and call `checkMeshServices(mesh, absMeshDir)` without an options argument.

Preservation controls:

- `checkInfra` still calls `checkAllEffectiveServiceStages`; that function still compiles standalone `test`.
- Invalid service `build.test` remains a preflight error. Mock external lint steps in an integration test if needed, but do not mock away `checkAllEffectiveServiceStages` in that test.
- Valid root cross-service env and retained dependency publication must continue passing ordinary mesh preflight (`v210-audit-preflight` positive cases).
- Unknown endpoint references still fail.
- `requireTester:true` still rejects a missing root tester.

Do not broaden the change into redesigning preflight's existing all-effective-stage policy.

## C06 — Make cleanup independent of the deleted topology

- **Change:** Remove `resolveMeshStage(mesh,"test",...)` from `projectNamesForMeshStage`; derive mesh project identities without stage resolution. Make `mesh down test` recover canonical Phase-1 standalone service projects through root service paths, then recover the global E2E project.
- **Why:** Narrowing the stage type otherwise leaves a compile error in cleanup. More substantively, canonical Phase 1 uses service-owned project names; the helper currently predicts names from the removed mesh unit runner.
- **Current behavior:** `projectNamesForMeshStage` resolves `mesh.test` even for dev/prod cleanup. For `test` it predicts `<mesh>-<service>-test` plus mesh E2E, omitting each standalone service's actual unit/E2E projects and saved child state. If test resolution fails, configured mesh name can be lost through the catch fallback.
- **Expected behavior:** Mesh-only project-name lookup requires no topology. Full-test cleanup delegates to each root service's existing down lifecycle in deterministic order, using its original path and saved state, then cleans the mesh E2E project. Non-test mesh down remains mesh-only. Cleanup succeeds with saved state when configuration is invalid. Cleanup failure preserves state and propagates.
- **Failing-before test:** T11: a mesh named `system` with root `api` whose build name is `orders` must cause `mesh down test` to target `orders-test`, `orders-e2e` and `system-e2e` (plus any saved identities), using child directories for service teardown; current implementation instead targets `system-api-test` and `system-e2e`. T12: verify no `resolveMeshStage` call during `projectNamesForMeshStage`; current helper calls it even for dev.

### Minimal project-name helper

In `src/utils/runState.ts`, remove the `resolveMeshStage` import and all effective service-name lookup from `projectNamesForMeshStage`. Retain `getMeshJson` for valid configured names and fallback to basename for invalid config:

```ts
export function projectNamesForMeshStage(meshDir: string, stage: string): string[] {
  const absDir = resolveProjectDir(meshDir);
  let rawMeshName = path.basename(absDir);
  try {
    rawMeshName = getMeshJson(absDir).name || rawMeshName;
  } catch {
    // Recovery can still use saved state and directory-derived identity.
  }
  const s = stage.toLowerCase();
  if (s === "test" || s === "test-e2e") {
    return [deriveProjectName(rawMeshName, "e2e")];
  }
  return [deriveProjectName(rawMeshName, s)];
}
```

The handler validates commands first. Do not use this helper's generic fallback to accept a removed CLI command. Leave `projectNamesForServiceStage`, generic `deriveProjectName`, and saved-state shape intact: service test projects still need them.

### Root-service recovery in mesh down

Use existing `handleServiceDown` to preserve its anonymous-volume tracking, saved-state preference, directory context, debug redaction and failure behavior. The relative import from the mesh down handler is `../../../service/commands/down/handler.js`. Import `getMeshJson` from `../../../../core/mesh/getMeshJson.js` and `resolveInsideProject` from `../../../../core/config/pathSafety.js`.

Resolve root service paths **only for the `test` command** and never through a mesh overlay. Suggested helper local to the handler:

```ts
function rootServiceDirsForCleanup(meshDir: string): string[] {
  try {
    const mesh = getMeshJson(meshDir);
    const dirs = Object.entries(mesh.services)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([name, service]) => resolveInsideProject(meshDir, service.path, {
        sourceFile: path.join(meshDir, "mesh.json"),
        configPath: `services.${name}.path`,
      }));
    return [...new Set(dirs)];
  } catch {
    // Do not parse legacy config with a permissive fallback.
    // Invalid config can still be recovered at the mesh root by saved state.
    return [];
  }
}
```

Add `node:path` import. Evaluate this helper outside runtime teardown `try/catch` blocks; its catch is for configuration discovery only. Do not catch `handleServiceDown` failures.

After supported-command validation and before root teardown/state clearing:

```ts
if (stage === "test") {
  for (const serviceDir of rootServiceDirsForCleanup(meshDir)) {
    const status = await handleServiceDown("test", {
      projectDir: serviceDir,
      volumes: Boolean(options.volumes),
      debug: Boolean(options.debug),
    });
    if (status !== 0) return status;
  }
}
```

Preserve the existing root saved-state-first teardown loop, anonymous volume metadata, and `clearRunState(meshDir)` only after successful root teardown. Child state is cleared by successful service down, never preemptively by mesh down.

For `down --debug`, change `stage === "test"` to compile E2E just like `test-e2e`:

```ts
const mode = stage === "dev" ? "dev"
  : stage === "test" || stage === "test-e2e" ? "e2e"
  : "prod";
```

This diagnostic describes the canonical global phase, not an imaginary test/prod topology. Keep the existing noncritical catch around debug compilation, so bad config never prevents saved-state cleanup. T13 should assert the compiler gets `e2e` for `down test --debug`; currently it gets `prod`.

### Recovery limitations and tests

A removed legacy runner wrote saved state in each service directory. Users can recover it with `builder service down test-unit -C <service>`; that handler reads saved identity before derived names. With valid migrated config, the new `mesh down test` also reaches those child saved states. No old topology is recompiled or executed.

If root mesh JSON is malformed or still contains forbidden `test`, child path discovery is deliberately unavailable. Root saved-state cleanup remains usable, and per-service down is the recovery route for child resources. Do not weaken the required guard to discover legacy overlay-only service paths. Document this precisely rather than promising discovery of resources whose paths are no longer valid configuration.

Tests must cover successful root/child recovery; configured build name differing from mesh key; child saved identity taking priority; duplicate root paths deduplicated; stage-overridden paths ignored; `volumes` forwarded; no child teardown for dev/prod/test-e2e; child teardown rejection preserving child/root state; root teardown rejection preserving root state; malformed config still recovering known root state; and removed `test-unit` rejecting without any teardown. These controls constrain cleanup changes to the execution model being retained.
