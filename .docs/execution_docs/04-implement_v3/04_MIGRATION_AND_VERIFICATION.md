# 04 — Repository migration, conformance coverage and completion gates

Prerequisites: [01](01_CONFIGURATION_AND_GRAPH.md), [02](02_COMPOSE_AND_ENVIRONMENT.md), [03](03_LIFECYCLES_AND_COMMANDS.md). This file specifies migration and verification of the whole Builder repository. All example work remains within `builder/examples`; do not migrate sibling projects.

## 1. Test migration policy and inventory

Keep existing useful coverage. Do not delete all V2 tests merely to make the suite pass. Use these exact dispositions:

| Existing test area | Disposition |
|---|---|
| `tests/v2/buildSchema`, `meshSchema`, `generatedSchemas`, `stageResolution`, `references`, `referenceDiagnostics` | Move meaningful cases into V3 schema/stage/reference tests, add canonical syntax assertions; replace V2 acceptance assertions with rejection |
| `tests/v2/meshSubstitution`, conformance `07-substitution` | Replace with explicit source-local edge deletion + fellow-root requisite + explicit env rewrite; assert no provider transfer remains |
| `tests/v2/dependencyCompose`, `compileServiceComposition`, conformance `04-dependencies` | Port to ordinary modules; add endpoint-less jobs, primary representative and requirement-only semantics |
| `tests/v2/meshPublication`, `meshLifecycle`, `compileMeshComposition`, `meshTester` | Port to common graph/publication/tester compiler; remove references to V2 folders/types |
| `tests/v2/serviceE2e`, `testerRuntime`, `serviceRunners`, `meshRunners`, `meshServiceTestPipeline`, `meshPhaseOneIndependence`, `meshTestCleanup` | Keep orchestration intent, use Compose testers/no mode injection and base-only Phase 1 |
| `tests/v2/meshTestRemoval*`, `meshRemovalSurface`, `meshStageTypes`, `meshRootValidation` | Preserve mesh test-stage rejection; extend rejection to public mesh test-e2e command |
| `tests/conformance/01` through `11` | Convert fixture factory and scenarios to V3; add graph/prerequisite cases rather than dropping entire suites |
| `tests/conformance/v210-*`, `v211-*`, `v213-*`, `v214-*`, `v220-*`, audit regressions | Preserve still-applicable port/resource/path/overlay/cleanup security regressions; rename assertions whose semantics changed |
| `tests/cleanup*`, `runWithCleanup`, `composeCleanupFailures`, saved/anonymous volume and path tests | Retain and extend with new memberships |
| `tests/schema-generation`, `schemas`, `templates`, `checkInfra`, `dockerfile-checker`, `cli`, `exportEnv`, `compileApplicationEnv` | Update public contract and expected paths/names; keep functional checks |
| `tests/docker-acceptance/*` | Migrate shared runtime fixture and retain all valid cleanup/env/status proofs; add V3 cases below |
| `tests/v2/examples`, `publicDocsSemantics`, `meshTestDocumentation` | Move to V3 examples/public docs tests, checking actual migrated files |

After porting a test file, move it to `tests/v3` retaining its basename; when this plan explicitly names a replacement suite, move its assertions into that suite instead. Remove the old file only after its still-applicable assertions exist in the replacement. Leave explicit legacy-invalid fixture data under `tests/fixtures/v3/invalid/legacy-*` with tests expecting rejection. Do not retain a green V2 acceptance suite importing obsolete compilers.

Record each moved/replaced test filename and destination in the implementation PR/report or a table appended to this plan during implementation. This is an audit trail, not permission to invent a second V2 runtime.

## 2. V3 fixture construction

Create `tests/fixtures/v3` and a shared `tests/v3/fixture.ts`. Temporary generated fixture projects must live in repository `.builder/test-tmp` (not system /tmp); clean each test's uniquely named subdirectory. Fixture helper constructs typed build/mesh objects and writes canonical Dockerfile plus tester Compose. Avoid typing every fixture as `any`; invalid fixtures should cast only at the explicit invalid field or write raw JSON.

