# 04 — Normative specs, `./docs`, examples, migration and release

The user explicitly requires updating `./docs` during implementation. This is a required deliverable, alongside `.docs/specs_v2`, `.docs/EXECUTION_MODEL.md`, README, CLI help and examples. Creating only internal specs or a changeset is insufficient.

## C08 — Correct normative stage ownership

- **Change:** Update the three v2 specification files and execution model to explicitly separate build stages from mesh stages and reject root mesh `test`.
- **Why:** Existing normative references authorize the exact legacy behavior being removed; implementers and users would otherwise receive contradictory contracts.
- **Current behavior:** `SPECS_V2.md` §12 has one four-stage chain; §23 includes root mesh `test`; §26 retains explicit test tooling. `MESH_JSON_DOCS.md` includes `test?: MeshStage`, a four-stage list and an entire retained-test namespace section. Execution model already specifies the correct two-phase pipeline but does not explicitly forbid the unused field.
- **Expected behavior:** Normative docs say build has four overlays, mesh has three, root mesh `test` is rejected in every active composition, and the `test` command is a pipeline. Build test/runtime contract remains intact.
- **Failing-before test:** T15-A: read normative mesh complete-shape section and assert it excludes `test?: MeshStage`; current text fails. T15-B: assert explicit root-field rejection language appears in execution model and mesh reference; current text lacks it. Use these document acceptance assertions with the file-by-file review below; do not add tests banning every word `test`.

### Exact normative changes

| File / location | Required edit | Current vs expected check |
|---|---|---|
| `.docs/specs_v2/SPECS_V2.md` §12 | Split shared stage-chain block into Build and Mesh blocks | Build block retains `test = base -> test`; mesh block has only dev/prod/e2e |
| Same, §23 canonical mesh JSON | Remove `"test": {}` only from mesh shape | Canonical mesh parses under new schema; build shape in §13 still has test |
| Same, §26 `## Test` | Replace retained-tooling paragraph with `## Test command (no mesh overlay)` and hard rejection rule | No assertion that mesh test-stage tooling remains supported |
| Same, §2.5 / §29 | State Phase 1 does not consume any mesh env/binding/publication/stage-path overlay; root paths define membership | Two-phase semantics remain; no new isolated mesh topology |
| Same, §32 | Add a separate v2.2 removal note for root mesh `test`; do not falsely list it as a V1-only removal | Versioned migration ownership is clear |
| `.docs/specs_v2/MESH_JSON_DOCS.md` §1 | Remove `test?: MeshStage`; clarify command/config distinction after inheritance block | Three-field shape |
| Same, §7 root stages | Remove `test` from allowed stage list | Exactly dev/prod/e2e |
| Same, §7.3 | Replace with explicit unsupported-root-field section, or renumber E2E to §7.3 and put removal rule in a separate subsection | No retained namespace; local heading links updated if renumbered |
| Same, §8 / §5.2 | Explicitly scope `<stage>` to dev/prod/e2e | Stage env never implies standalone Phase-1 ownership |
| Same, §12 | Add Phase-1 independence wording and preserve clean Phase 2 | Correct pipeline |
| Same, after §14 | Add v2.2 migration/rejection note distinct from removed V1 fields | No silent translation |
| `.docs/specs_v2/BUILD_JSON_DOCS.md` §9 intro | Say **build.json** supports these four overlays; link mesh's three-stage contract | Existing test example and §9.3 unchanged |
| Same, app env ownership paragraph | Clarify mesh env precedence applies when the app is in a composed mesh, not during standalone Phase 1 | No suggested mesh env injection into service tests |
| `.docs/EXECUTION_MODEL.md` §3 / §6 | State valid mesh overlays and unsupported root `test`; retain service runtime table and sequential two phases | Explicit rejected field plus unchanged service isolated runtime |

Suggested shared wording:

```text
build.json supports dev, prod, test, and e2e overlays.
mesh.json supports dev, prod, and e2e overlays only.
A root test field in mesh.json is invalid, including an empty object.
Builder rejects it rather than ignoring it, even for dev/prod/E2E commands
and when --skip-checks is used. The mesh test command is an orchestration
pipeline, not a configuration overlay.
```

