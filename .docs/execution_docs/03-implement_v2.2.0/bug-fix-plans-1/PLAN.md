# V2 specification audit: confirmed bugs and implementation fix plan

Scope: `.docs/specs_v2/SPECS_V2.md`, `MESH_JSON_DOCS.md`, `BUILD_JSON_DOCS.md`, and `.docs/EXECUTION_MODEL.md`, compared with the current `src/` implementation and conformance/runtime tests. This is an implementation plan only; no product code or tests were changed during this audit. The three items below have concrete reproductions. Do not add a fix to this batch if its proposed red test passes against the unmodified implementation. A failing test caused by a broken fixture or unavailable Docker is inconclusive; repair the fixture or environment and rerun the gate.

## Confirmed bug list

| ID | Bug | Current behavior | Required behavior |
| --- | --- | --- | --- |
| BF-01 | Valid short-form `depends_on` becomes an invalid long-form mapping when Builder adds readiness edges. | `depends_on: [helper]` becomes `depends_on: {helper: {}}`; `docker compose config --quiet` rejects it because `condition` is missing. | Every dependency in generated Compose uses `condition: service_healthy`, including edges originally written in short or long form. No compiled edge uses `service_started`. |
| BF-02 | A successful finite helper aborts global E2E before the selected tester finishes. The same runner command is used by service E2E. | `up --abort-on-container-exit --exit-code-from <tester>` stops all containers when *any* helper exits, even with status 0. A real Builder fixture returned status 1 before its runner printed `runner-done`. | Let helpers finish independently; wait for the selected tester and return **its** exit status, then tear down the entire composition. |
| BF-03 | A materialized dependency with a file-backed Compose config/secret can refer to a missing file without a compile-time error. | `compileServiceComposition('prod', ...)` succeeds with `configs.foo.file: ./missing-file.txt`; even `docker compose config --quiet` accepts the generated YAML, so the problem survives preflight until Docker creates the resource. | Reject a missing or non-regular materialized config/secret file with a `ConfigError` naming the Compose file and logical field. A substituted, non-materialized implementation must not be rejected solely for its unused file resource. |

Normative basis: `SPECS_V2.md` §§4, 17, 20, 28–29 require fail-fast declared-file validation, healthy Builder-created readiness edges, tester Compose helper support, decisive selected-tester exit status, and test teardown. The user's updated requirement is stronger for compiled lifecycle edges: **all** generated Compose dependencies must use `service_healthy`, including user-authored Compose dependencies. `MESH_JSON_DOCS.md` permits tester helper services. `BUILD_JSON_DOCS.md` permits dependency Compose configs/secrets and requires materialized dependencies to function. `EXECUTION_MODEL.md` §§2, 5–6 require sequential service tests followed by global E2E and cleanup after every test phase. None of these fixes reintroduces `mesh.json.test`; the existing root-field rejection must remain in place.

## Reproduction evidence captured during the audit

1. A generated global tester with valid `depends_on: [helper]` failed Builder's Docker preflight: `services.mesh-tester--runner.depends_on.mesh-tester--helper missing property 'condition'`. Inspection of `src/core/composition/composeDependsOn.ts` shows the short-form entry is converted to `{}`.
2. A real `runMeshTestE2e` fixture had an Alpine helper print `helper-done` after one second and an Alpine tester scheduled to print `runner-done` after 25 seconds. Builder used `up --abort-on-container-exit --exit-code-from mesh-tester--runner`; Compose printed `Aborting on container exit`, stopped the app and tester, and Builder returned `BUILDER_E2E_STATUS 1`. A standalone Compose control with a 30-second runner returned 137 after its successful helper exited. A second Compose control proved `up -d` followed by `wait runner` survives a successful helper exit and propagates a failing runner's exit code (7).
3. `compileService('prod', fixtureWithMissingConfig)` returned `COMPILED [ 'app', 'dep--store--owner' ]` even though `configs.missing-config.file` named `./missing-file.txt`, which had not been created. `docker compose config --quiet` also returned 0 for that generated composition.

