# Fourth V2.1.0 audit iteration — confirmed defects and implementation plans

Audited commit: `cba37da9df999fd9277b1dd6aae5c3f6117449e4` on 2026-10-13 (Asia/Manila). The checkout was clean before this audit. Plans from iterations 2 and 3 are implemented in this commit; this folder contains only new findings. The audit changed no production source or public `docs/` file.

## Findings

| Number | Area | Confirmed bug | Status | Evidence |
|---|---|---|---|---|
| [01](01-redact-explicit-mesh-test-unit-debug-output.md) | Explicit mesh `test-unit` / debug | Raw compiled YAML exposes an `API_TOKEN` value in console output despite the public CLI promise of secret redaction | Implemented & Verified | `V214-001` red; non-debug control green |
| [02](02-scope-mesh-test-unit-port-collisions-per-isolated-run.md) | Explicit mesh `test-unit` / host ports | Two sequential isolated services using the same fixed test port are rejected as a simultaneous conflict | Implemented & Verified | `V214-002` red; isolated standalone and integrated-mesh controls green |

Both bugs are implementation defects. Both have been implemented and verified with regression coverage in `tests/conformance/v214-audit.test.ts`. The public CLI reference already describes redacted debug output and isolated `test-unit` execution; no separate public documentation correction was required. The public `docs/` tree was reviewed for feature claims, with particular attention to quickstarts, stage behavior, publication, testing, CLI flags, and environment export. Existing docs corrections and fixes from iteration 3 remain present.

## Normative source and scope

- [Execution model](../../../EXECUTION_MODEL.md): isolated unit phase and sequential global service-test phase.
- [V2 specification](../../../specs_v2/SPECS_V2.md): §2.3 and §2.5 execution, §4 fail-fast contract, §26 explicit test stage, §30 conflict only among simultaneously published endpoints, §31 secrets.
- [Build JSON reference](../../../specs_v2/BUILD_JSON_DOCS.md): endpoint `publicPort` and test-stage configuration.
- [Mesh JSON reference](../../../specs_v2/MESH_JSON_DOCS.md): stage `publish`, §7.3 test, §11 fixed collision, §12 sequential test execution.
- [Public CLI reference](/home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/docs/reference/cli.md): user-facing `--debug` redaction and isolated `test-unit` claims. This is an audit subject, not a substitute for the normative files.

## Exact red reproduction

The five-case source is [v214-audit.test.ts.txt](reproductions/v214-audit.test.ts.txt). Install it at the repository root, before edits:

```bash
cp -n .docs/execution_docs/02-implement_v2.1.0/bug-fix-plans-4/reproductions/v214-audit.test.ts.txt tests/conformance/v214-audit.test.ts
pnpm exec vitest run tests/conformance/v214-audit.test.ts
```

**Observed before fixes:** 5 cases, **2 expected failures and 3 passing controls**. `V214-001` printed `API_TOKEN: SENTINEL_TOP_SECRET_214` instead of a mask. `V214-002` rejected with `PortConflictError: Host port 45214 is claimed by both alpha.app.endpoints.http and beta.app.endpoints.http`. The non-debug run printed no secret. Each service compiled alone with port 45214. The simultaneous integrated mesh correctly rejected port 45214. The red tests use a disposable fixture and dry-run runner; no Docker container starts.

**Existing green baseline after removing the red file:** `pnpm typecheck` passed; `pnpm test:conformance` passed (24 files, 588 tests); `pnpm test` passed (68 files, 824 tests); `pnpm check:v2-no-legacy` passed. The regression file is intentionally saved as `.txt` until the fixes are applied, so the default suite stays green.

## Decision gate, required for each plan

1. Install the exact reproduction source and run only the plan's `-t V214-00N` cases before changing source.
2. A proposed red assertion that **already passes** means this bug is absent on that implementation branch. Mark the plan already fixed or inapplicable; **do not apply its edit** and do not weaken the test to manufacture a failure.
3. A failed import, fixture setup, syntax error, inaccessible file, or missing tool is a harness failure. Repair that harness and rerun. Only the specified behavioral failure confirms the bug.
4. The related green control must pass. If a control fails, investigate before proceeding.
5. After a confirmed red result, apply the plan's source edit. Rerun the **same assertion**. It must turn green; retain the regression and run the listed surrounding tests.
6. After both applicable plans, run `pnpm typecheck`, `pnpm test:conformance`, `pnpm test`, and `pnpm check:v2-no-legacy`. Review the final diff for any unrelated changes.

## Audit limits

The audit inspected schema validation, stage resolution, service and mesh composition, endpoint publication, dependency readiness, tester composition, explicit test-stage execution, CLI claims, and public examples. Existing tests passing does not prove all Docker runtime behavior. These reports rely on reproducible behavioral failures; untested possibilities were not numbered as bugs.
