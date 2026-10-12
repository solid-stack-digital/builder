# 02 — Scope explicit mesh test-unit port conflicts to each isolated service run

## Bug report

**Bug.** `builder mesh up test-unit` executes effective test-stage services one at a time, but its preflight gathers every service's test publication into a single `allocateHostPorts` call. Two services that each declare the same fixed `publicPort` are rejected as if both were running at once. The runner never reaches the first unit test even though the fixed port is reusable after each service's teardown.

**Why this is a bug.** V2 §26 says the explicit mesh test stage is isolated tooling, and V2 §30 says a fixed-port conflict exists only among endpoints **simultaneously published in the same composition**. V2 §2.5 and Mesh JSON §12 similarly make independent service tests sequential with teardown. The [CLI reference](/home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/docs/reference/cli.md:66) describes explicit `test-unit` as isolated runs. The current global preflight applies integrated-mesh collision semantics to separate unit-test compositions. It rejects a valid configuration and prevents a documented workflow.

**Cause.** [validateMeshTestStage.ts](/home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/src/core/mesh/v2/validateMeshTestStage.ts:68) builds one `intents` list for all effective mesh services and calls `allocateHostPorts` once. [runMeshTestUnit.ts](/home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/src/core/mesh/runners/runMeshTestUnit.ts:4) then loops those services sequentially, creating a separate Compose project per service and tearing it down before moving on. The collision domain in preflight does not match the runner's actual lifetime.

**Expected behavior.** Within each isolated test-unit service, duplicate fixed publications still fail. Across different sequential service runs, the same fixed host port is allowed. A normal integrated mesh in dev/prod/E2E still rejects two simultaneously published fixed endpoints claiming the same port. AUTO allocation remains deterministic and uses the existing cache; it only needs uniqueness within one isolated service run.

## Red test and proceed-or-skip gate

Install the [shared reproduction](reproductions/v214-audit.test.ts.txt) per the [index](00-audit-index.md), then run before editing:

```bash
pnpm exec vitest run tests/conformance/v214-audit.test.ts -t V214-002
```

The red assertion creates two effective test services with the same fixed publication:

```ts
const root = meshFixture(
  {
    services: { alpha: { path: "alpha" }, beta: { path: "beta" } },
    test: { services: {
      alpha: { publish: ["app.endpoints.http"] },
      beta: { publish: ["app.endpoints.http"] },
    } },
  },
  {
    alpha: { app: { endpoints: { http: http(3000, { publicPort: 45214 }) } } },
    beta: { app: { endpoints: { http: http(3000, { publicPort: 45214 }) } } },
  },
);
await expect(runMeshTestUnit({ projectDir: root, dryRun: true })).resolves.toBe(0);
```

**Observed red:** `PortConflictError` names `alpha.app.endpoints.http` and `beta.app.endpoints.http` at port 45214 before either isolated run starts. Two controls pass: each service independently compiles with port 45214, and an integrated prod mesh publishing both endpoints rejects the same collision. If the red assertion already passes before source edits on the implementer's branch, **skip the fix**; record the commit and output. An import/fixture/syntax failure is not confirmation: repair the harness and rerun. Proceed only if the wrong cross-service conflict occurs and both controls pass.

## Exact source change

In `src/core/mesh/v2/validateMeshTestStage.ts`, preserve the initial publication validation and its current rejection of dependency publications in isolated test mode. Keep the sorted `appPublications` list and the existing `ValidatedMeshTestStage` return shape. Replace the single all-service `intents` allocation with a per-service loop:

```ts
const allocatedPorts = new Map<string, number>();
for (const name of Object.keys(services).sort((a, b) => a.localeCompare(b))) {
  const intents: PortIntent[] = appPublications
    .filter(pub => pub.meshService === name)
    .map(pub => ({
      logicalPath: pub.logicalPath,
      requested: pub.requested,
    }));

  const ownPorts = allocateHostPorts(
    meshDir,
    "test",
    intents,
    validationMode,
    { sourceFile: meshPath, composition: "mesh" },
  );
  for (const [logicalPath, port] of ownPorts) allocatedPorts.set(logicalPath, port);
}

return { bindings, appPublications, allocatedPorts };
```

This retains duplicate detection among endpoints published by the **same** service because their intents enter the same `allocateHostPorts` call. It stops carrying `reserved` ports from one isolated service into the next. `applyTestAppPublications` still looks up the same logical keys in the merged `allocatedPorts` map. Do not change `allocateHostPorts` globally: integrated mesh compilation depends on its composition-wide fixed-port collision rule. Do not change `compileMeshComposition` publication allocation.

For AUTO ports, per-service allocation may return the same currently available port for different services. That is valid because the test-unit runner tears down one composition before starting the next. Cache keys already include each service's logical endpoint path, so results remain attributable to the right endpoint. The implementer should verify that a service with two AUTO publications still gets two distinct ports within that one run.

## Green verification and controls

1. Rerun the exact `-t V214-002` gate. All three selected cases must pass: sequential same-port run, standalone control, and integrated-mesh conflict control.
2. Add a negative test for one service with two different published endpoints that both request port 45214. `validateMeshTestStage` or `runMeshTestUnit({dryRun:true})` must still throw `PortConflictError` naming both endpoints.
3. Add an AUTO test with two published app endpoints in one service and a second service also using AUTO. Assert distinct ports within the first service; across services, only assert valid allocated ports, since reuse is permissible.
4. Run `pnpm exec vitest run tests/conformance/v214-audit.test.ts tests/conformance/08-publication.test.ts tests/conformance/11-system-orchestration.test.ts`, then `pnpm typecheck` and the full suite.
5. If a changed test expects different fixed ports across **sequential** test-unit services, update that expectation only after the original red assertion has proved the false conflict. Keep integrated-mesh collision tests unchanged.

Retain the regression file in `tests/conformance/` after fixing the source. The public docs already describe isolated test-unit execution, so a separate docs change is unnecessary.
