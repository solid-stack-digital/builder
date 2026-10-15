# 08 — Execution, cleanup, public interfaces and bounded Docker acceptance

Prerequisite: [05](05_TEST_STRATEGY_AND_FIXTURES.md). Cases RUN/CLI/OPS/PKG use the real Builder implementation with OS boundaries controlled. DOC01–DOC03 are the only required real Docker batches. The complete warmed command targets 1–3 minutes; do not recreate the old expensive application/example builds inside these tests.

## A. Execution profiles and standalone workflows

Owner: `tests/v3/executionProfiles.test.ts`, `serviceWorkflow.test.ts`, `finiteTester.test.ts`. Spec §§4–6, 71–75; policy D13 for standalone convenience names. Use layer W except profile-only U cases.

| ID | Situation / setup and action | Expected result | How to test |
|---|---|---|---|
| RUN01 | Invoke standalone dev, dev full, prod, unit, service E2E; mesh dev/prod/global E2E. | Exact target/EXEC_MODE/INFRA_MODE/dotenv rows from plan 03; only main receives mode variables. | Parameter table through public handlers/real compiler; inspect YAML captured by process adapter, not profile helper alone. |
| RUN02 | Standalone test with unit exit 0, tester exit 0. | Unit starts/finishes/cleans before service E2E starts; overall 0. | TRACE exact phase order; hold unit cleanup promise unresolved and prove E2E hasn't started. |
| RUN03 | Unit exit 4. | Return 4; E2E compile preflight may occur but no E2E build/up/wait. | Script finite unit process exit; assert cleanup and forbidden runtime events. |
| RUN04 | Unit spawn/build/startup fails. | Nonzero infrastructure result, strict cleanup of any created state, no E2E runtime. | One failure point per test, real error path; don't stub runTest. |
| RUN05 | Unit succeeds but teardown fails. | Overall nonzero; no E2E; recovery state retained. | Inject down error after success; CLEAN failure contract. |
| RUN06 | Known E2E schema/ref error exists before standalone test invocation. | Preflight fails before unit runtime; no wasted test containers. | Real invalid E2E fixture with valid unit; assert no build/up. |
| RUN07 | E2E main and graph ready, selected tester exit 7. | Overall 7 after cleanup, not helper status or Compose startup 0. | Child wait/inspect responses; assert selected generated name used. |
| RUN08 | Tester helper exits 0 before selected runner. | Suite remains pending until runner exits. | Deferred runner completion; resolve helper event first and inspect unsettled workflow; no abort-on-container-exit arg. |
| RUN09 | Prerequisite exits 9 or dependency becomes unhealthy during startup. | Tester not waited on as if started; failure reported, consumers prevented, cleanup runs. | Engine fake startup nonzero plus inspect states; inspect emitted complete/healthy conditions too. DOC02 corroborates engine behavior. |
| RUN10 | Readiness deadline expires while job or health pending. | Failure names pending nodes; child terminated; cleanup; no real 120-second wait. | Advance fake clock to deadline−1 and deadline; assert timer cancellation after cleanup. |
| RUN11 | Images/builds take simulated >120 seconds, then runtime becomes ready promptly. | Startup deadline begins after preparation, not during build/pull. | Fake clock/adapter timeline; no timeout while preparation incomplete. |
| RUN12 | Build or pre-pull fails before application up. | No runtime starts; resources created by preparation tracked/cleaned appropriately. | TRACE no up, precise failing command/status; no credential logging. |
| RUN13 | Compose wait returns ambiguous/nonzero transport status; inspect selected runner exits 7. | Actual available runner exit status used; transport error without terminal runner state yields infrastructure failure. | Two scripted wait/inspect variants; never treat missing status as success. |
| RUN14 | Logs collection fails after tester exit 7/0. | Tester status preserved; log warning separate. | Parameter status table; cleanup still invoked exactly once. |
| RUN15 | SIGINT/SIGTERM during build/up/wait; then child emits exit too. | One cleanup, no phase advance, interruption failure, no dangling process/listener. | Event-emitter fake process; count listeners/timers before/after; no signal sent to host shell. |
| RUN16 | Runtime returns 0 but cleanup fails; runtime returns 7 and cleanup fails. | First nonzero cleanup result; second preserves primary failure and reports cleanup too. | Assert numeric result and both diagnostic records, saved recovery state. |
| RUN17 | Direct service test-unit/test-e2e commands. | Invoke only corresponding phase; E2E still target prod; never Dockerfile target test-e2e. | Actual handler dispatch and captured commands; policy tag D13. |
| RUN18 | Detached dev/prod success versus foreground termination. | Detached leaves runtime/state; foreground interrupted run cleans appropriately; tests cannot detach. | Fake successful up and termination; inspect state and cleanup option removeVolumes. |
| RUN19 | Dry-run standalone complete test and mesh test. | All requested compositions validated with placeholders; no process spawn, probes, allocations or state writes. | OS guard throws on accidental mutation/process calls; inspect returned status and diagnostics. |
| RUN20 | Start graph contains requirement-only disconnected-in-ordering module. | Startup explicit service list includes all reachable runtime/tester members. | Parse actual argv and compare to compiler runtimeServiceNames/testerServiceNames; do not rely on Compose recursive dependency pulling. |

