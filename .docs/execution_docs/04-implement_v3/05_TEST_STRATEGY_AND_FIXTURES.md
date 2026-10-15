# 05 — V3 test implementation strategy, fixtures and time budget

## 1. Scope and precedence

This is the entry point for the detailed test-plan continuation:

1. [06_TEST_CONFIGURATION_AND_GRAPH.md](06_TEST_CONFIGURATION_AND_GRAPH.md): parsing, schemas, overlays, scope, graph and endpoint permissions.
2. [07_TEST_COMPOSE_AND_ENVIRONMENT.md](07_TEST_COMPOSE_AND_ENVIRONMENT.md): environment precedence, modules, publication, ports, namespacing and generated Compose.
3. [08_TEST_EXECUTION_AND_ACCEPTANCE.md](08_TEST_EXECUTION_AND_ACCEPTANCE.md): execution workflows, CLI/API, cleanup, package checks, minimal real Docker evidence and coverage mapping.

Authority is [spec_v3.0.0.md](../../specs_v3/spec_v3.0.0.md). Apply the implementation decisions in [00](00_IMPLEMENTATION_CONTRACT.md), but identify decision-specific tests as policy tests. A policy assertion is not evidence that the specification explicitly requires that choice. These documents test the implemented V3 code; current V2 output must not be accepted as a golden oracle.

The continuation defines **255 scenario families**, including three real-Docker batches. Parameterized families expand into separately reported test cases.

This continuation supersedes file 04's allocation of fifteen scenarios to separate Docker acceptance executions, repeated whole-example runtime pipelines, and duplicate command gates. Preserve the behaviors being tested, move most proofs to real compiler + simulated operating-system boundaries, and use the small Docker batches in file 08 for the remaining engine semantics. Product defaults such as the 120-second readiness deadline do not change: simulate time in tests.

All edits/fixtures/reports remain inside builder. No Git mutations or publication. This deliverable is a test implementation plan, not an assertion that V3 is implemented or tested already.

## 2. Required execution budgets

Target a complete warmed verification run in **120–180 seconds**, with the normal Docker-free test suite completing in **45–90 seconds**. These are engineering budgets to measure, not measured results from this planning task. A slow machine, missing dependencies, first image download or Docker startup cannot have an honest unconditional three-minute guarantee.

| Work | Budget | Execution |
|---|---:|---|
| All schema/config/compiler/property scenarios, migrated regressions | 35 s | Vitest, four workers, no subprocesses except explicit API smoke |
| Workflow/CLI/cleanup/state scenarios | 15 s | Vitest, fake clock and process adapter; included in same invocation |
| Schema generation/public docs/example compilation/package contract tests | 15 s | One generation pass; cached per run; no installs/builds of examples |
| Typecheck and Builder package build | 25 s | Once each, outside test cases; no example application builds |
| Minimal Docker suite including teardown | 60 s | Three serial batches, locally cached tiny fixture image |
| Harness/process overhead and variance | 30 s | Reserve; total ceiling 180 s |

Do not launch Vitest separately for each scenario. Do not run `pnpm check`, `pnpm test:conformance`, `pnpm test`, and `check:full` back-to-back if they repeat identical files. Configure one fast project collecting all non-Docker tests, including the conformance registry.

Commands to add during implementation:

- `test:v3:fast`: one Vitest invocation using `vitest.v3.config.ts`, all active non-Docker tests and migrated regressions; no duplicate tests/v2 copies.
- `test:v3:docker`: one serial invocation using `vitest.v3-docker.config.ts`, only file 08's three Docker batches.
- `test:v3`: orchestration script `scripts/test-v3.ts`; run fast tests, typecheck, Builder build, built API smoke/legacy gate, then Docker batches once. Report wall time for every phase and total. Stop on first failed phase; always complete owned cleanup.
- `test:v3:prepare`: explicit one-time fixture-image preparation, outside the measured test command. See file 08. Never run automatically inside individual tests.

`test:v3:fast` requires no Docker executable or daemon. `test:v3` requires a prepared local fixture image and healthy Docker; missing prerequisites are a distinct nonzero preflight result, not a passing skip. CI must run the full command on a prepared runner. Report cold provisioning time separately. Coverage instrumentation is a separate diagnostic run, not enabled in the budgeted command.

Set fast default `testTimeout:2000`, `hookTimeout:5000`, `maxWorkers:4`; allow explicit 5000 ms only for batched filesystem/public API tests. Use fake time for all product deadlines and backoffs. Set Docker test/hook deadlines from file 08, not the existing 90/360-second defaults. A budget breach is reported with the ten slowest test files. Do not remove assertions, skip Docker evidence, or silently increase the budget to make it green. Cleanup has its own bounded deadline and must still run when the primary budget expires.

