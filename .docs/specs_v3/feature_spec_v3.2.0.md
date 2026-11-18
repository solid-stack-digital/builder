# Feature specification V3.2.0: isolated infra-mode overlay

**Status:** Approved. **Extends:** `spec_v3.0.0.md`, `feature_spec_v3.1.0.md`. **Implementation plan:** `.docs/execution_docs/06-implement_v3.2/`.

A service can start local helper modules (for example a dev database behind in-process mocks) in isolated runs without switching `main` to `INFRA_MODE=integrated`. Integrated runs never start those modules.

**S1. Field.** `build.json` stage overlays `dev` and `test` accept an optional key `on-inframode-isolated`. Its value is an object whose only allowed key is `services`. `services` maps service names to the same partial overlays a stage overlay accepts for `main` and ordinary services. `tester` is not allowed inside it. `on-inframode-isolated` is not allowed inside itself, at the root, in `services`, in `prod`, in `e2e`, or anywhere in `mesh.json`.

**S2. When it applies.** The block of the resolved stage applies exactly when the run's `INFRA_MODE` is `isolated`: `service up dev` without `--full` (block `dev.on-inframode-isolated`), `service up test-unit` and the unit phase of `service up test` (block `test.on-inframode-isolated`), and the per-source unit phase of `mesh up test` Phase 1 (each source's `test.on-inframode-isolated`). It never applies to `service up dev --full`, `service up prod`, `service up test-e2e`, `mesh up dev`, `mesh up prod`, or `mesh up test` Phase 2. `service export <stage>` and `builder check` compile the same effective configuration as the matching run.

**S3. Merge order.** Standalone: `base → stage → stage.on-inframode-isolated`. Merge rules are those of stage overlays: objects merge recursively, scalars and arrays replace, `requisites.<name>: false` removes an edge, an existing ordinary `compose` is immutable, a service introduced by the block must provide a complete `compose`, and `main` and `tester` must exist in base. Per-key origins point at `<stage>.on-inframode-isolated.services.<name>...`.

**S4. Isolated graph.** In an isolated run the active graph is the closure from `main` following (a) only those `main` requisite edges whose effective declaration comes from `on-inframode-isolated`, and (b) every requisite edge of each activated ordinary module. All other edges from `main` are dropped. Kept edges behave exactly as in integrated runs: `dependency` waits for health, `prerequisite` waits for exit 0, `requirement` includes without ordering; healthcheck and lifecycle validation apply.

**S5. Execution variables.** `EXEC_MODE` and `INFRA_MODE` for `main` are unchanged in every workflow; isolated runs keep `INFRA_MODE=isolated` even when modules are active.

**S6. References.** Endpoint references resolve against the active graph and the consumer's requisite closure, as in 3.1.0. A reference in the block to a module the block activates resolves. A reference outside the block to a module only the block activates fails in runs where that module is inactive (`outside effective requisite closure`).

**S7. Dormant declarations.** An ordinary module declared in base and reached only through the block is dormant in every other run: it does not start, publish ports, or appear in the Compose output. It is still structurally validated in every resolved stage.

**S8. Unit runner.** When the isolated `test` graph contains only `main`, `service up test-unit` runs exactly as in 3.1.0 (`up --build --abort-on-container-exit --exit-code-from main main`). When it contains active modules, Builder starts all active services detached, waits for `main` to exit, prints `main`'s logs, returns `main`'s exit code, and tears down everything.

**S9. Mesh.** `mesh.json` gains no field. Global mesh runs are integrated, so source blocks never apply there. Phase 1 of `mesh up test` runs each source's standalone test workflow, so each source's `test.on-inframode-isolated` applies in that source's unit phase.

**S10. Compatibility.** A configuration without `on-inframode-isolated`, or with an empty block, produces Compose output identical to 3.1.0 in every workflow.
