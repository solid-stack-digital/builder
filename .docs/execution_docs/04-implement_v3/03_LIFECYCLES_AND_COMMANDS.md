# 03 — Execution profiles, command integration, barriers and cleanup

Prerequisite: [02_COMPOSE_AND_ENVIRONMENT.md](02_COMPOSE_AND_ENVIRONMENT.md). Preserve the existing subprocess and teardown safeguards; replace hardcoded V2 app/tester identities and incorrect lifecycle assumptions.

## 1. One execution-profile factory

Create `src/core/config/executionProfile.ts` and remove local duplicated profile construction. Its return shape is configStage, envStage, mainTarget, execMode, infraMode, attachTester. Mesh accepts only dev/prod/e2e composition stages. Define these exact rows:

| Operation | configStage | mainTarget | EXEC_MODE | INFRA_MODE | Main dotenv | Tester |
|---|---|---|---|---|---|---|
| standalone dev | dev | dev | dev | isolated | .env.dev | absent |
| standalone dev --full | dev | dev | dev | integrated | .env.dev | absent |
| standalone prod | prod | prod | prod | integrated | .env.prod | absent |
| standalone unit phase | test | test | test | isolated | .env.test | absent |
| standalone E2E phase | e2e | prod | prod | integrated | .env.e2e | own Compose, .env.e2e-tester |
| mesh dev | dev | dev | dev | integrated | source .env.dev | absent |
| mesh prod | prod | prod | prod | integrated | source .env.prod | absent |
| global E2E phase | e2e | prod | prod | integrated | source .env.e2e | mesh Compose, root .env.e2e-tester |

Tester never receives either execution variable. `full` only affects standalone dev; reject `--full` on other service operations with a clear message instead of silently making test integrated. `detach` applies to dev/prod only; test workflows are finite and must reject detach before startup. Dry-run compiles/validates the requested workflow with placeholders, no containers or state files.

Tests `tests/v3/executionProfiles.test.ts` enumerate every row and invalid flag combination, including that `e2e` is a config stage and never an ExecutionMode.

## 2. Dockerfile contract and validation entrypoints

Edit `src/core/checkers/checkDockerfileContract.ts`, `checkDockerfile.ts`, `checkInfra.ts`, `checkEffectiveServiceStages.ts`, `getDeclaredYamlFiles.ts`, `checkYamlFiles.ts`, `templates/policy/dockerfile/dockerfile.rego`, and mesh checker files.

### Main contract

- Canonical file is project Dockerfile; no BuildJson dockerfile field.
- Required aliases are dev/test/prod only. Do not require or select test-e2e.
- Dev and prod must have an effective runtime CMD or ENTRYPOINT and valid enabled healthcheck, including inherited declarations. Dev must remain foreground. Test must have an effective runtime instruction that can terminate with meaningful status; runtime status is checked by the unit runner.
- Retain inherited HEALTHCHECK NONE detection and stage-inheritance cycle diagnostics. Verify runtime target health after permitted override timing changes.
- Remove technology-specific requirements for prod COPY --from, dev CMD specifically when ENTRYPOINT is sufficient, and global EXPOSE prohibition. EXPOSE is metadata and is not host publication.
- Do not require application source conventions, frameworks, DI implementation or specific work directories.
- Extract/share Dockerfile effective metadata evaluation so every runner's mandatory preflight can enforce required target/health before runtime. Existing Conftest remains an explicit check command tool; avoid making `skipChecks` a way to omit semantic contract validation.

### Check command behavior

`builder check` runs structural validation and all standalone profiles: isolated dev, integrated dev, prod, isolated test, E2E. Use validationMode for compilation, so checks do not create `.builder/ports-v3.json`, runtime YAML, run.state, containers, networks or volumes. Check only active Compose modules per profile. Do not independently read every obsolete override path as a second contradictory validation pass.