## 3. Test layers and seams

| Layer | Real code exercised | Replaced boundary | Appropriate assertion |
|---|---|---|---|
| U: pure contract | Zod/schema helpers, merge, scope, graph, references, env selection | None | Exact maps/edges/values/error fields |
| I: compiler integration | Public compile entrypoint, real JSON/YAML/filesystem, stage resolution through final serialization | Host port availability, image metadata only | Generated semantic Compose + graph + no forbidden I/O |
| W: workflow | Real command handlers, orchestrators, phase runners, runWithCleanup, state/teardown logic | OS process adapter, Docker inspection replies, clock | Ordered events, actual exit/cleanup handling, emitted argv/YAML |
| D: real engine | Real Builder compiler/runner and Docker Compose | No Docker calls mocked | Container status, markers, endpoints, resources removed |

Mock the narrowest adapter, never the function whose behavior is under test. An orchestrator test must not stub `runTest` to return 0 if its purpose is to prove the full standalone lifecycle. A compiler test must not stub resolveBuildStage, closure, env resolution or lifecycle lowering. Use controlled process responses only after inspecting actual emitted command/YAML.

Add internal injectable runtime dependencies (optional arguments/default production adapter, not CLI flags): `spawnProcess`, `inspectImage`, `probePort`, `clock`, and state-store filesystem root. Production default implementation remains the actual OS implementation. Keep direct public compile/CLI entrypoint tests so an unwired internal implementation cannot pass in isolation.

Tests using mock image metadata return a Docker-shaped object, not a boolean `healthy:true`. Test both image Healthcheck.Test and explicit Compose disabling it. Child-process fake must model stdout/stderr, exit status, spawn failure, stdin closure, signal, and a never-exiting child. Do not replace event-order assertions with arbitrary sleeps.

## 4. Standard test record and common assertions

Every row in files 06–08 is a required named case. A row listing multiple mutations is a parameterized family: generate one separately reported test per mutation. IDs are stable and prefixes disjoint. Test titles begin `[ID]`; parameterized titles add a readable suffix. Each record contains:

```ts
interface V3Case {
  id: string;
  title: string;
  specSections: string[];
  invariantIds: number[];
  decisionIds?: string[]; // D01 etc.; empty for purely normative assertions
  layer: 'U' | 'I' | 'W' | 'D';
  fixture: string;
  setup: string;
  action: string;
  expected: string;
  testFile: string;
}
```

Use `caseTest(record, callback)` to register and execute a real Vitest test. The registry checker fails on duplicate IDs, a record with no executable test, referenced unknown invariant, or missing required catalog ID. An assertion like `expect(cases.length).toBeGreaterThan(...)` is not feature coverage. Store run results from Vitest reporter; a skipped/failing test cannot count as passed invariant evidence.

Common assertions:

- **FAIL(path, reason)**: require ConfigError/appropriate error class, winning sourceFile, exact configPath, active stage/composition, referencedObject where applicable and stable reason fragment. Assert zero runtime spawn/build/up, zero cache/run.state writes, and no misleading successful result. Schema-only errors may precede a selected profile; assert schema path without demanding nonexistent stage metadata.
- **COMPILE(profile)**: call actual standalone/mesh compiler; inspect structured result AND YAML parsed independently with the YAML parser. Assert node set, generated service membership, env, ports and conditions relevant to the case. Use no huge snapshots as sole proof.
- **TRACE**: record `compile`, `build`, `up`, `wait`, `inspect`, `down`, `write-state`, `clear-state`, port operations and logical phase identity. Assert exact order or explicit happens-before edges and forbidden events. Do not assert unrelated log formatting.
- **CLEAN**: after completion/failure, no active owned runtime records, transient allocations or owned artifacts; on failed cleanup, recovery state remains and result fails. In W tests inspect fake engine resources plus real temporary state files; in D tests inspect real project-labelled resources.

## 5. Canonical fixtures

Create factories in `tests/v3/support/fixtures.ts`. Use `.builder/test-tmp/<worker>/<test-id>`; realpath containment must remain inside builder. Clone immutable baseline objects per test. Helpers write complete files only for requested integration fixtures. Explicitly deep-freeze inputs for pure merge tests. Resolve required fixture paths without process.cwd changes shared between concurrent tests.

### B0 — minimal standalone

