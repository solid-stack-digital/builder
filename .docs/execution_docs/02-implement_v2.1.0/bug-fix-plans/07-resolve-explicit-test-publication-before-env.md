# 07 — Apply explicit test-stage publication before resolving environment

**ID:** V210-007. **Priority:** Medium. **Status:** implemented and verified on 2026-10-12. The original red test and implementation plan are preserved below.

## Bug and trigger

An explicitly requested `mesh up test-unit` can publish an app endpoint according to `validateMeshTestStage`. But `runMeshTestUnit` resolves app/mesh environment references before it calls `applyTestAppPublications`. The compiled service fragment begins with mesh endpoints marked unpublished. A valid self-reference to a selected `public_url` therefore fails even though the port has already been selected in the publication plan.

The explicit branch of `checkMeshServices` has the same ordering gap: it calculates validation information but discards it and resolves references against an unpublished fragment. Fixing only the runner leaves CLI preflight broken; fixing only preflight leaves runtime compilation broken.

This concerns the optional isolated test-stage tool. It does not change canonical global testing, which uses independent service unit/E2E lifecycles and global E2E.

## Why it is a bug

- `SPECS_V2.md` §10 requires reference resolution after publication resolution, fixed-port reservation, and AUTO allocation.
- §27 and `MESH_JSON_DOCS.md` §4.4 define selected eligible app endpoints as effectively published.
- `MESH_JSON_DOCS.md` §7.3 retains the explicit structured test-stage tool.
- [runMeshTestUnit.ts](../../../../src/core/mesh/runners/runMeshTestUnit.ts) calls `resolveMeshEnvMap` before `applyTestAppPublications`.
- [checkMeshServices.ts](../../../../src/core/mesh/checkers/checkMeshServices.ts) invokes `validateMeshTestStage` but never applies its publications to the local endpoint registry.
- [validateMeshTestStage.ts](../../../../src/core/mesh/v2/validateMeshTestStage.ts) already exports the correct helper to update ports and endpoint publication properties.

## Exact red reproduction

Destination: `tests/conformance/v210-audit-test-publication.test.ts`.

```ts
import { afterEach, expect, it, vi } from 'vitest';
import { cleanupFixtures, http, meshFixture } from './fixture.js';
import { runMeshTestUnit } from '../../src/core/mesh/runners/runMeshTestUnit.js';
afterEach(() => { cleanupFixtures(); vi.restoreAllMocks(); });
it('V210-007 resolves published app reference before explicit test-stage execution', async () => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  const root = meshFixture({ services: { api: {
    path: 'api', publish: ['app.endpoints.http'],
    env: { SELF_URL: '${api.app.endpoints.http.public_url}' },
  } } }, { api: { app: { endpoints: { http: http(3000, { publicPort: 54321 }) } } } });
  await expect(runMeshTestUnit({ projectDir: root, dryRun: true })).resolves.toBe(0);
});

```

```bash
pnpm exec vitest run tests/conformance/v210-audit-test-publication.test.ts -t V210-007
```

Observed: rejected `ConfigError: Endpoint property public_url requires effective publication`, path `services.api.env.SELF_URL`, stage `test`. The fixture has a real eligible endpoint, fixed `publicPort: 54321`, and matching `publish` selector. It uses `dryRun:true`, so neither Docker nor actual host port binding is involved.

**Gate:** proceed only when the endpoint's publication is valid and env resolution nevertheless throws this error. If the dry-run succeeds already, do not apply the fix. Do not remove publication validation or permit `public_*` on unpublished endpoints to force a pass.

## Expected behavior

Compile the isolated app fragment, apply the previously validated app publication plan to both its Compose service and endpoint registry, then resolve app/mesh environment. A selected fixed endpoint resolves to `http://127.0.0.1:54321`. Unselected endpoints still reject `public_*`. The app remains `target=test`, `EXEC_MODE=test`, `INFRA_MODE=isolated`.

## Exact implementation changes

### Runner

In `src/core/mesh/runners/runMeshTestUnit.ts`, immediately after `compileServiceComposition(...)` returns `compiled`, move the existing app/publication statements forward:

```ts
const app = compiled.compose.services.app!;
applyTestAppPublications(validated, name, app, compiled.endpoints.app);

const endpoints: MeshEndpointRegistry = {
  app: { [name]: compiled.endpoints.app },
  dependencies: { [name]: compiled.endpoints.dependencies },
};
const refCtx: MeshReferenceContext = {
  services: { [name]: svc },
  bindings: new Map(),
  endpoints,
  stage: 'test',
  meshJsonPath: meshPath,
};
// Existing ownership checks and resolveMeshAppEnvironmentLayers /
// resolveServiceBuildEnvThroughMesh / resolveMeshEnvMap follow here.
```