## B. Mesh two-phase workflow

Owner: `tests/v3/meshWorkflow.test.ts`. Spec §§76–78. W tests use MM plus base roots zeta/alpha and stage-only inspector/audit. Mock only process/clock/engine responses, not source lifecycle functions.

| ID | Situation / setup and action | Expected result | How to test |
|---|---|---|---|
| MSH01 | Mesh dev/prod with source roots and stage additions. | Every effective non-tester root runs integrated, own dotenv, no tester. | Real compile from command handler; captured YAML exact main membership and profiles. |
| MSH02 | Mesh test declares base zeta then alpha, tester, dev-only inspector and E2E-only audit. | Phase 1 runs alpha then zeta under pinned sort policy; excludes tester and stage-only roots. | TRACE source paths and phase order; global E2E includes audit, not dev-only inspector. |
| MSH03 | Each base source has unit and service tester. | Both phases of each source complete and clean before next source begins. | Gate cleanup promises at each boundary, assert no concurrent up events. |
| MSH04 | Mesh extends changes env, prunes mock, hides publication. | Phase 1 uses source standalone env/mock/publication; Phase 2 uses mesh rewrites. | Compare captured YAML across three phase contexts; explicit marker values make leakage visible. |
| MSH05 | Two base aliases import same directory. | Run complete standalone test once per base entry, sequentially; separate mesh runtime identities Phase 2. | Count ordered source cycles and distinct final NodeIds. |
| MSH06 | First source unit/service E2E/cleanup fails, parameterized. | No later source runtime and no global E2E runtime. | Script failures at each exact boundary; assert error status and recovery behavior. |
| MSH07 | Second source fails after first source succeeds. | First already cleaned; global absent; failed source cleanup handled. | Resource fake registry and real temporary run.state files. |
| MSH08 | Global effective config invalid while standalone sources valid. | Global preflight rejects before Phase 1 runtime. | Actual invalid reference/publish fixture; no build/up anywhere. |
| MSH09 | Phase 1 uses fixed port 45100 and volume sentinel; Phase 2 requests same port/volume name. | Phase 1 releases binding/state; Phase 2 starts fresh with no previous data. | Fake engine tracks owned resources and errors on overlaps; inspect compile instances/allocation registries are fresh. DOC01/DOC03 validate real teardown primitives. |
| MSH10 | Source-local tester has poison env; global tester has distinct env and build target. | Only global tester in Phase 2; its correct runner identity/status used. | Exact service/env/target comparison and wait argv. |
| MSH11 | Global tester exit 7 or global cleanup fails. | Mesh workflow nonzero after cleanup; no false success after successful Phase 1. | TRACE status propagation; preserve recovery state if needed. |
| MSH12 | Valid mesh source repair shadows a standalone-invalid reference. | Mesh dev/prod compile may succeed; Phase 1 standalone test independently fails that source. | Pair mesh compile with complete mesh test; don't run standalone validation prematurely during ordinary mesh compile. |
| MSH13 | Global E2E inherits source prod→e2e then mesh prod→e2e. | Final main prod target/prod integrated env with env.e2e; stage-added audit included. | Actual final YAML, not mocked effective config. |
| MSH14 | Public mesh up test-unit/test-e2e/e2e requests. | Reject before checks/runtime, guidance to mesh up test; internal compile E2E remains usable. | Real command parser and direct handler; compare forbidden child calls. |