```json
{
  "name": "v3-basic",
  "services": {
    "main": {
      "endpoints": {
        "http": {"port": 3100, "publicPort": "AUTO", "primary": true, "scheme": "http"}
      }
    },
    "tester": {"compose": "./e2e/compose.yml", "service": "runner", "env": {"BASE_URL": "${main.endpoints.http.public_url}"}}
  }
}
```

Provide a parseable canonical Dockerfile with dev/test/prod and inherited enabled health on dev/prod; no test-e2e alias. Pure/compile fixtures do not build it. Tester YAML contains image-backed runner with no lifecycle variables. All normal fixtures have complete schemas; mutate only the field under test so a different earlier error cannot accidentally satisfy the assertion.

### BG — graph

Start from B0. Add `db` (Compose service db, primary tcp endpoint 5432, enabled health), `migration` (endpoint-less, service migrate, no health), `mail` (primary HTTP 8025, AUTO, health), `unused` (valid declaration with a Compose path that need not exist when inactive). Main requisites: db dependency, migration prerequisite, mail requirement. Migration requisite: db dependency. No base external env references, so isolated execution is valid. Add external refs only in integrated prod/E2E cases.

Expected integrated nodes: main/db/migration/mail. Expected ordering: main→db healthy, main→migration complete, migration→db healthy. Main→mail is absent from Compose conditions. E2E runner waits on main/db/mail healthy and migration complete. Unused never becomes a container or port intent.

### BA — atomic module

BG plus ordinary `observability` module with internal Compose services `api`, `ui`, `collector`; primary endpoint api:9100, secondary ui:9200. api is representative. Collector has its own implementation env/default and optional native completion dependency. Declare consumed network, named volume, config and secret. A second instance under another mesh source reuses every local name to test namespacing.

### MM — mesh

```json
{
  "name": "v3-mesh",
  "services": {
    "tester": {"compose": "./e2e/compose.yml", "service": "global-runner"},
    "backend": {"source": "./backend", "publish": ["main.endpoints.http"]},
    "frontend": {"source": "./frontend", "extends": {"main": {"requisites": {"source.backend": false, "backend": "dependency"}, "env": {"BACKEND_URL": "${backend.source.main.endpoints.http.network_url}"}}}}
  }
}
```

backend source is BG. frontend source is B0 with local backend mock, main→local backend dependency, prod main BACKEND_URL using that local endpoint. Mesh rewrite prunes the mock and replaces env. Each source includes its own tester. Add `dev.services.inspector` and `e2e.services.audit` only in membership cases. All HTTP source mains may share port 3100 internally; public AUTO values differ.

### EP — environment precedence

Build from BG/MM as appropriate. Write a separate `LAYER_KEY` marker (`dotenv`, `source-base`, `source-prod`, `source-e2e`, `override`, `mesh-base`, `mesh-prod`, `mesh-e2e`) into each layer. Tester has separate marker domain. One case removes higher layers one at a time to prove each winning value; do not test only the highest layer. Explicit integrated references are absent from isolated baseline.

### Runtime doubles

- Port probe supplies a finite queue of available/unavailable candidates and records probes; fake filesystem cache contains controlled old entries. One actual localhost socket test verifies adapter bind behavior; no Docker required.
- Process adapter parses emitted YAML and records actual service membership. It returns scripted engine states/events, not inferred “correct” graph results.
- Clock supports timers + elapsed-time injection; a 120-second deadline case advances fake time in milliseconds of wall time.
- Metadata fixture contains image config, inherited Dockerfile health, NONE, missing health, image lookup failure.

## 6. Test implementation order

1. Add support factories/record registrar/fake OS adapters and the independent subprocess-denial guard. Write one smoke proving accidental Docker access fails in the fast suite.
2. Implement file 06 scenarios against real schemas, effective resolver and public compile entrypoints.
3. Implement file 07 scenarios; table-drive layer/property/kind permutations rather than duplicating setup.
4. Implement file 08 workflow cases using real runners and fake OS, then three engine batches.
5. Port applicable existing regressions into the same collection; remove duplicate old-runtime assertions only after replacement coverage exists.
6. Add coverage report, schema parity, examples/docs/build smoke, and time reporting. Run the full warmed command three times to record median and maximum; this calibration is a one-time acceptance activity, not repeated within each normal verification invocation.

No network downloads, Docker starts, source installs, real 120-second sleeps or recursive package-manager commands are allowed inside the fast suite. The denial guard makes unexpected child_process calls fail, with narrow opt-in only for specifically labelled CLI smoke adapters. Do not globally mock readFile or YAML parsing; integration cases must exercise real files.