Delete the old later declaration `const app=...` and old later call to `applyTestAppPublications`. Apply exactly once: duplicate calls would append duplicate host-port mappings. Keep the final assignment to `app.environment` in its original precedence order after reference resolution.

### Checker

In `src/core/mesh/checkers/checkMeshServices.ts`, import the helper alongside the validator:

```ts
import {
  applyTestAppPublications,
  validateMeshTestStage,
} from '../v2/validateMeshTestStage.js';
```

Replace the discarded validation call with a captured result inside each stage iteration:

```ts
const testValidation = stage === 'test'
  ? validateMeshTestStage(services, root, meshPath, true)
  : undefined;
```

Inside `if (stage === 'test')`, immediately after compiling `fragment`, insert:

```ts
applyTestAppPublications(
  testValidation!,
  name,
  fragment.compose.services.app!,
  fragment.endpoints.app,
);
```

Then construct `endpoints`/`ctx` and resolve env. This works with plan 06: ordinary checks skip the test branch, while explicit checks opt into it. `validationMode:true` avoids runtime AUTO allocation during preflight, as before.

## Additional exact expectations

The first red test proves the order defect. Add these controls before considering the implementation complete:

1. Enable `debug:true` in a runner test, capture the YAML passed to `console.log`, parse it with `yaml.parse`, and assert app environment `SELF_URL === 'http://127.0.0.1:54321'` and exactly one port mapping with `published:54321`. Do not match console decoration strings; select the captured string containing `services:` and parse it.
2. Test `checkMeshServices(mesh, root, {includeTestStage:true})` with the same fixture after plan 06. Mock `checkInfra` as in plan 06. It must pass.
3. Move the reference from mesh service env to `build.json` app env as `${app.endpoints.http.public_url}`; explicit runner must resolve it after publication too.
4. Replace fixed port with `AUTO`; dry-run must resolve the validation placeholder consistently in env and emitted port mapping, and must not create `.builder` port cache.
5. Remove the `publish` entry while retaining `publicPort`; same public reference must fail.
6. Remove `publicPort` while retaining `publish`; publication validation must fail before env resolution.
7. Add retained dependency publication to explicit test topology; it must still fail as unmaterialized.
8. Assert `target=test`, `EXEC_MODE=test`, `INFRA_MODE=isolated`, no dependency containers, and no tester.

The checker test must explicitly request test-stage validation; otherwise plan 06 would make it pass without exercising this fix.

## Verification

Run the exact gate, the explicit checker control, `tests/v2/meshRunners.test.ts`, host publication/reference tests, and plan 00 final checks. No schema changes, new CLI commands, or changes to canonical phase sequencing are required. Keep the published/private reference restrictions intact; only correct the sequence in which the existing publication and resolution functions execute.

## Implementation record — 2026-10-12

The V210-007 regression failed before the change because `runMeshTestUnit` and `checkMeshServices` resolved service environment references before applying explicit test-stage app publications, causing valid self-references to `public_*` properties to fail with an unpublished-endpoint error. After the change, publication is applied immediately after compiling the isolated service composition and before reference resolution, resolving `public_*` endpoint properties and port mappings correctly.

In `src/core/mesh/runners/runMeshTestUnit.ts`, `applyTestAppPublications` is now invoked immediately after `compileServiceComposition`, mutating the Compose service's port mappings and marking the endpoint registry effectively published prior to reference resolution. In `src/core/mesh/checkers/checkMeshServices.ts`, the validated publication plan is captured from `validateMeshTestStage` and passed to `applyTestAppPublications` before environment resolution when `stage === "test"`.

The permanent test suite `tests/conformance/v210-audit-test-publication.test.ts` covers:
- Resolving published app endpoint self-references before explicit test execution.
- Emitted port mappings and resolved URL in debug YAML output.
- Verification in `checkMeshServices` with `{ includeTestStage: true }`.
- Resolution of published references in `build.json` app env.
- `AUTO` port resolution without creating a `.builder` port cache file.
- Rejection of public references when endpoints are not published.
- Rejection of publication when `publicPort` is missing.
- Rejection of retained dependency publications in isolated test stage.
- Verification of `target=test`, `EXEC_MODE=test`, `INFRA_MODE=isolated`, and omission of dependency containers and tester service.

Validation: All 9 tests in `v210-audit-test-publication.test.ts` passed, 550 conformance tests in 22 files passed, 786 full-suite tests in 66 files passed, TypeScript check passed, and removed-V1-token check passed. All 7 audit bug fixes (plans 01–07) are now fully implemented and verified.
