# Fresh V2 specification audit results

Audit date: 2026-10-12. Normative references: `SPECS_V2.md`, `BUILD_JSON_DOCS.md`, and `MESH_JSON_DOCS.md`.

Every item below followed the test-first gate: add the regression, run the narrow test before production changes, and patch only after the predicted behavior reproduced. All ten findings reproduced and were fixed.

| ID | Result | Pre-fix evidence | Fix |
|---|---|---|---|
| B01 | CONFIRMED + FIXED | Publication test allocated service `a`'s dependency after service `b`'s app endpoint. | Port intents now follow service, app, dependency, endpoint ordering. |
| B02 | CONFIRMED + FIXED | Invalid test-stage dependency slot and provider declarations were accepted by test-unit. | Shared test-stage validation checks bindings while preserving isolated runtime references. |
| B03 | CONFIRMED + FIXED | Invalid test-stage publish target and duplicate fixed port were accepted. | Test-stage publication is resolved and allocated globally, then applied to each isolated app. Dependency publication is rejected. |
| B04 | CONFIRMED + FIXED | Absolute in-project dependency, Dockerfile, service, override, and tester paths compiled. | Builder-managed paths now require relative syntax while retaining containment checks. |
| B05 | CONFIRMED + FIXED | Docker policy rejected `HEALTHCHECK NONE` on finite test targets. | Policy evaluates the effective final healthcheck for dev/prod; finite targets may disable inherited checks. |
| B06 | CONFIRMED + FIXED | Dangling named volumes, networks, configs, secrets, build secrets, and tester secrets compiled. | Shared Compose resource-reference validation runs before namespacing and tester output. |
| B07 | CONFIRMED + FIXED | Local map/list `build.additional_contexts` paths remained relative to the source Compose file after rebasing. | Local additional contexts are rebased; remote contexts remain unchanged. |
| B08 | CONFIRMED + FIXED | Tester IPC/PID helper services were omitted, and tester `extends` compiled. | Tester closure follows IPC/PID references and rejects unsupported `extends`. |
| B09 | CONFIRMED + FIXED | Runtime port extraction returned host-IP octets, treated target-only ports as published, and missed bracketed IPv6. | Runtime and static checks share a Compose published-port parser. |
| B10 | CONFIRMED + FIXED | Docker probe could not resolve original dependency hostname `db` after namespacing. | Original service names are aliases only on networks owned by the dependency bundle. |

The narrow tests and relevant conformance suites passed after each corresponding fix. Full repository verification is recorded after it completes.

## Final verification

- `pnpm typecheck` — passed.
- `pnpm test:conformance` — passed, 487 tests.
- `pnpm test` — passed, 653 tests.
- `pnpm check:v2-no-legacy` — passed.
- `pnpm build` — passed; schemas regenerated from the generator.
- `pnpm test:docker` — passed, 42 tests, including Docker DNS and finite-target healthcheck coverage.
- `pnpm check:full` — passed, including its repeated typecheck, conformance, ordinary, guard, build, and Docker steps.
- `git diff --check` — passed.

No Git staging or commit commands were run.
