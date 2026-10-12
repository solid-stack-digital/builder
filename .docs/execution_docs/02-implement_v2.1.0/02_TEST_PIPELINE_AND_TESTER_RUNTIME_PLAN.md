# Builder V2 Implementation Plan 02 — Test Pipeline and Tester Runtime

## 0. Purpose

This plan fixes the remaining Builder V2 test-execution and tester-runtime gaps after Plan 01 has corrected stage inheritance, application execution profiles, and ordered environment-layer compilation.

The implementation in this file is intentionally concrete. Follow the file order and code shapes below. Do not preserve an existing test merely because it currently passes when that test encodes behavior that contradicts the final V2 specification.

The normative behaviors implemented here are:

1. standalone `make test` / Builder service test remains exactly two phases: unit/isolated, then service E2E;
2. service E2E application runs as production code: Docker target `prod`, `EXEC_MODE=prod`, `INFRA_MODE=integrated`, app env file `.env.e2e`, structured config `base -> prod -> e2e`;
3. service E2E tester runs Docker target `test-e2e`, `EXEC_MODE=e2e`, receives no `INFRA_MODE`, consumes `.env.e2e-tester`, and is host-networked;
4. canonical mesh/global `make test` Phase 1 runs the semantic equivalent of each root service's entire standalone `make test`, sequentially and with teardown;
5. canonical mesh/global `make test` Phase 2 starts a clean `base -> prod -> e2e` mesh and runs the global tester;
6. stage-only mesh services are not Phase-1 members unless also present in root `mesh.json.services`;
7. global tester Compose owns its implementation and helper services; Builder selects one finite runner service rather than pruning the Compose file to only the runner dependency closure;
8. global tester runner is host-networked, uses only effectively published public endpoint references, has `EXEC_MODE=e2e`, no `INFRA_MODE`, and uses root `.env.e2e-tester`;
9. tester Builder-owned runtime variables cannot be overridden by user-controlled layers.

## 1. Files to change

### Add

- `src/core/config/builderEnvironment.ts`
- `src/core/mesh/runners/runMeshServiceTests.ts`
- `tests/v2/testerRuntime.test.ts`
- `tests/v2/meshServiceTestPipeline.test.ts`

### Edit

- `src/core/composition/compileServiceComposition.ts`
- `src/core/mesh/v2/compileMeshTester.ts`
- `src/core/mesh/runners/runMeshTest.ts`
- `src/core/mesh/runners/runMeshTestE2e.ts`
- `src/core/runners/runTest.ts` only if a small shared-option helper is needed; do not change the two-phase semantics
- `tests/v2/meshTester.test.ts`
- `tests/v2/meshRunners.test.ts`
- `tests/conformance/09-mesh-env.test.ts`
- the existing system/orchestration test file that exercises global `mesh test` end-to-end (currently under `tests/conformance` / `tests/docker-acceptance`)

### Delete after callers are migrated

- `src/core/mesh/runners/runMeshTestUnit.ts`

Do not keep `runMeshTestUnit.ts` as the implementation of canonical mesh Phase 1. Its current behavior — compiling the effective `mesh.test` topology and running only isolated test targets — is not the final global-test model.

If a CLI subcommand explicitly exposes a non-canonical `mesh test-unit` diagnostic operation and that operation must remain supported, do **not** delete the file. In that case:

- rename it to `runMeshExplicitTestStage.ts`;
- wire only the explicit diagnostic command to it;
- remove every call to it from canonical `runMeshTest()`;
- document that this command exercises `mesh.json.test` as explicit stage tooling and is not Phase 1 of canonical global `make test`.

Use repository command registration to decide whether this compatibility rename is required. Do not let compatibility tooling alter canonical `mesh test` semantics.

---

# 2. Add one shared Builder-owned environment validator

## 2.1 Why

Application and tester environments have different Builder-owned keys:

- application: `EXEC_MODE`, `INFRA_MODE`, and conditionally `PORT` when a primary app endpoint exists;
- tester: `EXEC_MODE` is always Builder-owned; `INFRA_MODE` is forbidden entirely.

The current code validates some application JSON layers but does not consistently protect `.env.*` sources or tester layers. Centralize this before adding tester env-file handling.

## 2.2 Add `src/core/config/builderEnvironment.ts`

Use this implementation shape:

