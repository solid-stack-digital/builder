# 09 — Public documentation refresh and v2.2.0 → v3 migration guide

## 1. Deliverables, authority and boundaries

Update the repository-root **`docs/` directory**, which contains the public user documentation. This is distinct from internal `.docs/`. Also update root `README.md` navigation and introductory examples, the V3 entry in `CHANGELOG.md`, and example README links needed to keep the public journey consistent.

Create **`docs/migration/v2.2-to-v3.0.md`** as the canonical migration guide from the current package version, **2.2.0**, to **3.0.0**. Use this exact filename everywhere. Use one migration page; do not create a second competing guide under another version spelling.

This file expands file 04 §5 into an executable documentation work plan. Read [00](00_IMPLEMENTATION_CONTRACT.md) for pinned interpretations, [01](01_CONFIGURATION_AND_GRAPH.md)–[03](03_LIFECYCLES_AND_COMMANDS.md) for implemented behavior, and [05](05_TEST_STRATEGY_AND_FIXTURES.md)–[08](08_TEST_EXECUTION_AND_ACCEPTANCE.md) for verification. The canonical behavioral authority remains [spec_v3.0.0.md](../../specs_v3/spec_v3.0.0.md).

The task in this plan is local authoring and validation. Do not publish the package, push Git changes, deploy a documentation site, or edit any sibling repository. Installation commands shown in the future guide are instructions for its readers; do not execute them to perform this documentation task. This plan does not assert that V3 is already publicly released.

Implement the documentation after the corresponding V3 behavior exists, and finish it before calling the migration complete. A documentation discrepancy is fixed against the specification and implemented contract; never rewrite the canonical specification to match a bug.

## 2. Observed documentation debt

The current `docs/README.md` identifies itself as Builder V2. Public pages and root README teach the following superseded behaviors:

- Application configuration under `app` and dependency declarations under root `dependencies`.
- Mesh `path`, provider substitution maps, direct service env, `dependsOn`, and a root tester.
- Endpoint-less dependency modules being inert.
- Automatic provider readiness and implicit inclusion of local dependencies.
- Stable-union merging of publish/ordering arrays.
- A required main Dockerfile `test-e2e` target and tester `EXEC_MODE=e2e`.
- Tester references restricted to public properties as a validation rule.
- Override files targeting `services.app` and selected by root stage `override-compose`.
- Direct public `builder mesh up test-e2e` execution.
- Optional project name and optional tester in public schema tables.

Do not implement this refresh as a global string replacement. Each obsolete statement changes either graph semantics, env precedence, lifecycle behavior, or ownership. Rewrite the explanations and their examples together.

## 3. Documentation conventions and shared example contract

### Reader-facing conventions

1. Describe the product as Builder V3 / `@solid-stack/builder` 3.0.0. Use `main`, `tester`, ordinary service/module, requisite, source, extends and publish consistently.
2. Explain `requirement`, `dependency` and `prerequisite` with their actual materialization/order behavior. Avoid using “dependency” generically where it could be mistaken for the specific edge kind.
3. Use actual CLI syntax (`builder service up ...`, `builder mesh up ...`), not semantic shorthand from the specification as if it were an implemented command.
4. Distinguish configuration stage, main Dockerfile target, application execution mode, and workflow phase. Never use them interchangeably.
5. Identify a JSON block as either **complete file**, **overlay fragment**, **invalid example**, or **historical V2 example**. A complete file must include required name/main/tester/source declarations and supporting files.
6. Place a path label above each file snippet. An overlay fragment states its insertion path and links to a complete example. Do not leave readers to infer whether a snippet replaces the whole file.
7. Keep implementation details such as internal NodeId tuples, compiler filenames, test doubles, cache record internals and allocator algorithms out of normal product tutorials. Explain observable behavior and supported recovery instead.
8. Preserve existing documentation filenames and inbound links. Rewrite pages whose names mention dependencies/providers; change their titles/content to explain V3 equivalents. Do not mass-rename paths for terminology alone.
9. Treat `publicPort: 'AUTO'` as publication capability, not a guessed fixed URL. Use public_url refs for runnable tester examples. Explain that mesh publication requires an explicit selector.
10. Public docs describe actual capabilities, not planned ones. Do not promise a published 3.0.0 artifact or new runtime/Compose minimum until the package/support matrix verifies it.

### Shared complete examples