`builder mesh check` validates effective mesh dev/prod/E2E with final source overlays and mesh extensions. Do not call a source's complete standalone compile as a prerequisite to mesh compilation: a mesh can legitimately fix/prune a standalone reference through extends. Source structural schema and Dockerfile contract are still validated. Phase 1 of actual mesh test independently validates/runs each standalone source.

`checkMeshTester` validates `services.tester` and its E2E effective env/compose; use shared tester compiler. Remove `allowMissingTester`/optional tester behavior inconsistent with required base tester. Root test rejection remains in structural parsing and every compile entrypoint.

`skipChecks` skips optional broad lint/tool checks only. All active-stage schema/effective references/graph/ports/ownership/lifecycle validation remains mandatory in the compiler/run preflight. Check banners and diagnostics say V3.

Tests `tests/v3/checkers.test.ts` cover each mandatory rule, overwritten files ignored, inactive runtime assets ignored, active assets rejected, no check side effects, inherited image/Dockerfile health, mesh-repaired source refs and skipChecks still rejecting invalid composition. Port existing Dockerfile policy tests, adding valid non-Node/no-artifact-copy and inherited ENTRYPOINT examples.

## 3. Standalone runner changes

Edit `src/core/runners/runDev.ts`, `runProd.ts`, `runTestUnit.ts`, `runTestE2e.ts`, `runTest.ts` and their compile/state integrations.

### Dev/prod

Compile once into metadata + YAML. Validate unresolved image metadata checks and host ports, persist actual allocation/state only in real execution, then run with existing attach/detach behavior. Main and all graph-required module containers must be included in the service list; requirement-only nodes cannot depend on Compose recursively pulling them in, since requirements emit no depends_on.

Keep cleanup on foreground interruption/failure. Detached successful dev/prod intentionally leaves saved state for down. Do not use test's strict volume deletion policy for ordinary dev/prod down unless explicitly requested.

### Unit phase

Compile profile test; run only returned main service. Target test and isolated vars are enforced. Capture that container's exit code; an unrelated helper is impossible because no modules/tester materialize. Use the existing finite application execution technique with explicit main identity and propagate nonzero status.

Strictly tear down unit containers, named/anonymous volumes, networks and temporary artifacts before return. A cleanup failure makes the phase fail and prevents E2E. Unit startup/compile failure also prevents E2E.

### Standalone test orchestrator

Keep runTest's sequential structure:

1. Compile/preflight both effective phases without writes before starting the unit runtime, so known E2E configuration errors fail fast.
2. Execute unit; await its cleanup fully.
3. On any unit/startup/cleanup error return nonzero; never call E2E.
4. Execute service E2E from a fresh compilation/allocation (validation placeholders are not runtime values).
5. Return E2E runner status after strict cleanup.

Standalone direct `test-unit` and `test-e2e` convenience commands invoke the corresponding phase only. They do not change the config schema or Docker target set.

### E2E execution

Update runTestE2e to consume the actual testerServiceName from compiled metadata. Never hardcode `tester`. Compile the full graph, selected tester and barrier before starting anything. Enforce main prod target and prod/integrated env. Stage state records use configStage=e2e and workflow=test where applicable, not an execution mode named e2e.

## 4. Finite tester and barrier execution

Keep `runFiniteTester` as the shared standalone/global runner, but accept compiled metadata rather than only YAML and a guessed service name:

```ts
runFiniteTester(compiled: CompiledComposition, projectDir: string): Promise<number>;
```

Required sequence:

1. Run `docker compose build` for the selected build-backed services first; propagate build failure without starting containers. Then run `docker compose up --no-build --detach` with explicit active runtime service names and tester module service names. Generated depends_on ensures the selected tester runner cannot start before the full barrier. All runtime nodes must be selected even if only requirement-connected; no reachability inference from Compose edges.
2. If startup returns nonzero (failed health, prerequisite nonzero, impossible dependency), do not wait indefinitely for a tester that never started. Collect logs/inspect state, return startup failure, and let runWithCleanup tear down.
3. On successful startup, run `docker compose wait <selected-runner>` and return that runner's status. No `--abort-on-container-exit` or “first helper exit wins.” Successful one-shot prerequisite/helper exits must not terminate the E2E run.
4. Collect logs without replacing the runner status if log collection fails. If the wait command fails without a container exit status, return a nonzero infrastructure status.
5. A Ctrl-C/SIGTERM must settle subprocesses and invoke strict cleanup once. Preserve current runWithCleanup signal semantics and test them.