## C. Cleanup, persistence and resource safety

Owner: migrated cleanup suites plus `tests/v3/state.test.ts`. W/I, no daemon. Spec §§27, 70, 74, 78 plus implementation cleanup policies.

| ID | Situation / setup and action | Expected result | How to test |
|---|---|---|---|
| OPS01 | Successful test owns main, atomic module helpers, job, tester helpers, networks, named/anonymous volumes. | Strict teardown covers all owned resources; no member omitted due to missing endpoints. | Fake engine catalogue from actual compiled membership; assert down args and specific anonymous volume cleanup. |
| OPS02 | Ordinary dev/prod down without volumes flag; test cleanup with strict policy. | Dev/prod volume preservation follows existing option, test volumes removed. | Same resource fixture, compare removeVolumes and final registry. |
| OPS03 | Down fails halfway. | Nonzero result and recovery state remains; do not falsely clear allocations/artifacts. | Script removal of one resource then failure; inspect state after exception. |
| OPS04 | Saved runtime state exists; config edited to another name/invalid JSON/deleted. | Down targets saved project/identities; doesn't start or compile new topology. | Real state file + corrupted config; capture exact project args and resource lookup. |
| OPS05 | Run-state write fails before up. | Fail before untracked runtime startup. | Inject EACCES only for state file write; no up and no swallowed success. |
| OPS06 | State clear/write/cache atomic rename fails after teardown. | Report persistence failure, preserve available recovery details; no next phase. | Narrow FS fault injection; assert state validity if old file survives. |
| OPS07 | Malformed/stale saved state and absent state. | Recovery path reports actionable error or uses documented safe lookup, never deletes unrelated project. | Fixtures for bad JSON/version/missing fields; inspect scoped cleanup commands. |
| OPS08 | Old V2 state exists but no supported V2 config. | Cleanup compatibility works using saved runtime identity only; compiler still rejects V2 config. | Two operations against same temp root; no V2 compile fallback. |
| OPS09 | Unrelated external volume/network and another project share similar names. | Cleanup affects owned project only; declared external resources preserved. | Engine fake labels and resource ownership table; assert non-owned IDs untouched. |
| OPS10 | Port cache contains current phase plus unrelated entries. | Successful strict cleanup removes current transient entries, preserves unrelated cache data; empty cache file removed. | Real temporary cache before/after; canonical keys include context. |
| OPS11 | Temporary artifact path attempts escape or symlink redirection. | No delete/write outside authorized builder-owned fixture subtree. | All sentinel files themselves remain inside builder; assert sentinel contents unchanged. |
| OPS12 | Repeated teardown/signal after already cleaned runtime. | Idempotent success/diagnostic, no double destructive operations or leaked listeners. | Invoke twice through real cleanup coordinator; fake engine responds absent on repeat. |
| OPS13 | Port collision discovered immediately before startup. | Up not called; pending state/allocation proposal not misreported as running. | Mock port available at proposal then busy at startup; inspect state and failure. |
| OPS14 | Global prune command listing resources includes unrelated/unlabelled containers. | Only resources within existing Builder prune ownership contract selected; no unrelated global prune. | Command handler with fake list response; assert exact scoped IDs/filters and dry-run no mutations. |

## D. CLI, library exports, schemas, docs and package surface

Owner: `tests/v3/cli.test.ts`, `publicApi.test.ts`, `repositoryContract.test.ts`. These are primarily I/W. Built-dist checks run once after Builder build in the full command; do not build the package from individual test cases.