Required fixture families:

| Fixture | Exact topology/features |
|---|---|
| `service-basic` | main HTTP primary, AUTO public port, Compose tester, required targets/health |
| `service-graph` | main dependency db, prerequisite migration, requirement mailpit; migration dependency db; one dormant service |
| `service-atomic` | ordinary module with primary API, secondary UI, helper and resource files; separate endpoint-less job |
| `service-stages` | prod env/override; E2E deletes one edge and adds fixture-loader prerequisite; tester env inherited prod→e2e |
| `service-isolated` | base requisite declarations but no integrated-only base env refs; isolated dev/test materialize main only |
| `mesh-rewrite` | frontend source-local backend mock pruned; frontend explicitly requires real backend; env explicitly rewritten |
| `mesh-cycle` | backend/frontend/gateway requirement cycles; no ordering cycle; only gateway and mailpit published |
| `mesh-phase-membership` | two base source roots, dev-only inspector, e2e-only audit-sink, base global tester |
| `mesh-same-names` | two roots with same source name/internal db/helper/network/volume names, independently namespaced |
| `tester-helpers` | runner chosen by service, successful finite helper, long-running helper, custom build target, no execution vars |

For isolated fixtures with integrated endpoint references, place integrated main refs in prod/E2E; dev integrated execution can use literal defaults or a dev overlay with isolated-safe values. Never make one fixture depend on the compiler ignoring active invalid refs in isolated mode. Add a dedicated negative fixture proving such surviving refs fail.

Extract the spec's exhaustive build and mesh JSON into executable test data. The build example can compile integrated dev/prod/E2E with generated module assets. Its base external references cannot pass isolated reference validation under D06; explicitly test that diagnostic rather than silently making a different execution exception. For canonical mesh example, generate source projects for backend/frontend/gateway/inspector/audit-sink and all selected local services. Ensure it proves requirement cycles, source-local pruning, publish replacement and stage-added roots.

## 3. Example build migration (all eight builds)

Apply to exactly these directories:

- `examples/backend`
- `examples/fullstack/services/backend`
- `examples/fullstack/services/filesystem`
- `examples/fullstack/services/frontend`
- `examples/fullstack/services/gateway`
- `examples/fullstack/services/mailer`
- `examples/largeProject/services/auth-api`
- `examples/largeProject/services/backend`

For each build:

1. Keep its existing project name except set largeProject source names to `largeproject-auth-api` and `largeproject-backend` to avoid misleading duplicate names in standalone logs. Preserve actual endpoint ports/schemes/publicPort capabilities.
2. Move app to services.main. Move each dependency declaration to services.<name>. Add main requisite `dependency` for every former dependency, preserving the old readiness intent explicitly. Do not infer these in runtime code.
3. Rename all builder endpoint expressions: `app.endpoints` → `main.endpoints`; `dependencies.x.endpoints` → `x.endpoints`. Preserve actual env keys consumed by source code.
4. Move every stage's root override-compose into `<stage>.services.main.override-compose`; move app env/endpoints into that same main patch; move dependency patches into stage.services entries. Compose override files change their sole runtime key from app to main.
5. Add `services.tester = {compose:'./e2e/docker-compose.yml', service:'e2e-runner', env:<old tester env with V3 refs>}`. Base tester env API_URL remains `${main.endpoints.http.public_url}`. Remove root tester.
6. Add `e2e/docker-compose.yml` with `e2e-runner` build context `..`, Dockerfile `e2e/Dockerfile`, no Builder lifecycle target and no execution vars. Use `network_mode: host` explicitly for public loopback endpoints.
7. Create `e2e/Dockerfile` as a dedicated runner image: copy the source project's current base stage setup (same Node image, WORKDIR, package-manager enablement, package files and frozen dependency install), then `COPY . .` and `CMD ["pnpm", "test:e2e"]`. Context stays project root, so existing test paths/configs remain valid. Remove the main Dockerfile's `FROM base AS test-e2e` stage entirely. Preserve main dev/test/prod and build helper stages.
8. Keep `.env.e2e` application inputs distinct from `.env.e2e-tester`. Add explicit tester dotenv examples only for real runner inputs; remove any EXEC_MODE/INFRA_MODE from tester files/code expectations. Applications continue choosing adapters through INFRA_MODE; don't branch app runtime on e2e.
9. Validate each ordinary Compose mock's representative health and module ownership rules. Add health checks where the existing example lacks one, using its actual HTTP endpoint or existing probe; don't use unconditional true. Preserve main runtime probes.
10. Put technology-specific dev mounts in the existing dev override, since generic templates no longer mount Node directories. Unit/test/prod overrides remain selected independently; E2E inherits the prod override unless its config specifies another one.
11. Update each example package README/makefile and embedded local policies. In particular `examples/backend/policy/dockerfile/dockerfile.rego` must not teach the obsolete tester-target requirement; synchronize that copy with the shipped V3 policy and add an equality assertion to the examples test so it cannot drift again.