Phase-1 wording:

```text
Phase 1 uses each root service's original path and runs its complete
standalone test lifecycle. Neither root mesh service env nor mesh stage
overlays, dependency bindings, lifecycle edges, or publication selections
are applied to that lifecycle. Unit configuration is owned by build.test;
service E2E configuration is owned by build base -> prod -> e2e.
```

Keep the reserved mesh service-name `test` in all naming tables. Keep the complete build JSON test example and Dockerfile targets.

## C09 — Update public documentation under `./docs`, README, and examples

- **Change:** Correct every current public description/example of mesh test topology, add migration guidance, and remove the obsolete fullstack Make target.
- **Why:** Users follow public docs and examples, not internal plans. Current docs would lead them to author a field that now fails immediately or invoke a removed command.
- **Current behavior:** `docs/reference/mesh-json.md` includes a `test` field/type/example; CLI and stage matrix advertise mesh test-unit; concepts/glossary describe a single four-stage domain for both files; the fullstack example Makefile invokes the removed command.
- **Expected behavior:** All current public docs distinguish four build overlays from three mesh overlays, describe full service lifecycles during Phase 1, state hard rejection, and show valid migration destinations. A dedicated v2.1-to-v2.2 guide explains removal and recovery. `./docs` changes are mandatory.
- **Failing-before test:** T15-C validates the canonical public mesh JSON example against the new schema and asserts no root test declaration in its shape; currently the example contains `test`. T15-D rejects retained-tooling claims in current reference/concept docs. T16 asserts no example Make command invokes `builder mesh up test-unit`; currently one does.

### Public documentation worklist

Each row is part of C09 and supplies its own current/expected delta and review/test acceptance. Changes are substantive instructions; do not merely add a disclaimer while retaining invalid positive examples.

| File | Current behavior / problem | Required change and expected behavior | Failing-before acceptance or paired regression |
|---|---|---|---|
| `docs/reference/mesh-json.md` | Four-stage TypeScript shape, root-field table, overlay paragraph, inheritance expression and complete JSON example | Remove test from every positive shape/list/example; specify `<stage>=dev/prod/e2e`; add forbidden-root-field rule and migration link; retain root tester | T15-C exact shape and parsed complete example lack `test`; currently both contain it |
| `docs/reference/cli.md` | Mesh up/down accept test-unit; explicit tooling explanation; examples invoke it; help inconsistency note | Mesh accepted list becomes dev/prod/test/test-e2e; remove mesh unit examples and stale help mismatch; explain pipeline/config distinction and removal error; retain service up/down/export sections | T09 rendered help plus scoped mesh CLI sections must match supported list; current sections include test-unit |
| `docs/reference/stage-matrix.md` | Generic four-stage intro and a mesh unit topology row | Split stage domains, remove mesh unit row, preserve all service rows; explain full pipeline separately with unit and service E2E in Phase 1 | T15-D no `mesh up test-unit` table row; build test row remains |
| `docs/concepts/stages.md` | Says all JSON has exactly four overlays | Separate build and mesh inheritance blocks; explain command names; no mesh test chain | T15-A-style block checks; currently one shared four-stage block |
| `docs/concepts/testing-model.md` | Correct pipeline followed by retained mesh-test-unit exception | Delete exception; add service ownership and hard field rejection | T15-D rejects `remains an explicit mesh` claim; current paragraph matches |
| `docs/glossary.md` | Stage defined as one four-value domain | Define config stage by owner and command separately | T15-E ownership sentence explicitly names both domains; currently absent |
| `docs/reference/json-schemas.md` | No explicit removed-field example | Explain strict root rejection and distinguish build vs mesh stage schemas; link migration | T06 schema rejection paired with docs assertion that `mesh.json.test` is rejected |
| `docs/guides/validate-before-running.md` | General checks only | Explain removed root field fails during loading even with skip-checks; preflight still validates standalone build.test | T14 bypass test paired with sentence check; currently absent |
| `docs/guides/configure-global-mesh-e2e.md` | Correct global tester setup but no migration boundary | Explain changes belong under mesh.e2e (inheriting prod), not mesh.test; link new migration guide; Phase 1 standalone | T15-B-style migration/rejection link check; preserve existing working commands |
| `docs/guides/clean-up-builder-resources.md` | Generic mesh down test guidance | Explain full-test cleanup visits root service standalone projects and root E2E; removed mesh unit command; legacy saved child state recoverable via service down; invalid root config limits child discovery | T11/T13 plus recovery example check; current helper/docs do not describe actual canonical recovery |
| `docs/troubleshooting/configuration-errors.md` | No dedicated removed-field diagnostic | Add exact error prefix, why, and per-owner migration destinations; empty test is invalid | T01 error text paired with required troubleshooting entry |
| `docs/troubleshooting/tests-and-testers.md` | No removed mesh command guidance | Add removed-command guidance, distinguish full mesh test and service unit; do not imply .env.test is removed | T07/T08 plus required troubleshooting command link |
| `docs/migration/v1-to-v2.md` | Generic “move stage behavior to dev/prod/test/e2e” | Scope that instruction to build; state mesh dev/prod/e2e; link current v2.2 removal guide | T15-E avoids generic four-stage mesh implication |
| New `docs/migration/v2.1-to-v2.2.md` | Missing | Add the complete migration content below | Required file + linked guide + example shape checks fail before addition |
| `docs/README.md` | No v2.2 migration entry | Add link in navigation/relevant guide list | Link resolution/required link check fails before addition |
| `README.md` mesh stage table / explanation / CLI synopsis | Contains mesh unit row, retained-tooling prose and mesh up/down test-unit signatures | Update mesh sections only; link v2.2 migration; leave service table/signatures unchanged | T15-D scoped prose/table checks; preserve service controls |
| `examples/fullstack/makefile` | `test-unit` target calls removed mesh command | Remove that target; retain dev, prod, test, test-e2e; ensure final newline | T16 no removed command and valid targets still present |