| ID | Situation / setup and action | Expected result | How to test |
|---|---|---|---|
| CLI01 | Parse both builder/solid-builder aliases and default service dev with explicit -C path. | Same handler behavior; projectDir resolved once; no cwd leakage. | In-process Commander parse with captured IO/adapters, one built executable smoke per alias. |
| CLI02 | Service dev --full versus prod/test --full; detach with finite test. | Full only affects dev; invalid flag combos fail before runtime per plan policy. | Actual parser+handler; no handler stub accepting everything. |
| CLI03 | Unknown service/mesh stage, missing argument or bad project path. | Helpful error/nonzero; no Docker calls. | Table of argv arrays; assert supported stages/guidance and no duplicate exits. |
| CLI04 | Help for service/mesh up and export/down. | Describes V3 targets/workflows, no public mesh E2E phase or required tester target. | In-process help output assertions; don't rely on whole-screen snapshot. |
| CLI05 | skipChecks with invalid final refs/order/publication. | Mandatory compiler validation still rejects before up. | Actual command handler with skipChecks true and negative fixtures. |
| CLI06 | Check standalone all profiles and mesh all effective stages. | Correct active contexts validated; no runtime/cache writes; mesh repair not preempted by standalone source validation. | Inject pure metadata and optional external checker adapter; count profile invocations without stubbing compiler. |
| CLI07 | compileEnvironment and compileMeshEnvironment public exports. | Return actual valid V3 YAML/runner metadata; unsupported config/mesh test rejects. | Import public source API and built API smoke; independent YAML parse. |
| CLI08 | compileApplicationEnv/export uses main renamed/runtime identity; tester contains poison key. | Only main effective env returned; no reliance on legacy app or tester name. | Native Compose-resolution adapter returns multiple containers; ensure requested generated main selected. |
| CLI09 | Export dotenv with quotes/dollars/newlines/empty values and invalid key/NUL. | Supported literals roundtrip; invalid export input rejected; no extra env domain. | Pure serializer roundtrip and controlled resolver; actual Compose corroboration DOC01. |
| CLI10 | Debug command compilation with env secrets. | Redacted console but unmodified runtime payload. | Capture both outgoing stdin YAML and printed text; sentinel forbidden only in logs. |
| PKG01 | Generate schemas once in memory and compare checked-in files. | Deterministic V3 schema, unchanged on repeat; correct published URIs/definitions. | Structural JSON comparison, no Git mutations or source-file regeneration inside test. |
| PKG02 | Compile each of eight migrated example builds and both meshes across applicable profiles. | Examples valid under V3 and expected graph structure, no V2 fields/commands. | Real files with metadata/port adapters, no app install/build/Docker; sample exact rewrite/node membership per example. |
| PKG03 | Current docs/examples contain V2 snippets; historical migration documents contain historical snippets. | Active pages use V3; historical pages explicitly labelled and excluded from blanket rejection. | Parse tagged current JSON code blocks and inspect command snippets; bounded explicit file list, not bare word grep. |
| PKG04 | Runtime source imports mesh/v2 or injects tester e2e mode/target. | Legacy gate fails actual removed surfaces; permits ordinary service named app and standalone convenience test-e2e. | Gate unit tests feed offending/legitimate snippets; then gate real source tree once. |
| PKG05 | Built exports/version/binaries/schema/template paths. | Version 3.0.0; both bins and required package assets present, no dependency on removed V2 tree. | One post-build smoke import and filesystem manifest check; never publish or install packed package elsewhere. |
| PKG06 | Template/policy/examples disagree on canonical Dockerfile stages or main override key. | Repository contract fails with exact offending path. | Parse YAML/policy required targets and compare curated example policy copy; no Docker Conftest run per fixture. |
| PKG07 | Registry missing scenario/invariant, duplicate ID, skipped normative case. | Coverage gate fails and reports missing/unexecuted IDs. | Feed synthetic reports to coverage reporter; actual report requires all normative cases executed/passed. |
| PKG08 | Fast test accidentally calls Docker, sleeps for product deadline or downloads an asset. | Harness rejects unexpected external access; suite cannot silently become slow. | Guard self-test intentionally attempts mocked child invocation/timer pattern, expects guard failure, then resets. |

## E. Three real Docker batches

### Preparation, isolation and common runtime