The runtime examples used disposable temporary fixtures and tore down Compose projects. They are observations, not substitutions for the red tests below.

## Common implementation gate and order

1. Start with a clean working tree (`git status --short` is read-only). Retain the existing mesh `test` rejection tests.
2. Add **only** BF-01's test, run it, and record its exact failure. Proceed with BF-01 only if the failure is the invalid `depends_on` mapping. Then make BF-01 green.
3. Add **only** BF-02's Docker acceptance test, run it with a working Docker daemon and record the failing tester status. Proceed with BF-02 only if the helper exit causes the selected tester to stop early. Then make BF-02 green.
4. Add **only** BF-03's test, run it, and record that compilation unexpectedly succeeds. Proceed with BF-03 only if the failing assertion demonstrates that missing materialized files were accepted. Then make BF-03 green.
5. After each fix, run its control cases. At the end run `pnpm typecheck`, `pnpm test`, `pnpm test:docker`, `pnpm build`, and `pnpm check:v2-no-legacy`. Run `git diff --check` and `git status --short` to review the patch. Do not use Git mutation commands (`add`, `commit`, `push`, etc.).

When a gate unexpectedly passes before implementation, mark that item **not reproduced** and omit its code change and claimed bug from the final fix report. When a gate fails for an unrelated reason (invalid fixture, Docker unavailable, image pull error), it does not authorize the proposed fix.

## BF-01 — compile every Compose lifecycle edge as healthy

**Why it is a bug.** Docker Compose accepts `depends_on: [helper]`, but Builder converts that entry to the invalid long form `helper: {}` when it adds tester readiness. `dependencyLifecycle.ts` repeats this conversion when augmenting a dependency owner's existing edges. The required Builder compilation policy is stronger than Compose's default: **every** dependency edge in emitted Compose must have `condition: service_healthy`. This includes raw short-form and raw long-form edges, not only edges Builder adds. A structurally correct test must inspect every generated edge and run Docker's own `config --quiet`.

**Red test: tester edge.** Add this to `tests/conformance/v220-audit-regressions.test.ts` (create the file with imports and `afterEach(cleanupFixtures)` as shown). Run `pnpm exec vitest run tests/conformance/v220-audit-regressions.test.ts -t 'BF-01 tester'` before editing `src/`. Current result: the condition assertion fails and Docker config reports `missing property 'condition'`. Expected result after fix: config succeeds and **both** the helper and app edges have `condition: service_healthy`.

```ts
import { spawnSync } from 'node:child_process';
import { afterEach, expect, it } from 'vitest';
import { stringify } from 'yaml';
import {
  cleanupFixtures, compileMesh, compileService, dep, fixture,
  http, meshFixture, ownerBundle,
} from './fixture.js';

afterEach(cleanupFixtures);

function dockerConfig(root: string, compose: object) {
  return spawnSync('docker', [
    'compose', '--project-directory', root, '-f', '-', 'config', '--quiet',
  ], { cwd: root, encoding: 'utf8', input: stringify(compose) });
}

it('BF-01 tester short depends_on remains valid after healthy app edges', () => {
  const root = meshFixture(
    {
      services: { api: { path: 'api' } },
      tester: { compose: 'tester.yml', service: 'runner' },
    },
    { api: { app: {} } },
    { 'tester.yml': { services: {
      helper: {
        image: 'alpine:latest',
        healthcheck: { test: ['CMD', 'true'] },
      },
      runner: { image: 'alpine:latest', depends_on: ['helper'] },
    } } },
  );
  const compose = compileMesh('e2e', root).compose;
  expect(compose.services['mesh-tester--runner']?.depends_on).toMatchObject({
    'mesh-tester--helper': { condition: 'service_healthy' },
    api: { condition: 'service_healthy' },
  });
  const result = dockerConfig(root, compose);
  expect(result.status).toBe(0);
});
```