Readiness must be bounded: validate health metadata exists for every required representative before start, and rely on healthcheck retries for healthy/unhealthy transitions. Add a 120-second default startup/barrier deadline in the subprocess layer (tests inject a shorter value), starting after image builds/pulls complete. Pre-pull image-backed services before starting that deadline; build/pull time must not consume application readiness time. On deadline, stop waiting, report pending representative display names/states, fail and clean up. This deadline is internal, not a new config property. Long-running test execution is not capped by this startup deadline; tester completion uses the existing test process behavior. Prerequisite jobs are covered by the same startup deadline so a hung migration cannot block forever.

Verify Compose wait's exit behavior in Docker acceptance tests with runners exiting 0 and 7. If installed Compose does not expose runner status through wait, inspect the selected runner container's State.ExitCode after wait and use that exact code. Implement this inspection fallback in runFiniteTester rather than guessing success from logs.

The logical tester barrier is one representative per module; a module's helpers can finish normally without requiring healthchecks of their own. Internal dependency failures still affect Compose startup and must propagate. Main health is always part of the barrier regardless of references/publication.

Tests `tests/v3/finiteTester.test.ts`: explicit full membership passed to startup; tester blocked until job completion and requirement-node health; startup failure avoids wait; runner code preserved; helper success does not end test; logs cannot replace status; timeout returns failure and cleanup; signals clean once. Use mocked subprocess tests plus Docker checks in file 04.

## 5. Mesh workflow changes

Edit `src/core/mesh/runners/runMeshDev.ts`, `runMeshProd.ts`, `runMeshTest.ts`, `runMeshServiceTests.ts`, `runMeshTestE2e.ts`.

### Dev/prod

Compile the entire mesh once, with every effective top-level non-tester source as a root. No per-source partial compiler that allocates ports or validates stale refs. Every main is integrated and uses its own stage dotenv. Start all runtimeServiceNames; no global tester.

### Test Phase 1

1. Read base mesh config only to select members; exclude `services.tester`. Sort source root names lexicographically (existing deterministic order).
2. For each member use its source directory as standalone projectDir. Run its complete runTest pipeline. Pass debug/dryRun as appropriate; force finite/non-detached execution. Do not pass mesh env, extends, publish, shared port registry, source graph or global tester.
3. If two aliases share a directory, run once per base entry sequentially, matching the “every base service” rule.
4. Await strict teardown of that source's unit and E2E phases before advancing. If execution or cleanup fails, stop; do not test later sources or start global E2E.
5. Dev/prod/e2e-only top-level additions are not members unless also declared in base. Source build's own E2E fixture additions still participate in its standalone test.
6. Verify allocation/state cleanup boundary after each source. No previous containers, anonymous volumes, network or allocated host bindings survive. Never run Promise.all over base source tests.

### Test Phase 2

Only after all Phase 1 tests and cleanups succeed, compile a fresh global E2E composition: source base/prod/e2e → mesh base/prod/e2e. Include E2E-only mesh roots. Build a fresh allocation registry/network/project. Exclude all source-local testers; use the effective mesh services.tester only. Enforce full graph barrier and selected runner exit status through shared runFiniteTester; strictly clean up afterward.

Preflight the effective global E2E config before starting Phase 1 without persisting resources, so known invalid global references cannot waste source test runs. Never reuse that preflight's placeholder ports as actual runtime ports.

Tests `tests/v3/meshWorkflow.test.ts`: root membership with tester and stage-only services; lexicographic sequence; duplicate source aliases; standalone env/publication independent of mesh; fail-fast at unit/service-E2E/cleanup; no global startup on failure; clean fresh global network/ports; E2E-only root included Phase 2; global runner failure propagated.