Use the migrated repository examples from file 04 as the source of runnable examples. Add small documentation fixtures under `tests/fixtures/v3/docs` for snippets not already represented there. Avoid adding another full demonstration application just for docs.

Maintain these canonical example subjects:

| Example ID | Required contents and use |
|---|---|
| `docs-service` | Required name, services.main HTTP primary with AUTO, services.tester Compose/service/env, canonical Dockerfile dev/test/prod, dedicated tester Compose and runner Dockerfile; used by root README/service quickstart |
| `docs-requisites` | Main plus database dependency, migration prerequisite, inspection service requirement, dormant optional service; demonstrates inclusion, ordering and endpoint-less jobs |
| `docs-mesh` | Frontend/backend source projects, source-local backend mock explicitly pruned, real backend requisite/env rewrite, global Compose tester, only intentional endpoint publication |
| `docs-e2e-overlay` | Prod structured env inherited by E2E, separate app/tester dotenv, E2E-only fixture job made reachable, tester complete graph barrier |
| `docs-publication` | Private source endpoints with publicPort capability, main and nested ordinary endpoint selectors, explicit replacement of inherited publish arrays |
| `docs-migration-pair` | Complete valid V2.2 before and V3 after standalone/mesh configs plus Dockerfile/tester/override assets; exact examples used by migration guide |

Ensure the quickstart can run isolated dev and unit tests without surviving external references. Put integrated-only endpoint env in prod/E2E overlays or supply isolated-safe values as pinned by D06. Explicitly explain this limitation in reference/troubleshooting pages; do not copy the exhaustive specification example's base external refs and claim isolated dev will succeed.

Tester examples use an explicit host network when addressing loopback public endpoints. A separate network-ref example uses explicit bridge networking and explains DNS reachability. Say public properties are recommended for black-box tests; do not state network properties are categorically forbidden.

## 4. Exact public page worklist

Every existing public Markdown page listed below must be reviewed and updated. Paths are relative to root `docs/`. Historical migration pages receive version banners and forward links rather than conversion of their old syntax.

### Entry points and first-run tutorials

| Page | Required changes / acceptance |
|---|---|
| `README.md` | Title Builder V3; opening graph model; prominent v2.2→v3 migration link; start-here/task navigation updated; remove provider-substitution guidance; link all reference/concept groups and historical migrations separately |
| `glossary.md` | Define main, tester, ordinary/atomic module, requisite, requirement, dependency, prerequisite, closure/reachability, representative, stage, source, extends, publication capability, public endpoint and isolated/integrated execution; mark provider substitution as historical terminology |
| `getting-started/installation.md` | Version-specific V3 installation instructions, both executable aliases, verify --version; requirements match tested package engines/Compose support; link migration for existing users; local prerelease checkout instructions must not imply npm publication |
| `getting-started/service-quickstart.md` | Complete docs-service file tree including tester assets; three main targets; health requirements; check, isolated dev, dev --full, prod, test and down; explain which files each command uses |
| `getting-started/dependencies-quickstart.md` | Retitle “Add ordinary services and requisites”; show that declaration alone does nothing; add explicit dependency edge; include endpoint-less migration example and correct ordinary env ownership |
| `getting-started/mesh-quickstart.md` | Complete named mesh with services.tester and two source roots; explicit source-local prune + real requisite + env ref; source-relative publish; dev/prod/test and down; no public mesh E2E-only command |

Root repository `README.md` must be rewritten around the same model: concise feature list, one complete minimal service example, correct target matrix, one explicit mesh rewrite illustration, and links into `docs/`. Remove its current large duplicated V2 tutorial content; keep detailed field tables in reference pages so they have one maintained owner. Update its documentation link label to “Builder V3 documentation” and add the migration link immediately below installation.

### Concepts

