# 02 — Reject internal dependency Compose lifecycle cycles in standalone service compilation

## Bug report

**Bug.** A materialized dependency implementation may contain `owner depends_on helper` and `helper depends_on owner`. Both services exist, the endpoint owner has a healthcheck, and `compileServiceComposition("prod", ...)` succeeds. Docker Compose rejects that exact relation as a dependency cycle.

**Why this is a bug.** V2 §4 says lifecycle cycles fail before runtime; §17 explicitly permits internal dependency Compose `depends_on`. The validator checks whether each referenced service exists but not whether the relationships form a cycle. Standalone compilation has no final graph check. An independently runnable service therefore gets unusable Compose despite passing Builder compilation. This is a distinct path from the mesh final-graph check.

**Cause and location.** [validateDependencyCompose.ts](/home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/src/core/composition/validateDependencyCompose.ts:23) gathers internal references solely for existence validation; [compileServiceComposition.ts](/home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/src/core/composition/compileServiceComposition.ts:100) then adds Builder lifecycle edges and returns without checking the Compose `depends_on` graph.

**Expected behavior.** A dependency bundle with cyclic internal `depends_on` fails with a `ConfigError` identifying the dependency Compose source and a readable cycle. An acyclic bundle, including a helper that the endpoint owner depends on, still compiles. Both Compose short-list and long-map `depends_on` syntax must be understood.

## Red test gate before fixing

Install the shared reproduction from [the index](00-audit-index.md), then run:

```bash
pnpm exec vitest run tests/conformance/v211-audit.test.ts -t V211-002
```

The red case uses the existing disposable fixture helper:

```ts
it("V211-002 rejects a cycle inside a materialized standalone dependency bundle", () => {
  const root = fixture({ app: {}, dependencies: { db: dep("db.yml", "owner") } }, {
    "db.yml": { services: {
      owner: {
        image: "alpine",
        healthcheck: { test: ["CMD", "true"] },
        depends_on: ["helper"],
      },
      helper: { image: "alpine", depends_on: ["owner"] },
    } },
  });
  expect(() => compileService("prod", root)).toThrow(/cycl/i);
});
```

**Observed red:** compilation returned normally, causing `expected [Function] to throw an error`. The V211-002 acyclic control passed. Docker Compose independently returned `dependency cycle detected: helper -> owner -> helper`. If the test passes before editing the implementation, mark this plan already fixed/not applicable and stop this plan. If a fixture or import fails, repair the harness first; only the documented behavior establishes this bug.

## Exact implementation change

Add a reusable checker at `src/core/composition/assertComposeLifecycleAcyclic.ts`. It should map service-level Compose `depends_on` into the existing lifecycle graph type and call `assertAcyclicGraph`. The graph contains names from the source Compose document, so errors remain understandable before namespacing.

```ts
import { assertAcyclicGraph, type LifecycleGraph } from "../config/lifecycleGraph.js";
import type { ComposeService } from "./types.js";

export function assertComposeLifecycleAcyclic(
  services: Record<string, ComposeService>,
  context: { sourceFile: string; stage: string; composition: "service" | "mesh" },
): void {
  const graph: LifecycleGraph = new Map(
    Object.keys(services).map(name => [name, new Set<string>()]),
  );

  for (const [name, service] of Object.entries(services)) {
    const value = service.depends_on;
    const targets = Array.isArray(value)
      ? value.filter((item): item is string => typeof item === "string")
      : value && typeof value === "object"
        ? Object.keys(value)
        : [];
    for (const target of targets) {
      // The existing bundle validators report unknown references separately.
      if (graph.has(target)) graph.get(name)!.add(target);
    }
  }

  assertAcyclicGraph(graph, context);
}
```

Then import and call it in `src/core/composition/validateDependencyCompose.ts` after the `for (const [name, svc] of Object.entries(services))` loop and **before** the early return for an endpoint-less dependency. The call belongs after the existing missing-reference check, which gives the more specific error for an unknown target.

```ts
import { assertComposeLifecycleAcyclic } from "./assertComposeLifecycleAcyclic.js";

// After all service-local validation and before `if (!Object.keys(dependency.endpoints).length) return;`
assertComposeLifecycleAcyclic(services, {
  sourceFile: context.composePath,
  stage: context.stage,
  composition: "service",
});
```

Although an endpoint-less dependency is inert, its declared Compose file is currently loaded and validated. Place the check before that return to keep the current fail-fast treatment of declared files consistent. Do not change endpoint materialization or stage selection.

## Green verification and controls

1. Rerun the identical `-t V211-002` command. The red case and acyclic control must both pass.
2. Add a second negative case with long-form `depends_on: { helper: { condition: "service_started" } }` on one side and a reciprocal edge on the other. The checker must reject the cycle regardless of the condition; it does not weaken a condition to make the graph usable.
3. Add a self-edge negative case (`owner` depends on `owner`) and assert the source Compose filename appears in the `ConfigError`.
4. Retain a positive multi-service acyclic bundle, including its healthchecked endpoint owner, to guard the permitted §17 behavior.
5. Run `pnpm exec vitest run tests/conformance/v211-audit.test.ts tests/conformance/04-dependencies.test.ts tests/conformance/05-lifecycle-wiring.test.ts` and `pnpm typecheck`.

After 02 is green, keep the shared checker available for plan 03. The cycle check is a validation addition; it should not rewrite `depends_on`, change readiness conditions, or require Docker during tests.
