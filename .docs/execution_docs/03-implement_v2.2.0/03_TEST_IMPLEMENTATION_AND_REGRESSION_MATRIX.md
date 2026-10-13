# 03 — Test implementation and regression matrix

## C07 — Replace obsolete expectations without discarding surviving protections

- **Change:** Add v2.2 contract tests, migrate old explicit mesh-unit tests to supported boundaries, and expand canonical Phase-1 isolation and cleanup coverage.
- **Why:** Deleting the runner breaks several test imports, and simply deleting those tests would lose valuable port/redaction/cleanup protections. Some current passing tests actively require legacy behavior.
- **Current behavior:** `PIPE-003` accepts a root `test` override and verifies it is ignored; explicit unit tests validate mesh-owned env/publications; schema generation assumes four mesh stages. The canonical pipeline already has ordering and early-failure tests.
- **Expected behavior:** Old-field fixtures become negative tests. Valid root-versus-stage tests use `prod`/`e2e` overrides. Supported paths retain regression coverage, and tests distinguish newly failing contracts from controls that already pass.
- **Failing-before test:** T01–T13 below fail against the current contract for the reasons listed. In particular, revised `PIPE-003` must expect an error for legacy root `test` rather than accepting it. New positive independence controls may already pass; do not change correct runtime code merely to make those controls initially red.

## Test ID matrix

| ID | Test / assertion | Current result | Expected result | Files |
|---|---|---|---|---|
| T01 | Loader rejects any root `test` with targeted context | Empty/populated overlays accepted; malformed values get generic schema errors | `ConfigError` at `test`, migration guidance, no secret value | New `tests/v2/meshTestRemoval.test.ts` |
| T02 | Direct resolver rejects legacy field in dev/prod/e2e | Field ignored in those stages | Same field error | Same file |
| T03 | Strict mesh schema rejects root test | Valid overlay accepted | `safeParse.success === false` | `meshSchema.test.ts` or new file |
| T04 | Direct resolver rejects stage `test` with no legacy field | Resolves base/test | Config stage error, no silent alias | New file |
| T05 | Mesh type cannot contain test; build type can | Mesh accepts it | `@ts-expect-error` consumed by `pnpm typecheck` | New `tests/v2/meshStageTypes.test.ts` |
| T06 | Generated mesh schema lacks test; build schema keeps it | Mesh property exists | Exact mesh keys and strict root | `generatedSchemas.test.ts`, `schema-generation.test.ts` |
| T07 | Removed mesh up command rejected before any runner/preflight | Legacy runner invoked | `ScriptError` + migration command | New `tests/v2/meshCommandRemoval.test.ts` |
| T08 | Removed mesh down command rejected before teardown | Teardown attempted | `ScriptError`, no side effects | Same file or cleanup tests |
| T09 | Help advertises only supported mesh commands | Explicit mesh unit command shown | No advertised mesh unit command; valid service guidance allowed | CLI registration test |
| T10 | Mesh preflight API/call shape has no includeTestStage | Option exists/passed | Removed type and exact call shape | `mesh-preflight-regression.test.ts`, type test |
| T11 | Full-test down targets service-owned test/E2E project names and root E2E | Mesh-prefixed unit names | Child lifecycle recovery + root E2E | New `tests/v2/meshTestCleanup.test.ts` |
| T12 | Project-name lookup does not resolve any topology | Resolves mesh test even for dev | No stage resolver call | Same file |
| T13 | Full-test down debug compiles E2E | Compiles prod | `compileMeshEnvironment("e2e", ...)` | Same file |
| T14 | Supported up commands reject legacy field with skipChecks | Valid legacy overlays accepted, then execution/compilation attempted | Field error before runtime calls | New `tests/v2/meshTestRemovalEntryPoints.test.ts` |
| T15 | Current public docs/specs/examples describe only three mesh overlays | Obsolete field/types/examples present | Correct scoped documentation assertions | `publicDocsSemantics.test.ts`, new docs contract test |
| T16 | Example Makefile does not invoke removed command | Has `mesh up test-unit` target | Target removed; test and test-e2e retained | `examples.test.ts` |

T01 falsey input cases may already reject generically under Zod; the **targeted error/context** expectation is what fails before the change. T04 non-`test` invalid stages may currently throw an incidental TypeError; require a `ConfigError`, not just any exception. New tests must fail for the intended missing behavior, not an import error, malformed fixture, missing Docker, or unavailable service directory.

## Ready-to-copy guard test file

