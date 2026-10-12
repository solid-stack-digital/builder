# 06 — Do not apply optional isolated mesh test rules to ordinary commands

**ID:** V210-006. **Priority:** High. **Status:** two reproduced cases. **Fix not applied.**

## Bug and user-visible behavior

`handleMeshUp` calls `checkMesh` for dev, prod, canonical test, and explicit test commands. `checkMeshServices` unconditionally validates stages `dev`, `prod`, `test`, and `e2e`. Its `test` branch treats each service as a one-service isolated mesh, even when the user only requested dev/prod or canonical two-phase testing.

This rejects valid ordinary mesh configurations:

1. Root `frontend.env.API_URL` refers to `backend.app.endpoints.http.network_url`. Dev composition succeeds. Preflight then invents a one-service `test` reference context and reports `Unknown mesh service reference "backend"`.
2. Root `publish` selects an eligible retained dependency endpoint. Prod composition succeeds. Preflight rejects it because isolated mesh test-stage dependencies are not materialized.

Neither fixture even declares a `mesh.json.test` overlay. The root publication cannot be removed with a test overlay because publication union-merges and V2 provides no deletion syntax. Users must not need `--skip-checks` to run this valid configuration.

## Normative basis and source

- `EXECUTION_MODEL.md` §6 and `SPECS_V2.md` §2.5 define canonical global test as each root service's standalone lifecycle, followed by global E2E.
- `SPECS_V2.md` §26 and `MESH_JSON_DOCS.md` §7.3 reserve `mesh.json.test` for explicit test-stage tooling; it does not replace canonical service testing.
- `MESH_JSON_DOCS.md` §§4.4 and 5 permit root dependency publication and composition-level cross-service env.
- [checkMeshServices.ts](../../../../src/core/mesh/checkers/checkMeshServices.ts), lines 19–34: unconditional test-stage loop and one-service reference context.
- [checkMesh.ts](../../../../src/core/mesh/checkers/checkMesh.ts) and [mesh up handler](../../../../src/commands/mesh/commands/up/handler.ts): callers do not convey whether explicit test-stage validation is intended.

This is a preflight scope defect, distinct from plan 05's runtime network defect and plan 07's explicit test publication ordering defect.

## Exact red tests

Only the external `checkInfra` boundary is mocked. The checked mesh compilers/resolvers are real. Builds use valid fixture Dockerfiles and no service app env that would independently violate standalone compilation.

```ts
import { afterEach, expect, it, vi } from 'vitest';
import { cleanupFixtures, compileMesh, dep, http, meshFixture, ownerBundle } from './fixture.js';
import { getMeshJson } from '../../src/core/mesh/getMeshJson.js';
import { checkMeshServices } from '../../src/core/mesh/checkers/checkMeshServices.js';
vi.mock('../../src/core/checkers/checkInfra.js', () => ({ checkInfra: vi.fn() }));
afterEach(() => { cleanupFixtures(); vi.clearAllMocks(); });
it('V210-006 accepts ordinary mesh cross-service env in preflight', () => {
  const root = meshFixture({ services: { backend: { path: 'backend' }, frontend: { path: 'frontend', env: { API_URL: '${backend.app.endpoints.http.network_url}' } } } }, {
    backend: { app: { endpoints: { http: http() } } }, frontend: { app: {} },
  });
  expect(() => compileMesh('dev', root)).not.toThrow();
  expect(() => checkMeshServices(getMeshJson(root), root)).not.toThrow();
});
it('V210-006 accepts retained dependency publication in ordinary preflight', () => {
  const root = meshFixture({ services: { api: { path: 'api', publish: ['dependencies.db.endpoints.api'] } } }, {
    api: { app: {}, dependencies: { db: dep('db.yml', 'owner', 6379, { publicPort: 54321 }) } },
  }, { 'api/db.yml': ownerBundle() });
  expect(() => compileMesh('prod', root)).not.toThrow();
  expect(() => checkMeshServices(getMeshJson(root), root)).not.toThrow();
});

```

```bash
pnpm exec vitest run tests/conformance/v210-audit-preflight.test.ts -t V210-006
```

Observed errors:

```text
Unknown mesh service reference "backend" ... stage=test ... services.frontend.env.API_URL
mesh.test is isolated; dependency endpoints are not materialized and cannot be published ... stage=test
```

**Gate:** the ordinary compile assertions must pass first; preflight must then fail with these unrelated test-stage errors. If preflight already succeeds, skip the fix. An external linter failure is not confirmation.

## Expected behavior