**Red test: dependency-owner edge.** Add the following test to the same file. It prevents fixing only the tester path while leaving the parallel `asMap` conversion broken. `cache` is a valid materialized target; `store`'s owner has a user-authored helper edge plus a Builder-created edge to `cache`. Current Docker config rejects `dep--store--helper: {}`. After fix, **both** edges are `service_healthy`.

```ts
it('BF-01 dependency owner retains a valid short helper edge', () => {
  const root = fixture({
    app: {},
    dependencies: {
      cache: dep('cache.yml', 'owner', 6379),
      store: {
        ...dep('store.yml', 'owner', 6380),
        dependsOn: ['dependencies.cache'],
      },
    },
  }, {
    'cache.yml': ownerBundle(),
    'store.yml': {
      services: {
        owner: {
          image: 'alpine:latest',
          healthcheck: { test: ['CMD', 'true'] },
          depends_on: ['helper'],
        },
        helper: {
          image: 'alpine:latest',
          healthcheck: { test: ['CMD', 'true'] },
        },
      },
    },
  });
  const compose = compileService('prod', root).compose;
  expect(compose.services['dep--store--owner']?.depends_on).toMatchObject({
    'dep--store--helper': { condition: 'service_healthy' },
    'dep--cache--owner': { condition: 'service_healthy' },
  });
  expect(dockerConfig(root, compose).status).toBe(0);
});
```

**Implementation.** Edit `src/core/composition/composeDependsOn.ts`. Its public function must normalize **both** short and long forms to `service_healthy`. Preserve unrelated long-form options such as `required` and `restart`, but replace any incoming `condition` (including `service_started` or `service_completed_successfully`). This is an intentional Builder compilation rule, not an attempt to preserve raw Compose's original startup semantics:

```ts
export function normalizeComposeDependsOn(value: unknown): Record<string, unknown> {
  const entries = Array.isArray(value)
    ? value.filter((name): name is string => typeof name === 'string')
        .map(name => [name, {}] as const)
    : value && typeof value === 'object'
      ? Object.entries(value as Record<string, unknown>)
      : [];
  return Object.fromEntries(entries.map(([name, options]) => [
    name,
    {
      ...(options && typeof options === 'object' && !Array.isArray(options)
        ? options as Record<string, unknown> : {}),
      condition: 'service_healthy',
    },
  ]));
}
```

Edit `src/core/composition/dependencyLifecycle.ts` to import and call this shared function instead of its local `asMap` converter. Delete `asMap`. `healthyMerge` must keep every existing edge healthy and set Builder-added owners healthy too:

```ts
import { normalizeComposeDependsOn } from './composeDependsOn.js';

function healthyMerge(target: ComposeService, owners: Iterable<string>): void {
  const current = normalizeComposeDependsOn(target.depends_on);
  for (const owner of owners) {
    const old = current[owner];
    current[owner] = {
      ...(old && typeof old === 'object' ? old as object : {}),
      condition: 'service_healthy',
    };
  }
  target.depends_on = current;
}
```

`compileMeshTester.ts` already calls the shared normalizer. That alone does not cover helper-to-helper edges or dependency Compose services that `healthyMerge` never touches. Add one final composition pass in `src/core/composition/composeDependsOn.ts` and call it at the end of **both** `compileServiceComposition.ts` and `compileMeshComposition.ts`, after all user and Builder services/edges have been merged and before returning or serializing YAML:

```ts
import type { ComposeDocument } from './types.js';

export function enforceHealthyDependsOn(document: ComposeDocument): void {
  for (const service of Object.values(document.services ?? {})) {
    if (service.depends_on === undefined) continue;
    service.depends_on = normalizeComposeDependsOn(service.depends_on);
  }
}
```