```ts
import fs from "node:fs";
import { ConfigError } from "../../errors/ConfigError.js";

export const EXEC_MODE_KEY = "EXEC_MODE" as const;
export const INFRA_MODE_KEY = "INFRA_MODE" as const;
export const PORT_KEY = "PORT" as const;

export interface BuilderEnvContext {
  sourceFile: string;
  configPath: string;
  stage: string;
  composition: "service" | "mesh";
}

export function assertNoBuilderOwnedEnvKeys(
  env: Record<string, string>,
  keys: readonly string[],
  context: BuilderEnvContext,
): void {
  for (const key of keys) {
    if (!(key in env)) continue;

    throw new ConfigError({
      sourceFile: context.sourceFile,
      configPath: `${context.configPath}.${key}`,
      stage: context.stage,
      composition: context.composition,
      value: env[key],
      reason: `User-controlled environment cannot set Builder-owned key "${key}"`,
    });
  }
}

export function assertDotenvDoesNotDefineKeys(
  filePath: string,
  keys: readonly string[],
  context: Omit<BuilderEnvContext, "sourceFile">,
): void {
  if (!fs.existsSync(filePath)) return;

  const forbidden = new Set(keys);
  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]!;
    const match = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/.exec(line);
    if (!match) continue;

    const key = match[1]!;
    if (!forbidden.has(key)) continue;

    throw new ConfigError({
      sourceFile: filePath,
      configPath: `${context.configPath}.${key}`,
      stage: context.stage,
      composition: context.composition,
      value: `line ${index + 1}`,
      reason: `Environment file cannot set Builder-owned key "${key}"`,
    });
  }
}
```

Do not parse values. This helper needs only to detect declarations of forbidden keys. Ignore comments and blank lines naturally through the regex.

## 2.3 Reuse from Plan 01

Replace any ad-hoc loops like:

```ts
for (const key of ["EXEC_MODE", "INFRA_MODE", ...]) {
  if (key in env) throw ...;
}
```

with this helper. The application key list is:

```ts
const builderOwnedAppKeys = [
  EXEC_MODE_KEY,
  INFRA_MODE_KEY,
  ...(hasPrimaryEndpoint ? [PORT_KEY] : []),
] as const;
```

For tester-controlled sources use:

```ts
const testerOwnedKeys = [EXEC_MODE_KEY, INFRA_MODE_KEY] as const;
```

`INFRA_MODE` is included even though Builder does not inject it into testers: a user-supplied tester `INFRA_MODE` would violate the contract that testers do not receive it.

---

# 3. Complete service-level E2E tester compilation

## 3.1 Current bug

`compileServiceComposition.ts` currently generates the tester approximately as:

```ts
compose.services.tester = {
  build: { ... target: "test-e2e" },
  network_mode: "host",
  environment: testerEnv,
  depends_on: { app: { condition: "service_healthy" } },
};
```

This omits two required runtime layers:

- `.env.e2e-tester`;
- Builder internal `EXEC_MODE=e2e`.

It also does not fail if tester configuration attempts to inject `INFRA_MODE` or override `EXEC_MODE`.

## 3.2 Edit the service tester block in `src/core/composition/compileServiceComposition.ts`

Locate the block that executes when `profile.attachTester && !options.meshMode`.

Before resolving `effective.tester?.env`, add:

```ts
const testerDotenvPath = path.join(root, ".env.e2e-tester");
const testerBuilderKeys = [EXEC_MODE_KEY, INFRA_MODE_KEY] as const;

assertDotenvDoesNotDefineKeys(testerDotenvPath, testerBuilderKeys, {
  configPath: ".env.e2e-tester",
  stage: "e2e",
  composition: "service",
});

const testerConfigEnv = effective.tester?.env ?? {};
assertNoBuilderOwnedEnvKeys(testerConfigEnv, testerBuilderKeys, {
  sourceFile: buildPath,
  configPath: "tester.env",
  stage: "e2e",
  composition: "service",
});
```

Then keep the existing public-only reference validation and interpolation for `testerConfigEnv`.

Construct the tester service exactly with env-file precedence represented by Compose:

```ts
compose.services.tester = {
  build: {
    context: ".",
    ...(dockerfile === "Dockerfile" ? {} : { dockerfile }),
    target: profile.testerTarget ?? "test-e2e",
  },
  network_mode: "host",
  env_file: [
    {
      path: ".env.e2e-tester",
      required: false,
    },
  ],
  environment: {
    ...resolvedTesterEnv,
    EXEC_MODE: "e2e",
  },
  depends_on: {
    app: {
      condition: "service_healthy",
    },
  },
};
```

Do **not** add `INFRA_MODE`.

The ordering is correct because Compose `environment` overrides `env_file`:

```text
.env.e2e-tester
-> build.json tester.env
-> Builder internal tester environment (EXEC_MODE=e2e)
```

## 3.3 Do not leak application env into tester

Do not spread any of these into tester `environment`:

- `app.env`;
- `.env.e2e`;
- dependency env;
- mesh service env.

Tester env is a separate namespace.

## 3.4 Preserve host-black-box behavior

Keep:

```ts
network_mode: "host"
```

and public-only endpoint-reference enforcement.

The service E2E tester must not use dependency/application `network_*` properties because it is intentionally outside the application Compose network boundary.

---

# 4. Rewrite global tester composition to preserve the tester Compose implementation

## 4.1 Current bug

`src/core/mesh/v2/compileMeshTester.ts` currently:

1. walks references from `tester.service`;
2. keeps only the runner's helper closure;
3. drops unrelated helper services/resources;
4. rejects host networking on helper services;
5. does not attach root `.env.e2e-tester`;
6. does not inject `EXEC_MODE=e2e`;
7. does not explicitly prevent tester `INFRA_MODE`;
8. does not force a build-backed selected runner to `target: test-e2e`.

The final V2 contract says the tester Compose file owns the tester implementation and may contain helper services. Builder selects the finite runner and makes that runner host-networked; it must not reinterpret the tester Compose as a dependency-closure declaration language.

## 4.2 Delete closure-pruning helpers

From `compileMeshTester.ts`, delete:

```ts
function refs(...)
function referencedResources(...)
```

Remove imports needed only by those functions, including `collectBuildSecretReferences` if no other use remains.

Do not build `included`, `res`, or `selected` subsets.

## 4.3 Validate the whole tester Compose

Immediately after loading and rebasing:

```ts
const raw = rebaseComposePaths(...);

if (!raw.services || !raw.services[tester.service]) {
  throw new ConfigError(...);
}

validateComposeResourceReferences(raw, {
  sourceFile: file,
  stage,
  composition: "mesh",
});
```

Then validate all tester Compose services:

```ts
for (const [serviceName, service] of Object.entries(raw.services)) {
  if (service.extends !== undefined) {
    throw new ConfigError({
      sourceFile: file,
      configPath: `services.${serviceName}.extends`,
      stage,
      composition: "mesh",
      reason: "Tester Compose extends is unsupported until effective Compose inheritance can be validated safely",
    });
  }

  assertNoServiceBuildContexts(service, `services.${serviceName}`, file);
}
```

Preserve the existing service-reference and named-resource validation provided by `validateComposeResourceReferences()` / namespacing.

## 4.4 Remove the invented helper-host-network prohibition

Delete this rule:

```ts
if (name !== tester.service && svc.network_mode === "host") {
  throw ... "Only the selected tester runner may use host networking";
}
```

The final specification does not prohibit helper services from using host networking. The selected runner must be host-networked, but Builder should not invent unrelated tester-helper policy unless the normative docs say so.

Keep selected-runner compatibility validation:

```ts
const selectedRaw = raw.services[tester.service]!;

if (
  selectedRaw.network_mode !== undefined &&
  selectedRaw.network_mode !== "host"
) {
  throw new ConfigError({
    sourceFile: file,
    configPath: `services.${tester.service}.network_mode`,
    stage,
    composition: "mesh",
    reason: "Selected tester runner must be compatible with host networking",
  });
}

if (selectedRaw.networks !== undefined) {
  throw new ConfigError({
    sourceFile: file,
    configPath: `services.${tester.service}.networks`,
    stage,
    composition: "mesh",
    reason: "Selected host-network tester runner cannot declare Compose networks",
  });
}

if (selectedRaw.ports !== undefined) {
  throw new ConfigError({
    sourceFile: file,
    configPath: `services.${tester.service}.ports`,
    stage,
    composition: "mesh",
    reason: "Selected host-network tester runner cannot define ports",
  });
}
```

## 4.5 Namespace the complete tester Compose

Replace closure-specific namespacing with:

```ts
const ns = namespaceDependencyCompose({
  dependencyKey: "mesh-tester",
  namespacePrefix: "mesh-tester",
  document: raw,
  allocator: nameAllocator,
  identityPrefix: JSON.stringify(["mesh-tester"]),
});
```

This ensures:

- all tester helper services remain;
- all named resources remain when declared/used;
- internal service references are rewritten consistently;
- tester resources cannot collide with system services/resources.

## 4.6 Force build-backed selected runner to `test-e2e`

After namespacing, get:

```ts
const runner = ns.serviceNameMap.get(tester.service)!;
const runnerSvc = ns.document.services[runner]!;
```

Add helper:

```ts
function applyTesterBuildTarget(service: ComposeService): void {
  if (service.build === undefined) return;

  if (typeof service.build === "string") {
    service.build = {
      context: service.build,
      target: "test-e2e",
    };
    return;
  }

  service.build = {
    ...service.build,
    target: "test-e2e",
  };
}
```

Call:

```ts
applyTesterBuildTarget(runnerSvc);
```

Do not rewrite an image-only runner; an image-only runner is the tester Compose's equivalent finite implementation and has no Docker target to select.

If the repository already has a helper that safely changes only `build.target`, reuse it instead of duplicating.

## 4.7 Attach root `.env.e2e-tester`

Add a small helper in the same file:

```ts
function appendEnvFile(
  existing: ComposeService["env_file"],
  next: { path: string; required: boolean },
): ComposeService["env_file"] {
  if (existing === undefined) return [next];
  return Array.isArray(existing) ? [...existing, next] : [existing, next];
}
```

Because the tester Compose is rebased to `meshDir`, the Builder-required root file is:

```ts
runnerSvc.env_file = appendEnvFile(runnerSvc.env_file, {
  path: ".env.e2e-tester",
  required: false,
});
```

