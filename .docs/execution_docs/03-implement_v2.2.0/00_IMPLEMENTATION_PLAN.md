# Builder v2.2.0: remove the mesh test topology

Status: implementation plan only. No implementation changes are authorized by this document's creation.

## Decision and precedence

Remove `test` from `mesh.json` completely. Its presence is an error, not a deprecated no-op. Retain `test` in `build.json`, service commands, service runtime modes, service dotenv files, and service Dockerfile targets.

The user's follow-up explicitly requires a throwing guard when a mesh JSON document contains `test`. This requirement supersedes the existing provisions retaining an explicit mesh test namespace in `.docs/specs_v2/SPECS_V2.md` §26 and `.docs/specs_v2/MESH_JSON_DOCS.md` §7.3.

Read before writing this plan, in full:

- `.docs/specs_v2/SPECS_V2.md` (1,258 lines).
- `.docs/specs_v2/BUILD_JSON_DOCS.md` (1,875 lines).
- `.docs/specs_v2/MESH_JSON_DOCS.md` (1,676 lines).
- `.docs/EXECUTION_MODEL.md` (the normative two-phase execution model).

These were all files in `.docs/specs_v2` at audit time. Code, executable tests, generated schemas, public documentation, example Make targets, and cleanup behavior were also inspected. Historical execution plans remain historical records; do not mass-edit them to erase the old architecture.

## Required final contract

| Surface | Accepted values / behavior |
|---|---|
| `build.json` overlays | `dev`, `prod`, `test`, `e2e` |
| `mesh.json` overlays | `dev`, `prod`, `e2e` |
| Service CLI execution names | `dev`, `prod`, `test`, `test-unit`, `test-e2e` |
| Mesh CLI execution names | `dev`, `prod`, `test`, `test-e2e` |
| `mesh up test` | Root service standalone test lifecycles, sequentially, then global E2E |
| `mesh up test-e2e` | Global E2E only; mesh and service structured config inherit `base -> prod -> e2e` |
| `mesh up test-unit` | Reject with service-command migration guidance |
| `mesh down test-unit` | Reject; use `service down test-unit -C <service>` for service recovery |
| Root `mesh.json.test` | Throw `ConfigError`, even when empty or inactive and even with `--skip-checks` |
| Direct mesh resolver with stage `test` | Throw a domain error; never resolve `base -> test` |

Removing `mesh up test-unit` is an implementation decision in this plan: its current purpose is specifically the removed mesh overlay tooling. Do not silently redefine it to mean independent service unit tests or alias it to the full pipeline. Independent unit execution remains `builder service up test-unit -C <service>`. If a future aggregate unit-only command is wanted, design it separately.

```text
mesh up test / root make test
  Phase 1, root mesh.services sorted by service key:
    service A: build base -> test; then build base -> prod -> e2e; teardown
    service B: build base -> test; then build base -> prod -> e2e; teardown
    ...
  Phase 2:
    mesh base -> prod -> e2e
    each app: build base -> prod -> e2e, target=prod,
              EXEC_MODE=prod, INFRA_MODE=integrated, .env.e2e
    global tester: target=test-e2e, EXEC_MODE=e2e, no INFRA_MODE,
                   root .env.e2e-tester
```

Phase 1 uses root paths and each service's own configuration. Mesh env, provider bindings, `dependsOn`, publication, and stage path substitutions must not enter either standalone phase. Mesh stage-only services are not Phase-1 members. Cleanup failure blocks the next service and global E2E. These semantics already largely work and must be preserved rather than replaced.

## Audit evidence, not hypothetical behavior

A read-only `tsx` probe against current source produced:

```json
{
  "emptyTestAccepted": true,
  "populatedTestAccepted": true,
  "resolvedTest": { "MARKER": "legacy" },
  "testIgnoredInProd": {}
}
```

The probe used `meshSchema.safeParse` on empty/populated `test`, and `resolveMeshStage` on `test` and `prod`. Thus both active legacy application and silent inactive acceptance exist today.

Baseline run:

```sh
pnpm exec vitest run tests/v2/meshSchema.test.ts tests/v2/stageResolution.test.ts tests/v2/meshServiceTestPipeline.test.ts tests/v2/meshRunners.test.ts tests/mesh-preflight-regression.test.ts tests/schema-generation.test.ts
```

Result: 6 files, 24 tests passed. These tests currently endorse some behavior being removed; a green baseline is not evidence of the new contract. No Docker runtime was started. Proposed red tests below have not been installed or run during planning.