| Page | Required changes / acceptance |
|---|---|
| `concepts/service-and-mesh-model.md` | Services are possibilities; requisites define graph; standalone main root versus all effective mesh source roots; tester special role; imported source remains independently runnable |
| `concepts/local-dependencies.md` | Ordinary Compose modules can contain multiple containers and zero endpoints; explicit representative; dormant versus reachable; module-wide env and cleanup |
| `concepts/dependency-substitution.md` | Retitle “Replace a local service through source overrides”; explain V2 binding is removed; use three explicit operations (prune, requisite, env rewrite); no automatic endpoint-name matching or readiness transfer |
| `concepts/stages.md` | Build and mesh allowed stages; source and mesh application order; recursive object/scalar/array behavior; false deletion; immutable compose/source; stage-added local versus mesh-root distinction |
| `concepts/endpoints.md` | Exact primary rules; main PORT; ordinary owner/representative; endpoint-less service; scheme and publicPort capabilities |
| `concepts/endpoint-references.md` | Canonical build/local/mesh source syntax; self/direct/transitive permissions; another active root alone is insufficient; stale shadowed refs ignored; surviving pruned refs fail |
| `concepts/publication-and-ports.md` | Standalone publication and private-by-default mesh; selectors; unreachable selections invalid; AUTO/fixed conflicts; public availability does not create requisites |
| `concepts/environment.md` | Only main execution vars; ordinary Compose defaults and module-wide env; separate tester domain; link exact precedence reference; Builder-owned keys cannot be overridden |
| `concepts/lifecycle-and-readiness.md` | Three edge kinds; allowed requirement cycles; ordering subgraph acyclic; dependency/prerequisite conflict; representative health/completion; main health; full E2E barrier |
| `concepts/testing-model.md` | Standalone unit→service E2E; mesh base-source tests sequentially→fresh global E2E; no leaks; stage-only sources excluded Phase 1; tester own Compose and no execution variables |

### References

| Page | Required changes / acceptance |
|---|---|
| `reference/build-json.md` | Strict complete V3 type/field tables; name/main/tester required per implemented contract; no root dockerfile/app/dependencies/tester; main/ordinary/tester and overlays have separate tables; full valid example |
| `reference/mesh-json.md` | Required name/tester and ≥1 source; source/extends/publish; special tester shape; extends existing-only; mesh stages exclude test; full source composition order and publish replacement |
| `reference/identifier-rules.md` | Canonical regex, reserved main/tester meanings, mesh main restriction; do not preserve old blanket reservation of app/dependencies/dev |
| `reference/json-schemas.md` | Canonical build/mesh schema URIs; editor setup; generated V3 shapes; distinguish structural editor checks from effective graph/runtime validation; no claim that JSON Schema validates cross-file reachability |
| `reference/endpoint-properties.md` | Eight-property table with exact values and scheme/publication preconditions; all canonical grammars; main PORT differs from public port; self and transitive examples |
| `reference/stage-matrix.md` | One exact table for standalone/mesh workflows with config inheritance, main target, EXEC_MODE, INFRA_MODE, main dotenv, tester dotenv; tester target is declared Compose implementation, not a canonical lifecycle target |
| `reference/environment-precedence.md` | Exact lists for standalone/mesh main normal/E2E, ordinary normal/E2E, source/global tester; selected override position; winner-only reference evaluation; no implicit env.prod in E2E |
| `reference/dockerfile-contract.md` | Canonical project Dockerfile and dev/test/prod targets; inherited health/command rules, foreground dev; no required test-e2e, EXPOSE prohibition or required artifact-copy architecture; app chooses adapters through INFRA_MODE |
| `reference/dependency-compose-contract.md` | Retitle “Ordinary service Compose contract”; atomic membership, endpoint/representative validation, health by lifecycle, ownership restrictions, paths/resources, retained native internal conditions; endpoint-less services are not inert |
| `reference/override-compose-contract.md` | Path under services.main; sole services.main override; single effective selected file; build.args; safe mounts/env; protected target/ports/namespaces/vars; source/mesh-origin path semantics |
| `reference/cli.md` | Derive all command/flag tables from implemented help and handlers; mesh up dev/prod/test only; standalone convenience phase commands distinguished from targets; export config stages; dry-run/skip-checks boundaries; down/recovery/prune and exact volume effects |

Do not invent a new prune safety scope in docs. Inspect the actual handler: the current public docs describe broad stopped-container/unused-network pruning. If implementation retains that behavior, describe it accurately and recommend project-specific down for project cleanup. If a separate implemented change scopes prune, verify it with OPS14 before documenting that changed behavior. No reader should mistake pruning for a migration requirement.

Remove obsolete tutorial uses of `mesh check --require-tester`; V3 projects require the tester declaration. The CLI reference must state the actual status of any retained compatibility flag rather than implying the tester remains optional. Match down/export compatibility syntax to their tested handlers; do not infer removed down commands solely from removed up commands.

### Task guides