Dependency edges after migration:

| Source | main requisites |
|---|---|
| examples/backend | filesystem: dependency |
| fullstack/backend | filesystem, mailer, firebase: dependency |
| fullstack/filesystem | firebase: dependency |
| fullstack/frontend | backend: dependency |
| fullstack/gateway | frontend, backend: dependency |
| fullstack/mailer | none |
| largeProject/auth-api | filesystem: dependency |
| largeProject/backend | filesystem, auth-api: dependency |

Do not introduce global mesh provider behavior into these standalone sources. Their local mocks remain independently runnable and are explicitly pruned only by mesh extends.

## 4. Example mesh migration

### examples/fullstack/mesh.json

Keep name fullstack and five source roots. Move global tester under services.tester and retain compose/service paths. Convert each path to source, each publish selector to `main.endpoints.http`, and tester refs to `<root>.source.main.endpoints.http.public_url`.

Apply these exact source rewrites:

| Mesh root | extends.main.requisites | extends.main.env |
|---|---|---|
| filesystem | no extra rewrite; its local firebase remains reachable | preserve any existing source env |
| mailer | no extra rewrite | preserve any existing source env |
| backend | `source.filesystem:false`, `source.mailer:false`, `filesystem:'dependency'`, `mailer:'dependency'` | FILESYSTEM_URL `${filesystem.source.main.endpoints.http.network_url}`, MAILER_URL `${mailer.source.main.endpoints.http.network_url}` |
| frontend | `source.backend:false`, `backend:'dependency'` | BACKEND_URL `${backend.source.main.endpoints.http.network_url}` |
| gateway | `source.frontend:false`, `source.backend:false`, `frontend:'dependency'`, `backend:'dependency'` | FRONTEND_URL `${frontend.source.main.endpoints.http.network_url}`, BACKEND_URL `${backend.source.main.endpoints.http.network_url}` |

Retain the current fullstack publication of all five mains because its existing global suite addresses them individually. Add the private-gateway-only publication scenario to a separate fixture/recipe, not by breaking current example tests. Backend and filesystem's separate firebase implementations remain distinct source-local modules.

### examples/largeProject/mesh.json

Add `name:'largeproject'`. Move tester under services.tester. Change source paths and publish selector syntax. Backend extends.main removes `source.auth-api`, adds `auth-api:'dependency'`, and sets AUTH_API_URL to `${auth-api.source.main.endpoints.http.network_url}`. Keep backend local filesystem reachable. Tester BACKEND_URL becomes `${backend.source.main.endpoints.http.public_url}`. Auth-api is private unless explicitly published by its existing scenario.

### Global tester assets and makefiles