In `compileServiceComposition.ts`, call `enforceHealthyDependsOn(compose)` immediately before the final `nameAllocator.assertUnique()`/return. In `compileMeshComposition.ts`, call it after merging the global tester fragment and immediately before `nameAllocator.assertUnique()`/YAML serialization. Keep the existing lifecycle-cycle checks; do not use this normalization to hide unresolved or cyclic references. Add a third test with a dependency helper that depends on another helper but is never touched by `healthyMerge`, and a fourth test with a long-form `condition: service_started`; assert **every** emitted edge is `service_healthy`. A long-form `service_completed_successfully` edge must also compile as `service_healthy`; document that a finite one-shot target is incompatible with this health-gated relationship and must be modeled without `depends_on` or changed into a health-capable service.

Use this assertion helper in the BF-01 tests so they detect any stray short form, empty condition, or explicit non-healthy condition in the final composition:

```ts
function expectAllDependenciesHealthy(compose: {
  services: Record<string, { depends_on?: unknown }>;
}) {
  for (const [serviceName, service] of Object.entries(compose.services)) {
    if (service.depends_on === undefined) continue;
    expect(Array.isArray(service.depends_on), serviceName).toBe(false);
    for (const [target, options] of Object.entries(
      service.depends_on as Record<string, { condition?: string }>,
    )) {
      expect(options.condition, `${serviceName} -> ${target}`)
        .toBe('service_healthy');
    }
  }
}
```

Call `expectAllDependenciesHealthy(compose)` in both red tests above and in the additional short/long-form controls. For the untouched-helper control, add `sidecar` to the `store.yml` services map with `healthcheck: { test: ['CMD', 'true'] }` and set `helper.depends_on: ['sidecar']`; assert its generated edge is healthy. For the long-form control, change that raw dependency to `depends_on: { sidecar: { condition: 'service_started', required: true } }` and assert generated `condition: 'service_healthy'` with `required: true` retained. These tests fail on the current implementation even when Docker accepts the original raw Compose.

Every target of a generated `service_healthy` edge must actually be capable of becoming healthy. Give test helper targets explicit enabled Compose healthchecks, as the BF-01 fixtures above do. Where a target is a Builder app, its required Dockerfile `dev`/`prod` healthcheck satisfies this. For dependency/tester helper targets, validate an explicit Compose healthcheck when available; if an image-provided healthcheck is the intended source, retain Docker's health evaluation and cover it with a runtime test. Never emit `service_started` as a fallback. Update the minimal relevant wording in `SPECS_V2.md` (the fail-fast paragraph currently says only Builder-created edges use healthy readiness), `BUILD_JSON_DOCS.md`, and `MESH_JSON_DOCS.md` so they say all generated Compose dependency edges are `service_healthy`. Update `docs/concepts/lifecycle-and-readiness.md`, `docs/reference/dependency-compose-contract.md`, and `docs/troubleshooting/healthchecks-and-startup.md` to explain that a helper used as a `depends_on` target needs a healthcheck. Keep surrounding official-spec prose unchanged. Run the BF-01 tests, existing tester/dependency lifecycle suites, Docker config on generated YAML, and the Docker acceptance tests.

## BF-02 — make the selected E2E tester's exit code decisive

**Why it is a bug.** `runMeshTestE2e.ts` and `runTestE2e.ts` call `docker compose up --build --abort-on-container-exit --exit-code-from <tester>`. With a tester Compose helper or materialized dependency helper that completes successfully, Compose aborts as soon as that helper exits. The selected tester can be stopped before it executes; this violates the documented test lifecycle and exit-code rule. Removing only `--abort-on-container-exit` is insufficient: `--exit-code-from` itself implies abort-on-container-exit in Docker Compose. Use a detached start plus an explicit wait for the named tester.

**Red Docker acceptance test.** Add `tests/docker-acceptance/v220-e2e-helper-exit.test.ts`. This test uses an image-only finite tester, which the global tester spec permits as an equivalent runner. The 25-second tester makes the current abort deterministic even with Compose's stop grace period. Its own command exits 0 and emits `runner-done` if allowed to finish. The app image is tiny and has the required production healthcheck. Docker is required; a skipped test is not proof.

