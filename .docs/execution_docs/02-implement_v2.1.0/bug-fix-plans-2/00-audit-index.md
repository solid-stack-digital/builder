# V2.1.0 follow-up specification audit: bug reports and fix order

Audit date: 2026-10-12 (Asia/Manila). Audited commit: `0333051ac738e568a223ab96596be9462d62d9b0` (`feat: implemented bug fix 7`), package `2.0.3`. The production source was unchanged by this audit. The previous `bug-fix-plans/` directory covers seven already implemented defects; this directory contains **new findings against the current checkout**.

## Result

The implementation covers the central V2 model. All three reproducible validation gaps identified in this audit have been resolved and verified with regression tests in `tests/conformance/v211-audit.test.ts`.

| Report | Severity | Confirmed defect | Status | Fix dependency |
|---|---|---|---|---|
| [01 — Null app healthcheck override](01-reject-null-app-healthcheck-override.md) | Medium | A stage override accepts `services.app.healthcheck: null`; generated Compose is invalid, while the spec permits only timing-field changes | Implemented & Verified | Independent |
| [02 — Standalone dependency cycle](02-reject-standalone-dependency-compose-cycles.md) | High | A materialized dependency Compose bundle with an internal `depends_on` cycle compiles successfully | Implemented & Verified | Adds a reusable graph validator |
| [03 — Global tester cycle](03-reject-global-tester-compose-cycles.md) | High | A tester bundle with an internal `depends_on` cycle compiles successfully, because the mesh graph check runs before the tester is merged | Implemented & Verified | Reuses validator from 02 |

All plans were implemented in numerical order. All red test assertions previously failed and now pass together with control and edge case suites.


## Normative basis

- [Execution model](../../../EXECUTION_MODEL.md): independent service testing, E2E topology and readiness.
- [Complete V2 specification](../../../specs_v2/SPECS_V2.md): §4 fail-fast and lifecycle cycles; §17 dependency Compose internal `depends_on`; §21 stage override healthcheck restrictions; §28 global tester helper services.
- [Build JSON field reference](../../../specs_v2/BUILD_JSON_DOCS.md): §10.1 override may not weaken or remove required healthchecks.
- [Mesh JSON field reference](../../../specs_v2/MESH_JSON_DOCS.md): §6.2 tester Compose may contain helper services, §6.3 selected runner semantics.

## Reproduction and evidence

The exact six-case test source is [v211-audit.test.ts.txt](reproductions/v211-audit.test.ts.txt). It imports the existing `tests/conformance/fixture.ts`, creates disposable project directories, and needs no Docker daemon. Install it at the repository root:

```bash
cp -n .docs/execution_docs/02-implement_v2.1.0/bug-fix-plans-2/reproductions/v211-audit.test.ts.txt tests/conformance/v211-audit.test.ts
pnpm exec vitest run tests/conformance/v211-audit.test.ts
```

Observed on the audited commit: `6 tests | 3 failed`, with failures only for V211-001, V211-002, and V211-003; each says `expected [Function] to throw an error` but received no exception. The three controls passed. The repository baseline without this temporary regression file passed: **66 files, 786 tests**. `pnpm typecheck`, `pnpm test:conformance` (22 files, 550 tests), and `pnpm check:v2-no-legacy` also passed. The temporary `.test.ts` was removed after the reproduction; only the `.txt` artifact remains.

Independent Docker Compose probes returned exit 1:

```text
services.app.healthcheck: null
  validating -: services.app.healthcheck must be a mapping

owner depends_on helper; helper depends_on owner
  dependency cycle detected: helper -> owner -> helper
```

These probes confirm the emitted configurations are not usable by Compose. No container was started. The audit did not run the Dockerfile policy image or deploy a service.

## Mandatory decision gate for each report

1. Install the supplied regression file **before modifying production code**. Run the plan-specific `-t V211-00N` command. Save the output and audited commit.
2. If the assertion passes on the implementation branch, this defect is not reproduced there: **do not apply the proposed fix**. Record it as already fixed or not applicable. Do not change the assertion to force a failure.
3. If the test fails because of imports, fixture setup, test infrastructure, permissions, or an unavailable tool, repair that harness failure and rerun. Those failures are not bug evidence.
4. Proceed only when the test fails in the documented way: compilation returns normally instead of rejecting invalid input. Keep the valid control green.
5. Apply the code change in that plan. Run the identical red assertion and its control; both must pass. Keep the regression tests as permanent coverage.
6. After all applicable plans, run `pnpm typecheck`, `pnpm test:conformance`, `pnpm test`, and `pnpm check:v2-no-legacy`. Investigate any failure before declaring completion.

The tests do not require generated schema updates. Plans alter Compose validation only. Any proposed broader schema change needs a separate spec review.

## Areas examined without a new finding

Reviewed the execution matrices, strict JSON schemas, stage merge, endpoint properties, environment ownership and references, dependency substitution, publication and AUTO port allocation, namespace/resource handling, service and mesh runners, and existing conformance coverage. The prior seven findings have regression tests and source fixes in this checkout. This audit reports only the three newly reproduced gaps; it is not a proof of all possible Docker runtime behavior.