Create `tests/v2/meshTestRemoval.test.ts`. This imports existing production modules so the initial red run is meaningful before adding the new helper module:

```ts
import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { meshSchema } from "../../src/core/mesh/meshSchema.js";
import { getMeshJson } from "../../src/core/mesh/getMeshJson.js";
import { resolveMeshStage } from "../../src/core/config/resolveMeshStage.js";
import { resolveBuildStage } from "../../src/core/config/resolveBuildStage.js";
import { ConfigError } from "../../src/errors/ConfigError.js";
import { cleanupMeshes, createMesh } from "./meshFixture.js";

afterEach(cleanupMeshes);
const services = { api: { path: "api" } };

function expectRemovedField(action: () => unknown, file: string): void {
  let caught: unknown;
  try { action(); } catch (error) { caught = error; }
  expect(caught).toBeInstanceOf(ConfigError);
  const error = caught as ConfigError;
  expect(error.context).toMatchObject({
    sourceFile: file, configPath: "test", composition: "mesh",
  });
  expect(error.message).toContain("mesh.json.test is no longer supported");
  expect(error.message).toContain("build.json.test");
  expect(error.message).toContain("mesh.json.e2e");
  expect(error.message).not.toContain("SECRET_SENTINEL_220");
}

describe("removed mesh test topology", () => {
  it.each([
    {},
    { services: {} },
    { services: { api: { env: { API_TOKEN: "SECRET_SENTINEL_220" } } } },
    null, false, 0, "", [],
  ])("T01 rejects presence of root test regardless of value %#", test => {
    // No child projects: the config error must happen before service loading.
    const root = createMesh({ services, test }, {});
    expectRemovedField(() => getMeshJson(root), path.join(root, "mesh.json"));
    expect(fs.existsSync(path.join(root, ".builder"))).toBe(false);
  });

  it.each(["dev", "prod", "e2e"] as const)(
    "T02 guards direct resolution even when %s would ignore test",
    stage => {
      expectRemovedField(
        () => resolveMeshStage({ services, test: {} } as any, stage, "mesh.json"),
        "mesh.json",
      );
    },
  );

  it("T02 detects own undefined properties for in-memory callers", () => {
    expectRemovedField(
      () => resolveMeshStage({ services, test: undefined } as any, "prod", "mesh.json"),
      "mesh.json",
    );
  });

  it("T03 removes root test from the schema", () => {
    expect(meshSchema.safeParse({ services, test: {} }).success).toBe(false);
    expect(() => meshSchema.parse({ services, test: {} })).toThrow();
    expect(meshSchema.safeParse({ services, prod: {}, e2e: {} }).success).toBe(true);
  });

  it.each(["test", "test-unit", "test-e2e", "unknown"])(
    "T04 rejects unsupported configuration stage %s",
    stage => {
      let caught: unknown;
      try { resolveMeshStage({ services }, stage as any, "mesh.json"); }
      catch (error) { caught = error; }
      expect(caught).toBeInstanceOf(ConfigError);
      expect((caught as Error).message).toContain("Supported stages: dev, prod, e2e");
    },
  );

  it("control: build.test remains a meaningful service overlay", () => {
    const build = resolveBuildStage({
      app: { env: { LOG_LEVEL: "info", BASE: "yes" } },
      test: { app: { env: { LOG_LEVEL: "silent" } } },
      prod: { app: { env: { PROD_ONLY: "yes" } } },
    }, "test", "build.json");
    expect(build.app.env).toEqual({ LOG_LEVEL: "silent", BASE: "yes" });
  });
});
```

Also test a service env key named `test` as an ordinary string map entry; it remains valid. Reserved service name `test` remains rejected independently. A nested unsupported `prod.test` or `services.api.test` still fails existing strict shape validation; do not mislabel these as the root-field migration error.

## Type contract test

Create `tests/v2/meshStageTypes.test.ts`. Vitest does not typecheck these assertions; `pnpm typecheck` is mandatory.