| Page | Required changes / acceptance |
|---|---|
| `guides/develop-a-service.md` | Isolated default and integrated --full; correct graph inclusion, health and technology-owned mounts |
| `guides/run-with-local-dependencies.md` | Declaration + requisite prerequisites; endpoint-less modules; explain active graph rather than “all endpoint-bearing dependencies” |
| `guides/build-a-mesh.md` | Source imports and explicit extends; consumer closures; every effective root starts; global tester and publication |
| `guides/bind-dependencies-to-real-services.md` | Retitle “Replace local mocks with mesh services”; exact three-operation rewrite and nested ordinary consumer rewrite; no provider map remains |
| `guides/configure-service-e2e.md` | Dedicated tester Compose/Dockerfile, selected runner, base/prod/e2e tester env; production main, full barrier, tester status and cleanup |
| `guides/configure-global-mesh-e2e.md` | Root services.tester, tester env.e2e-tester, effective global overlay and explicit publication; run full mesh test; no direct public global E2E command |
| `guides/use-stage-only-services-and-dependencies.md` | Local addition needs requisite; top-level mesh addition becomes root; Phase 1 membership remains base-only; full required declaration |
| `guides/publish-mesh-endpoints.md` | Source-relative main/nested selectors, publicPort prerequisite, replace-array behavior, private endpoint diagnostic |
| `guides/customize-a-stage-with-override-compose.md` | Complete main override example with build.args, mounts and env; single selected override file; forbidden ownership changes |
| `guides/export-resolved-environment.md` | Export correct effective main env, config stage names, separate resolved files, overwrite behavior from real command; no tester export or reuse of internal vars as runtime input |
| `guides/validate-before-running.md` | Structural/effective/runtime validation boundaries, all-stage checks, active composition, no stale shadowed-ref failure; skip-checks cannot bypass semantic validation |
| `guides/clean-up-builder-resources.md` | Dev/prod versus strict test teardown, named/anonymous volumes, saved state recovery after config edits, source-local cleanup contexts, truthful prune scope |

### Recipes

| Page | Required changes / acceptance |
|---|---|
| `recipes/automatic-host-ports.md` | Main/ordinary AUTO capability, effective publication, endpoint refs; no guessed localhost port |
| `recipes/multiple-endpoints.md` | Exactly one primary, separate owners, representative chosen by primary; secondary endpoint health not automatically a separate logical lifecycle |
| `recipes/dependency-to-dependency-readiness.md` | Ordinary a requisites b dependency; include prerequisite variant with successful completion; native Compose conditions preserved |
| `recipes/real-service-replaces-local-mock.md` | Full source/mock and mesh before/after story with prune + explicit requisite + explicit URL rewrite |
| `recipes/public-gateway-private-services.md` | Publish gateway only; gateway closure reaches backend/frontend; global tester accesses gateway public URL; no private source host leakage |
| `recipes/composition-owned-gateway-wiring.md` | extends.main.env plus explicit requisites; cross-source URLs; requirement cycles allowed only when ordering graph remains acyclic |
| `recipes/publish-a-local-dependency-ui.md` | Publish nested ordinary endpoint with `<local>.endpoints.<endpoint>`; service must already be reachable and capable |
| `recipes/stage-only-e2e-provider.md` | Retitle “Add an E2E-only mesh service”; source declaration, explicit main rewrites, E2E root inclusion and Phase-1 exclusion; no provider substitution |

### Troubleshooting and historical pages

| Page | Required changes / acceptance |
|---|---|
| `troubleshooting/configuration-errors.md` | Removed fields, missing name/tester, strict service kinds, immutable fields, invalid extends, wrong stage; show corrected V3 fragments |
| `troubleshooting/references-and-environment.md` | Closure missing despite target active, pruned surviving reference, scope collisions, winning env layers, isolated external-ref limit, reserved variables |
| `troubleshooting/ports-and-publication.md` | Missing publicPort, private mesh endpoint, unreachable selector, fixed collision, AUTO allocation/caching; no publish-induced reachability |
| `troubleshooting/healthchecks-and-startup.md` | Missing representative health, NONE, ordering cycle, classification conflict, failed/hung prerequisite, graph barrier pending; no all-owner health assumption |
| `troubleshooting/tests-and-testers.md` | Required compose/service, wrong runner, helper exit versus runner exit, production app semantics, no tester modes, Phase-1 fail-fast, strict cleanup failure |
| `troubleshooting/docker-and-compose.md` | Path rebasing, missing assets, ownership restrictions, generated namespace expectations, Docker preflight versus compiler diagnostics; actual supported Compose commands |
| `migration/v1-to-v2.md` | Add clear historical-version banner and forward link to latest guide; preserve intentional V1/V2 before/after snippets |
| `migration/v2.1-to-v2.2.md` | Historical banner and next-step link to v2.2→v3; keep its historical command story labelled as 2.2 rather than teaching it as current |
| `migration/v2.2-to-v3.0.md` | New complete migration guide specified below |

