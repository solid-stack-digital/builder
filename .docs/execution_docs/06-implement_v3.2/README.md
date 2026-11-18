# V3.2.0 implementation plan: isolated infra-mode overlay (`on-inframode-isolated`)

Origin: [feature request 0001](../../../feature-requests/0001-local-sidecars-isolated-dev.md). The design was reworked from the request; this plan is the source of truth, not the request.

## How to use this plan

Execute the chapters in order. Every code change is given as an exact replacement or as complete file content. Do not redesign or rename anything. If a step's "old" text does not match the file, stop and report it; do not improvise.

| Chapter | Content |
|---|---|
| [00_MASTER_PLAN.md](00_MASTER_PLAN.md) | Scope, normative semantics (also copied into the feature spec), pinned decisions, test-ID matrix, done criteria |
| [01_SCHEMA_AND_TYPES.md](01_SCHEMA_AND_TYPES.md) | Public types, `Origin` flag, Zod schemas, JSON schema generator |
| [02_RESOLUTION_GRAPH_AND_RUNNERS.md](02_RESOLUTION_GRAPH_AND_RUNNERS.md) | `resolveBuildStage`, `compileServiceComposition`, `selectReachableGraph`, `runTestUnit` |
| [03_TESTS.md](03_TESTS.md) | Requirement catalog, fast tests `ISO01`–`ISO22`, Docker tests `ISO23`–`ISO25`, docs test, version tests |
| [04_DOCS_MIGRATION_AND_RELEASE.md](04_DOCS_MIGRATION_AND_RELEASE.md) | Feature spec file, public docs edits, the 3.1 → 3.2 migration guide, version bump, changelog |

## Verification commands (run after each chapter where stated)

```bash
pnpm build:schemas
pnpm typecheck
pnpm test:v3:fast
pnpm test:v3:prepare   # only if the Docker fixture image is missing or stale
pnpm test              # final full gate (fast + typecheck + build + legacy + Docker + all-case coverage)
```

## Dry-run verification

On 2026-11-18 this plan was applied mechanically to commit `8beacfc` (3.1.0) in a throwaway worktree, with each chapter's code blocks copied exactly as written. Results:
- `tsc --noEmit` passed, and the build passed; `dist/bin.js --version` printed `3.2.0`.
- `schemas/mesh-schema.json` was unchanged.
- Fast suite: 30 files, 435/435 tests passed, fast coverage gate passed.
- Docker suite: 5 files, 7/7 passed. ISO23–ISO25 took about 48 s together; the whole Docker suite took about 96 s.
- All-case coverage gate: 331 families, 442/442 tests passed. The legacy gate passed.

If the 180 s warm budget fails on a slower machine, chapter 04 step 4.19 says what to report.