```ts
import { expect, it } from "vitest";
import type { MeshConfig, MeshConfigStage } from "../../src/core/mesh/types.js";
import type { BuildJson, Environment } from "../../src/types/index.js";
import type { CheckMeshOptions } from "../../src/core/mesh/checkers/checkMesh.js";
import { checkMeshServices } from "../../src/core/mesh/checkers/checkMeshServices.js";

const validMeshStage: MeshConfigStage = "e2e";
// @ts-expect-error test is a command, not a mesh config stage
const removedMeshStage: MeshConfigStage = "test";
const invalidMesh: MeshConfig = {
  services: { api: { path: "api" } },
  // @ts-expect-error root mesh.test is forbidden
  test: {},
};
const invalidOptions: CheckMeshOptions = {
  // @ts-expect-error explicit mesh test preflight no longer exists
  includeTestStage: true,
};
// This function is intentionally never invoked; it is a compile-time check.
function invalidCheckerCall(): void {
  // @ts-expect-error checker no longer has a mesh test options argument
  checkMeshServices({ services: { api: { path: "api" } } }, "/tmp", { includeTestStage: true });
}
const validBuildStage: Environment = "test";
const validBuild: BuildJson = { app: {}, test: { app: { env: { LOG_LEVEL: "silent" } } } };
it("retains service test types", () => {
  expect(validMeshStage).toBe("e2e");
  expect(validBuildStage).toBe("test");
  expect(validBuild.test?.app?.env?.LOG_LEVEL).toBe("silent");
  void removedMeshStage; void invalidMesh; void invalidOptions; void invalidCheckerCall;
});
```

## CLI removal and bypass tests

For T07/T08 use hoisted mocks for all remaining mesh runners, `checkMesh`, and teardown. In the initial red run, also mock the old runner; remove that mock when deleting its file. Do not keep a virtual implementation of the removed runner in final tests.

Representative test in the command-mock suite:

```ts
it.each([false, true])("T07 rejects removed mesh command with skipChecks=%s", async skipChecks => {
  await expect(handleMeshUp("test-unit", { skipChecks, dryRun: true }))
    .rejects.toThrow(/service up test-unit/);
  expect(checkMesh).not.toHaveBeenCalled();
  for (const runner of [runMeshDev, runMeshProd, runMeshTest, runMeshTestE2e]) {
    expect(runner).not.toHaveBeenCalled();
  }
});
```

Place T14 in a **separate file without mocked mesh runners or loader**. Mock only `runCompose`, `teardownCompose`, and infrastructure checks if needed; keep `getMeshJson` real. Build the root fixture with the standard fixture helper, one healthy `api` build, `test:{}`, and a global tester declaration so there is no unrelated missing-tester failure. For each supported command:

```ts
it.each(["dev", "prod", "test", "test-e2e"])(
  "T14 cannot bypass the field guard with skipChecks for %s",
  async stage => {
    const root = createMesh({
      services: { api: { path: "api" } },
      test: {},
      tester: { compose: "tester.yml", service: "runner" },
    }, { api: { app: {} } }, {
      "tester.yml": "services:\n  runner:\n    image: alpine\n",
    });
    await expect(handleMeshUp(stage, { projectDir: root, skipChecks: true, dryRun: true }))
      .rejects.toMatchObject({
        name: "ConfigError", context: { configPath: "test", composition: "mesh" },
      });
    expect(runCompose).not.toHaveBeenCalled();
    expect(teardownCompose).not.toHaveBeenCalled();
    expect(fs.existsSync(path.join(root, ".builder"))).toBe(false);
    expect(fs.existsSync(path.join(root, "api", ".builder"))).toBe(false);
  },
);
```

The current code may reach Docker validation for E2E before throwing an unrelated error. Spy/mock `node:child_process.spawnSync` in this file to return a successful empty result if necessary, so the baseline failure remains the missing field rejection. Never assert merely `.rejects.toThrow()` here: that would accept missing Docker as success. Add analogous direct compiler/checker tests with targeted error context and zero service/checker calls.

For help, create a Commander command, register mesh up/down, and capture `--help` through `configureOutput` + `exitOverride` (catch only `commander.helpDisplayed`), since `helpInformation()` alone does not include `addHelpText("after")`. Assert no `builder mesh up test-unit` example or stage-list entry. Permit `builder service up test-unit` guidance. Preserve service help examples independently.

## Canonical Phase-1 independence controls

These are primarily preservation tests; most should pass current code with valid fixtures. Put call-boundary tests in `tests/v2/meshServiceTestPipeline.test.ts`, whose existing mock of `runTest` is appropriate for routing but cannot prove actual env behavior.