## 5. Migration guide structure and exact required content

Write the new guide in the following order. All “before” examples must be valid for the audited 2.2.0 model; all “after” examples must pass V3 schema/effective compiler checks. No runtime compatibility transformer is promised.

### 5.1 What changes and who should use this guide

State source version 2.2.0, target 3.0.0, breaking config migration, technology-agnostic application boundary, and absence of V2 fallback. Link earlier migration guides for older starting versions without treating their snippets as V3.

Give the short semantic model: explicit requisites determine inclusion and ordering; references configure already reachable nodes; mesh extends replaces provider substitution; tester is an independent Compose module.

### 5.2 Inventory and safe migration order

List every asset to inspect: build.json/mesh.json and overlays, Dockerfiles, ordinary Compose files, main overrides, source/global tester files, five dotenv roles, makefiles/package scripts/CI commands, application execution-mode branches, endpoint refs and publication selections.

Order the reader's work:

1. Record existing behavior and package version; copy configuration/source assets into a local backup location of the reader's choice. Do not give Git mutation commands as required migration steps.
2. Stop existing dev/prod/test runs using the currently installed Builder's supported down commands and source contexts. Explain volume removal separately; do not recommend blanket prune or automatic volume deletion as a migration step.
3. Convert each standalone source completely, including tester assets, before converting the mesh.
4. Convert mesh source rewrites/publication/tester and stage overlays.
5. Update scripts, execution-mode assumptions, overrides and endpoint refs.
6. Use the V3 local checkout or available installed V3 package to run structural/compile/dry-run checks; inspect semantic output before live execution.
7. Run focused source tests and finally the complete mesh test workflow. Explain that a real project's first build/test can exceed the Builder repository's warmed 1–3 minute test budget.

Do not claim automatic data migration between renamed Docker resources. Existing external data/volumes need an explicit user-managed retention strategy; describe current cleanup/recovery tools without auto-destructive commands.

### 5.3 Complete field transformation table

Include all of these rows, with before path, after path, and required semantic action:

| V2.2 input | V3 replacement | Required explanation |
|---|---|---|
| Optional/missing name | Required name | Add an explicit meaningful build/mesh name |
| app | services.main | Application runtime identity |
| dependencies.x | services.x | Declaration alone no longer starts the module |
| Implicit integrated dependency inclusion | Explicit main/ordinary requisites | Use dependency to preserve former healthy ordering; requirement only intentionally removes waiting |
| dependsOn entries | requisites keyed by canonical target | Convert each edge explicitly, including ordinary consumers |
| Root tester env | services.tester compose/service/env | Extract main-Dockerfile E2E runner to a dedicated Compose implementation |
| Root stage override-compose | stage.services.main.override-compose | Select one final override path |
| Override services.app | Override services.main | Preserve allowed args/resources; no target/port ownership override |
| Root dockerfile customization | Canonical project Dockerfile | Move/organize main build to canonical path; tester may use its own Compose Dockerfile |
| Mesh service path | source | Source immutable after declaration |
| Mesh direct env | extends.main.env | Preserve env precedence and origin |
| Mesh dependencies provider map | extends requisite deletion/addition + env rewrite | No automatic provider edge/reference translation |
| Mesh root tester | services.tester | Same required runner selection shape as source tester |
| app.endpoints.x | main.endpoints.x | Local canonical reference/selector |
| dependencies.x.endpoints.y | x.endpoints.y | Local ordinary reference/selector |
| meshName.app.endpoints.x | meshName.source.main.endpoints.x | Cross-source reference |
| meshName.dependencies.x.endpoints.y | meshName.source.x.endpoints.y | Actual retained local node only, not a substituted alias |
| Stable-union publish arrays | Replacement arrays | Restate the entire desired active list in an overlay |
| Inert endpoint-less dependency | Ordinary service with explicit service | Requisite-controlled materialization; classify jobs as prerequisite |
| Required test-e2e main target | Separate tester Compose image/build | No forced tester target and no tester execution variables |
| Tester EXEC_MODE=e2e branches | Tester-specific configuration/entrypoint | Remove obsolete mode assumptions; app E2E remains prod/integrated |
| Public mesh up test-e2e | mesh up test | Full two-phase workflow; internal composition stage does not imply public command |

