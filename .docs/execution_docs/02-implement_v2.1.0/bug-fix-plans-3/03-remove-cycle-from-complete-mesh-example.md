# 03 — Remove the lifecycle cycle from the “complete” public mesh example

## Documentation bug report

**Bug.** `docs/reference/mesh-json.md` labels a JSON block “Complete example” but declares `frontend.dependsOn: ["gateway"]` and `gateway.dependsOn: ["frontend", "backend"]`. These edges form `frontend -> gateway -> frontend`. `resolveMeshStage(..., "dev", ...)` rejects the example before service loading.

**Why it is a bug.** V2 §4 and §20.3 require lifecycle cycles to fail. The resolver is correctly enforcing that rule; the public reference suggests an impossible configuration. The example's frontend-to-gateway edge is unnecessary for the described wiring: environment references supply addresses but do not create readiness, while the gateway's explicit dependencies can wait for frontend and backend.

**Observed evidence.** The supplied `V213-D03` regression parses the exact JSON fenced block in [mesh-json.md](/home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/docs/reference/mesh-json.md) and expects its effective dev lifecycle to resolve. It fails with `Lifecycle cycle detected: frontend -> gateway -> frontend`. A control deleting only the frontend `dependsOn` entry passes. This test uses `resolveMeshStage` directly, so the path-example issue in plan 02 cannot mask the cycle.

**Expected documentation.** The complete example has an acyclic lifecycle in every active stage. Its gateway can depend on frontend and backend, and its frontend can retain the dependency binding to backend. The example must not imply that a consumer waits for a gateway that itself waits for the consumer.

## Red test gate

Install the shared [V213 reproduction](reproductions/v213-audit.test.ts.txt) per the [index](00-audit-index.md), then run:

```bash
pnpm exec vitest run tests/conformance/v213-audit.test.ts -t V213-D03
```

Core assertion:

```ts
const doc = readFileSync("docs/reference/mesh-json.md", "utf8");
const block = doc.match(/## Complete example[\s\S]*?```json\n([\s\S]*?)\n```/)?.[1];
expect(block).toBeDefined();
const example = JSON.parse(block!);
expect(() => resolveMeshStage(example, "dev", "docs/reference/mesh-json.md"))
  .not.toThrow();
```

**Observed red:** only this assertion fails with the cycle; the companion control without the reversed edge passes. If the assertion is already green before a documentation edit, skip the plan and record the checked commit. A missing JSON fence or parse failure is a test/docs formatting issue and must be distinguished from the lifecycle defect before changing the edge.

## Exact documentation change

Edit only the frontend service object in the “Complete example” of `docs/reference/mesh-json.md`. Remove the reverse readiness edge and keep the binding and environment reference:

```diff
     "frontend": {
       "path": "./services/frontend",
       "env": { "BACKEND_URL": "${frontend.dependencies.backend.endpoints.http.network_url}" },
       "dependencies": { "backend": "backend" },
-      "dependsOn": ["gateway"],
       "publish": []
     },
```

The path shown above assumes plan 02 has been applied. If plan 02 has not yet run, remove only the `dependsOn` line, then apply the path correction independently. Keep `gateway.dependsOn: ["frontend", "backend"]`, which represents the intended readiness direction.

Add one sentence after the example: “Gateway waits for frontend and backend; frontend's backend binding supplies its own provider readiness. Neither service waits for gateway.” Avoid implying that an env reference creates an edge.

## Green checks

1. Rerun the exact `-t V213-D03` command. The source-example assertion and its acyclic control must pass.
2. Resolve the parsed example for `dev`, `prod`, and `e2e` using `resolveMeshStage`. The test stage can also be checked, but the canonical global test pipeline is separate and must not be described as an integrated mesh-test topology.
3. After plan 02, confirm the example's service paths satisfy the mesh-root path rule. Do not change source lifecycle validation or suppress the error to make the documentation pass.
4. Run `pnpm test:conformance`; the existing lifecycle cycle tests should stay green.

## Implementation record — 2026-10-13

The complete mesh example in `docs/reference/mesh-json.md` previously included `frontend.dependsOn: ["gateway"]` while `gateway.dependsOn` declared `["frontend", "backend"]`, causing `resolveMeshStage` to fail with a cycle detection error (`frontend -> gateway -> frontend`).

1. Removed `"dependsOn": ["gateway"]` from `frontend` in `docs/reference/mesh-json.md`.
2. Added clarification explaining that gateway waits for frontend and backend while frontend's dependency binding supplies its own provider readiness, ensuring an acyclic topology.

Validation: All V213-D03 regression and control tests (including multi-stage resolution across dev, prod, and e2e) passed.