1. Replace old `PIPE-003` with a negative legacy-field test (T01) and a separate positive path test: root `api.path="api"`, `prod.api.path="prod-api"`, `e2e.api.path="e2e-api"`. `runMeshServiceTests` must call `runTest` for root `api` only.
2. Add root env/bindings/publish/dependsOn sentinels and verify `runTest` receives exactly the service-owned execution options, with no mesh env/registry/publication/config object forwarded.
3. Include prod-only and E2E-only services: neither runs in Phase 1 unless at root.
4. Keep sorted ordering, nonzero exit propagation, dry-run/debug forwarding, and cleanup rejection propagation.
5. Use a deferred promise to prove sequencing: start `runMeshServiceTests`, hold the first `runTest` unresolved, assert only one call, resolve it, await completion and assert the second call. Call order alone does not prove absence of concurrency.

For actual environment behavior add `tests/v2/meshPhaseOneIndependence.test.ts` with real `runMeshServiceTests`, `runTest`, `compileEnvironment`, and service compiler; mock only Compose execution/teardown and host-port collision probes. Capture `runCompose` YAML documents and project directories. Use fixed, distinct service-owned publications (or none), not AUTO allocation, to make the comparison deterministic.

Fixture service `api` build:

```json
{
  "name": "independent-api",
  "app": { "env": { "OWNER": "build-base" } },
  "test": { "app": { "env": { "OWNER": "build-test" } } },
  "prod": { "app": { "env": { "PROD_ONLY": "yes", "OWNER": "build-prod" } } },
  "e2e": { "app": { "env": { "OWNER": "build-e2e" } } },
  "tester": { "env": { "TESTER_OWNER": "service" } }
}
```

Root mesh adds `services.api.env.OWNER="mesh-base"`, `prod.services.api.env.OWNER="mesh-prod"`, `e2e.services.api.env.OWNER="mesh-e2e"` and valid stage path substitutions to other fixture projects. Run Phase 1 directly; it must still use `api` root path. Compare captured service unit/E2E documents to direct `compileServiceComposition("test"/"e2e", apiDir, {validationMode:true})` documents. Normalize only legitimately variable cache/name fields if present, and explicitly assert environments, build targets, env files, dependency membership and tester membership rather than snapshotting opaque YAML.

Expected Phase-1 unit app: `OWNER=build-test`, `EXEC_MODE=test`, `INFRA_MODE=isolated`, target `test`, `.env.test`, no external dependency containers or tester. Expected service E2E app: `OWNER=build-e2e`, inherited `PROD_ONLY=yes`, target `prod`, `EXEC_MODE=prod`, `INFRA_MODE=integrated`, `.env.e2e`. Service tester: `TESTER_OWNER=service`, `EXEC_MODE=e2e`, no `INFRA_MODE`, `.env.e2e-tester`. No mesh env sentinel in either standalone composition.

Add a second fixture with a real logical dependency and a mesh provider, using existing `dep`, `http`, `ownerBundle` helpers. Service E2E must materialize its own local dependency and resolve its logical URL locally even though mesh E2E substitutes a provider. Keep a build.test override of the dependency URL (e.g. `"API_URL":"in-process"`) so isolated reference validation itself is valid. This avoids accidentally testing a malformed standalone build.

Then compile global E2E with real `compileMeshComposition("e2e", root, {validationMode:true})`: assert mesh env wins there, prod/e2e services appear, provider substitution suppresses the local implementation, global tester env is independent, and every app runs prod/integrated. Keep this separate from the Phase-1 call-boundary suite that mocks `runTest`.

## Full pipeline lifecycle controls

Keep existing `meshRunners`, `serviceRunners`, `runWithCleanup`, `cleanupFailures`, `composeCleanupFailures` and `v210-audit-cleanup` checks. Add one joined orchestration test with mocked runners/Compose boundaries to assert:

```text
alpha unit up -> alpha unit cleanup
alpha service E2E up -> alpha service E2E cleanup
beta unit up -> beta unit cleanup
beta service E2E up -> beta service E2E cleanup
global E2E up -> global E2E cleanup
```

Initial stale teardown is also expected before each up; identify it separately instead of confusing it with completion cleanup. Reject at each exit/cleanup boundary and assert that later up operations do not occur. Existing equivalent tests may be reused rather than duplicated. No modifications to already-correct `runMeshTest`, `runMeshServiceTests`, `runTest`, or `runWithCleanup` are required solely for this refactor.

## Existing-test migration inventory

