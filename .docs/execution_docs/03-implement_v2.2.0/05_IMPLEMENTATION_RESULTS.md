# v2.2.0 implementation results

Implementation follows C01–C10. The original plan files remain unchanged as the design record.

## Completed changes

| Plan | Implementation |
|---|---|
| C01 | Presence-based legacy-field guard in file loading and direct resolution; strict schema rejects root test; diagnostics omit rejected values |
| C02 | Mesh configuration stages narrowed to dev/prod/e2e with runtime stage validation; service test stages preserved |
| C03 | Generator and committed mesh schema updated; build schema unchanged; repeated generation produces identical artifacts |
| C04 | Removed mesh up/down test-unit dispatch and the obsolete mesh unit runner/publication validator; service commands retained |
| C05 | Removed includeTestStage and the isolated mesh preflight branch; standalone build.test remains validated |
| C06 | Cleanup uses root service paths and standalone project identities, followed by global E2E; saved-state failure recovery retained |
| C07 | Migrated obsolete regressions; added field/stage/type/CLI guard, isolation, sequential pipeline, cleanup, and publication tests |
| C08 | Official specs and execution model updated only at affected fields, stage lists and ownership rules |
| C09 | Updated public docs, CLI help, example Makefile and migration guide; repaired README links to the existing official spec files |
| C10 | Added minor changeset; package version/dependencies unchanged; build and package-content checks completed without publishing |

## Regression evidence

Before implementation, the new field/stage suite failed 17 assertions, with its build.test control passing. Six surface checks reproduced obsolete CLI, preflight, schema, example and documentation behavior. Typechecking produced four unused `@ts-expect-error` errors for legacy mesh APIs that were still accepted.

The full standalone/global pipeline test compiles real service and mesh configurations with only external Compose operations mocked. It compares both standalone phases with direct service compilation, checks root-only membership and service-owned environments/dependencies, and exercises failure and cleanup rejection at every phase boundary.

The Docker system test had an obsolete assertion that forbade all E2E output after the second service's unit failure. It now verifies that the first service's E2E completes, the second service fails, and global E2E never starts. Global tester markers and per-run service project names make those assertions unambiguous and cleanup checks cover child projects.

The broader Docker suite also reproduced four production/lifecycle failures in the shared test fixture: it required E2E-only dotenv values for every production-mode app. A focused fixture change adds that expectation only to the fixture's E2E overlay, preserving strict E2E dotenv isolation and ordinary integrated prod execution. Six regression tests cover the fixture modes and overlay preservation; the ordinary-prod assertion and missing E2E expectation reproduced failures before that correction. No additional production-code change was needed.

## Validation

| Check | Final result |
|---|---|
| `pnpm typecheck` | Passed |
| `pnpm test` | 78 files, 891 tests passed |
| `pnpm test:docker` | 8 files, 47 tests passed |
| `pnpm check:v2-no-legacy` | Passed |
| `pnpm build` | Passed, including schema generation and declarations |
| `pnpm exec tsx scripts/prepublish-check.ts` | Passed, including package-content dry run |
| Repeated `pnpm build:schemas` | Identical hashes for both generated schemas |
| Built CLI: legacy root field in dev/prod/test/test-e2e with skip-checks | All rejected with the targeted diagnostic |
| Built CLI: removed mesh unit command | Rejected with service-command migration guidance |
| Built CLI: service test-unit dry run | Passed |
| Built CLI: complete mesh test dry run | Passed; standalone unit and service E2E precede global E2E |
| Public Markdown relative links | All resolve |
| `git diff --check` | Passed |

The Docker policy suite deliberately emits failure messages for invalid Dockerfile fixtures; those negative assertions pass. The final Docker suite summary reports all 47 tests passed.

The build schema, package.json, and pnpm-lock.yaml have no diff. The runtime no longer references `runMeshTestUnit`, `validateMeshTestStage`, or `includeTestStage`. Historical planning documents are retained; active documentation describes the removed behavior only in rejection/migration guidance.

## Repository constraints

Only read-only Git commands were used (status, diff and diff checks). No staging, commits, pushes, resets, checkout operations, release versioning, or publication were performed. Existing package and lockfile versions were retained; the changeset is ready for the normal release workflow.
