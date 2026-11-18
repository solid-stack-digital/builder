# 00 — Master plan: isolated infra-mode overlay (V3.2.0)

**Package:** `@solid-stack/builder`
**Current version:** `3.1.0` → **target version:** `3.2.0` (minor, additive, opt-in)
**Normative spec (created in chapter 04, step 1):** `.docs/specs_v3/feature_spec_v3.2.0.md` = §2 of this file, verbatim.

---

## 1. Problem and outcome

In 3.1.0 an isolated run (`service up dev` without `--full`, `service up test-unit`, Phase 1 of `mesh up test`) starts only `main`: `selectReachableGraph` activates the roots and drops every edge. A service cannot start a local helper container (for example a dev database backing in-process mocks) without `--full`, and `--full` switches `INFRA_MODE` to `integrated`. Declaring the helper as a normal requisite also starts it, unused, in every integrated run.

V3.2.0 adds an optional `on-inframode-isolated` block inside the `dev` and `test` stage overlays of `build.json`. It has the same shape as a stage overlay (`services` → partial `main` / ordinary overlays). It is merged last, and **only** when the run is isolated. In an isolated run, `main`'s requisite edges are taken only from this block; edges declared elsewhere on `main` are still dropped, as in 3.1.0.

---

## 2. Normative semantics (copy verbatim into `.docs/specs_v3/feature_spec_v3.2.0.md`)

> ### Feature specification V3.2.0: isolated infra-mode overlay
>
> **S1. Field.** `build.json` stage overlays `dev` and `test` accept an optional key `on-inframode-isolated`. Its value is an object whose only allowed key is `services`. `services` maps service names to the same partial overlays a stage overlay accepts for `main` and ordinary services. `tester` is not allowed inside it. `on-inframode-isolated` is not allowed inside itself, at the root, in `services`, in `prod`, in `e2e`, or anywhere in `mesh.json`.
>
> **S2. When it applies.** The block of the resolved stage applies exactly when the run's `INFRA_MODE` is `isolated`: `service up dev` without `--full` (block `dev.on-inframode-isolated`), `service up test-unit` and the unit phase of `service up test` (block `test.on-inframode-isolated`), and the per-source unit phase of `mesh up test` Phase 1 (each source's `test.on-inframode-isolated`). It never applies to `service up dev --full`, `service up prod`, `service up test-e2e`, `mesh up dev`, `mesh up prod`, or `mesh up test` Phase 2. `service export <stage>` and `builder check` compile the same effective configuration as the matching run.
>
> **S3. Merge order.** Standalone: `base → stage → stage.on-inframode-isolated`. Merge rules are those of stage overlays: objects merge recursively, scalars and arrays replace, `requisites.<name>: false` removes an edge, an existing ordinary `compose` is immutable, a service introduced by the block must provide a complete `compose`, and `main` and `tester` must exist in base. Per-key origins point at `<stage>.on-inframode-isolated.services.<name>...`.
>
> **S4. Isolated graph.** In an isolated run the active graph is the closure from `main` following (a) only those `main` requisite edges whose effective declaration comes from `on-inframode-isolated`, and (b) every requisite edge of each activated ordinary module. All other edges from `main` are dropped. Kept edges behave exactly as in integrated runs: `dependency` waits for health, `prerequisite` waits for exit 0, `requirement` includes without ordering; healthcheck and lifecycle validation apply.
>
> **S5. Execution variables.** `EXEC_MODE` and `INFRA_MODE` for `main` are unchanged in every workflow; isolated runs keep `INFRA_MODE=isolated` even when modules are active.
>
> **S6. References.** Endpoint references resolve against the active graph and the consumer's requisite closure, as in 3.1.0. A reference in the block to a module the block activates resolves. A reference outside the block to a module only the block activates fails in runs where that module is inactive (`outside effective requisite closure`).
>
> **S7. Dormant declarations.** An ordinary module declared in base and reached only through the block is dormant in every other run: it does not start, publish ports, or appear in the Compose output. It is still structurally validated in every resolved stage.
>
> **S8. Unit runner.** When the isolated `test` graph contains only `main`, `service up test-unit` runs exactly as in 3.1.0 (`up --build --abort-on-container-exit --exit-code-from main main`). When it contains active modules, Builder starts all active services detached, waits for `main` to exit, prints `main`'s logs, returns `main`'s exit code, and tears down everything.
>
> **S9. Mesh.** `mesh.json` gains no field. Global mesh runs are integrated, so source blocks never apply there. Phase 1 of `mesh up test` runs each source's standalone test workflow, so each source's `test.on-inframode-isolated` applies in that source's unit phase.
>
> **S10. Compatibility.** A configuration without `on-inframode-isolated`, or with an empty block, produces Compose output identical to 3.1.0 in every workflow.

---

## 3. Pinned decisions (do not revisit)