Explicitly state that mesh.json.test was already removed by 2.2.0. Its continued rejection is not presented as a newly introduced V3 breaking change.

### 5.4 Standalone before/after walkthrough

Use one named API with main HTTP endpoint, a Compose-backed backend mock, prod BACKEND_URL, isolated test settings, stage overrides and tester API_URL. Include complete before/after build.json, not only a rename fragment. In the after version:

- Main has an explicit backend dependency requisite.
- Backend is an ordinary module with compose, primary owner endpoint and valid health.
- Prod env uses `${backend.endpoints.http.network_url}`; isolated base/test do not retain external endpoint refs.
- Tester uses compose `./e2e/docker-compose.yml`, service `e2e-runner`, env `${main.endpoints.http.public_url}`.
- Stage main env and override-compose appear below stage.services.main.

Show actual override file before/after key change and build.args preservation. State that a selected E2E override replaces the prod override file; users who previously relied on accumulating mounts/env/args from multiple files must consolidate needed content into the selected file.

### 5.5 Tester extraction walkthrough

Provide all files and path relationships:

- Main Dockerfile before includes dev/test/test-e2e/prod; after includes required dev/test/prod plus ordinary helper build stages, with tester instructions removed.
- Dedicated `e2e/Dockerfile` preserves the old test-e2e stage's dependencies, copied test assets, entrypoint and actual test command; do not prescribe deleting needed dev/test packages from the runner image.
- `e2e/docker-compose.yml` selects runner, uses project-root context and `dockerfile: e2e/Dockerfile`, explicit host networking for public URL example; no forced lifecycle target.
- `.env.e2e` remains application env; `.env.e2e-tester` remains runner env. No automatic merge, no `.env.prod` inheritance, no tester EXEC_MODE/INFRA_MODE.
- A multi-container tester example selects the correct runner via service and explains helper exits do not define the result.

Explain that standalone `builder service up test-e2e` may remain a phase convenience command; the string's continued presence in CLI syntax does not mean the old Dockerfile target is required.

### 5.6 Mesh before/after walkthrough

Include complete two-source frontend/backend mesh with global tester. Show the exact local/backend collision case:

```json
{
  "source": "./services/frontend",
  "extends": {
    "main": {
      "requisites": {
        "source.backend": false,
        "backend": "dependency"
      },
      "env": {
        "BACKEND_URL": "${backend.source.main.endpoints.http.network_url}"
      }
    }
  }
}
```

Label this block as the value at `services.frontend` within the complete after file. Explain each operation separately: local edge deletion; fellow-root edge inclusion and readiness; explicit env rewrite. Do not say the ordinary service declaration was deleted or the reference created the edge.

Add a nested ordinary consumer example: source `worker` still references a pruned source backend. Override `extends.worker.requisites` and `extends.worker.env` too, or retain its local edge intentionally. The guide must not imply rewriting main automatically fixes every source-local consumer.

Require all surviving refs to point to the effective target. A stale lower-precedence ref overwritten by extends is harmless; an unshadowed surviving ref fails. Different real-service endpoint names require explicit rewritten refs, not provider endpoint-name matching.

### 5.7 Stages, publication and ordering changes

Provide three separate worked examples:

1. Base publish contains main and inspection UI; dev overlay wants both plus debug UI. Show full replacement array and the accidental-loss variant. All selected nodes are already reachable and have publicPort.
2. E2E adds fixture-loader locally and adds a prerequisite edge; a stage declaration alone is dormant. Contrast a top-level mesh E2E audit source becoming a root and being excluded from Phase-1 base source tests.
3. Dependency healthy ordering versus prerequisite completion; requirement-only cycles legal, dependency/prerequisite ordering cycles invalid. Show the error when two consumers classify the same node incompatibly.

Mention exactly one primary endpoint, explicit service for endpoint-less modules, full E2E health/completion barrier and main health. Do not convert every old dependsOn to requirement merely to avoid cycles; preserve healthy ordering with dependency and resolve real ordering conflicts deliberately.