## 6. Cleanup, run state and down/prune

Update `src/utils/runState.ts`, `src/core/composeCleanup.ts`, `teardownCompose.ts`, `runWithCleanup.ts`, service/mesh down handlers and prune integration only where new identity/membership requires it. Preserve existing recovery tests.

Required test cleanup owns all application/module/tester containers; all namespaced networks; named and anonymous volumes; materialized runtime files; transient allocations. Preserve user source files and declared external resources. Failed cleanup must not clear recovery state as if it succeeded.

Version saved state with `version:3`; record projectName, composition kind, configStage, workflow, projectDir, runtime container names, tester names, owned artifact paths, allocated endpoint keys and anonymous-volume service identities. Keep existing safe read compatibility for older saved state solely for cleanup; this is not V2 config support. Down must work using saved runtime identity even if build/mesh config becomes invalid or changes after startup. Do not recompile config and generate a different identity merely to stop the old project.

Strict test completion removes active allocation keys and runtime state only after successful teardown. A port cache is not a live lease, but Phase 1 runtime state must not be passed to Phase 2. Preserve unrelated preexisting cache entries if a file contains allocations for other contexts; remove the file if empty. On state persistence failure before startup, fail rather than silently starting an untracked test runtime. On cleanup persistence failure, report failure and retain available recovery information.

Error precedence: runtime nonzero remains the primary reported status, with cleanup failure also reported. If runtime succeeds but cleanup fails, overall result is nonzero. Signals return an interruption failure after cleanup. Never swallow cleanup errors to proceed to the next phase.

Tests migrate `cleanupAndTeardown`, `cleanupFailures`, `runWithCleanup`, `composeCleanupFailures`, `teardown-volumes-regression`, `saved-volume-cleanup`, and path-boundary regression suites. Add modules with multiple helpers, endpoint-less jobs and tester sidecars to their resource membership assertions.

## 7. CLI, exports and public API

Edit service and mesh up command/handler files, exported types in `src/index.ts`, `compileEnvironment.ts`, `compileMeshEnvironment.ts`, `compileApplicationEnv.ts`, service export/down help and relevant CLI tests.

- Preserve `builder` and `solid-builder`, existing service/mesh command grouping, project directory flags and dev/prod/test workflows.
- Standalone service stages: dev/prod/test/test-unit/test-e2e. Help explicitly distinguishes convenience workflow names from Dockerfile targets.
- Mesh public up stages: dev/prod/test. Reject `test-unit`, `test-e2e`, and `e2e` before source tests/startup. Error directs users to `builder mesh up test`. Remove handler import/dispatch of public direct global E2E; keep internal runMeshTestE2e only.
- Keep internal compileMeshEnvironment('e2e') for the orchestrator and library composition use; no mesh test config topology.
- compileApplicationEnv compiles one standalone V3 profile and selects returned main identity from Docker Compose's resolved config. It never exports tester/module env as application env. Preserve serialization/dollar roundtrip.
- Service export supports existing documented stages but routes to V3 compile logic. Dry-run/export/check all use shared effective env precedence; do not maintain independent V2 merging.
- Update command errors, diagnostic config paths, check banners and supported-stage constants. No suggestion should mention provider substitution, root tester or a required tester Dockerfile target.
- Update makefiles later in file 04; no need to add a new top-level command spelling merely because the spec uses semantic shorthand `mesh dev`.

Tests in `tests/v3/cli.test.ts` and migrated `exportEnv.test.ts`/`compileApplicationEnv.test.ts` verify actual dispatch, rejection before side effects, flag handling, selected main env and literal values. Library imports must not reference the removed mesh/v2 tree.

## 8. Integration gate

Run `pnpm typecheck`, all V3 unit/conformance tests and existing migrated cleanup/export tests. Validate CLI help via `pnpm builder --help`, `pnpm builder service up --help`, and `pnpm builder mesh up --help`. These commands must not start Docker. The Docker runtime proofs and full repository migration are mandatory in file 04.