For both `examples/fullstack/e2e` and `examples/largeProject/e2e`, preserve dedicated tester Dockerfile build instructions and actual pnpm test command. Their existing `test` build stage may remain an implementation target explicitly selected in Compose or the final stage; Builder must not overwrite it with test-e2e. Add explicit host network to selected global-e2e runner. Remove stale hardcoded Compose-DNS endpoint defaults that conflict with public loopback testing, leaving Builder env refs authoritative.

Remove `mesh up test-e2e` targets from mesh makefiles (observed in `examples/fullstack/makefile`); `test` is the complete workflow. Standalone makefile convenience targets may remain. Update examples' package dependency versions only where they directly refer to Builder 2.x; keep local link dependencies intact. Do not install or alter sibling linked packages.

## 5. Public documentation migration

Rewrite current docs, preserving historical migration pages with explicit version labels. Required edits by area:

| Files | Required content |
|---|---|
| `README.md`, `docs/README.md`, `docs/glossary.md` | V3 service graph mental model, main/tester/ordinary roles, navigation |
| `docs/reference/build-json.md`, `mesh-json.md`, `json-schemas.md`, `identifier-rules.md` | Exact strict field tables and reserved names, schema URIs, stage additions/immutability |
| `docs/reference/stage-matrix.md`, `dockerfile-contract.md`, `cli.md` | Three targets, no tester modes, finite workflows and mesh command removal |
| `docs/reference/environment-precedence.md`, `override-compose-contract.md` | All seven main/ordinary/tester precedence cases, single effective override, protected fields |
| `docs/reference/endpoint-properties.md`, `dependency-compose-contract.md` | Endpoint-less modules, representative, eight endpoint properties, ownership/health requirements |
| `docs/concepts/service-and-mesh-model.md`, `local-dependencies.md`, `dependency-substitution.md` | Replace provider model with source/extends and explicit edge pruning; explain references don't create edges |
| `docs/concepts/stages.md`, `endpoint-references.md`, `lifecycle-and-readiness.md`, `testing-model.md`, `environment.md`, `publication-and-ports.md` | Merge-first, closure permission, requirement cycles versus ordering cycles, prerequisites, full tester barrier, publication |
| `docs/guides/*` | Convert all build/mesh/code snippets and commands; no outdated live tutorial |
| `docs/recipes/*` | Explicit source rewrites, nested publication, stage-only services, module lifecycle, private mesh gateway |
| `docs/getting-started/*` | Minimal complete V3 build and mesh with Compose testers and three-target Dockerfile |
| `docs/troubleshooting/*` | Missing edges, pruned refs, no scheme/publication, job failure, health/barrier, cleanup recovery |
| `.docs/EXECUTION_MODEL.md` | Rewrite obsolete tester rows/provider paragraph; preserve applicable two-phase workflow and dotenv separation |
| Example READMEs | Actual migrated commands/config paths, no stale test-e2e-target policy |

Keep existing filenames such as dependency-substitution.md as rewritten migration explanations so links do not break; titles/content use V3 and show explicit replacements. Add `docs/migration/v2.2-to-v3.0.md` with before/after complete build, source rewrite, tester extraction and semantic changes. Explain publish arrays now replace, dependency membership is no longer automatic, endpoint-less jobs are active when reachable, and no automatic provider-to-healthy transfer exists.

Historical `.docs/specs_v2`, previous execution plans and migration/v1-to-v2 or v2.1-to-v2.2 pages remain historical; do not mechanically change them. Do not modify the canonical v3 specification to fit implementation behavior. Document interpretation decisions (especially isolated refs, required tester and network defaults) in current guides and tests.

## 6. Automated conformance matrix

Create `tests/conformance/v3-requirements.test.ts` with table-driven assertions and a companion exported case catalog in `tests/v3/requirements.ts`. Each case has id, spec section(s), setup, compile/run action and concrete assertion. Link the case IDs to the following coverage. Existing migrated tests may own assertions; the catalog records their test file rather than duplicating every test.

