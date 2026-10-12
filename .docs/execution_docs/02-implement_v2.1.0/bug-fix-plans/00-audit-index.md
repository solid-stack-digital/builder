# V2.1.0 specification audit and implementation gates

Audit date: 2026-10-12, Asia/Manila. Audited commit: `e125df26a7044e59c456adeac5b708a4bfed6d25`. Package version at audit: `2.0.3`. Working tree was clean before audit reproduction files were created.

## Conclusion

The code implements the central V2 schema and execution model, but it does **not fully implement the specified behavior**. Seven concrete defects were reproduced. The existing automated suite passed; new tests expose behavior it does not cover.

At audit completion, these were implementation plans and no production source had been changed. **Implementation update (2026-10-12): plans 01–04 are now implemented and verified; see their implementation records. Plans 05–07 remain unapplied.** Audit regression sources are retained as `.test.ts.txt` artifacts so intentionally failing tests do not break the current default suite. Copy them into the stated test paths before implementation.

## Numbered bug reports

| ID / plan | Priority | Confirmed behavior | Regression cases |
|---|---|---|---:|
| [01 — Teardown failures](01-teardown-failure-must-stop-test-pipeline.md) | High | Two failed `down` attempts resolve successfully; test pipelines can advance and erase recovery state | 1 |
| [02 — Compose overlay merge](02-preserve-inherited-compose-maps.md) | Medium | E2E partial healthcheck/logging overrides discard inherited map fields | 2 |
| [03 — Resource runtime names](03-namespace-owned-resource-runtime-names.md) | High | Distinct generated resource keys retain identical explicit global `name` values | 4 |
| [04 — Missing override resources](04-validate-app-override-resource-references.md) | Medium | App references to undeclared volumes/networks/configs/secrets pass compilation | 4 |
| [05 — Retained dependency reachability](05-connect-retained-endpoints-to-mesh-network.md) | High | Supported cross-service dependency references resolve to a host with no shared network | 3 |
| [06 — Optional test-stage preflight](06-scope-explicit-mesh-test-preflight.md) | High | Ordinary mesh configurations are rejected by unrelated isolated test-stage validation | 2 |
| [07 — Test-stage publication order](07-resolve-explicit-test-publication-before-env.md) | Medium | Explicit test-stage env resolves before selected app publication is applied | 1 |

Priority indicates impact, not a measured production incident rate. Implement 06 and 01 first, followed by 07, 03, 05, 02, and 04. Plans 06 and 07 share the explicit test-stage checker; implement them together after independently confirming both gates. Numbering identifies reports permanently; it does not imply dependency order. Plans 02/04 touch the service composition path; plan 03 touches resource handling used by that path. Apply sequentially and rebase edits carefully.

## Normative documents

- [Execution model](../../../EXECUTION_MODEL.md)
- [Complete architecture](../../../specs_v2/SPECS_V2.md)
- [Build fields](../../../specs_v2/BUILD_JSON_DOCS.md)
- [Mesh fields](../../../specs_v2/MESH_JSON_DOCS.md)

The reports cite document section numbers so the rationale remains findable if source lines move.

## Evidence and limits

Executed against the unmodified implementation:

```text
pnpm exec vitest run
56 test files passed; 696 tests passed; exit 0.

pnpm exec vitest run tests/conformance/v210-audit-gates.test.ts tests/v210-audit-cleanup.test.ts
2 files failed; 14 assertions failed; exit 1.

pnpm exec vitest run tests/conformance/v210-audit-preflight.test.ts
1 file failed; 2 assertions failed; exit 1.

pnpm exec vitest run tests/conformance/v210-audit-test-publication.test.ts
1 file failed; 1 assertion failed; exit 1.
```

The failures are behavioral assertion failures, not missing imports, parse errors, unavailable Docker, or fixture creation failures. See [first run output](reproductions/observed-gates.log) and [preflight output](reproductions/observed-preflight.log), and [explicit test publication output](reproductions/observed-test-publication.log). In total, 17 new regression cases failed for seven distinct bugs. The preflight tests mock only `checkInfra` to avoid external lint containers; real mesh stage resolution, publication, environment resolution, and composition execute. The cleanup test mocks Docker child processes returning failure; the real retry and teardown implementation executes. Composition tests execute real compilers with validation-mode ports.

No live Docker containers, network connectivity probes inside containers, Dockerfile policy engine, or production deployments were run. Runtime consequences of invalid generated networking/resource names follow from the emitted Compose configuration; they are not claims of a completed Docker acceptance run. The audit does not establish that every possible configuration or external Docker behavior is correct. Findings are limited to reproduced defects, rather than turning every untested area into a bug report.

