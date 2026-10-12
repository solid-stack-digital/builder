# Third V2.1.0 audit iteration: implementation and public-documentation fix plans

Audit date: 2026-10-12–13 (Asia/Manila). Audited commit: `f4098f5073e224d1e0541388f6a71bcd20614fbb`, package `2.0.3`. The working tree was clean before these audit documents were created. **The three findings in `bug-fix-plans-2` are implemented on this commit.** This directory contains only third-iteration findings. No production source or public `docs/` page was changed by this audit.

## Results and implementation order

The core V2 model and the previous ten reported fixes have regression coverage, but this pass reproduced two new implementation bugs and three public-documentation mismatches. The `docs/` pages were checked against the normative `.docs/EXECUTION_MODEL.md` and `.docs/specs_v2/*` documents, then against current compiler behavior where a page promised an observable result.

| Plan | Type / priority | Confirmed behavior | Red assertions |
|---|---|---|---:|
| [01 — Effective app env references](01-resolve-only-effective-app-env-references.md) | Code / medium | A reference in a lower app env layer is resolved even after a stage, override Compose, or mesh env value replaces that key | 5 |
| [02 — Escaping mesh example paths](02-correct-public-mesh-path-examples.md) | Docs / high | Ten public pages show `../service` mesh paths that Builder's path-safety rule rejects | 1 |
| [03 — Cyclic complete mesh example](03-remove-cycle-from-complete-mesh-example.md) | Docs / high | The “Complete example” has `frontend -> gateway -> frontend` readiness cycle | 1 |
| [04 — Export poisons runtime dotenv](04-keep-resolved-env-export-separate-from-runtime-dotenv.md) | Code and docs / high | Default resolved export writes Builder-owned keys into `.env.dev`, which the next compile rejects | 1 |
| [05 — Missing quickstart AUTO URL export](05-make-quickstart-auto-url-export-real.md) | Docs / medium | The quickstart promises a resolved host URL in exported app env without declaring the reference that would put it there | 1 |

Implement in order 01, 02, 03, 04, 05. Plans 02 and 03 both edit `docs/reference/mesh-json.md`; apply plan 02's path changes and then plan 03's edge removal. Plan 05 depends on plan 04's corrected export destination. Plans 01 and 04 touch source; plans 02, 03, and 05 change public documentation only. Prior plans remain in `bug-fix-plans-2` under their own numbering; do not append these findings there.

## Normative sources

- [Execution model](../../../EXECUTION_MODEL.md): stage runtime, E2E inheritance, service/global test sequencing.
- [V2 architecture](../../../specs_v2/SPECS_V2.md): §4 fail-fast path/cycle rules, §8–10 endpoint properties/references, §11 env precedence, §12 final effective validation, §20.3 mesh lifecycle.
- [Build JSON field reference](../../../specs_v2/BUILD_JSON_DOCS.md): app env reference rules, stage overlays, E2E inheritance.
- [Mesh JSON field reference](../../../specs_v2/MESH_JSON_DOCS.md): §4.1 service path safety, §5.3 env precedence, stage service overlays.

The `.docs` files above control feature truth. Public `docs/` examples are report subjects, not authority when they conflict.

## Exact reproduction

The complete 14-case source is [v213-audit.test.ts.txt](reproductions/v213-audit.test.ts.txt). Install it only when intentionally performing red/green implementation work:

```bash
cp -n .docs/execution_docs/02-implement_v2.1.0/bug-fix-plans-3/reproductions/v213-audit.test.ts.txt tests/conformance/v213-audit.test.ts
pnpm exec vitest run tests/conformance/v213-audit.test.ts
```

The file uses the repository's disposable `tests/conformance/fixture.ts`; its documentation tests read real Markdown files. The AUTO export case invokes local `docker compose config` through `compileApplicationEnv` but starts no containers. After the audit reproduction, the temporary `.test.ts` was removed from `tests/` so the default suite remains green. Keep the exact red source as a permanent test only after the applicable fixes are implemented.

**Observed before fixes:** the first 12 cases yielded eight specified failures and four passing controls. A separate two-case export probe yielded one specified failure and one passing control. The combined artifact therefore contains **14 cases: nine red assertions and five green controls**. All five plan-01 variants failed because a replaced lower value raised `Unknown app endpoint reference` or `Referenced endpoint does not exist`; the effective-invalid-reference control passed. Plan 02 identified ten offending docs. Plan 03 got `Lifecycle cycle detected: frontend -> gateway -> frontend`; its acyclic control passed. Plan 04 failed because re-compilation rejected the just-exported `.env.dev.EXEC_MODE`, while its full-snapshot control passed. Plan 05 found no exported URL; its explicit-reference control passed. These are behavioral assertion failures, not missing imports or fixture errors.

**Unmodified baseline after removing the red file:** `pnpm typecheck` passed; `pnpm test:conformance` passed (23 files, 566 tests); `pnpm exec vitest run` passed (67 files, 802 tests); `pnpm check:v2-no-legacy` passed. The saved reproduction also passed TypeScript typechecking when temporarily installed. No Docker container, network service, or deployment was started in this audit.

## Mandatory decision gate for every plan

1. Install the supplied regression file before editing the relevant source or docs. Run the plan-specific `-t V213-...` command. Record the commit and full output.
2. If its **red assertion already passes**, the proposed bug is not present on that implementation branch: **do not apply the fix**. Mark the plan already fixed/not applicable. Do not weaken or invert the assertion to create a failure.
3. If the failure is an import, fixture, Docker CLI availability, file-read, or parse/harness problem, repair the harness and rerun. Such a failure does not confirm the claim.
4. Proceed only when the test fails for the behavior documented in its plan and its valid control passes.
5. Apply the exact edit. Rerun the identical test, then the extra controls in that plan. Keep the regression coverage. If the identical assertion remains red, the fix is incomplete.
6. After all applicable plans, run `pnpm typecheck`, `pnpm test:conformance`, `pnpm test`, and `pnpm check:v2-no-legacy`. Review public Markdown diffs and verify code examples are valid JSON/YAML as applicable.

## Coverage and limits

This iteration inspected existing schemas and stage resolvers, service/mesh composition, endpoint reference resolution, environment precedence, mesh path validation, publication/export behavior, lifecycle graphs, CLI paths, and the public `docs/` tree. Its five reports are limited to reproduced gaps. The green baseline is evidence that existing tests pass, not a proof of every Docker runtime behavior. In particular, no live container readiness probe or production deployment was run. Do not turn an untested possibility into a numbered bug without a failing behavioral assertion.