| Case IDs | Required positive and negative assertions |
|---|---|
| S01–S08 | Required name/main/tester, mesh source count; strict unknown/legacy fields; string env; reserved-kind dispatch; valid ports/scheme; base false forbidden; no mesh test |
| M01–M08 | Deep object merge; scalar/array replacement; E2E prod inheritance; no env.prod; immutable compose/source; complete new declarations; source-stage-before-mesh order; extends existing only |
| G01–G10 | All three requisite kinds; false removal; root selection; dormant local pruning; stage-only mesh root; cycles allowed/forbidden correctly; global classification conflict; isolated main only; endpoint-less active; tester excluded |
| R01–R08 | Self/direct/transitive visibility; unrelated root denied; lexical provenance; shadowed invalid ignored; pruned active ref rejected; explicit endpoints grammar; all properties and scheme; tester full active scope |
| P01–P06 | Standalone selected ports; mesh private default; selector grammar/capability/reachability; replacement publish; fixed conflicts; AUTO stable/noncolliding |
| C01–C08 | Atomic helpers; representative selection; endpoint owner existence; dependency and E2E health; jobs without health; internal conditions preserved; ownership restrictions; deterministic names/resources |
| E01–E08 | Main precedence standalone/mesh normal/E2E; ordinary normal/E2E module-wide; tester standalone/mesh dotenv isolation; no execution variables outside main; authoritative PORT |
| T01–T08 | Main targets/modes; unit failure stops; unit cleanup before E2E; full barrier; selected runner status; helper exit ignored; job failure blocks; graph readiness failure cleanup |
| W01–W06 | Base-only sequential source tests; no mesh overrides in Phase 1; strict teardown; fresh global state; E2E-added roots Phase 2; public mesh E2E command rejected |
| X01–X05 | Main override fields/resources; actual Compose path/env roundtrip; export picks main; check/dry-run no writes; down recovers after config changes |

Add one test that validates catalog coverage for every §83 rejection and all 61 final invariant numbers. The catalog must map to real named tests and include an expected behavior assertion; a list of section strings alone is not coverage. Test spec examples §§85–86 and invalid §§87–94. Include main/ordinary/tester examples that prove no hidden V2 injection survives.

## 7. Docker acceptance implementation

Update `tests/docker-acceptance/runtimeFixture.ts` and add `v3-graph-runtime.test.ts`, `v3-tester-runtime.test.ts`, `v3-mesh-workflow.test.ts`. Use existing supported lightweight fixture images, explicit short health intervals/retries and temporary projects within builder. Run serially using current Docker Vitest configuration. Never use production credentials or sibling source trees.

Required observable cases:

1. Healthy db + one-shot migration + main: main writes a marker only after migration marker exists; migration waits for db health. Assert exact execution env and all container exit codes.
2. Migration exit 9: main/tester markers absent, workflow fails, all test-owned containers/networks/volumes removed.
3. Requirement-only sibling slow health: ordinary main need not wait during dev/prod; E2E tester must wait for that sibling as well as main. Assert timestamp/marker ordering, not sleep-based guessed completion.
4. Requirement-only cycle between two mains compiles/starts; dependency/prerequisite ordering cycle fails before any Docker container creation.
5. Endpoint-less prerequisite executes even without endpoints; dormant module never creates a container.
6. Atomic module with two endpoint owners and helper uses one representative; env applied to all; primary/nonprimary endpoint requests reach correct containers; internal completion condition remains functional.
7. Tester runner uses an explicitly named custom build target or image; runner sees neither EXEC_MODE nor INFRA_MODE; helper successful exit does not terminate suite; selected runner exit 7 returns 7.
8. Tester starts only after all active long-running representatives healthy, all jobs successful and main healthy; unhealthy main always blocks even if no tester URL references it.
9. Mesh source-local mock pruned and real source main reached; cross-source nested endpoint DNS works; duplicate Compose names/resources remain distinct.
10. Public endpoints work via selected loopback ports; private source endpoint has no host binding; fixed conflict detected; two simultaneous AUTO publications differ.
11. Phase 1 source order and strict cleanup: reuse a fixed port between sequential sources and prove Phase 2 can reuse it; create test data in a volume and prove fresh Phase 2 has none. Stage-only E2E source runs only Phase 2.
12. Fail a first source unit, service E2E, then cleanup (separate cases); assert subsequent source/global markers absent. Interrupt a running E2E and verify teardown and status.
13. Dotenv/env literal roundtrip with dollars, quotes, backslashes/newlines; prove E2E app uses env.e2e, tester env.e2e-tester, and structured prod inheritance remains.
14. `down` from saved state after config edit/invalid config removes correct project without compiling a new graph. Strict cleanup failure retains recovery state.
15. Non-Node main Dockerfile with dev/test/prod, inherited health/ENTRYPOINT, no COPY --from passes; missing target or disabled effective health fails before application startup.