If `rebaseComposePaths()` converts all paths to absolute or a different normalized form, use the same representation it uses for root-relative env files. The semantic result must point to `<meshDir>/.env.e2e-tester`, not `<tester-compose-dir>/.env.e2e-tester`.

## 4.8 Protect tester-owned keys

Before final environment construction:

```ts
const testerBuilderKeys = [EXEC_MODE_KEY, INFRA_MODE_KEY] as const;
const meshTesterDotenv = path.join(meshDir, ".env.e2e-tester");

assertDotenvDoesNotDefineKeys(meshTesterDotenv, testerBuilderKeys, {
  configPath: ".env.e2e-tester",
  stage,
  composition: "mesh",
});

const rawRunnerEnvironment = normalizeComposeEnvironment(
  runnerSvc.environment,
  "tester runner environment",
);

assertNoBuilderOwnedEnvKeys(rawRunnerEnvironment, testerBuilderKeys, {
  sourceFile: file,
  configPath: `services.${tester.service}.environment`,
  stage,
  composition: "mesh",
});

const testerEnv = tester.env ?? {};
assertNoBuilderOwnedEnvKeys(testerEnv, testerBuilderKeys, {
  sourceFile: meshPath,
  configPath: "tester.env",
  stage,
  composition: "mesh",
});
```

Then retain public-only reference validation:

```ts
assertMeshTesterEnvPublic(testerEnv, "tester.env");
```

## 4.9 Build final selected-runner env

Use:

```ts
runnerSvc.environment = {
  ...rawRunnerEnvironment,
  ...resolveMeshEnvMap(testerEnv, meshCtx, "tester.env"),
  EXEC_MODE: "e2e",
};
```

Do **not** add `INFRA_MODE`.

The final Builder-controlled order is:

```text
root .env.e2e-tester
-> mesh.json tester.env
-> Builder internal tester env
```

Existing tester-Compose implementation environment remains part of the Compose implementation. It is not a Builder JSON layer and is preserved rather than silently erased.

## 4.10 Preserve helper lifecycle and add system readiness to runner

Keep the runner's existing helper dependencies:

```ts
const depends = normalizeComposeDependsOn(runnerSvc.depends_on);
```

Then add every effective top-level application:

```ts
for (const app of effectiveTopLevelApps) {
  depends[app] = { condition: "service_healthy" };
}
runnerSvc.depends_on = depends;
```

Do not add system app readiness edges to helper services unless tester Compose itself declares them.

## 4.11 Return the entire namespaced tester document

Return:

```ts
return {
  services: ns.document.services as Record<string, ComposeService>,
  ...(ns.document.volumes ? { volumes: ns.document.volumes } : {}),
  ...(ns.document.networks ? { networks: ns.document.networks } : {}),
  ...(ns.document.configs ? { configs: ns.document.configs } : {}),
  ...(ns.document.secrets ? { secrets: ns.document.secrets } : {}),
  runnerServiceName: runner,
};
```

No closure filtering.

---

# 5. Replace canonical mesh Phase 1 with each root service's full standalone test lifecycle

## 5.1 Current bug

Current `runMeshTestUnit.ts` resolves the effective mesh `test` stage and runs each effective service's `test` target only. That is not canonical global `make test`.

The final model requires:

```text
for every ROOT mesh.json.services entry, sequentially:
  service unit / isolated
  service E2E
  full teardown

then, only when all pass:
  clean global base -> prod -> e2e
  global tester
```

## 5.2 Add `src/core/mesh/runners/runMeshServiceTests.ts`

Use this implementation shape:

```ts
import path from "node:path";
import pc from "picocolors";
import { resolveProjectDir } from "../../../utils/paths.js";
import { resolveInsideProject } from "../../config/pathSafety.js";
import { runTest } from "../../runners/runTest.js";
import { getMeshJson } from "../getMeshJson.js";
import type { MeshRunOptions } from "../MeshRunOptions.js";

export async function runMeshServiceTests(
  options: MeshRunOptions = {},
): Promise<number> {
  const meshDir = resolveProjectDir(options.projectDir);
  const meshPath = path.join(meshDir, "mesh.json");
  const mesh = getMeshJson(meshDir);

  const rootServices = Object.entries(mesh.services)
    .sort(([left], [right]) => left.localeCompare(right));

  for (const [serviceName, service] of rootServices) {
    const serviceDir = resolveInsideProject(meshDir, service.path, {
      sourceFile: meshPath,
      configPath: `services.${serviceName}.path`,
      stage: "test",
      composition: "mesh",
    });

    console.log(
      pc.bold(pc.cyan(`\n-> Running full standalone test lifecycle for [${serviceName}]\n`)),
    );

    const status = await runTest({
      projectDir: serviceDir,
      debug: Boolean(options.debug),
      detach: false,
      skipBanner: true,
      silenceWarnings: false,
      ...(options.dryRun !== undefined ? { dryRun: options.dryRun } : {}),
    });

    if (status !== 0) return status;
  }

  return 0;
}
```

### Critical details