```ts
import { afterEach, expect, it } from 'vitest';
import { cleanupFixtures, meshFixture, write } from '../conformance/fixture.js';
import { runMeshTestE2e } from '../../src/core/mesh/runners/runMeshTestE2e.js';

afterEach(cleanupFixtures);

it('BF-02 helper exit does not stop the selected global tester', async () => {
  const root = meshFixture(
    {
      services: { api: { path: 'api' } },
      tester: { compose: 'tester.yml', service: 'runner' },
    },
    { api: { app: {} } },
    { 'tester.yml': { services: {
      helper: {
        image: 'alpine:latest',
        command: ['sh', '-c', 'sleep 1; echo helper-done'],
      },
      runner: {
        image: 'alpine:latest',
        command: ['sh', '-c', 'sleep 25; echo runner-done'],
      },
    } } },
  );
  write(root, 'api/Dockerfile', [
    'FROM alpine:latest AS base',
    'FROM base AS dev',
    'HEALTHCHECK CMD true',
    'CMD ["sh", "-c", "sleep 100"]',
    'FROM base AS test',
    'CMD ["true"]',
    'FROM base AS test-e2e',
    'CMD ["true"]',
    'FROM base AS prod',
    'HEALTHCHECK CMD true',
    'CMD ["sh", "-c", "sleep 100"]',
    '',
  ].join('\n'));

  await expect(runMeshTestE2e({ projectDir: root })).resolves.toBe(0);
}, 90_000);
```

Run `pnpm exec vitest run --config vitest.docker.config.ts tests/docker-acceptance/v220-e2e-helper-exit.test.ts` before changing the runner. Current observation with the same fixture: helper exits 0, Compose prints `Aborting on container exit`, Builder returns 1. If it instead succeeds on a different Compose version, verify the tester actually completed (capture logs or a marker) before calling the gate green; do not infer success solely from a race-affected status 0. To make the assertion robust against that race, capture runner output and assert that `runner-done` occurred, or have the tester write a marker to a test-owned bind mount and assert the marker exists; keep the exit-status assertion as well.

**Implementation.** Add a shared function in `src/core/runners/runFiniteTester.ts` so standalone and global E2E use one protocol. Its inputs are the generated YAML, project directory, selected tester service name, and volume-cleanup policy. Keep the existing `runWithCleanup` and `teardownCompose` envelopes in the two calling runners. The core behavior is:

```ts
import { runCompose } from '../runCompose.js';

export async function runFiniteTester(
  yaml: string,
  projectDir: string,
  testerServiceName: string,
): Promise<number> {
  const started = await runCompose(
    ['up', '--build', '--detach'], yaml, projectDir, { removeVolumes: true },
  );
  if (started !== 0) return started;
  return runCompose(
    ['wait', testerServiceName], yaml, projectDir, { removeVolumes: true },
  );
}
```

In `src/core/mesh/runners/runMeshTestE2e.ts`, replace the existing single `runCompose(['up', '--build', '--abort-on-container-exit', '--exit-code-from', testerServiceName], ...)` callback with `() => runFiniteTester(yaml, meshDir, testerServiceName)`. In `src/core/runners/runTestE2e.ts`, replace the analogous callback with `() => runFiniteTester(finalYamlConfig, options.projectDir, 'tester')`. Import the helper and remove now-unused `runCompose` imports. Keep `writeRunState` before execution, the existing `runWithCleanup` finally path, `teardownCompose(..., { removeVolumes: true })`, and `clearRunState`. These preserve Phase-1 and Phase-2 isolation and failure cleanup.

The `wait` command returns the named container's status; this was confirmed locally with a tester exiting 7 (`wait runner` exited 7). `up --detach` starts all helper services and respects generated `depends_on` health edges, while a helper's later successful exit does not terminate the runner. Do not replace this with `up --wait`: a finite helper exiting 0 causes `up --wait` to return 1 in the tested Compose version. Do not rely on `run --no-deps`, which would skip declared readiness edges.