Always inspect cleanup by project labels/recorded resource IDs after each test. Restore only resources created by that test. An unavailable Docker daemon is a reported unexecuted acceptance gate, never a passing skip disguised as verification.

## 8. Scripts, package metadata and CI

Edit `scripts/generate-schemas.ts` as file 01 specifies. Replace `scripts/check-no-v1-config-code.ts` with `scripts/check-no-v2-config-code.ts` and package script `check:v3-no-legacy`. Do not ban the bare words app/dependencies/test-e2e globally: they can be ordinary service identifiers, package dependency metadata, migration examples or retained standalone command names.

The new gate checks actual removed model surfaces: imports from core/mesh/v2; exported AppConfig/DependencyConfig/provider-binding model; raw config `.app`, `.dependencies`, `.path` in Builder config handling; tester EXEC_MODE=e2e injection; testerTarget/test-e2e template build; V2 schema definition names; mesh public test-e2e dispatch. Permit explicit negative fixtures and historical docs. Native Compose depends_on and service_started are valid, so remove the old gate's global service_started prohibition.

Set package version to 3.0.0 using direct file edit (not pnpm version, which may mutate Git). `src/version.ts` must derive/report it consistently. Update root lockfile package metadata only if required; do not upgrade dependencies incidentally. Keep files whitelist dist/templates/schemas. Update schema/template/package smoke assertions for V3.

Keep these scripts with exact intent:

```text
build:schemas          tsx scripts/generate-schemas.ts
build                  pnpm build:schemas && tsx scripts/build.ts
test                   vitest run
typecheck              tsc --noEmit
test:conformance       vitest run tests/conformance
test:docker            vitest run --config vitest.docker.config.ts
check:v3-no-legacy     tsx scripts/check-no-v2-config-code.ts
check                  pnpm typecheck && pnpm test:conformance
check:full             pnpm check && pnpm test && pnpm check:v3-no-legacy && pnpm build && pnpm test:docker
```

Update prepublishOnly's legacy-gate name, but do not invoke publication. Local validation can run `pnpm exec tsx scripts/prepublish-check.ts` after build; inspect its package file-list command and keep output artifacts within builder. Do not execute Makefile publish/patch targets or `.github/workflows/publish.yml`.

Update `.github/workflows/ci.yml` to remove Node 18 (outside the existing package engines range), retain Node 20 and Node 22 build/typecheck coverage, and use Node 22 for the full suite with the pinned package manager. Keep the existing package engine declaration; this V3 model migration does not authorize an unrelated runtime-support change. Toolchain incompatibility is a failing verification gate to report and fix within the declared support range, not a reason to silently drop the job. Add mandatory legacy/schema checks and a serial Docker acceptance job on Ubuntu. CI configuration changes are local only; do not push/trigger workflows.

## 9. Ordered verification commands and acceptance evidence

Run from builder root. Put any tool caches/temp outputs created by this work within `.builder` where configurable. Do not run install commands that traverse linked sibling workspaces. If dependencies already exist, use them; if missing, install only this package with its pinned manager and report any unavailable prerequisites.