- Iterate `mesh.services`, **not** `resolveMeshStage(mesh, "test")`.
- Sort by root service key for deterministic order.
- Run `runTest()` so each service gets both phases.
- Use the root service's own path; do not use a `mesh.test.services.<name>.path` override for canonical Phase 1.
- A service introduced only by `prod`, `e2e`, or `test` is not included.
- Stop immediately on first nonzero status.
- Do not run services concurrently.

## 5.3 Why calling `runTest()` is correct

`runTest()` already implements semantic standalone service `make test`:

```text
runTestUnit()
-> if success
runTestE2e()
```

Both runners already perform stale teardown before execution and teardown in `finally`, including run-state cleanup. Reusing them prevents a second divergent test implementation.

Do not duplicate their Compose invocation logic in mesh code.

---

# 6. Rewrite `runMeshTest.ts`

Replace:

```ts
import { runMeshTestUnit } from "./runMeshTestUnit.js";
```

with:

```ts
import { runMeshServiceTests } from "./runMeshServiceTests.js";
```

Rewrite the function clearly rather than preserving the current minified one-line form:

```ts
import pc from "picocolors";
import type { MeshRunOptions } from "../MeshRunOptions.js";
import { runMeshServiceTests } from "./runMeshServiceTests.js";
import { runMeshTestE2e } from "./runMeshTestE2e.js";

export async function runMeshTest(
  options: MeshRunOptions = {},
): Promise<number> {
  console.log(
    pc.bold(
      pc.blue(
        "\n========================================\n" +
          "MESH TEST PIPELINE\n" +
          "========================================\n",
      ),
    ),
  );

  console.log(
    pc.bold(pc.blue("[1/2] ROOT SERVICE TEST LIFECYCLES")),
  );

  const serviceStatus = await runMeshServiceTests(options);
  if (serviceStatus !== 0) return serviceStatus;

  console.log(pc.bold(pc.blue("[2/2] GLOBAL MESH E2E")));
  return runMeshTestE2e(options);
}
```

Do not catch and convert exceptions here; preserve existing CLI error handling.

---

# 7. Preserve Phase-2 clean-start behavior in `runMeshTestE2e.ts`

`runMeshTestE2e.ts` already compiles E2E, checks ports, performs a stale teardown before `up`, and tears down in `finally`. Keep that shape.

After Plan 01, `compileMeshEnvironment("e2e")` must already mean:

```text
mesh structured config = base -> prod -> e2e
app target = prod
app EXEC_MODE = prod
app INFRA_MODE = integrated
app env file = each service .env.e2e
```

The tester generated by Section 4 of this plan must mean:

```text
selected runner target = test-e2e when build-backed
EXEC_MODE = e2e
INFRA_MODE absent
root .env.e2e-tester
host network
```

Do not add `.env.prod` to either application or tester env files.

## 7.1 Optional defensive cleanup assertion

If there is an existing run-state utility capable of checking active service run states, add a debug assertion before Phase 2 to ensure no Phase-1 run state remains. Do not make this a new runtime dependency if none exists; the required resource cleanup already occurs through the standalone service runners.

---

# 8. Decide the fate of `mesh.json.test` tooling explicitly

The schema retains `mesh.json.test`. Final V2 says it is a structured namespace for explicit Builder test-stage tooling, but canonical global `make test` does not use it for Phase 1.

Therefore:

### If CLI still exposes explicit `mesh test-unit`

Keep explicit test-stage support under a renamed implementation:

```text
src/core/mesh/runners/runMeshExplicitTestStage.ts
```

Move the current `runMeshTestUnit.ts` behavior there, including `validateMeshTestStage()`.

Update command dispatch so only explicit `mesh ... test-unit` calls it.

Tests that currently verify `mesh.test` bindings/publication should be retargeted to this explicit operation.

### If CLI no longer exposes explicit `mesh test-unit`

Delete:

- `runMeshTestUnit.ts`;
- `validateMeshTestStage.ts` if no other references remain;
- tests whose sole purpose is that non-canonical operation.

Do not make canonical `runMeshTest()` consume `mesh.test` merely to keep those tests alive.

---

# 9. Rewrite global tester tests

## 9.1 Edit `tests/v2/meshTester.test.ts`

### Replace current first test

Current expectation:

```ts
expect(c.compose.services).not.toHaveProperty("mesh-tester--unrelated");
```

is wrong under final V2.

Rename test to:

```ts
it("preserves the complete tester Compose and selects the explicit runner", () => {
```

Assert:

```ts
expect(c.testerServiceName).toBe("mesh-tester--playwright");
expect(c.compose.services).toHaveProperty("mesh-tester--setup");
expect(c.compose.services).toHaveProperty("mesh-tester--playwright");
expect(c.compose.services).toHaveProperty("mesh-tester--unrelated");
```

Keep helper dependency assertion and add:

```ts
expect(
  (c.compose.services["mesh-tester--playwright"]?.depends_on as any)
    ["mesh-tester--setup"],
).toEqual({ condition: "service_completed_successfully" });
```