**Control tests before closing the fix.** Add a second global acceptance test by constructing the same fixture with `runner.command: ['sh', '-c', 'sleep 3; exit 7']`; assert `runMeshTestE2e({ projectDir: root })` returns 7. Refactor the fixture construction into a local `makeGlobalHelperFixture(command: string[])` helper so the two tests differ only in the selected runner command. The failing status must come from the runner, not the helper. For a service-level E2E control, use the existing `runtimeService`, `dependencyBundle`, and `testerScript` helpers from `tests/docker-acceptance/runtimeFixture.ts`. This exact variation creates a materialized owner plus a finite sibling helper, then makes the tester run long enough for the helper to finish first:

```ts
import { runTestE2e } from '../../src/core/runners/runTestE2e.js';
import { runtimeService, dependencyBundle, testerScript } from './runtimeFixture.js';
import { dep, write } from '../conformance/fixture.js';

it('BF-02 service E2E waits for its tester after a helper exits', async () => {
  const root = runtimeService({
    dependencies: { cache: dep('cache.yml', 'owner', 6379) },
  });
  const bundle = dependencyBundle(0) as { services: Record<string, unknown> };
  write(root, 'cache.yml', {
    ...bundle,
    services: {
      ...bundle.services,
      helper: {
        image: 'alpine:latest',
        command: ['sh', '-c', 'sleep 1; echo helper-done'],
      },
    },
  });
  write(root, 'tester.mjs',
    'await new Promise(resolve => setTimeout(resolve, 25000));\n' + testerScript,
  );
  await expect(runTestE2e({ projectDir: root })).resolves.toBe(0);
}, 90_000);
```

This service control should fail before the runner change for the same abort-on-helper reason; if it fails due to an unrelated fixture problem, correct that problem first. Confirm both success and failure paths remove containers/networks/volumes and clear saved run state using the existing cleanup helpers. Verify no Phase-1 state remains before global E2E starts. If `docker compose wait` is unsupported in the project's minimum supported Compose version, establish and test that constraint before shipping; do not silently fall back to `--exit-code-from`.

## BF-03 — validate file-backed resources of materialized dependencies

**Why it is a bug.** The general fail-fast contract requires missing declared files to fail before runtime whenever possible. Dependency Compose files may define configs and secrets. `compileServiceComposition.ts` checks that the Compose YAML exists and that resource references name top-level definitions, but it never checks whether a file named by a materialized `configs.<name>.file` or `secrets.<name>.file` exists. Docker will need those files to create the resource. A substituted dependency is atomically absent from the generated composition, so its unused file resources are not runtime requirements.

**Red test.** Add this to `tests/conformance/v220-audit-regressions.test.ts`; import `write` from `./fixture.js` for the present-file control. Run `pnpm exec vitest run tests/conformance/v220-audit-regressions.test.ts -t 'BF-03 rejects'` before editing `src/`. Current behavior: `compileService('prod', root)` returns a composition and `.toThrow` fails. Expected: a `ConfigError` with `d.yml` and `configs.settings.file` in the diagnostic.

```ts
it('BF-03 rejects a missing file-backed config in a materialized dependency', () => {
  const root = fixture({
    app: {},
    dependencies: { store: dep('d.yml', 'owner', 3000) },
  }, {
    'd.yml': {
      services: {
        owner: {
          image: 'alpine:latest',
          healthcheck: { test: ['CMD', 'true'] },
          configs: ['settings'],
        },
      },
      configs: { settings: { file: './missing-file.txt' } },
    },
  });
  expect(() => compileService('prod', root)).toThrow(/configs\.settings\.file|missing-file/);
});
```

Add parallel tests for a missing `secrets.credentials.file` and a path that exists but names a directory. Add two controls: (1) create the named file with `write(root, 'missing-file.txt', 'present')` and require compile success; (2) create a mesh provider binding that substitutes `store` and require mesh compilation to succeed without the suppressed local config file. The controls ensure the validator checks only resources that are actually materialized. For the substitution control, include a provider service and valid `store` endpoint; use `meshFixture`, and keep the local dependency's Compose YAML present even though its file-backed config payload is absent.