Prepare once with `test:v3:prepare`. Use one tiny shared image `builder-v3-test-runtime` built from Python 3.12 Alpine with only repository-owned standard-library scripts; no pip/npm install, test frameworks or application dependency downloads. Preparation resolves the base tag to its immutable image ID/digest, records it in `.builder/test-images.json`, and builds the runtime image with a content hash of its Dockerfile/scripts. All measured tests use that recorded image ID/hash, `--pull never` where applicable, and verify it exists. Cold download/build time is reported separately. Missing/stale image makes full-suite preflight fail with the preparation command; no automatic pull mid-test.

Runtime scripts under `tests/docker-acceptance/v3-runtime/`:

- `serve.py`: standard-library HTTP server, `/health` returning ready only after specified marker predicates; `/env` returns only fixture allowlisted env keys; `/role` returns own role/name. Configured port from environment. Writes `started-<role>.json` on process start.
- `job.py`: verify prerequisite endpoint reachable, write a unique completion marker then exit specified status; failure variant exits 9 without success marker.
- `runner.py`: assert expected marker predicates and URLs/env, write tester-started/completed markers, exit configured 0/7. Assertion failure exits 11 with a specific reason.
- `unit.py`: assert EXEC_MODE=test, INFRA_MODE=isolated, no graph URL/native tester vars; write the nonce-bearing unit-completed marker before exiting with configured status.

Markers are separate files created atomically in a per-test bind-mounted directory, not a concurrently appended text log. Assertions use file existence and monotonic ordering within a single observing process; do not compare independent container wall clocks. Node/container markers must contain generated fixture nonce to prevent stale artifacts passing a rerun. Persist diagnostic markers until assertions complete, then remove them.

The main fixture Dockerfile has real dev/test/prod targets inheriting the cached runtime image; main production command serves and unit command exits. Builder compiles and uses its canonical Dockerfile; do not hand-edit final compiled Compose to inject a fake main image or bypass target selection. Ordinary/tester modules use the shared prebuilt image. Tiny cached main builds are allowed and included in runtime budget. Build contexts contain only the fixture Dockerfile and necessary tiny files, never the repository/node_modules.

Use unique project name per batch/run nonce, explicit project labels from actual compiler, loopback AUTO public ports, ordinary bridge network and selected host-network tester. In DOC01, mount an owned named scratch volume on main through its valid override, write a sentinel there, and verify its actual removal after cleanup. Bind-mounted assertion markers are separate from this volume so cleanup evidence remains readable. Health interval 1 second, timeout 1 second, start period 0, retries 3. Runner normally finishes immediately once gates are met. No arbitrary multi-second sleeps; use marker/health predicates and bounded polling. Run batches serially.

Cleanup always executes through production Builder teardown plus an outer harness finally block that removes only that batch's recorded resources if product cleanup failed. Before fallback cleanup, capture labels/IDs/status so a product leak fails the test rather than being hidden. Inspect actual remaining container/network/volume IDs after product cleanup; cache preexisting IDs to avoid accusing unrelated resources. No `docker system prune`.

### DOC01 — successful complete standalone graph, barrier and literal interoperability

**Budget:** 22 seconds including cached build, unit phase, E2E startup, assertions and teardown. **Owner:** `tests/docker-acceptance/v3-standalone.test.ts`. **Spec:** §§4–6, 8–10, 17–18, 54–64, 69, 71–75, 79–80.

**How the situation happens:** Run actual standalone `test` lifecycle against BG. Unit writes a unit-completed marker. E2E has main, db, endpoint-less migration, requirement-only mail and selected tester runner (five containers; no helper needed in this batch). db health succeeds once server listens. Migration checks db then writes migration-success. Main startup requires migration-success; its health passes after server starts. Mail health requires main-started marker, proving main is able to start before requirement-only mail is ready. Tester asserts all expected markers and endpoints, plus no EXEC_MODE/INFRA_MODE in its own environment. Give main `.env.e2e` and tester `.env.e2e-tester` distinct values and one representative literal string containing a dollar, quote and newline.

**Expected result:** Unit→cleanup→E2E order; main prod/integrated; db readiness before job; migration completion before main; tester only after main and mail ready. No unused service. Tester returns 0. Endpoint response and exported literal value match expected bytes. Product cleanup removes all containers/networks/owned volumes and state.