Inspect all remaining markdown under `./docs` for equivalent stale wording. Files such as `docs/reference/build-json.md`, service quickstart, service E2E guide, export guide, Dockerfile contract, and service-only dependency examples should normally retain their test content. A search match is a review candidate, not permission to delete.

`examples/fullstack/mesh.json` currently has no root `test`; do not invent a removal diff there. The user's illustrative frontend URL example is an ownership example, not evidence that this exact JSON exists in the current fullstack file. `docs/reference/mesh-json.md` does currently have a root test example. Validate actual files rather than assuming every snippet is present.

### Suggested new migration guide content

```markdown
# Migrate from Builder v2.1 to v2.2

Builder no longer supports a root `test` field in `mesh.json`.
Even `"test": {}` fails validation. Remove the field; Builder does not
ignore or translate it, and `--skip-checks` does not bypass this error.

`build.json.test`, `.env.test`, Docker target `test`, and service unit
commands remain supported.

## Choose the configuration owner

- Service isolated-test env belongs in that service's `build.json.test.app.env`
  or `.env.test`.
- Service E2E app settings belong in `build.json.e2e` or `.env.e2e`.
- Global E2E topology, bindings, publication, and mesh app overrides belong
  in `mesh.json.e2e`; it inherits `mesh.json.prod`.
- Service tester env belongs in `build.json.tester.env` or the service's
  `.env.e2e-tester`.
- Global tester env belongs in root `mesh.json.tester.env` or root
  `.env.e2e-tester`.

Do not blindly move an old mesh test map into e2e: isolated service settings
and global topology settings have different owners. If it was unused,
remove it without adding a replacement.

## Commands

`builder mesh up test` still runs each root service's unit tests and service
E2E sequentially, tears each down, then runs a clean global E2E mesh.
`builder mesh up test-e2e` runs global E2E only.

`builder mesh up test-unit` was removed. For isolated tests use
`builder service up test-unit -C ./services/frontend`.
For a full independent service lifecycle use
`builder service up test -C ./services/frontend`.

## Recover resources from a previous run

Use `builder mesh down test` for the canonical pipeline after configuration
has been migrated. To recover a service's saved legacy test project directly,
use `builder service down test-unit -C ./services/frontend`.

A broken or still-unmigrated root config does not prevent cleanup of a saved
root project, but Builder cannot discover child service paths from invalid
configuration. Run service down in each affected service directory in that
case. No legacy mesh test topology is executed during recovery.
```

