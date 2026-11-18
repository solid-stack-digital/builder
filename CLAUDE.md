# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

`@solid-stack/builder` (V3.1.0) is a TypeScript ESM CLI (`builder` / `solid-builder`) that compiles a service's `build.json` or a system's `mesh.json` into Docker Compose and drives the `dev` / `prod` / `test` workflows. Node ≥ 20, pnpm 11. Runtime commands need Docker Engine + Compose.

## Commands

```bash
pnpm install
pnpm build                 # generate schemas/*.json from Zod, then tsup bundle + tsc declarations into dist/
pnpm typecheck             # tsc --noEmit
pnpm builder <args>        # run the CLI from source via tsx (e.g. pnpm builder service up dev)
node dist/bin.js --version # run the built CLI

pnpm test:v3:fast          # non-Docker suite + fast coverage gate (what to run while iterating)
pnpm test                  # full V3 verification: fast tests, typecheck, build, built CLI/API smoke,
                           # legacy gate, Docker batches, all-case coverage gate (warm budget: 180 s)
pnpm test:v3:prepare       # build the local Docker fixture image; rerun when tests/docker-acceptance/v3-runtime changes
pnpm test:v3:docker        # Docker tests only (tests/v3/docker, serial)
pnpm check:v3-no-legacy    # fail if removed V2 model names reappear in src/ or templates/docker

# single file / single test (fast suite config includes the no-external-process setup)
pnpm exec vitest run --config vitest.v3.config.ts tests/v3/buildArgs.test.ts
pnpm exec vitest run --config vitest.v3.config.ts -t "BAR12"
```

CI (`.github/workflows/ci.yml`) runs typecheck, build and the legacy gate on Node 20/22, then `test:v3:prepare` + `test:v3`.

## Testing conventions

- Active suites are defined by `vitest.v3.config.ts` (`tests/v3/**` + `tests/conformance/v3-*.test.ts`) and `vitest.v3-docker.config.ts` (`tests/v3/docker/**`). `tests/v2/`, most of `tests/conformance/`, `tests/fixtures/v2/` and the root `vitest.config.ts` / `vitest.docker.config.ts` are legacy and not part of `pnpm test`.
- The fast suite forbids spawning `docker`, `curl`, `wget`, `npm`, `pnpm` (`tests/v3/support/noExternal.setup.ts`). Fast tests exercise the compilers directly (`compileServiceComposition`, `compileMeshComposition`, `resolveBuildStage`, schemas) with `validationMode: true`, using helpers in `tests/v3/support/fixtures.ts` (`basicBuild`, `writeBasic`, `fixtureDir`).
- Test names carry requirement IDs like `[BAR01]`. `scripts/check-v3-coverage.ts` reads the vitest JSON report and validates it against the catalog in `tests/v3/requirementsCatalog.ts`, which is parsed from the case tables in `.docs/execution_docs/04-implement_v3/06–08_*.md` (plus IDs hard-coded there). Adding, renaming or dropping an ID requires keeping the catalog and the plan tables in sync, or the coverage gate fails.
- `tests/v3/documentation.test.ts` checks the public docs: local links/anchors resolve and JSON code blocks parse and validate. The page inventory is `tests/v3/support/docsManifest.ts`, so new docs pages must be registered there. Schema tests load the checked-in `schemas/*.json`, so rerun `pnpm build:schemas` after changing the Zod schemas.

## Architecture

Pipeline: **config → stage resolution → graph → Compose compilation → runner**.

- **CLI** (`src/cli.ts`, `src/commands/<group>/commands/<verb>/{command,handler}.ts`): commander wiring for `service up|down|export`, `mesh up|down|check`, `check`, `prune`. Handlers are thin and delegate to `src/core`.
- **Schemas** (`src/core/buildSchema.ts`, `src/core/mesh/meshSchema.ts`): Zod is the source of truth. `scripts/generate-schemas.ts` emits `schemas/build-schema.json` and `schemas/mesh-schema.json` (definition names `BuildJsonV3` / `MeshJsonV3`). Public types are in `src/types/index.ts`.
- **Config resolution** (`src/core/config/`): `resolveBuildStage` merges base config with stage overlays (`base → dev|prod|test`; `e2e` is `base → prod → e2e`) and records per-key origins for diagnostics. `resolveMeshStage` does the same for meshes. `serviceGraph` / `lifecycleGraph` build the requisite graph (which modules run and how they wait). `references.ts` resolves `${node.source.main.endpoints.x.prop}` references. `publication.ts` / `hostPorts.ts` handle `publicPort` (including `AUTO`).
- **Mesh** (`src/core/mesh/`): `loadMeshSources` loads each source's `build.json`, `applyMeshExtends` applies `extends` overlays such as requisite rewrites (`"source.backend": false, "backend": "dependency"`), and `compileMeshComposition` then feeds the same graph compiler.
- **Composition** (`src/core/composition/`): `compileServiceComposition` and `compileMeshComposition` both converge on `compileGraphComposition`, which namespaces dependency Compose files, merges `override-compose`, wires networks, healthchecks, `depends_on`, environment and build args, and validates the materialized Compose (cycles, resource references, build inputs). Build-arg precedence is: standalone `base < stage < override-compose < Builder`; mesh `source base < source stage < source override < mesh base < mesh stage < Builder`.
- **Runners** (`src/core/runners/`, `src/core/mesh/runners/`): workflow execution over `runCompose` / `teardownCompose` / `runWithCleanup`. `service up test` = isolated `test-unit` then `test-e2e` (prod main with the full graph; the tester's selected service decides the result). `mesh up test` tests each source sequentially, then runs a fresh global E2E. The README has the stage → Dockerfile target / execution mode matrix. User Dockerfiles must provide `dev`, `test` and `prod` targets.
- `templates/docker/*.yml` are base Compose templates that ship in the package and are copied into `dist/templates` at build.
- `src/index.ts` is the public library API. `tests/v3/publicApiMatrix.test.ts` guards it.

## Docs layout

- `docs/` holds the public user docs (reference, concepts, guides, migration). Behavior changes usually need matching doc updates, and these docs are tested.
- `.docs/` holds internal, normative material for developers and agents. The current specs are `.docs/specs_v3/spec_v3.0.0.md` and `feature_spec_v3.1.0.md`, plus `.docs/EXECUTION_MODEL.md`. `.docs/execution_docs/NN-implement_*` holds per-release implementation plans and bug-fix audits; the latest is `05-implement_v3.1` (buildArgs). `specs_v0.9`/`specs_v2` are historical, even though `.docs/README.md` still points at `specs_v2`.
- Release notes use Changesets (`.changeset/`) and `CHANGELOG.md`.