**How to test:** Use real public handler and actual Docker adapter. Runner queries `/env` and published main/mail URLs, checks markers and records assertions; inspect terminal status and no leaked resources. Capture generated Compose conditions separately to explain ordering failures. Native Docker Compose config/export roundtrip is exercised once here; all additional literal variants stay Docker-free in ENV16/CLI09. If marker assertions fail, return actual runner 11 and report failing predicate; don't turn them into retry loops that hide wrong ordering.

### DOC02 — failed prerequisite blocks consumer and tester

**Budget:** 16 seconds including teardown. **Owner:** `tests/docker-acceptance/v3-failure.test.ts`. **Spec:** §§10, 69, 74–75.

**How the situation happens:** Run actual standalone service-E2E phase with main, job and tester (three containers declared). Job is endpoint-less and exits 9 immediately. Main declares job prerequisite. Tester's full barrier contains job completion and main health. No db needed; job failure behavior is isolated from health timeouts.

**Expected result:** Execution fails; main-started and tester-started markers do not exist. The process does not wait indefinitely for nonexistent runner completion. Actual job status is nonzero, diagnostic identifies job failure, and strict cleanup removes owned runtime resources/state. The overall infrastructure startup code may differ from 9; assert nonzero plus inspected job ExitCode=9 rather than incorrectly requiring Compose's startup command to return 9.

**How to test:** Run production runner, capture startup status, inspect job state before teardown through test observer hook, and check markers. Use a 6-second test-injected startup deadline so a broken implementation fails quickly; don't wait production 120 seconds. Outer finally performs scoped fallback only after recording leak/failure evidence. Simulated W tests cover timeout/signals/cleanup failure permutations; do not add a second real unhealthy-container run.

### DOC03 — real mesh identities, DNS, explicit publication and selected tester status

**Budget:** 22 seconds including teardown. **Owner:** `tests/docker-acceptance/v3-mesh.test.ts`. **Spec:** §§13, 27, 40–50, 70, 76–79.

**How the situation happens:** Use an MM-derived mesh with two main roots, one ordinary module containing api and helper, and a global tester runner (five containers). A pruned frontend-local backend mock is declared but never started. Both source mains and module api use the same internal HTTP port safely; frontend requires backend by requirement, and backend requires frontend by requirement, forming a legal requirement-only cycle. Backend also requires its ordinary api/helper module by requirement. Frontend points to backend via canonical network ref, retries its request with a bounded 3-second readiness deadline (no assumed startup order), and records the returned role before becoming healthy. Publish backend main and module api; keep frontend private. Module helper is a short job that exits 0 independently; it is not the tester runner. Global tester validates public endpoints and role markers, then intentionally exits 7.

**Expected result:** No local mock container; separate names/resources despite duplicated internal names; cross-source DNS reaches backend; no frontend host binding; published endpoints reachable; requirement cycle starts; helper exit does not end suite early; actual selected global tester result is 7; strict cleanup removes resources. No source standalone tester appears in global composition.

**How to test:** Invoke the actual internal global E2E runner through a prepared composition context, using production compiler and Docker adapter. Phase-1 sequence/independence is covered by MSH02–MSH09 with real orchestration and fake OS; this batch need not rerun multiple application test lifecycles. Runner's completed assertion marker must exist before accepting exit 7, otherwise any arbitrary failure could masquerade as expected failure. Inspect published ports and private service port absence; verify helper ExitCode=0 and selected runner ExitCode=7 before cleanup through observer capture.

### Acceptance boundary

These batches establish that Docker respects Builder's emitted health/completion conditions, finite runner status, networking, env serialization and teardown. They do not substitute for the hundreds of Docker-free decisions/negative cases. Conversely, fake OS tests do not prove Docker behavior; full CI is incomplete if DOC01–DOC03 did not actually execute. This separation is what keeps broad coverage within the time budget.

## F. Complete feature and invariant mapping

Use actual case IDs below in the executable registry; parameter variants inherit relevant section/invariant metadata. Section 84 Naming and the exhaustive Build example are distinct labels because the specification repeats that number. Every normative final invariant has an owner and at least one concrete case. Policy-specific cases also record D01–D16 as appropriate.