Include two concrete examples after “Choose the configuration owner”:

Service-owned isolated env in **frontend/build.json**, merged into its existing file:

```json
{
  "app": {},
  "test": {
    "app": {
      "env": { "LOG_LEVEL": "silent" }
    }
  }
}
```

Global E2E frontend URL in **mesh.json**, only if the value really describes that global topology:

```json
{
  "services": { "frontend": { "path": "./services/frontend" } },
  "e2e": {
    "services": {
      "frontend": {
        "env": { "FRONTEND_EXTERNAL_URL": "http://127.0.0.1:3000/web" }
      }
    }
  }
}
```

Explain that the literal URL assumes the corresponding endpoint is actually published on port 3000; it does not publish anything. For dynamic publication, use an effective endpoint `public_url` reference and an explicit mesh publish selection. Do not introduce a hardcoded URL as a new recommended universal endpoint policy.

### Documentation checks: precise, scoped, and migration-aware

Extend `tests/v2/publicDocsSemantics.test.ts` to scan active `README.md` and `docs` for obsolete affirmative claims such as:

```ts
const removedClaims: RegExp[] = [
  /remains (?:an? )?explicit[^\n]*mesh[^\n]*test[^\n]*stage/i,
  /test-unit[^\n]*explicitly exercises[^\n]*mesh[^\n]*test[^\n]*overlay/i,
  /test-unit uses mesh\/build test/i,
];
```

For exact references, scope checks to current positive sections, not migration prose. A removed command must appear in migration/error documentation, so a repository-wide forbidden substring assertion is wrong. Similarly, `mesh.json.tester` must not be mistaken for `mesh.json.test`; use exact field boundaries.

Suggested independent test for canonical public reference:

```ts
const meshDoc = fs.readFileSync("docs/reference/mesh-json.md", "utf8");
const shape = meshDoc.split("## Complete shape")[1]!.split("## Root fields")[0]!;
expect(shape).not.toMatch(/\btest\??\s*:\s*MeshStage/);
const example = meshDoc.split("## Complete example")[1]!.split("## Related")[0]!;
const jsonFence = example.match(/```json\s*\n([\s\S]*?)\n```/);
expect(jsonFence).not.toBeNull();
const config = JSON.parse(jsonFence![1]!);
expect(Object.prototype.hasOwnProperty.call(config, "test")).toBe(false);
expect(meshSchema.safeParse(config).success).toBe(true);
```

This validates shape, not full cross-project semantics of illustrative projects. Existing real example compilation tests cover runnable topology. Add a positive check that `docs/reference/build-json.md` still documents `test?: BuildStage` and the isolated runtime.

Verify every new relative link resolves locally. Do not browse or rely on a hosted docs version to validate repository-local links. Keep historical `.docs/execution_docs/01-*` and `02-*` documents outside these current-doc prose checks.

## C10 — Release record and final checks

- **Change:** Add a changeset describing removal and migration, build the package/schemas, verify executable/package behavior, and run the release checks below.
- **Why:** This is an intentional compatibility break within the requested v2.2 work: users need to see both rejected config and removed commands before upgrading.
- **Current behavior:** Package version is 2.1.0, pending changesets discuss prior execution semantics, and there is no release note for removing mesh.test. Built artifacts may still advertise old help until rebuilt.
- **Expected behavior:** Release material explicitly identifies the removed field/commands and retained standalone testing. Generated package has the updated schemas/help/guard. Use the existing changeset workflow; do not hand-edit historical changelog entries.
- **Failing-before acceptance:** A release-note check requiring the new changeset's mesh.test removal/migration text currently fails because that file does not exist. A built-CLI smoke test requiring root test rejection currently accepts the field. The latter is a behavioral regression gate; note-file presence is release acceptance, not an independent runtime defect.

Create `.changeset/remove-mesh-test-topology.md` during implementation:

```markdown
---
"@solid-stack/builder": minor
---

Remove the legacy root test field from mesh.json. Builder now rejects its
presence, including an empty object and when --skip-checks is supplied.
Mesh configuration supports dev, prod, and e2e overlays only.

Remove mesh up/down test-unit. Use service up/down test-unit for isolated
service execution/recovery. mesh up test retains the sequential standalone
service test lifecycles followed by a clean global E2E mesh.

Move service-owned isolated settings to build.json.test and global E2E
topology settings to mesh.json.e2e as appropriate. build.json.test and
service test execution remain supported. See docs/migration/v2.1-to-v2.2.md.
```

The minor label follows the requested v2.2.0 release plan and existing repository changeset convention, but the note must candidly call out removed compatibility. Let the normal release workflow calculate/version the release alongside other pending changesets. Do not run `changeset version`, publish, or change package/lockfile versions merely while implementing this plan unless release preparation is separately in scope.

### Ordered implementation verification

1. **Baseline red phase:** Install T01–T10/T14 and the docs/schema assertions. Run targeted tests and `pnpm typecheck`; confirm failures match accepted mesh.test, missing runtime stage guard, old CLI dispatch, old generated schema, old options/types and stale docs. Save results in the implementation PR description. Do not demand that preservation controls fail.
2. **Core green phase:** Apply C01–C06, migrate old tests per C07, regenerate schemas. Run targeted tests again.
3. **Docs/example phase:** Apply C08–C09 and run doc/example assertions.
4. **Repository gates:** Run the commands below once the change is coherent.

```sh
pnpm build:schemas
pnpm typecheck
pnpm test
pnpm check:v2-no-legacy
pnpm build
pnpm exec tsx scripts/prepublish-check.ts
```

`pnpm test` includes conformance under the default Vitest configuration; no need to repeat the same full suite solely under another alias after it passes. `pnpm check` is also a valid repository convention (`typecheck` plus `test:conformance`) but does not replace the full `pnpm test` run.

For Docker validation, run the existing relevant suites when Docker and required images are available:

```sh
pnpm exec vitest run --config vitest.docker.config.ts tests/docker-acceptance/06-service-runtime.test.ts tests/docker-acceptance/11-system-runtime.test.ts
```

Then run `pnpm test:docker` if required by the repository release gate. Report an unavailable Docker environment as unrun validation, not a pass. This planning task does not start containers.

Built CLI smoke tests use `node dist/bin.js` in a temporary fixture directory:

- `mesh up --help`: correct supported commands and valid service unit guidance.
- `mesh up test-unit --skip-checks --dry-run`: nonzero with removed-command message.
- For each supported mesh up command, fixture `mesh.json` with `test:{}` and `--skip-checks --dry-run`: nonzero with targeted field error before Docker interaction.
- `service up test-unit --skip-checks --dry-run` with a valid existing service fixture: still compiles test runtime. Do not accidentally use a mesh-only fixture.
- `mesh up test --skip-checks --dry-run` on a valid mesh fixture: service unit/service E2E then global E2E compilation; this can still require Docker Compose validation, so run only with prerequisites or cover the same flow with appropriately mocked unit tests.

### Final source audit

```sh
rg -n 'runMeshTestUnit|validateMeshTestStage|includeTestStage' src scripts
rg -n 'resolveMeshStage\([^\n]*"test"' src
rg -n 'mesh\.json\.test\b|mesh up test-unit|mesh down test-unit' docs README.md src
rg -n 'test\??:.*MeshStage|test: meshStageSchema' src docs .docs/specs_v2
```

The first two commands should return no production matches. The latter two require review: intentional rejection messages and migration examples are expected; positive type/schema declarations and live command examples are not. Multiline calls need a supplemental review/typecheck; do not mistake a line-based grep for complete proof.

Run `git diff --check`; inspect changed paths, generated schema diff and preserved build schema. Confirm no unrelated dependency/version changes. Confirm deleted files have no remaining imports. Confirm tests do not mock a deleted runner to make the suite appear green.

### Definition of done

- C01–C10 are implemented with their failing-before tests/acceptance checks and preserved controls.
- Active `./docs` pages and normative specs agree with CLI and generated schema.
- Strict field errors have useful context and do not print rejected configuration secrets.
- `build.test` still controls isolated unit execution and canonical mesh testing still runs each service E2E before global E2E.
- Cleanup can recover canonical projects without resolving mesh.test.
- All executed checks are reported accurately; no release is published as part of documentation planning.