### 5.8 Environment changes and precedence

Include a concise migration delta table and link the complete precedence reference:

- Main alone receives Builder execution variables; PORT follows primary internal endpoint, not host port.
- Ordinary env applies to every container in its atomic module and does not inherit main dotenv.
- Main override environment is below mesh extends env; one selected override file.
- Source/global tester receives only its own dotenv and effective tester env, with no lifecycle vars.
- E2E structured inheritance includes prod; E2E dotenv does not include env.prod.
- Only surviving effective values are reference-validated; active invalid external refs in isolated mode still fail under the pinned contract.

### 5.9 Command/script migration and validation checklist

Audit and rewrite makefile/package/CI scripts without renaming valid application test scripts unnecessarily. Replace direct public global-E2E commands with full mesh test; preserve standalone convenience commands where implemented. Update check flags and help expectations to the actual V3 CLI.

Include this ordered reader checklist, using concrete service and mesh directories from the walkthrough:

```text
builder --version
builder check -C ./services/frontend
builder check -C ./services/backend
builder service up prod --dry-run -C ./services/frontend
builder service up test --dry-run -C ./services/frontend
builder mesh check -C .
builder mesh up dev --dry-run -C .
builder mesh up test --dry-run -C .
builder service up test -C ./services/frontend
builder service up test -C ./services/backend
builder mesh up test -C .
```

State that the final mesh test intentionally repeats standalone source tests as Phase 1; the earlier standalone commands are a migration troubleshooting sequence, not necessary duplicate steps for every routine run. Do not promise dry-run proves engine health, successful jobs or tester connectivity.

For every validation step, state what to inspect: node set, suppressed local mock, selected main target/modes, runner identity, effective publication, env domains, successful cleanup. Explain expected nonzero stop behavior on errors.

### 5.10 Troubleshooting and recovery

Use a symptom → cause → exact correction table covering:

- Unknown app/dependencies/path/tester/dependsOn field.
- Missing name/tester/ordinary representative.
- Outside requisite closure despite target being a mesh root.
- Pruned-but-still-referenced target.
- Publication selector missing source-relative syntax/publicPort/reachability.
- Disappeared host endpoint after array replacement.
- Immutable compose/source replacement attempted in stage.
- E2E job never completes or exits nonzero.
- Main or requirement-only runtime lacks health for tester barrier.
- Tester command/target still assumes EXEC_MODE=e2e.
- Old source test target selected as global tester or helper status mistaken for runner result.
- Cleanup failure leaving state/resources after a failed test.

Recovery uses saved runtime identity and supported down commands. For reverting a local migration, stop the V3 runtime first, restore the user's backed-up source/config and original package version, then validate with that version. Explicitly state this does not restore data deleted by volume removal and does not migrate persistent data between resource names.

## 6. Documentation implementation sequence

1. Create the docs fixture manifest and extract current active examples/commands so failures identify actual outdated pages.
2. Write the build/mesh/schema/stage/env/endpoint/override/Compose/CLI reference pages first. They establish terminology and exact contracts for other authors/pages.
3. Write the complete migration-pair fixtures and the new guide; verify after examples with real V3 compiler and before examples against the audited V2 shape as historical data (no running the old runtime).
4. Rewrite concepts and quickstarts using the tested fixtures. Update all guide and recipe pages from the page worklist.
5. Rewrite troubleshooting around actual V3 diagnostic behavior; add links back to corrective reference/guide sections.
6. Update docs/README, root README, glossary, CHANGELOG and example README links. Add historical migration banners/forward links.
7. Run documentation-specific checks and existing PKG03/PKG06/CLI04 coverage. Fix broken anchors, unsupported commands, invalid examples and semantic contradictions.
8. Review the final rendered Markdown flow from installation→quickstart→reference and from V2 landing→migration→validation. No publishing action is required.

## 7. Automated checks and specific acceptance cases

Extend existing `tests/v3/repositoryContract.test.ts` and public-doc tests rather than create a second expensive test command. Register the following DOCS cases as an extension to the 255-family catalog in files 05–08. They are Docker-free, batched, and must add no more than five seconds to the existing fast-suite budget; replace redundant broad docs scans rather than increase the 180-second full-suite budget.