| V3 feature / sections | Required cases |
|---|---|
| Service kinds, reserved schema, required fields, naming §§3,22–28,33–39,83–84 Naming | CFG01–CFG24, MER11–MER18, LIF15–LIF19 |
| Execution variables and targets §§4–6 | ENV10–ENV14, LIF07–LIF10, LIF16, RUN01, DOC01 |
| Requisites, closures, lifecycle conflicts/cycles §§7–15 | GRF01–GRF22, LIF01–LIF06, DOC01–DOC03 |
| Endpoint shapes/primaries/scheme/properties §§16–21 | CFG15–CFG19, REF13–REF15, PUB01–PUB20, CMP03–CMP04 |
| Merge/immutability/stage additions §§28–32,39 | MER01–MER24, INT01–INT03 |
| Source/extends/scopes/merge-first §§36–46,51–53,101 | MER14–MER24, REF01–REF24, MSH04, MSH12–MSH13 |
| Publication §§47–50,79–81 | PUB01–PUB20, REF10,REF14–REF15,REF20, DOC03 |
| Main/ordinary/tester env §§54–64 | ENV01–ENV20, CLI08–CLI10, DOC01 |
| Overrides/build args §§65–66 | CMP13,CMP16–CMP19, MER04, ENV01–ENV04 |
| Atomic Compose/ownership/representatives/health §§27,67–70 | CMP01–CMP24, LIF01–LIF22, OPS01–OPS14 |
| Standalone lifecycle/E2E barrier §§71–75 | RUN01–RUN20, LIF13–LIF14, DOC01–DOC02 |
| Mesh workflow §§76–78 | MSH01–MSH14, RUN01, DOC03 |
| Canonical pipeline/fail-fast §§82–83 | INT04–INT06, CFG errors, REF23, PUB14, CLI05–CLI06 |
| Examples/invalid examples §§84 Build example–94 | INT02–INT04, PKG02 |
| Removed V2 concepts and model §§95–101 | CFG09–CFG10, MSH14, PKG03–PKG06 |
| Existing supported tooling beyond explicit V3 features | OPS04,OPS08,OPS14, CLI01–CLI10, PKG01–PKG08 |

| Final invariant | Concrete tests | Final invariant | Concrete tests |
|---:|---|---:|---|
| 1 | CFG03,CFG09 | 32 | MER06–MER07,ENV02 |
| 2 | CFG05–CFG07 | 33 | MER01–MER02 |
| 3 | GRF01 | 34 | MER04,MER10 |
| 4 | ENV10,ENV13,LIF16 | 35 | MER03,PUB06 |
| 5 | RUN01 | 36 | MER11,GRF15 |
| 6 | LIF07–LIF09 | 37 | MER21,MSH02 |
| 7 | ENV02,RUN01 | 38 | GRF18,REF04 |
| 8 | LIF19,RUN01 | 39 | REF01 |
| 9 | CFG04–CFG05,CFG12 | 40 | REF02–REF06 |
| 10 | CMP01,CMP09 | 41 | REF07–REF09,ENV18 |
| 11 | CFG17,CMP02 | 42 | REF12 |
| 12 | CFG17,CMP03 | 43 | REF10–REF11 |
| 13 | CFG19,CMP04,LIF22 | 44 | PUB03–PUB04 |
| 14 | CFG18,MER13 | 45 | PUB02 |
| 15 | GRF03,LIF01 | 46 | PUB05 |
| 16 | LIF02,DOC01 | 47 | GRF18,PUB20 |
| 17 | LIF03,DOC01–DOC02 | 48 | ENV01–ENV08,ENV14 |
| 18 | MER08–MER10,MER16 | 49 | ENV05–ENV06 |
| 19 | GRF05,GRF21,DOC03 | 50 | ENV10–ENV13 |
| 20 | GRF06–GRF08 | 51 | LIF07–LIF09,LIF14 |
| 21 | GRF09–GRF12 | 52 | LIF11–LIF12,LIF22 |
| 22 | GRF02,REF22 | 53 | RUN09,DOC02 |
| 23 | GRF01,GRF03–GRF04 | 54 | LIF13,DOC01 |
| 24 | GRF16,MSH01 | 55 | LIF14,DOC01 |
| 25 | GRF17 | 56 | MSH02–MSH07 |
| 26 | CFG09,MER15 | 57 | MSH09–MSH13 |
| 27 | CFG05,MER14–MER20 | 58 | CFG10,MSH14 |
| 28 | CFG20,MER17 | 59 | CMP08–CMP11,DOC03 |
| 29 | MER05 | 60 | CMP16–CMP18 |
| 30 | CFG10,MER06 | 61 | INT04–INT06,REF23,PUB14 |
| 31 | CFG10 | — | — |