Ordinary mesh validation and canonical `mesh up test` validate standalone service contracts and integrated dev/prod/E2E compositions. The optional isolated `mesh.json.test` topology is validated when `mesh up test-unit` explicitly requests it. Root JSON schema validation still parses and validates field shapes for every declared overlay.

Do not weaken explicit test-stage rules, materialize dependencies in isolated tests, or create a mesh-integrated unit phase to make these tests pass.

## Implementation plan with exact interfaces

1. In `src/core/mesh/checkers/checkMeshServices.ts`, add an optional flag and select stages accordingly:

```ts
export interface CheckMeshServicesOptions {
  includeTestStage?: boolean | undefined;
}

export function checkMeshServices(
  mesh: MeshConfig,
  meshDir: string,
  options: CheckMeshServicesOptions = {},
): void {
  const root = resolveProjectDir(meshDir);
  const meshPath = path.join(root, 'mesh.json');
  const checked = new Set<string>();
  const stages: Array<'dev' | 'prod' | 'test' | 'e2e'> =
    options.includeTestStage
      ? ['dev', 'prod', 'test', 'e2e']
      : ['dev', 'prod', 'e2e'];
  for (const stage of stages) {
    // Keep existing stage resolution, service checks, compilation,
    // and the explicit test branch here.
  }
}
```

This snippet replaces the function signature, setup, and loop header; retain the existing loop body. Do not remove `checkInfra`: its own standalone test validation is required for independently testable services and remains unrelated to mesh env/bindings.

2. In `src/core/mesh/checkers/checkMesh.ts`, extend its existing options and forward the flag:

```ts
export interface CheckMeshOptions {
  requireTester?: boolean | undefined;
  includeTestStage?: boolean | undefined;
}

// Inside checkMesh, replace the existing service checker call:
checkMeshServices(mesh, absMeshDir, {
  includeTestStage: Boolean(options.includeTestStage),
});
```

Keep global tester checks and the success message after successful validation.

3. In `src/commands/mesh/commands/up/handler.ts`, change the preflight call:

```ts
checkMesh(projectDir, {
  requireTester: stage === 'test-e2e' || stage === 'test',
  includeTestStage: stage === 'test-unit',
});
```

Canonical `test` must pass `false`; it runs service-owned test lifecycles. Explicit `test-unit` passes `true`. Existing `skipChecks` behavior remains intact.

4. Default `builder mesh check` keeps `includeTestStage` false. Explicit test-stage preflight is available through `builder mesh up test-unit --dry-run`; a new CLI option is not required for this bug fix. If exposing the flag in the check command later, treat that as a separate CLI enhancement with help text and forwarding tests.

5. Coordinate plan 07: when the explicit branch does run, publication must be applied before env resolution. Skipping this branch for ordinary commands must not conceal its own remaining correctness issue.

## Permanent regression and routing controls

Keep both red cases. Update `tests/mesh-preflight-regression.test.ts`'s existing exact-call assertion to include the new option:

```ts
expect(checkMesh).toHaveBeenCalledExactlyOnceWith(process.cwd(), {
  requireTester: stage === 'test' || stage === 'test-e2e',
  includeTestStage: stage === 'test-unit',
});
```

Its existing `it.each` stage list already covers all five commands. Add/retain these checks:

| Case | Assertion |
|---|---|
| Ordinary dev/prod with base cross-service env | compiles and passes preflight |
| Canonical `test` routing | optional mesh test-stage validation disabled; standalone service tests retained |
| Explicit `test-unit` routing | optional validation enabled |
| Explicit mode with dependency publication | still rejected as unmaterialized |
| Direct API `checkMeshServices(mesh, root, {includeTestStage:true})` | exercises existing explicit test branch |
| Missing global tester for canonical `test` | still fails `requireTester` check |
| Invalid build Dockerfile/checkInfra | failure still propagates and runner is not invoked |
| Unknown endpoint in ordinary env | still rejected by ordinary integrated compiler |
| `--skip-checks` | still bypasses preflight only when explicitly selected |

Find existing tests of `checkMeshServices` with `rg -n 'checkMeshServices|includeTestStage' tests`. Cases intentionally targeting optional isolated topology must opt in explicitly. Do not change ordinary configuration tests to expect failure simply to preserve old behavior.

## Acceptance and limits

Run the exact gate, mesh preflight regression suite, mesh runner/pipeline tests, and plan 00 final checks. The exact red tests exercise the default checker path after the change. A direct handler test must additionally prove flag propagation so CLI behavior is covered.

Default check no longer claims semantic validation of the optional isolated mesh topology. Its JSON shape remains validated, ordinary compositions remain checked, and explicit tooling retains semantic validation. Document that scope if public CLI check documentation currently claims every optional topology is always validated.
