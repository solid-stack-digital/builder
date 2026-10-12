# 03 — Reject internal global tester Compose lifecycle cycles

## Bug report

**Bug.** A `mesh.json.tester.compose` bundle in which `runner depends_on helper` and `helper depends_on runner` passes `compileMeshComposition("e2e", ...)`. The selected runner exists and may be host-networked as required, but the generated E2E composition cannot start.

**Why this is a bug.** V2 §4 requires lifecycle cycles to fail before runtime, and Mesh JSON §6.2 explicitly allows tester Compose helper services. `compileMeshTester` validates that local service references exist, yet never checks their `depends_on` graph. The mesh compiler checks its app/dependency graph **before** it merges the tester fragment, so that existing check cannot see tester cycles. Docker Compose rejects this graph as a dependency cycle. The global E2E pipeline would fail late after Phase 1 has already spent time running independent tests.

**Cause and location.** [compileMeshTester.ts](/home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/src/core/mesh/v2/compileMeshTester.ts:46) calls `validateServiceReferences` but no cycle check. [compileMeshComposition.ts](/home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/src/core/mesh/v2/compileMeshComposition.ts:42) checks the graph before the tester is merged on the next line.

**Expected behavior.** Compilation fails immediately with a `ConfigError` naming `tester.compose` and the cycle. A valid runner-to-helper dependency remains accepted; Builder's injected runner-to-app `service_healthy` edges remain intact. No Docker daemon is required to diagnose an internal tester cycle.

## Red test gate before fixing

Install the shared regression source from [the index](00-audit-index.md), then run:

```bash
pnpm exec vitest run tests/conformance/v211-audit.test.ts -t V211-003
```

The focused negative test is:

```ts
it("V211-003 rejects a cycle inside a global tester bundle", () => {
  const root = meshFixture(
    {
      services: { appone: { path: "appone" } },
      tester: { compose: "tester.yml", service: "runner" },
    },
    { appone: { app: {} } },
    { "tester.yml": { services: {
      runner: { image: "alpine", depends_on: ["helper"] },
      helper: { image: "alpine", depends_on: ["runner"] },
    } } },
  );
  expect(() => compileMesh("e2e", root)).toThrow(/cycl/i);
});
```

**Observed red:** `compileMesh` returned normally, so Vitest reported `expected [Function] to throw an error`. The matching acyclic tester control passed. If this red assertion passes on the implementation branch before the plan-03 edit, do not apply this fix; record the branch/commit and output. A setup or import failure requires harness repair, not a source fix.

## Exact implementation change

Plan 02 adds `assertComposeLifecycleAcyclic` in `src/core/composition/assertComposeLifecycleAcyclic.ts`. Import it in `src/core/mesh/v2/compileMeshTester.ts`, then call it on **raw** tester services immediately after `validateServiceReferences(raw, file, stage)`. This keeps the error tied to the user's tester Compose file and original service names, before namespacing.

```ts
import { assertComposeLifecycleAcyclic } from "../../composition/assertComposeLifecycleAcyclic.js";

validateComposeResourceReferences(raw, { sourceFile: file, stage, composition: "mesh" });
validateServiceReferences(raw, file, stage);
assertComposeLifecycleAcyclic(raw.services, {
  sourceFile: file,
  stage,
  composition: "mesh",
});
```

`raw.services` is known to contain the selected runner after the preceding existence check. Keep that check first. The existing mesh graph validation should still run for app, dependency, and cross-service lifecycle edges; this new call covers the tester's internal edges. Do not move only the current graph check after tester merge without preserving source-file diagnostics and the existing app-cycle detection.

## Green verification and controls

1. Rerun the identical `-t V211-003` command. Both the cycle rejection and the acyclic control must pass.
2. Add a negative long-form map case and a self-edge case, parallel to plan 02. Assert at least one error includes the tester Compose filename and a readable service cycle.
3. Keep a positive runner with a helper in its `depends_on`. Verify its final namespaced `depends_on` still includes the helper and all effective top-level apps with `condition: "service_healthy"` for the apps.
4. Run `pnpm exec vitest run tests/conformance/v211-audit.test.ts tests/conformance/10-global-tester.test.ts tests/conformance/11-system-orchestration.test.ts` and `pnpm typecheck`.

This plan is complete when invalid tester cycles fail in Builder compilation, while valid helper ordering and the existing global E2E readiness gates remain unchanged.