| ID | Topic | Decision |
|---|---|---|
| D-ISO-01 | Key name | `on-inframode-isolated` (kebab-case, matches `override-compose`). Constant `ISOLATED_OVERLAY_KEY` exported from `src/core/config/resolveBuildStage.ts`. |
| D-ISO-02 | Allowed stages | `dev` and `test` only. `prod`/`e2e` reject the key through `.strict()` (Zod) and `additionalProperties:false` (JSON schema). Not allowed in base or in mesh. |
| D-ISO-03 | Allowed content | `{ services?: { main?: MainOverlay, <ordinary>?: OrdinaryOverlay } }`. `tester` rejected with message `tester cannot be configured in on-inframode-isolated`. |
| D-ISO-04 | Where the mode decision lives | `compileServiceComposition` computes `executionProfile(stage,"service",full).infraMode` and passes `{ isolated }` to `resolveBuildStage`. `loadMeshSources` passes nothing (default `false`). |
| D-ISO-05 | Marking edges | `Origin` gains optional `isolatedOverlay?: true`. `resolveBuildStage` sets it on every origin recorded from the block (service, env, buildArgs, requisites, layer). |
| D-ISO-06 | Graph rule | `selectReachableGraph` uses one `follow(edge)` predicate: integrated → always true; isolated → true if the consumer is not a root, or `edge.origin.isolatedOverlay === true`. `computeClosure` gains an optional `follow` parameter (default: always true). |
| D-ISO-07 | Base requisites of main | Not removed from the effective config; they are ignored by the graph in isolated runs via D-ISO-06. Redeclaring a base edge inside the block makes it count. |
| D-ISO-08 | Unit runner | Single-node graphs keep the exact 3.1.0 command. Multi-node graphs use `up --build --detach <all runtime services>` → `wait main` → exit code via `inspectRunnerExit` (exported from `runFiniteTester.ts`) → `logs --no-color main`. Unknown exit → `waited===0 ? 1 : waited` (same rule as the finite tester). |
| D-ISO-09 | Run state | `runTestUnit` records `compiled.runtimeServiceNames` (identical to `[main]` for single-node graphs). |
| D-ISO-10 | Release mechanics | Bump `package.json` to `3.2.0` manually and add a `## 3.2.0` CHANGELOG section, as 3.1.0 did. Do **not** add a `.changeset/` file (it would bump the version again). |
| D-ISO-11 | Test IDs | Prefix `ISO`, `ISO01`–`ISO25`. `ISO23`–`ISO25` are Docker (layer `D`). Catalog grows from 306 to 331. New docs test is `DOCS13` (DOCS IDs are exempt from the catalog). |

---

## 4. Test-ID matrix

| ID | Spec | Behavior verified | Layer | File |
|---|---|---|---|---|
| ISO01 | S1 | `dev`/`test` accept the block with `main` and ordinary overlays (Zod + JSON schema) | I | `tests/v3/isolatedOverlay.test.ts` |
| ISO02 | S1 | `prod`/`e2e` reject the block (Zod + JSON schema) | I | same |
| ISO03 | S1 | The block rejects `tester` (Zod + JSON schema) | I | same |
| ISO04 | S1 | The block rejects nested `on-inframode-isolated` and unknown keys | I | same |
| ISO05 | S2 | `resolveBuildStage` without `isolated` ignores the block | I | same |
| ISO06 | S3 | `resolveBuildStage` with `isolated` merges the block last and records flagged origins | I | same |
| ISO07 | S4, S5 | Isolated dev starts `main` + block module, not base-only targets; health-gated `depends_on`; `INFRA_MODE=isolated` | I | same |
| ISO08 | S6 | Block env reference to the block module resolves to its network URL | I | same |
| ISO09 | S2, S5 | `dev --full` ignores the block | I | same |
| ISO10 | S2 | `prod` and `e2e` ignore the block | I | same |
| ISO11 | S4, D-ISO-07 | Base `main` edges stay dropped in isolated runs unless redeclared in the block | I | same |
| ISO12 | S3, S7 | Module declared only inside the block runs in isolated dev, is absent elsewhere; incomplete declaration fails at the block path | I | same |
| ISO13 | S4 | Activated module's own requisites are followed (prerequisite ordering) | I | same |
| ISO14 | S2 | `test` block applies only to `test`; `dev` block only to `dev` | I | same |
| ISO15 | S10 | No block ≡ empty block, byte-identical Compose in all five workflows; isolated graph is roots-only | I | same |
| ISO16 | S3 | `override-compose` set in the block is selected only in isolated runs | I | same |
| ISO17 | S3, S6 | Invalid reference in the block reports the block config path | I | same |
| ISO18 | S3 | `false` on an unknown target in the block reports the block path | I | same |
| ISO19 | S9 | Global mesh `dev`/`prod` ignore a source's block | I | same |
| ISO20 | S9 | `mesh up test` Phase 1 starts a source's `test` block module | I | same |
| ISO21 | S8 | `runTestUnit`: single-node command unchanged; multi-node sequence, exit status, startup failure | I | same |
| ISO22 | S2 | `builder check` stage validation compiles blocks and reports their errors | I | same |
| ISO23 | S4, S5, S6 | Real Docker isolated dev: block module healthy before `main`; `main` reaches it; `INFRA_MODE=isolated` | D | `tests/v3/docker/isolatedOverlay.test.ts` |
| ISO24 | S8 | Real Docker `test-unit` with a block module exits 0 and removes all resources | D | same |
| ISO25 | S8 | Real Docker `test-unit` with a block module propagates `main`'s non-zero exit | D | same |

---

## 5. Execution order

1. **Chapter 01:** types, `Origin` flag, Zod schemas, JSON schema generator, then `pnpm build:schemas && pnpm typecheck`.
2. **Chapter 02:** `resolveBuildStage`, `compileServiceComposition`, `selectReachableGraph`/`computeClosure`, `runFiniteTester` export, `runTestUnit`, then `pnpm typecheck && pnpm test:v3:fast`. The existing suite must still pass at this point. The coverage gate will fail on the new IDs until chapter 03; run `pnpm exec vitest run --config vitest.v3.config.ts` to see test results without the gate.
3. **Chapter 03:** catalog, new tests, updated count, then `pnpm test:v3:fast`. It must pass, including the coverage gate.
4. **Chapter 04:** spec file, docs, migration guide, version bump, changelog, then `pnpm test`. It must pass within the 180 s warm budget.

## 6. Done criteria

- `pnpm test` passes.
- `pnpm check:v3-no-legacy` passes.
- `git diff --stat` touches only the files listed in chapters 01–04.
- `node dist/bin.js --version` prints `3.2.0`.