**Implementation.** Add `src/core/composition/validateMaterializedComposeFiles.ts` with a function that receives the **raw** dependency document, the dependency Compose path, and active stage. Resolve each `file` relative to the source Compose file's directory. A regular file is required. Preserve the logical resource name in the `ConfigError`:

```ts
import fs from 'node:fs';
import path from 'node:path';
import { ConfigError } from '../../errors/ConfigError.js';
import type { ComposeDocument } from './types.js';

export function validateMaterializedComposeFiles(
  document: ComposeDocument,
  sourceFile: string,
  stage: string,
): void {
  for (const kind of ['configs', 'secrets'] as const) {
    for (const [name, raw] of Object.entries(document[kind] ?? {})) {
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
      const file = (raw as Record<string, unknown>).file;
      if (typeof file !== 'string') continue;
      const absolute = path.resolve(path.dirname(sourceFile), file);
      let regular = false;
      try { regular = fs.statSync(absolute).isFile(); } catch { /* report below */ }
      if (!regular) throw new ConfigError({
        sourceFile,
        configPath: `${kind}.${name}.file`,
        stage,
        composition: 'service',
        value: file,
        reason: 'Materialized Compose file resource is missing or not a regular file',
      });
    }
  }
}
```

In `src/core/composition/compileServiceComposition.ts`, split the current load/rebase expression so the raw parsed document remains available. Extend `namespaced`'s entry type to store it:

```ts
const namespaced: Record<string, {
  doc: ComposeDocument;
  raw: ComposeDocument;
  map: Map<string, string>;
  source: string;
}> = {};

// Inside the existing dependency loop:
const rawDocument = loadComposeDocument(sourcePath, { /* existing context */ });
const document = rebaseComposePaths(
  rawDocument, sourcePath, options.composeOutputDir ?? root,
);
validateDependencyCompose(key, dep, document, {
  composePath: sourcePath, stage,
});
// Preserve the existing endpoint-bearing condition and namespace call.
namespaced[key] = {
  doc: ns.document, raw: rawDocument,
  map: ns.serviceNameMap, source: sourcePath,
};
```

Then, inside the existing integrated-materialization loop, call the new validator **after** the `suppressDependencies` check and **before** `mergeDocument`:

```ts
for (const [key, entry] of Object.entries(namespaced)) {
  if (options.suppressDependencies?.has(key)) continue;
  validateMaterializedComposeFiles(entry.raw, entry.source, stage);
  // Keep the existing merge, endpoint-owner mapping, and materialized record.
}
```

Do not put this file-existence check in `validateDependencyCompose` before suppression; that would reject a local implementation whose entire bundle is correctly absent under mesh substitution. Do not validate `external: true`, `environment`, or inline `content` resources as files. This fix is deliberately scoped to the confirmed missing-file bug; any broader file/path policy change needs its own red test and contract check.

## Final review checklist

- Each item's red test failed for the stated bug **before** its source change, and passed **after** it. Record command, observed failure, and green result in the implementation PR/review notes.
- Docker Compose validates generated service and mesh E2E YAML with a tester helper short `depends_on`; **every** compiled dependency edge, whether user-authored or Builder-created, has `condition: service_healthy`.
- Finite helpers may exit 0 without stopping the tester; a failing selected tester's exact exit code is returned; teardown occurs on success, failure, and thrown errors.
- Missing materialized config/secret files fail at compile time; present files pass; substituted unused file resources do not block mesh compilation.
- Existing `mesh.json.test` guard and service `build.json.test` behavior still pass their tests. Update the three official V2 specification files and the three public `./docs` pages named under BF-01 for the clarified all-healthy compiled-edge rule; make only the necessary wording changes. `EXECUTION_MODEL.md` needs no change unless implementation reveals a direct conflicting sentence.