| Existing file | Required migration | Protection that must survive |
|---|---|---|
| `tests/mesh-preflight-regression.test.ts` | Remove old runner mock and `test-unit` positive row; exact checker args omit includeTestStage; add removed-command row | One preflight per supported command; skip-checks behavior |
| `tests/v2/meshServiceTestPipeline.test.ts` | Replace legacy `PIPE-003`; add valid prod/e2e path control | Root membership/path ownership, sequential fail-fast lifecycle |
| `tests/schema-generation.test.ts` | Iterate three mesh stages and assert missing `test` property | Service identifier, provider and dependsOn restrictions |
| `tests/v2/generatedSchemas.test.ts` | Add exact mesh root keys; retain build.test | Published runtime/schema alignment |
| `tests/conformance/v210-audit-preflight.test.ts` | Remove only explicit includeTestStage branch; keep ordinary positive/negative cases; add field rejection | Cross-service env and retained publication remain valid in supported mesh stages |
| `tests/conformance/09-mesh-env.test.ts` | Remove old runner import; narrow the nested-field rejection stage loop to dev/prod/e2e; replace explicit mesh-test cases with root-field rejection or supported-stage cases; rename MEN-027 to describe standalone service unit compilation | Builder-owned env restrictions, mesh precedence, invalid binding/provider/publication errors |
| `tests/conformance/v210-audit-test-publication.test.ts` | Retire explicit mesh unit publication behavior; move still-relevant cases to standalone build.test or mesh dev/prod/e2e tests | Public-reference resolution occurs after publication; unpublished public refs fail; isolated service runtime contract |
| `tests/conformance/v214-audit.test.ts` | Move debug secret fixture into service `build.test.app.env`, run canonical Phase 1 or service unit; remove mesh.test publication setup | Token/URL password redaction; sequential service fixed-port reuse; within-service and simultaneous mesh fixed conflicts; AUTO uniqueness |
| `tests/cleanupFailures.test.ts` | Remove old mesh-unit import and runner row; retain service unit, service E2E, mesh E2E rows; add canonical Phase-1 wrapper cleanup rejection if needed | Failure propagation and saved state preservation |
| `tests/conformance/10-global-tester.test.ts` | Iterate allowed stages for nested tester rejection; test root test rejection separately | Test passes for the intended wrong nested tester, not merely wrong root key |
| `tests/v2/publicDocsSemantics.test.ts` | Add scoped current-doc architecture checks | Correct service stages and E2E application semantics |
| `tests/v2/examples.test.ts` | Assert example Makefile removal and compile all valid examples | Service test overlays still compile; mesh examples compile dev/prod/e2e |

Do not blindly rename every old test to `prod`: isolated behavior and integrated topology behavior differ. Map each assertion by ownership:

- Mesh env/publication does not apply to isolated service tests: use a negative legacy-field test plus a positive Phase-1 independence control.
- Standalone self public reference: place publication capability in build endpoints, compile `test`, verify service public properties.
- Cross-service references: test allowed references in an integrated mesh; test standalone builds reject mesh reference grammar if needed.
- Unknown binding/provider and invalid mesh publication: exercise `dev`, `prod`, or `e2e`, keeping errors attributable to the same invalid declaration.
- Reused fixed ports across sequential tests: call real `runMeshServiceTests` or compile each standalone service separately; no shared mesh port namespace in Phase 1.
- Redaction: use actual supported debug runners, and test that the new legacy-field diagnostic does not print the rejected env secret.

## Cleanup test harness details

Create fixtures using `meshFixture`, write child build name `orders`, and write saved child/root states with `writeRunState`. Mock `teardownCompose`, `compileMeshEnvironment` and external collision probes, but keep `handleMeshDown`, `handleServiceDown`, project name derivation and state reads/writes real. Use `vi.mocked(teardownCompose).mock.calls` to assert directory and `projectName` tuples.

Expected minimum tuples for `handleMeshDown("test", {projectDir: root})` without saved state:

```ts
expect(calls).toEqual(expect.arrayContaining([
  [path.join(root, "api"), "orders-test"],
  [path.join(root, "api"), "orders-e2e"],
  [root, "system-e2e"],
]));
expect(calls.some(([, name]) => name === "system-api-test")).toBe(false);
```

Derive `calls` from `mock.calls.map(([, directory, options]) => [directory, options?.projectName])`. With saved identities, those extra tuples come first in the corresponding directory. Reject teardown by its directory/projectName, not fragile global invocation counts. Verify rejected cleanup leaves the relevant `.builder/run.state` intact. Use `vi.spyOn` for the resolver no-call assertion in T12 if the module loader supports it, otherwise mock only `resolveMeshStage` with a throwing sentinel in a separate suite; `projectNamesForMeshStage` must still return the configured dev name without invoking it.