1. Run targeted tests after each plan section (`pnpm exec vitest run tests/v3/<suite>.test.ts`).
2. `pnpm typecheck`.
3. `pnpm test:conformance`.
4. `pnpm test` (all non-Docker tests, including migrated regressions).
5. `pnpm check:v3-no-legacy`.
6. `pnpm build` and schema-generation consistency test; compare generated schema output with a second in-memory generation, not a Git reset/regeneration trick.
7. CLI help and schema/library smoke via built dist; version must report 3.0.0 and public schema rejects V2 samples.
8. `pnpm test:docker` including the fifteen observable scenarios above.
9. Compile/check all eight example builds and both meshes across applicable profiles; run the small backend's complete standalone test and both meshes' complete test pipeline where Docker dependencies are available. Do not substitute mesh-only E2E for the required full workflow. Any unavailable example dependency is listed explicitly as incomplete verification.
10. `pnpm exec tsx scripts/prepublish-check.ts` for local package contents only; never pnpm publish.
11. `git diff --check`, `git status --short`, and read-only `git diff --stat` to confirm scope and whitespace. Untracked file contents need separate review because diff --check does not inspect them.

Do not repeatedly run the entire suite after documentation-only adjustments once sufficient verification exists; rerun the affected docs/schema tests. On failures, fix root cause and rerun the affected suite before the final gate.

Completion report must state implemented model changes, migrated examples/docs, exact executed test commands/results, any unexecuted Docker/example gates, and that no publishing/Git mutation occurred. Do not report V3 complete while required tests are knowingly failing. The user's permission restrictions remain in force throughout implementation.

## 10. Exact final-invariant traceability

Use this table when constructing the conformance catalog. Each row must resolve to an executed test name; the suite is the owner, and the assertion is mandatory. This table covers the specification's final 61 invariants, independently of chapter numbering.

| Invariant | Suite / required assertion |
|---:|---|
| 1 | schema: runtime declarations accepted only below services |
| 2 | schema: main/tester special fields enforced by key |
| 3 | graph: integrated standalone root exactly main |
| 4 | environment: no ordinary/tester EXEC_MODE or INFRA_MODE injection |
| 5 | executionProfiles: execution mode union/results exactly dev/test/prod |
| 6 | checkers: dev/test/prod required, test-e2e unnecessary |
| 7 | stages + executionProfiles: E2E overlays prod and runs prod |
| 8 | testerCompilation: Compose tester included only for E2E |
| 9 | schema: tester compose/service required, env optional |
| 10 | composeLifecycle: complete ordinary module included atomically |
| 11 | graph + composition: endpoint-less ordinary node materializes |
| 12 | schema: endpoint-less node without top-level service fails |
| 13 | composition: primary endpoint owner determines representative |
| 14 | schema/stages: zero/multiple primary fails on nonempty effective collection |
| 15 | composeLifecycle: requirement materializes without emitted condition |
| 16 | composeLifecycle: dependency emits service_healthy |
| 17 | composeLifecycle: prerequisite emits service_completed_successfully |
| 18 | stages/meshScopes: false removes canonical inherited edge |
| 19 | graph: requirement-only cycle terminates traversal and passes |
| 20 | graph: mixed dependency/prerequisite cycle fails |
| 21 | graph: conflicting classifications fail across consumers/sources |
| 22 | graph: isolated graph has no external materialized nodes |
| 23 | graph: integrated standalone transitive closure starts at main |
| 24 | graph: all effective non-tester mesh roots included without inbound edges |
| 25 | meshScopes: fellow root requisite includes its main and subtree |
| 26 | schema/examples: source accepted, legacy path rejected |
| 27 | schema/meshScopes: imported overrides accepted under extends only |
| 28 | meshScopes: unknown extends target fails, source-stage-added target succeeds |
| 29 | stages: changed compose/source fails, repeated identical value passes |
| 30 | schema: build dev/prod/test/e2e accepted, other stages rejected |
| 31 | schema: mesh dev/prod/e2e accepted, test rejected |
| 32 | stages: prod structured settings survive into E2E |
| 33 | stages: nested object sibling fields retained |
| 34 | stages: scalar override replaces inherited scalar |
| 35 | stages/publication: publish array replaces, empty array clears |
| 36 | graph: local stage addition dormant until requisite added |
| 37 | graph/meshWorkflow: top-level stage source becomes active-stage root |
| 38 | references: endpoint ref cannot materialize an otherwise dormant target |
| 39 | references: self ref succeeds without self edge |
| 40 | references: unrelated active mesh root still inaccessible without closure |
| 41 | references/environment: shadowed invalid lower-precedence refs never parsed |
| 42 | references: shorthand omitting endpoints rejected |
| 43 | references: cross-source nested canonical syntax succeeds |
| 44 | publication: source-relative selector accepted, source-prefixed selector rejected |
| 45 | publication: source publicPort alone produces no mesh host binding |
| 46 | publication: unreachable/missing-publicPort selection rejected |
| 47 | publication: selector does not alter graph closure |
| 48 | environment: profile-specific dotenv and independent tester dotenv verified |
| 49 | environment: ordinary containers never inherit main dotenv automatically |
| 50 | environment: main authoritative variables cannot be overridden |
| 51 | checkers/runtime: missing/disabled dev/prod main health rejected |
| 52 | composition/runtime: dependency representative health required |
| 53 | runtime: prerequisite exit 9 blocks consumer/tester and fails |
| 54 | testerCompilation/runtime: barrier includes requirement-only nodes and jobs |
| 55 | runtime: main unhealthy blocks tester regardless of refs |
| 56 | meshWorkflow: base sources sequential, tester/stage-only sources excluded Phase 1 |
| 57 | meshWorkflow: fresh global prod-shaped E2E follows successful Phase 1 |
| 58 | schema/cli: mesh test field and public mesh E2E lifecycle rejected |
| 59 | names/resources regression: identical local names produce distinct deterministic identities |
| 60 | main override: build.args honored without generic config build-args field |
| 61 | all negative compile cases: fail before startup, selected final effective values determine validation |