## Audit coverage

| Area | Reviewed implementation / existing evidence | Audit result |
|---|---|---|
| Strict JSON schemas, removed fields, endpoint grammar and primary invariant | `buildSchema`, `meshSchema`, stage resolvers, schema/conformance tests | Implemented in inspected paths; baseline green |
| Execution matrices and E2E stage inheritance | Service/mesh compilers, templates, runners | Core target/mode/env-file selection present; overlay map defect 02 |
| Runtime env precedence, references, reserved keys | Environment layers, reference parsers, tester compiler | Core ownership and precedence present; network topology defect 05 |
| Dependency suppression, materialization, health and lifecycle | Dependency compiler, namespacing, substitution and graph functions | Core mechanisms present; physical resource names defect 03 |
| Publication, fixed collisions, AUTO allocation | Endpoint registries, publication and allocator | Existing cases green; no new allocator finding |
| App override restrictions | Override validator, merge path, resource validator | Missing resource validation 04; merge defect 02 |
| Service/global testing and teardown | Service runners, mesh pipeline, teardown | Correct nominal sequencing; failure handling defect 01 |
| Global mesh checks and explicit test-stage tooling | Checkers, up handler, explicit test-stage validator | Wrong preflight scope defect 06; explicit publication order defect 07 |
| Dockerfile contract and path boundaries | Rego policy, checker invocations, path helpers | Source reviewed; live policy execution not performed |
| Generated schemas, examples, public docs | Existing automated tests included in baseline | Baseline passed; not treated as proof of runtime conformance |

## Install exact reproductions

Run from the repository root, after checking that destination files do not contain existing work. These exact destinations were temporary during the audit and have been removed.

```bash
cp -n .docs/execution_docs/02-implement_v2.1.0/bug-fix-plans/reproductions/v210-audit-gates.test.ts.txt tests/conformance/v210-audit-gates.test.ts
cp -n .docs/execution_docs/02-implement_v2.1.0/bug-fix-plans/reproductions/v210-audit-cleanup.test.ts.txt tests/v210-audit-cleanup.test.ts
cp -n .docs/execution_docs/02-implement_v2.1.0/bug-fix-plans/reproductions/v210-audit-preflight.test.ts.txt tests/conformance/v210-audit-preflight.test.ts
cp -n .docs/execution_docs/02-implement_v2.1.0/bug-fix-plans/reproductions/v210-audit-test-publication.test.ts.txt tests/conformance/v210-audit-test-publication.test.ts
pnpm exec vitest run tests/conformance/v210-audit-gates.test.ts tests/v210-audit-cleanup.test.ts tests/conformance/v210-audit-preflight.test.ts tests/conformance/v210-audit-test-publication.test.ts
```

Do not also paste the same cases into another test file; choose the supplied files or the per-report snippets. Tests use the repository's existing `tests/conformance/fixture.ts`. That helper creates an application Dockerfile and removes temporary projects. Fixed test ports are validated structurally and never bound. The audit resources contain no real credentials.

## Mandatory decision gate for every plan

1. Install its regression test **before changing production code**.
2. Run its `-t V210-00N` command on the target branch.
3. If the test passes, the proposed defect is not reproduced on that branch: **do not apply the fix**. Mark the plan not applicable/already fixed and record the commit and output. Do not weaken the expected result to force a failure.
4. If it fails from tooling, imports, permissions, or fixture setup, repair the harness and rerun. Such failures do not confirm a bug.
5. Proceed only when the failure is the behavior documented in the report. Save the red output.
6. Apply the specified change, rerun the exact same assertion, then add/run the listed controls. Keep those tests as permanent regression coverage.
7. A green result after the source change is the expected fix confirmation. It is distinct from a green baseline, which cancels the fix.
8. Run the final checks below after the accepted plans are implemented. A failure requires investigation; do not silently revise the contract or delete coverage.

## Final implementation acceptance

```bash
pnpm typecheck
pnpm test:conformance
pnpm exec vitest run
pnpm check:v2-no-legacy
```

No schema change is expected for these seven plans. Rebuild generated schemas only if implementation introduces a justified schema edit. For Docker acceptance, use disposable projects and the existing Docker acceptance harness after compiler tests pass; never run destructive cleanup tests against a user's running project. Optional runtime checks are described in the relevant plans and were not executed in this audit.

A completed implementation should report: baseline red result per ID, source files changed, permanent regression/control cases, final check results, and any remaining Docker-only limitation.