### Replace current helper-host-network rejection test

Delete expectation that helper host networking fails.

Replace with:

```ts
it("preserves helper host networking while forcing only the runner contract", () => {
  // helper has network_mode: host
  // runner selected as tester.service
  const c = compileMeshComposition("e2e", root);
  expect(c.compose.services["mesh-tester--helper"]?.network_mode).toBe("host");
  expect(c.compose.services["mesh-tester--runner"]?.network_mode).toBe("host");
});
```

### Add build target test

Fixture:

```yaml
services:
  runner:
    build:
      context: .
      dockerfile: Dockerfile
      target: arbitrary-old-target
```

Expected:

```ts
expect((runner.build as any).target).toBe("test-e2e");
```

### Add image-only runner test

Image-only runner must compile without Builder inventing a `build` block.

```ts
expect(runner.build).toBeUndefined();
expect(runner.image).toBe("busybox");
```

### Keep network-reference rejection test

Retain the existing `network_url` rejection in global `tester.env`.

### Add unpublished-public-reference test

Use `public_url` against endpoint with `publicPort` but absent mesh `publish`, and expect failure.

Then add valid published case and expect `http://127.0.0.1:<port>`.

---

# 10. Add tester runtime tests

## 10.1 Add `tests/v2/testerRuntime.test.ts`

Cover both service and mesh testers.

### TST-RUN-001 — service E2E app is prod, tester is e2e

Compile standalone E2E and assert:

```ts
const app = result.compose.services.app!;
const tester = result.compose.services.tester!;

expect((app.build as any).target).toBe("prod");
expect(env(app).EXEC_MODE).toBe("prod");
expect(env(app).INFRA_MODE).toBe("integrated");
expect(app.env_file).toEqual([{ path: ".env.e2e", required: false }]);

expect((tester.build as any).target).toBe("test-e2e");
expect(env(tester).EXEC_MODE).toBe("e2e");
expect(env(tester).INFRA_MODE).toBeUndefined();
expect(tester.env_file).toEqual([
  { path: ".env.e2e-tester", required: false },
]);
expect(tester.network_mode).toBe("host");
```

### TST-RUN-002 — service tester env precedence

Create:

```dotenv
# .env.e2e-tester
VALUE=file
FILE_ONLY=yes
```

and build config:

```json
{
  "tester": {
    "env": {
      "VALUE": "json",
      "JSON_ONLY": "yes"
    }
  }
}
```

Static compiled Compose should have env file plus `environment.VALUE=json`. For a Docker acceptance test, have tester print variables and verify `VALUE=json`, both `FILE_ONLY` and `JSON_ONLY` present, `EXEC_MODE=e2e`, no `INFRA_MODE`.

### TST-RUN-003 — tester JSON cannot set `EXEC_MODE`

Expect `ConfigError` containing:

```text
tester.env.EXEC_MODE
Builder-owned
```

### TST-RUN-004 — tester JSON cannot set `INFRA_MODE`

Same for `INFRA_MODE`.

### TST-RUN-005 — `.env.e2e-tester` cannot set `EXEC_MODE`

Write file with `EXEC_MODE=bad`; compile must fail before runtime.

### TST-RUN-006 — `.env.e2e-tester` cannot set `INFRA_MODE`

Same.

### TST-RUN-007 — service tester cannot use `network_*`

Keep or add one assertion for each family through table-driven test:

```ts
for (const property of [
  "network_host",
  "network_port",
  "network_address",
  "network_url",
]) { ... }
```

### TST-RUN-008 — service tester public endpoint must actually be published

A referenced app endpoint lacking `publicPort` must fail.

### TST-RUN-009 — global tester internal env

Compile global E2E and assert selected runner:

```ts
expect(env(runner).EXEC_MODE).toBe("e2e");
expect(env(runner).INFRA_MODE).toBeUndefined();
expect(runner.network_mode).toBe("host");
```

### TST-RUN-010 — global tester root env file

Assert `runner.env_file` contains root `.env.e2e-tester` after any tester Compose env files.

### TST-RUN-011 — global tester key protection

Test all three user-controlled sources separately:

1. tester Compose selected runner `environment.EXEC_MODE`;
2. `mesh.json tester.env.EXEC_MODE`;
3. root `.env.e2e-tester` `EXEC_MODE`.

Repeat for `INFRA_MODE`.

### TST-RUN-012 — global tester helper env does not receive tester internal keys

A helper service must not automatically receive `EXEC_MODE=e2e`.

---

# 11. Rewrite mesh runner unit tests

## 11.1 Edit `tests/v2/meshRunners.test.ts`

Change mocks from:

```ts
const { unit, e2e } = ...
vi.mock(".../runMeshTestUnit.js", ...)
```

to:

```ts
const { services, e2e } = vi.hoisted(() => ({
  services: vi.fn(),
  e2e: vi.fn(),
}));

vi.mock(
  "../../src/core/mesh/runners/runMeshServiceTests.js",
  () => ({ runMeshServiceTests: services }),
);
```