## 11. Diagnostic acceptance contract

Reuse ConfigError/PortConflictError rather than adding a parallel error framework. Tests assert structured fields and stable identifying phrases, not an entire colored CLI string. Every semantic diagnostic includes sourceFile, configPath, active stage and composition. Include the winning leaf's origin for env errors and both origins for conflicts.

| Failure | Required reason fragment / referenced object |
|---|---|
| Unknown legacy field | `Unknown V3 field` plus offending JSON path; suggest its V3 replacement when one exists |
| Changed compose/source | `immutable` plus prior declaration path and attempted replacement path |
| Unknown extends service | `extends target does not exist` plus source directory/service |
| Invalid requisite | `Unknown requisite target` or `tester cannot be a requisite target` |
| Reference not in closure | `outside effective requisite closure` plus consumer and target |
| Pruned surviving reference | Same closure error with removed edge origin when available |
| Public reference private | `endpoint is not published` plus standalone capability or mesh publish selector |
| URL without scheme | `requires scheme` plus endpoint path |
| Missing representative | `endpoint-less service requires service` or `lifecycle representative does not exist` |
| Conflicting ordering class | `both dependency and prerequisite` plus both consumer-edge origins |
| Ordering cycle | `ordering cycle` plus ordered node/edge-kind cycle |
| Invalid health | `requires a valid healthcheck` plus representative and reason it is gated |
| Port collision | PortConflictError with port and both canonical endpoints, or host occupancy |
| Prerequisite runtime failure | `prerequisite failed` plus logical node and actual exit status |
| Startup deadline | `readiness deadline exceeded` plus pending node display names/states |
| Cleanup failure | Identify failed resource operation; preserve primary test failure and recovery state |

Do not print entire env maps or credentials in these errors. Existing secret redaction remains applied to debug YAML and subprocess failure context.