Use `tests/v3/support/docsManifest.ts` to enumerate current pages, historical pages, fixture IDs, code block role and expected compile profile. Associate snippets with stable explicit HTML markers (`<!-- example: docs-service/build.json -->`) or fixture links. Do not classify arbitrary JSON as a complete Builder file merely because it appears in a fence.

| ID | Setup/action | Expected result | Test method |
|---|---|---|---|
| DOCS01 | Read all public docs, root README and newly added migration page. | Every relative Markdown link/image and heading anchor resolves; migration reachable from both landing pages. | One filesystem/link pass with GitHub-style heading IDs; ignore network fetches, never crawl external URLs |
| DOCS02 | Load complete active build/mesh example blocks from manifest. | Strict V3 shape and effective composition valid in declared profiles. | Production schemas/compiler, metadata/port adapters from file 05; real fixture files, zero Docker |
| DOCS03 | Load overlay/invalid/historical blocks according to manifest role. | Overlays compile in named parent fixture; intentional invalid block fails expected reason; V2 historical snippets are never misrepresented as valid V3. | Parameterized expected outcome per snippet; fail unclassified current Builder config blocks |
| DOCS04 | Compare migration before/after pair and supporting assets. | After has explicit graph/tester/source rewrite; expected local mock pruned and real target/env used; no implicit provider compatibility. | Real V3 compile after, assert node/edge/env/publication maps; independently inspect before shape |
| DOCS05 | Examine migration prod/test/E2E and publish overlay examples. | E2E prod target, no tester modes, correct dotenv domains, publish replacement, reachable fixture job and no phase-membership confusion. | Reuse execution-profile/compiler assertions against actual documented fixture data |
| DOCS06 | Parse active command snippets and CLI reference tables. | Every command/flag supported; no public mesh up test-e2e; standalone phase names not treated as Docker targets. | In-process actual parser/handlers with denied runtime adapter; historical/explicit invalid commands labelled and excluded from positive dispatch |
| DOCS07 | Scan active prose for obsolete claims and verify rewritten pages. | No endpoint-less-is-inert, automatic provider rewiring, tester-e2e-var, union-publication or public-only-tester-validation claims. | Curated prohibited-claim patterns plus targeted semantic assertions; allow clearly labelled migration “before” explanations |
| DOCS08 | Compare stage/env/field tables to production contracts. | Required keys, exact stage sets, target/modes and precedence match implemented V3. | Structured assertions over manifest/table rows and compiler fixture outputs; no giant rendered-page snapshots |
| DOCS09 | Inspect scope/path/publication examples and helper runner selection. | Correct author-relative paths, source-relative selectors, explicit endpoint namespace, actual selected tester service. | Compile fixtures from directories with distinct same-named paths; inspect generated values and runner metadata |
| DOCS10 | Build docs inventory from docs/**/*.md and manifest. | Every public page has disposition/version classification; historical guides have banners/forward links; all listed worklist pages reviewed. | Set equality on actual file inventory; fail new unclassified page or orphan migration link |
| DOCS11 | Compare installed-package metadata/help to root README installation/version/compatibility claims. | Supported versions and executable aliases accurate; no false claim that an unpublished artifact is already available. | Local package/help assertions only; publication status is not inferred from package.json version |
| DOCS12 | Run docs checks with Docker/network denied. | Entire docs validation completes within ≤5 seconds warmed and makes no external calls. | Existing fast-suite guard and per-file duration reporter; no example dependency install or application build |

For prose that cannot be reliably checked automatically, perform a finite review against this list: each of the three edge kinds explained correctly; references do not create graph; publication does not create graph; all source roots active; E2E composition order correct; selected override semantics explicit; helper/representative/runner roles distinct; migration uses explicit rewrites and honest rollback/data limits. Record reviewed page paths in the implementation report.

## 8. Definition of done

- Every current root/docs page in the inventory is V3-correct or explicitly historical.
- `docs/migration/v2.2-to-v3.0.md` includes complete before/after source and mesh configs, runner extraction files, override changes, reference/edge/publication rewrites, command migration, validation and recovery.
- Root README and docs landing page link directly to the guide and current V3 references; existing public paths remain usable.
- Active snippets and commands pass the appropriate Docker-free validation; all DOCS cases and affected PKG/CLI cases pass within the established budget.
- Public prose does not silently resolve specification tensions differently from plan 00, promise unimplemented features, or imply publication has happened.
- Only local files inside builder changed; no Git mutation, package publication, external deployment or sibling-project migration performed.