## Implementation sequence and complete change list

Each ID is a change card with current behavior, expected behavior, rationale, a failing-before test, concrete implementation instructions, and validation in the linked document. Preservation controls are expressly marked as already passing; do not pretend they are newly reproduced failures.

| Order | ID | Change | Detailed document |
|---|---|---|---|
| 1 | C01 | Reject root `mesh.test` in runtime/schema contracts and issue targeted migration errors | [01](01_CONFIG_GUARDS_TYPES_AND_SCHEMAS.md) |
| 2 | C02 | Narrow mesh stage types and guard direct resolution; preserve build stages | [01](01_CONFIG_GUARDS_TYPES_AND_SCHEMAS.md) |
| 3 | C03 | Generate and verify the three-stage mesh JSON Schema | [01](01_CONFIG_GUARDS_TYPES_AND_SCHEMAS.md) |
| 4 | C04 | Remove mesh unit CLI execution and explicit unit topology implementation | [02](02_CLI_PREFLIGHT_AND_CLEANUP.md) |
| 5 | C05 | Remove mesh test preflight branch without weakening service test validation | [02](02_CLI_PREFLIGHT_AND_CLEANUP.md) |
| 6 | C06 | Remove cleanup's mesh test resolution and align recovery with standalone Phase 1 | [02](02_CLI_PREFLIGHT_AND_CLEANUP.md) |
| 7 | C07 | Replace obsolete tests, add rejection and independence coverage, retain lifecycle protections | [03](03_TEST_IMPLEMENTATION_AND_REGRESSION_MATRIX.md) |
| 8 | C08 | Correct normative spec stage ownership and rejection rules | [04](04_SPECS_PUBLIC_DOCS_EXAMPLES_AND_RELEASE.md) |
| 9 | C09 | Correct public docs and executable examples; provide migration instructions | [04](04_SPECS_PUBLIC_DOCS_EXAMPLES_AND_RELEASE.md) |
| 10 | C10 | Record release behavior and run final acceptance checks | [04](04_SPECS_PUBLIC_DOCS_EXAMPLES_AND_RELEASE.md) |

Implement C01–C06 together before expecting the complete test suite/typecheck to pass: old tests import the deleted runner and pass removed options. Add red tests first, observe the intended failures, then migrate obsolete tests with C07. C08–C10 finish the same release; do not publish code whose schemas/examples still advertise `mesh.test`.

## Boundaries that prevent accidental over-removal

- Keep `Environment`, `SERVICE_STAGES`, `BuildJson.test`, build schema `test`, `stageOverlayChain("test")`, `resolveBuildStage("test")`, `runTestUnit`, `.env.test`, and Docker target `test`.
- Keep `mesh up test` and `runMeshTest`; `test` is a pipeline command, not a mesh configuration stage.
- Keep Compose `healthcheck.test` everywhere. Do not grep-delete arbitrary `test` keys.
- Keep `test` in the reserved mesh service-name list. This is an existing naming restriction, not support for a root topology. Making it a valid service name would be unrelated compatibility work.
- Keep common port allocation, redaction, environment resolution, generated resource names, and service cleanup helpers used by supported paths.
- Do not automatically move old `mesh.test` values into `mesh.e2e` or `build.test`. Their intended owner must determine the migration.
- Do not automatically publish mesh endpoints during Phase 1. Standalone publication remains build-owned.
- Do not add external lint tools, test libraries, Docker images, or network lookups for this change.
- Do not edit generated `dist` by hand or bump lockfile dependency versions.

## Acceptance criteria

1. Every execution/validation/compilation entry point rejects a root `test` field before dependency loading, port allocation, Compose invocation, or run-state writes.
2. The guard detects property presence, not truthiness, and never includes potentially sensitive legacy env values in errors.
3. Mesh schemas and types contain only three overlays; generated build schema still has four.
4. No production caller resolves a mesh `test` stage, and no mesh unit runner/validator remains.
5. Canonical Phase 1 remains equivalent to each service's `make test`, and Phase 2 still inherits production structure.
6. Service unit execution remains fully available and tested.
7. Cleanup never needs a mesh test topology and retains saved-state recovery after malformed config or failed teardown.
8. Public examples/help accurately distinguish mesh pipeline commands from configuration overlays.
9. Only the requested plan directory is changed in this planning task. Code changes described here are future implementation work.