Tests:

```ts
it("stops before global E2E when any root service lifecycle fails", async () => {
  services.mockResolvedValueOnce(2);
  expect(await runMeshTest({})).toBe(2);
  expect(e2e).not.toHaveBeenCalled();
});

it("runs global E2E only after every root service lifecycle passes", async () => {
  services.mockResolvedValueOnce(0);
  e2e.mockResolvedValueOnce(0);
  expect(await runMeshTest({})).toBe(0);
  expect(services).toHaveBeenCalledOnce();
  expect(e2e).toHaveBeenCalledOnce();
});
```

---

# 12. Add direct Phase-1 orchestration tests

## 12.1 Add `tests/v2/meshServiceTestPipeline.test.ts`

Mock `runTest()` and create a mesh with root services inserted in deliberately non-alphabetical order:

```json
{
  "services": {
    "zeta": { "path": "zeta" },
    "alpha": { "path": "alpha" },
    "middle": { "path": "middle" }
  },
  "e2e": {
    "services": {
      "only-e2e": { "path": "only-e2e" }
    }
  }
}
```

### PIPE-001 — deterministic root-only order

Expect `runTest` call project dirs:

```text
alpha
middle
zeta
```

and never `only-e2e`.

### PIPE-002 — failure stops later services

Mock alpha success, middle failure. Expect zeta never called.

### PIPE-003 — root path, not stage override path

Give:

```json
{
  "services": {
    "api": { "path": "api" }
  },
  "test": {
    "services": {
      "api": { "path": "api-test-alternate" }
    }
  }
}
```

Canonical Phase 1 must call standalone test in `api`, not `api-test-alternate`.

### PIPE-004 — forwards dry-run/debug safely

Assert options passed to `runTest()` include:

```ts
{
  debug: true,
  detach: false,
  dryRun: true,
  skipBanner: true,
}
```

### PIPE-005 — does not require global tester for Phase 1 itself

Call `runMeshServiceTests()` on mesh without `tester` and expect the root service standalone tests to be invoked. `runMeshTest()` as a whole will still fail when entering Phase 2 if global tester is absent.

---

# 13. Update current conformance expectations that encode superseded execution semantics

## 13.1 `tests/conformance/09-mesh-env.test.ts`

### MEN-028

Current assertion:

```ts
expect(env(result.compose.services.api)).toMatchObject({
  EXEC_MODE: "e2e",
  INFRA_MODE: "integrated",
  STAGE: "e2e",
});
```

Replace with:

```ts
expect(env(result.compose.services.api)).toMatchObject({
  EXEC_MODE: "prod",
  INFRA_MODE: "integrated",
  STAGE: "e2e",
});
```

Rename test from “prod app image and E2E runtime” to:

```text
MEN-028 runs global E2E apps as production execution with E2E configuration
```

### Add tester assertion

```ts
const runner = result.compose.services[result.testerServiceName!]!;
expect(env(runner).EXEC_MODE).toBe("e2e");
expect(env(runner).INFRA_MODE).toBeUndefined();
```

### Existing `runMeshTestUnit` tests

Tests around current lines 164 onward exercise explicit `mesh.test` tooling. Handle them according to Section 8:

- if explicit test-stage command remains, import renamed `runMeshExplicitTestStage` and keep them there;
- if explicit command is removed, delete those tests.

Do not point them at `runMeshServiceTests()`, because canonical Phase 1 intentionally ignores `mesh.test` overlays.

---

# 14. Rewrite system orchestration tests for five-step two-service flow

Find the current system test that models two root services plus global E2E. The existing implementation expected roughly:

```text
service A unit
service B unit
global E2E
```

Replace expected order with:

```text
service A unit
service A service-E2E
service B unit
service B service-E2E
global E2E
```

for alphabetically sorted root service names.

## 14.1 Assert each service-E2E composition

For each service E2E app:

```ts
expect((app.build as any).target).toBe("prod");
expect(env(app).EXEC_MODE).toBe("prod");
expect(env(app).INFRA_MODE).toBe("integrated");
```

For each service tester:

```ts
expect((tester.build as any).target).toBe("test-e2e");
expect(env(tester).EXEC_MODE).toBe("e2e");
expect(env(tester).INFRA_MODE).toBeUndefined();
```

## 14.2 Failure matrix

Add/replace scenarios:

| Scenario | Expected `runCompose` executions | Later phases |
|---|---:|---|
| first service unit fails | 1 | no service E2E, no later service, no global E2E |
| first service E2E fails | 2 | no later service, no global E2E |
| second service unit fails | 3 | no second service E2E, no global E2E |
| second service E2E fails | 4 | no global E2E |
| all Phase 1 pass | 5 | global E2E runs |
| global E2E fails | 5 | overall returned status is global tester status |

## 14.3 Teardown assertions

Each standalone sub-run already performs:

```text
stale teardown before up
+ teardown in finally
```

Global E2E does the same.

For two services with all five executions, expect ten teardown calls if the test mocks at that exact layer. If the test abstracts each runner instead, assert each phase gets pre/post cleanup rather than hardcoding ten.

Also assert all service and mesh run-state files are cleared after success and after failure.

---

# 15. Docker acceptance tests for tester isolation

Static composition tests are insufficient for env precedence. Add at least one Docker-backed service fixture and one global tester fixture when Docker acceptance runs are available.

## 15.1 Service E2E fixture

Tester script should fail unless:

```text
EXEC_MODE=e2e
INFRA_MODE unset
FILE_ONLY from .env.e2e-tester is present
JSON_ONLY from tester.env is present
VALUE equals tester.env override
```

Application script should fail unless:

```text
EXEC_MODE=prod
INFRA_MODE=integrated
E2E_FILE from .env.e2e is present
PROD_FILE from .env.prod is absent
```

## 15.2 Global E2E fixture

Use tester Compose with:

- selected runner;
- setup helper;
- unrelated helper that writes/holds a marker so its actual materialization can be observed.

Assert all three services exist in `docker compose config` / runtime as appropriate, runner uses host networking, and global tester sees root `.env.e2e-tester` without `INFRA_MODE`.

---

# 16. Test-first implementation gates

For each subsection, prove the gap before applying the fix.

## Gate A — service tester runtime

1. Add TST-RUN-001 through TST-RUN-006 first.
2. Run them against current code.
3. Expected current failures:
   - missing tester env_file;
   - missing `EXEC_MODE=e2e` on tester;
   - user key conflicts not rejected.
4. If a proposed regression test unexpectedly passes, inspect whether a different code path already implements the behavior. Do not duplicate it.

## Gate B — global tester full Compose

1. Change current test to require unreferenced helper preservation.
2. It must fail against current closure-pruning implementation.
3. Add helper host-network acceptance; it must fail under current invented prohibition.
4. Add target/env-file/internal-env tests; they should fail where current behavior is missing.
5. Apply Section 4 only after confirming failures.

## Gate C — canonical mesh Phase 1

1. Add `meshServiceTestPipeline.test.ts` first.
2. Against current `runMeshTestUnit`, it should demonstrate that canonical mesh test is not invoking full `runTest()` per root service.
3. Update `runMeshTest.ts` only after the regression is proven.

---

# 17. Commands to run after this plan

When package tooling is available:

```bash
pnpm vitest run tests/v2/testerRuntime.test.ts
pnpm vitest run tests/v2/meshTester.test.ts
pnpm vitest run tests/v2/meshServiceTestPipeline.test.ts
pnpm vitest run tests/v2/meshRunners.test.ts
pnpm vitest run tests/conformance/09-mesh-env.test.ts
```

Then orchestration/system tests:

```bash
pnpm vitest run tests/conformance
```

Then Docker-backed tests:

```bash
pnpm vitest run tests/docker-acceptance
```

Then complete suite:

```bash
pnpm test
```

If repository scripts use different names, use the scripts already declared in `package.json`; do not install a second test framework.

---

# 18. Completion checklist

Do not mark this plan complete until all are true:

- [ ] standalone service `runTest()` still runs unit then service E2E;
- [ ] service E2E app target is `prod`;
- [ ] service E2E app `EXEC_MODE=prod`;
- [ ] service E2E app `INFRA_MODE=integrated`;
- [ ] service E2E app env file is `.env.e2e` only;
- [ ] service E2E tester target is `test-e2e`;
- [ ] service E2E tester has `.env.e2e-tester`;
- [ ] service E2E tester has `EXEC_MODE=e2e`;
- [ ] service E2E tester has no `INFRA_MODE`;
- [ ] tester public-only references are enforced;
- [ ] tester Builder-owned env conflicts fail in JSON and dotenv sources;
- [ ] global tester Compose preserves all helper services/resources;
- [ ] global selected runner is host-networked;
- [ ] helper host networking is not rejected merely for being a helper;
- [ ] build-backed global tester runner gets target `test-e2e`;
- [ ] image-only global tester remains image-only;
- [ ] global tester receives root `.env.e2e-tester`;
- [ ] global tester gets `EXEC_MODE=e2e` and no `INFRA_MODE`;
- [ ] global tester remains health-gated on every effective top-level application;
- [ ] canonical mesh Phase 1 iterates root `mesh.services` only;
- [ ] canonical mesh Phase 1 order is deterministic and sequential;
- [ ] each root service Phase 1 executes unit **and** service E2E;
- [ ] any Phase-1 failure aborts later services and global E2E;
- [ ] every Phase-1 service lifecycle tears down completely;
- [ ] Phase 2 starts clean and runs `base -> prod -> e2e` global E2E;
- [ ] `mesh.json.test` is retained only as explicit test-stage tooling, not canonical Phase 1;
- [ ] tests that asserted the superseded unit-only global Phase 1 are removed/replaced.