## G. Test implementation exit criteria

- Every catalog ID has an executable named case; parameterized mutation families produce separately visible results.
- No spec feature is supported solely by a snapshot, mocked compiler, schema metadata string, or registry entry.
- Fast suite succeeds with Docker unavailable and makes zero Docker calls; Docker evidence executes only in the three explicit batches.
- Full warmed suite includes all active migrated regressions, typecheck/build once, post-build smoke once, and all three engine batches. Report exact wall times, runtime/Compose versions, fixture image ID, case counts and failures/skips.
- Measured normal total stays at or below 180 seconds on the declared CI runner; fast suite at or below 90 seconds. Investigate import/setup/real sleep/duplicate invocation costs before changing architecture. Preparation and dependency installation are reported separately, not hidden as test time.
- Product cleanup failures fail the test even if harness fallback succeeds. Required Docker tests never become passing skips when prerequisites are absent.
- All negative cases verify fail-fast side effects, all result-status cases verify actual selected finite process, and all stateful cases verify isolation/cleanup.
- No publishing, Git mutation, sibling workspace edits, or real external application dependencies are needed for verification.

## H. Replacement map for the earlier fifteen Docker requirements

This table makes the continuation's runtime-budget change explicit. File 04 §7's behavioral requirements remain covered; they are not fifteen separate Docker projects anymore.

| Earlier file 04 §7 item | Docker-free detailed coverage | Remaining engine evidence |
|---:|---|---|
| 1 — db→migration→main | GRF03,LIF02–LIF03,RUN01–RUN02 | DOC01 |
| 2 — migration failure | RUN09,OPS01–OPS03 | DOC02 |
| 3 — requirement-only readiness | LIF01,LIF06,LIF13–LIF14 | DOC01 |
| 4 — allowed/forbidden cycles | GRF05–GRF08,GRF21–GRF22,LIF05 | DOC03 proves legal cycle; compiler rejection needs no engine |
| 5 — endpoint-less/dormant | GRF01–GRF02,GRF14–GRF15,CMP02 | DOC01–DOC02 |
| 6 — atomic module | CMP01–CMP05,LIF02,LIF04 | DOC03 api/helper membership |
| 7 — selected tester/helper | LIF15–LIF18,RUN07–RUN08,RUN13 | DOC03 selected status 7 with helper 0 |
| 8 — full barrier/main health | LIF06,LIF13–LIF14,RUN09–RUN10 | DOC01–DOC02 |
| 9 — source rewrite/names | MER15–MER19,GRF17,CMP08–CMP11 | DOC03 |
| 10 — public/private/ports | PUB01–PUB20 | DOC01 and DOC03 endpoint access/private absence |
| 11 — sequential isolation | MSH02–MSH09,OPS01,OPS10 | DOC01/DOC03 actual teardown; no repeated full mesh pipeline |
| 12 — fail-fast/signals | RUN03–RUN06,RUN15–RUN16,MSH06–MSH07 | DOC02 engine prerequisite failure; OS signal permutations simulated |
| 13 — dotenv/literals | ENV01–ENV20,CLI08–CLI09 | DOC01 one native Compose roundtrip |
| 14 — recovery/down | OPS03–OPS12 | Shared production teardown exercised in all batches; corrupted-state permutations simulated |
| 15 — Dockerfile contract | LIF07–LIF12,PKG06 | DOC01 real three-target fixture build; negative metadata cases stay pure |

There is no optional slow suite required to satisfy this catalog. Additional exploratory real-world application tests may exist outside this verification contract, but they must not be substituted for missing cases or included secretly in the reported 1–3 minute total.
