# Solid Stack Builder V2 — Master Audit and Implementation Order

## Purpose

This is the controlling implementation plan for bringing the current `@solid-stack/builder` codebase into exact conformance with the final Builder V2 architecture defined by:

1. `SPECS_V2.md` — cross-file architecture and normative behavior.
2. `BUILD_JSON_DOCS.md` — normative `build.json` field reference.
3. `MESH_JSON_DOCS.md` — normative `mesh.json` field reference.
4. `EXECUTION_MODEL.md` — runtime/execution model.

When current source code, tests, README/public docs, old implementation plans, archived V0.9 specs, or historical changesets disagree with those four sources, the four final normative documents win.

This audit is based on the uploaded codebase snapshot containing 530 tracked/non-ignored files. The codebase is already substantially V2-oriented. Do **not** rewrite working V2 subsystems merely for consistency. The implementation should preserve all already-conforming behavior and fix only the remaining conformance gaps below.

> Audit limitation: the source snapshot was statically inspected in full enough to map the implementation. A baseline Vitest run could not be executed in the analysis environment because `pnpm` is not installed and Corepack cannot download it from the network. The implementer must run the prescribed red/green commands in a normal development checkout before merging.

---

# 1. Authoritative invariants that must drive every change

These are not optional design choices.

## 1.1 Execution state

Application processes:

| Operation | Docker target | `EXEC_MODE` | `INFRA_MODE` | dotenv |
|---|---|---|---|---|
| standalone dev | `dev` | `dev` | `isolated` | `.env.dev` |
| standalone dev `--full` | `dev` | `dev` | `integrated` | `.env.dev` |
| standalone prod | `prod` | `prod` | `integrated` | `.env.prod` |
| standalone unit | `test` | `test` | `isolated` | `.env.test` |
| service E2E app | `prod` | `prod` | `integrated` | `.env.e2e` |
| mesh dev apps | `dev` | `dev` | `integrated` | each service `.env.dev` |
| mesh prod apps | `prod` | `prod` | `integrated` | each service `.env.prod` |
| global E2E apps | `prod` | `prod` | `integrated` | each service `.env.e2e` |

Tester processes:

| Tester | Effective target | `EXEC_MODE` | `INFRA_MODE` | dotenv |
|---|---|---|---|---|
| service E2E tester | `test-e2e` | `e2e` | **not present** | service `.env.e2e-tester` |
| global E2E tester | `test-e2e` or equivalent finite runner | `e2e` | **not present** | root `.env.e2e-tester` |

Never set `EXEC_MODE=e2e` on an application container.

## 1.2 Stage inheritance

Exactly:

```text
dev  = base -> dev
prod = base -> prod
test = base -> test
e2e  = base -> prod -> e2e
```

This applies independently to `build.json` and `mesh.json`.

E2E inherits the **structured `prod` layer**, but not `.env.prod`.

## 1.3 E2E app environment precedence

Service E2E, low to high:

```text
.env.e2e
-> base app.env
-> prod app.env
-> prod override-compose app environment
-> e2e app.env
-> e2e override-compose app environment
-> Builder internal base environment
-> Builder internal E2E environment
```

Global E2E adds the mesh layers after the service-owned layers:

```text
.env.e2e
-> base app.env
-> prod app.env
-> prod override-compose app environment
-> e2e app.env
-> e2e override-compose app environment
-> mesh base service env
-> mesh prod service env
-> mesh e2e service env
-> Builder internal base environment
-> Builder internal E2E environment
```

This ordering means a single final merged `app.env` map plus one override map is **not sufficient**. The compiler must preserve the ordered source layers until final runtime environment assembly.

## 1.4 Global `make test`

Exactly two phases:

```text
Phase 1
for each ROOT mesh.json.services entry, sequentially:
  service unit/isolated
  -> service E2E
  -> full teardown

Phase 2
fresh mesh: base -> prod -> e2e
  -> all apps target=prod / EXEC_MODE=prod / INFRA_MODE=integrated
  -> global tester EXEC_MODE=e2e / no INFRA_MODE
  -> full teardown
```

A service added only by `prod`, `test`, or `e2e` is not a Phase-1 member unless it also exists in root `services`.

---

# 2. Confirmed conformance gaps

The IDs below are used by the other plan files.

## G01 — Build E2E does not inherit `prod`

### Current code

`src/core/config/resolveBuildStage.ts`, current lines 9–21:

```ts
const overlay = build[stage] ?? {};
...
const effective = {
  ...build,
  app: {
    env: mergeStringMap(build.app.env, overlay.app?.env),
    endpoints: appEndpoints,
  },
  ...
  overrideCompose: overlay["override-compose"],
};
```

For `stage === "e2e"`, only `build.e2e` is used. `build.prod` is omitted.

### Why it violates V2

E2E structured configuration is `base -> prod -> e2e`.

### Tests currently encoding the wrong behavior

Replace, do not preserve:

- `tests/conformance/03-stages.test.ts` `STG-020`.
- `tests/conformance/06-service.test.ts` `SVC-025`.
- `tests/v2/compileServiceComposition.test.ts` E2E test.

### Required result

`resolveBuildStage(build, "e2e", ...)` must include all inherited `prod` app endpoints, app env, dependency additions/overlays, dependency lifecycle additions, and `prod` override Compose before applying `e2e`.

---

## G02 — Mesh E2E does not inherit `prod`

### Current code

`src/core/config/resolveMeshStage.ts`, current lines 7–14:

```ts
const overlays = mesh[stage]?.services ?? {};
const names = new Set([...Object.keys(mesh.services), ...Object.keys(overlays)]);
```

Only the active stage is merged.

### Why it violates V2

Global E2E mesh configuration is `base -> prod -> e2e`.

### Tests currently encoding or failing to expose the wrong behavior

Replace/extend:

- `tests/conformance/03-stages.test.ts` `STG-021`.
- `tests/conformance/09-mesh-env.test.ts` `MEN-023`.
- global E2E stage-only service/binding/publication tests.

### Required result

E2E must inherit `mesh.prod.services.*` before `mesh.e2e.services.*`, including:

- service additions;
- path overrides;
- mesh env;
- dependency-provider bindings;
- `dependsOn` union additions;
- `publish` union additions.

---

## G03 — E2E application receives `EXEC_MODE=e2e`

### Current code

`src/core/composition/compileServiceComposition.ts`, current line 31:

```ts
case "e2e":
  return {
    configStage: "e2e",
    appTarget: "prod",
    runtimeStage: "e2e",
    integrated: true,
    attachTester: true,
    testerTarget: "test-e2e",
  };
```

Later:

```ts
const internal = {
  EXEC_MODE: profile.runtimeStage,
  INFRA_MODE: profile.integrated ? "integrated" : "isolated",
  ...
};
```

### Why it violates V2

`e2e` is tester-only. E2E applications execute as production applications:

```text
target=prod
EXEC_MODE=prod
INFRA_MODE=integrated
```

The app still uses `.env.e2e` and the `base -> prod -> e2e` structured configuration.

### Tests currently asserting the wrong value

Update all of the following:

- `tests/conformance/03-stages.test.ts` `STG-018`.
- `tests/conformance/05-lifecycle.test.ts` E2E app assertion.
- `tests/conformance/06-service.test.ts` `SVC-005`.
- `tests/conformance/09-mesh-env.test.ts` E2E assertions including `MEN-028`.
- `tests/v2/compileServiceComposition.test.ts`.
- `tests/compileEnvironment.test.ts`.
- `tests/docker-acceptance/env-roundtrip.test.ts`.
- any real Docker system fixture expecting `EXEC_MODE=e2e` in app logs/env.

---

## G04 — Current effective configuration cannot represent exact E2E env/override ordering

### Current code

`EffectiveBuildConfig` contains only:

```ts
app: { env: Record<string, string>; ... };
overrideCompose?: string;
```

`CompiledServiceComposition` contains only:

```ts
buildJsonAppEnvironment?: Record<string, string>;
overrideComposeAppEnvironment?: ComposeEnvironmentMap;
```

`compileServiceComposition()` therefore has one final JSON app env and at most one override Compose environment.

### Why it violates V2

The required E2E sequence interleaves two different source kinds:

```text
prod app.env
-> prod override environment
-> e2e app.env
-> e2e override environment
```

If `prod` and `e2e` app env are collapsed before override application, a `prod` override can incorrectly beat an `e2e` JSON value.

### Required result

Preserve ordered build layers through compilation. The concrete design is specified in `01_STAGE_INHERITANCE_AND_ENVIRONMENT_COMPILATION_PLAN.md`.

---

## G05 — Stage overlays can replace an inherited dependency `compose`

### Current code

`src/core/config/resolveBuildStage.ts`, current lines 15–19:

```ts
const prior = dependencies[name] ?? ...;
prior.compose = patch.compose ?? prior.compose;
```

### Why it violates V2

A dependency has exactly one local/default Compose implementation once introduced. A stage may define `compose` only when adding a dependency that does not exist in inherited configuration.

### Test currently asserting the wrong behavior

`tests/conformance/03-stages.test.ts` `STG-009` currently expects E2E to replace the base bundle. Replace this test with rejection coverage.

### Required result

Reject:

- base dependency -> dev/prod/test/e2e `compose` replacement;
- dependency introduced in `prod` -> `e2e` `compose` replacement.

Allow:

- stage-only dependency absent from inherited configuration, provided that its effective definition resolves a valid `compose`.

---

## G06 — Canonical mesh `test` runs only unit/isolated service tests in Phase 1

### Current code

`src/core/mesh/runners/runMeshTest.ts` calls:

```ts
const unitStatus = await runMeshTestUnit(options);
...
return runMeshTestE2e(options);
```

`runMeshTestUnit.ts` compiles only the service `test` target for each effective mesh-test service.

### Why it violates V2

Global Phase 1 must run the semantic equivalent of **each root service's complete `make test`**, meaning:

```text
service unit
-> service E2E
-> teardown
```

Then and only then may global E2E begin.

The current implementation also bases Phase 1 on the effective mesh `test` stage, so a stage-only test service can incorrectly participate.

### Required result

Create a separate canonical Phase-1 runner that iterates root `mesh.json.services` only and invokes the standalone `runTest()` lifecycle sequentially.

`runMeshTestUnit()` remains available for explicit `builder mesh up test-unit` / mesh test-stage tooling; it is no longer canonical global Phase 1.

---

## G07 — Service E2E tester misses mandatory tester execution environment

### Current code

`compileServiceComposition()` currently creates:

```ts
compose.services.tester = {
  build: { context: ".", target: "test-e2e" },
  network_mode: "host",
  environment: testerEnv,
  depends_on: { app: { condition: "service_healthy" } },
};
```

### Missing V2 behavior

- no `.env.e2e-tester` `env_file`;
- no Builder-owned `EXEC_MODE=e2e`;
- no explicit protection against a user-provided `INFRA_MODE` reaching the tester;
- no Builder-owned tester-env conflict validation for dotenv/tester maps.

### Required result

Service tester:

```text
target=test-e2e
network_mode=host
env_file=.env.e2e-tester
EXEC_MODE=e2e
INFRA_MODE absent
public endpoint references only
app readiness = service_healthy
exit code is service-E2E result
```

---

## G08 — Global tester is incomplete and prunes valid helper services

### Current code

`src/core/mesh/v2/compileMeshTester.ts`:

- computes a service-reference closure from only the selected runner;
- discards unreferenced helper services;
- does not inject root `.env.e2e-tester`;
- does not inject `EXEC_MODE=e2e`;
- does not protect against `INFRA_MODE` reaching the selected tester;
- preserves a build implementation but does not ensure a build-backed runner uses `target: test-e2e`;
- rejects host networking on helper services although the final V2 tester contract does not impose that restriction.

### Why it violates V2

The tester Compose file owns the tester implementation **including helper services**. The final specification's example explicitly permits a helper (`setup`) alongside the selected runner. The entire tester implementation must be materialized, while only `tester.service` is the exit-code source and only that runner is forced to the Builder host-networked black-box semantics.

### Required result

- materialize the complete tester Compose implementation;
- namespace all tester-owned services/resources consistently;
- selected runner only is exit-code source;
- selected runner receives `.env.e2e-tester`, `tester.env`, `EXEC_MODE=e2e`, and no `INFRA_MODE`;
- selected runner is host-networked;
- selected build-backed runner has effective `target: test-e2e` while preserving build context/dockerfile/args/secrets;
- helper services remain present and keep their own implementation behavior unless it conflicts with general Compose/reference validation.

---

## G09 — `mesh.json.services` does not enforce the normative root minimum

### Current code

`src/core/mesh/meshSchema.ts`:

```ts
services: z.record(serviceNameSchema, meshServiceSchema)
```

`resolveMeshStage()` checks only whether the **effective** service set is nonempty.

### Why it violates V2

The field reference requires at least one **root** service. A document with root `services: {}` and only a stage-added service must fail schema validation rather than become valid for that stage.

### Required result

Runtime Zod and generated JSON Schema must enforce root `services` `minProperties: 1`. Stage `services` maps remain optional and may be empty.

---

## G10 — Dockerfile policy does not completely enforce the foreground runtime contract

### Current code

`templates/policy/dockerfile/dockerfile.rego`:

- requires a `dev` CMD;
- validates dev/prod healthchecks;
- checks `CMD` text for known daemonization patterns;
- does **not** require an effective prod runtime instruction;
- does not inspect `ENTRYPOINT` for foreground/daemonization rules.

### Why it is incomplete

V2 requires:

- `dev` foreground default command;
- `prod` foreground runtime;
- `test` and `test-e2e` finite runner targets;
- app runtime stages not to daemonize/background the main process.

### Required result

Add effective runtime-instruction detection for `prod`, include `ENTRYPOINT` in foreground/daemonization checks, and retain the existing explicit `dev` default-command rule. Do **not** invent a new schema/policy requirement that `test` and `test-e2e` must contain their own literal Dockerfile `CMD`/`ENTRYPOINT`; the normative contract requires those targets to behave as finite runners, and they may inherit runtime metadata from a base image that static Dockerfile policy cannot fully inspect. Verify representative `test` and `test-e2e` finiteness with real Docker acceptance tests instead.

Static policy cannot mathematically prove that an arbitrary test command eventually exits; real Docker acceptance tests must verify representative finite test targets. Do not invent heuristics such as banning servers by process name beyond existing obvious daemonization patterns.

---

## G11 — Some fail-fast errors lose normative diagnostic context

### Current examples

`src/core/config/references.ts` creates errors such as:

```ts
new ConfigError({
  configPath: sourcePath,
  value: raw,
  reason: `Invalid ${scope} endpoint reference`,
});
```

No `sourceFile`, `stage`, or `composition` is carried through.

Several low-level host-port and Compose-merge errors similarly use generic source data.

### Why it matters

V2 says errors should identify source file, logical path, offending value/reference, active composition, and reason where applicable.

### Required result

Thread an explicit diagnostic context through reference parsing/interpolation and port allocation. Do not change the error class API unnecessarily; use the existing `ConfigErrorContext` fields consistently.

---

## G12 — Public documentation and several tests still describe the superseded execution model

Known contradictory public docs include:

- `README.md` — says E2E does not inherit `prod` and describes mesh test as unit-only Phase 1.
- `docs/reference/stage-matrix.md` — lists E2E app `EXEC_MODE=e2e`.
- `docs/reference/environment-precedence.md` — says prod JSON/mesh layers do not enter E2E.
- `docs/concepts/testing-model.md` — says mesh full test does not run per-service E2E.
- `docs/concepts/stages.md` — says E2E excludes `prod.app.env` and `mesh.prod`.
- `docs/guides/configure-service-e2e.md`.
- `docs/guides/configure-global-mesh-e2e.md`.
- `docs/troubleshooting/tests-and-testers.md`.
- `docs/reference/build-json.md` and `docs/reference/mesh-json.md` where they repeat the old inheritance statement.

The current final normative files in `.docs/specs_v2/` should remain authoritative. Historical V0.9 material under `.docs/specs_v2/specs_v0.9/` and superseded execution-plan documents must not be edited to pretend they were historically different; instead mark their directory/readme as superseded if it is not already clearly labeled.

---

# 3. Comprehensive specification audit matrix

Legend:

- **KEEP** — current implementation is materially conforming; do not rewrite.
- **FIX** — confirmed gap above.
- **VERIFY** — behavior exists and must be protected by regression tests while adjacent code changes are made.

## 3.1 `SPECS_V2.md` sections 1–33

| Spec section | Status | Current implementation / required action |
|---|---|---|
| 1 Purpose and ownership | KEEP | `buildSchema.ts`, `meshSchema.ts`, composition split are V2-shaped; mesh service `env` exists as intended. |
| 2.1 Runtime variables | **FIX G03/G07/G08** | App E2E `EXEC_MODE` wrong; testers missing owned execution env. |
| 2.2 Standalone matrix | **FIX G03/G07** | dev/dev-full/prod/test are correct; service E2E app/tester values need correction. |
| 2.3 Mesh matrix | **FIX G03/G08** | dev/prod integrated semantics are present; global E2E app/tester values need correction. |
| 2.4 E2E inheritance | **FIX G01/G02/G04** | Current resolvers use active stage only. |
| 2.5 Global `make test` | **FIX G06** | Current Phase 1 is unit-only mesh test stage. |
| 3 Service independence | KEEP | mesh loads each service's own `build.json`; no Git-layout requirement in runtime. |
| 4 Fail-fast contract | VERIFY + **G11** | Most validations exist; improve diagnostic context. |
| 5 Identifiers | KEEP | identifier schemas/constants match; reserved mesh service names enforced. |
| 6 Composition modules | KEEP | app/dependency/tester model; no sidecar schema role. |
| 7 Endpoint model | KEEP | app/dependency endpoint shapes, ports, primary and scheme implemented. |
| 8 Endpoint properties | KEEP | `endpointProperties.ts` implements all 8 properties and scheme/publication requirements. |
| 9 Publication | KEEP | standalone auto-publishes `publicPort`; mesh requires `publish`; substitution prevents local dep publication. |
| 10 Builder references | KEEP + **G11** | syntax/resolution implemented; retain semantics while improving context. |
| 11 Environment model | **FIX G04/G07/G08** | string maps and mesh env exist; E2E interleaving/tester layers incomplete. |
| 12 Stage overlay semantics | **FIX G01/G02/G05** | ordinary merge/union behavior exists; E2E chain and immutable dep compose are wrong. |
| 13 `build.json` | KEEP | strict V2 shape. |
| 14 Dockerfile contract | **FIX G10** | targets/healthcheck/EXPOSE/artifact checks exist; runtime instruction enforcement incomplete. |
| 15 Dependency model | KEEP | no dependency-level service; no third-party/fellow-service type split. |
| 16 Dependency materialization | KEEP | inert deps omitted; local bundles atomic; substituted bundles suppressed. |
| 17 Dependency Compose contract | KEEP | raw ports, host mode, privileged, container name, root bind forbidden; resources namespaced/rewritten. |
| 18 Dependency Compose across stages | **FIX G05** | current scalar replacement is contrary to final V2. |
| 19 Dependency readiness | KEEP | endpoint owners validated and health-gated. |
| 20 Lifecycle | KEEP | automatic app/local dependency, dependency `dependsOn`, mesh explicit/binding lifecycle use `service_healthy`. |
| 21 Project stage override Compose | **FIX G04** | restrictions mostly enforced; two inherited E2E override files cannot currently participate in required order. |
| 22 Service-level E2E tester | **FIX G03/G07** | host tester exists but runtime/env-file contract is incomplete. |
| 23 `mesh.json` | **FIX G09** | shape correct; root minimum missing. |
| 24 Mesh substitution | KEEP | binding suppresses local dep and transfers lifecycle. |
| 25 Reference-driven provider compatibility | KEEP | provider compatibility is checked when consumed properties resolve; no port equality requirement. |
| 26 Mesh stages | **FIX G02/G03** | dev/prod correct; E2E chain/runtime wrong; `test` tooling exists. |
| 27 Mesh publication/AUTO ports | KEEP | deterministic service/app/dependency ordering and cache are implemented. |
| 28 Global mesh tester | **FIX G08** | runner exists/public-only refs; helper/env/target semantics incomplete. |
| 29 Global test isolation | **FIX G06** | finite runners tear down, but canonical Phase 1 topology is wrong. |
| 30 Host-port conflicts | KEEP | fixed collisions fail and identify both logical owners; runtime collision check exists. |
| 31 Secrets | KEEP | no first-class Builder `secrets`; strict schemas reject it. |
| 32 Removed V1/V1.2 fields | KEEP | strict schemas and `check:v2-no-legacy` protect removal. |
| 33 Canonical E2E model | **FIX G01/G02/G03/G04/G07/G08** | central set of remaining execution mismatches. |

## 3.2 `build.json` complete field audit

| Field / rule | Status | Notes |
|---|---|---|
| `$schema` optional | KEEP | Accepted; no runtime behavior. |
| `name` optional | KEEP | Used for standalone project identity; mesh key is authoritative in mesh compile. |
| `dockerfile` optional/default `Dockerfile` | KEEP | `resolveApplicationDockerfile()` uses default and path safety. |
| required targets dev/test/test-e2e/prod | KEEP + G10 | Rego requires aliases. Runtime instruction checks need strengthening. |
| no Dockerfile `EXPOSE` | KEEP | Rego denies globally. |
| `app` required | KEEP | Zod required. |
| `app.env` strict string map | KEEP | Zod string map. |
| app env Builder refs | KEEP | Build app/dependency endpoint refs implemented. |
| app env does not become build args | KEEP | Only override Compose `build.args` drives build args. |
| complete app env precedence | **FIX G04** | Exact E2E interleaving missing. |
| Builder-owned app keys fail | VERIFY | app JSON/dotenv/mesh/override checks exist; refactor into layer-aware validation. |
| `app.endpoints` identifier grammar | KEEP | Zod record key schema. |
| endpoint port 1..65535 | KEEP | schema + effective validation. |
| `publicPort` number/AUTO/omitted semantics | KEEP | standalone/mesh behavior implemented. |
| exactly one primary if nonempty | KEEP | `assertPrimaryEndpointInvariant`. |
| app primary -> Builder-owned `PORT` | KEEP | compiler injects. |
| scheme grammar / URL requirement | KEEP | schema + endpoint resolver. |
| dependencies logical-slot model | KEEP | V2 shape. |
| base dependency `compose` required | KEEP | schema. |
| stage-added dependency `compose` required effectively | KEEP | resolver checks effective dep. |
| inherited dependency compose immutable | **FIX G05** | currently replaceable. |
| dependency Compose path safety | KEEP | `resolveInsideProject`. |
| dependency Compose restrictions | KEEP | dedicated validator. |
| dependency env string map | KEEP | schema. |
| dependency env applies to all bundle services | KEEP | compiler overlays all materialized bundle services. |
| dependency env Builder refs | KEEP | standalone and mesh deferred resolution implemented. |
| dependency endpoint service explicit | KEEP | schema/effective validation; no guessing. |
| endpoint owner exists + healthcheck | KEEP | dependency validator. |
| dependency primary invariant | KEEP | resolver. |
| dependency `dependsOn` syntax | KEEP | qualified regex. |
| dependency `dependsOn` unknown/inert/self/cycle errors | KEEP | resolver/lifecycle graph. |
| dependency `dependsOn` union merge | KEEP once G01 | current active-stage union works; must run through prod then e2e. |
| service `tester.env` | **FIX G07** | field accepted/references validated but missing env-file/internal runtime layers. |
| tester public-only endpoint refs | KEEP | `assertTesterReferencesArePublic`. |
| tester no `INFRA_MODE` | **FIX G07** | currently user layers can supply it. |
| dev overlay | KEEP | base -> dev behavior works. |
| prod overlay | KEEP | base -> prod behavior works. |
| test overlay | KEEP | base -> test and isolated materialization behavior works. |
| e2e overlay | **FIX G01/G03/G04** | inheritance/runtime/order wrong. |
| stage app deep merge | KEEP once chain fixed | current endpoint/env merge semantics are suitable. |
| stage dependency overlay | **FIX G05** | env/endpoints/dependsOn correct; compose mutability wrong. |
| override Compose restrictions | KEEP | current validator enforces endpoint/lifecycle/target/health/env ownership. |
| prod override -> e2e override order | **FIX G04** | only one override currently retained. |
| removed V1 fields rejected | KEEP | strict schemas. |

## 3.3 `mesh.json` complete field audit

| Field / rule | Status | Notes |
|---|---|---|
| `$schema` optional | KEEP | accepted. |
| `name` optional | KEEP | used for mesh identity. |
| `services` required | KEEP | Zod required. |
| at least one root service | **FIX G09** | effective minimum only; schema needs root minimum. |
| service key grammar/reserved names | KEEP | runtime + schema/generated schema. |
| `services.<name>.path` | KEEP | root required, stage overlay optional, path safety/load checks. |
| stage may override path | KEEP once G02 | current active stage can; E2E must inherit prod first. |
| stage-added service requires path | KEEP | effective resolver checks. |
| service dependency binding map | KEEP | validates consumer slot/provider. |
| substitution suppresses local bundle | KEEP | compiler suppress set. |
| provider compatibility by consumed properties | KEEP | deferred build-reference resolution against provider. |
| mesh explicit `dependsOn` | KEEP | cycle/unknown/self checks. |
| binding auto-lifecycle | KEEP | lifecycle edges include bindings. |
| `publish` syntax/app/local-dep forms | KEEP | publication resolver. |
| build owns publication capability | KEEP | missing `publicPort` fails. |
| substituted local dep cannot publish | KEEP | explicit failure. |
| mesh private by default | KEEP | no allocation without publish. |
| `services.<name>.env` | KEEP | current schema/compiler supports composition overrides. |
| stage service env keywise merge | **FIX G02** | active stage works; E2E must include prod. |
| complete app env precedence | **FIX G04** | build-layer ordering and prod mesh inheritance missing. |
| root tester shape | KEEP | strict compose/service/env only. |
| global tester required only when global E2E requested | KEEP | runner/check options implement this. |
| tester Compose helper services | **FIX G08** | current closure prunes valid helpers. |
| selected tester target/equivalent | **FIX G08** | build-backed target not enforced. |
| selected tester `EXEC_MODE=e2e` | **FIX G08** | absent. |
| selected tester no `INFRA_MODE` | **FIX G08** | not protected. |
| root `.env.e2e-tester` | **FIX G08** | absent. |
| global tester public-only refs | KEEP | validation exists. |
| dev = base -> dev | KEEP | resolver active-stage behavior correct. |
| prod = base -> prod | KEEP | resolver active-stage behavior correct. |
| e2e = base -> prod -> e2e | **FIX G02** | prod omitted. |
| test stage namespace | KEEP | explicit `test-unit` tooling exists. |
| stage dependencies map keywise override | KEEP once G02 | resolver logic suitable. |
| stage `dependsOn` stable union | KEEP once G02 | resolver logic suitable. |
| stage `publish` stable union | KEEP once G02 | resolver logic suitable. |
| direct mesh refs no `services.` prefix | KEEP | parser grammar correct. |
| public/network property rules | KEEP | resolver correct. |
| deterministic AUTO allocation | KEEP | mesh compiler constructs required deterministic order. |
| global Phase 1 root services/full service tests | **FIX G06** | current unit-only effective test-stage pass. |
| global Phase 2 clean base->prod->e2e | **FIX G02/G06** | cleanup exists; stage inheritance wrong. |
| removed mesh V1 fields rejected | KEEP | strict schema. |

---

# 4. Implementation plan files and ownership

Implement in this exact order.

## Plan 01 — stage inheritance and environment compilation

File: `01_STAGE_INHERITANCE_AND_ENVIRONMENT_COMPILATION_PLAN.md`

Fixes:

- G01 build E2E inheritance;
- G02 mesh E2E inheritance;
- G03 E2E app execution mode;
- G04 ordered app environment / override composition;
- G05 dependency Compose immutability;
- G09 root mesh service minimum.

Do this first because every E2E/tester/global-system behavior depends on the correct effective composition.

## Plan 02 — test orchestration and testers

File: `02_TEST_PIPELINE_AND_TESTER_RUNTIME_PLAN.md`

Fixes:

- G06 canonical global two-phase test;
- G07 service tester runtime/env;
- G08 global tester implementation/env/helpers/target;
- no-state-leak assertions.

Do this only after Plan 01 is green.

## Plan 03 — validation, diagnostics, docs, and release gates

File: `03_VALIDATION_DIAGNOSTICS_DOCS_AND_RELEASE_PLAN.md`

Fixes:

- G10 Dockerfile runtime policy;
- G11 diagnostics;
- G12 public documentation and stale test descriptions;
- generated schema/test snapshots;
- changeset and release gates.

---

# 5. Files to add / edit / remove

## Add

At minimum:

```text
src/core/config/builderEnvironment.ts
src/core/mesh/runners/runMeshServiceTests.ts
.changeset/fix-final-v2-execution-semantics.md
```

A separate stage-chain source file is **not** required; add the stage-chain helper to `src/core/config/stageMerge.ts` so build and mesh resolution share one canonical function.

## Edit — core config/composition

```text
src/core/config/stageMerge.ts
src/core/config/types.ts
src/core/config/resolveBuildStage.ts
src/core/config/resolveMeshStage.ts
src/core/config/references.ts
src/core/config/hostPorts.ts                  # diagnostic-context refinement
src/core/composition/types.ts
src/core/composition/compileServiceComposition.ts
src/core/mesh/meshSchema.ts
src/core/mesh/v2/compileMeshComposition.ts
src/core/mesh/v2/compileMeshTester.ts
src/core/mesh/runners/runMeshTest.ts
src/core/mesh/runners/runMeshTestUnit.ts      # adapt to new env-layer output; not canonical phase 1
src/core/mesh/checkers/checkMeshServices.ts   # adapt to new env-layer output
scripts/generate-schemas.ts
schemas/mesh-schema.json                      # regenerated, never hand-maintain alone
```

## Edit — policy

```text
templates/policy/dockerfile/dockerfile.rego
```

## Edit — tests

Expected direct-touch set:

```text
tests/v2/stageResolution.test.ts
tests/v2/compileServiceComposition.test.ts
tests/v2/serviceE2e.test.ts
tests/v2/meshTester.test.ts
tests/v2/meshRunners.test.ts
tests/v2/generatedSchemas.test.ts

tests/compileEnvironment.test.ts

tests/conformance/01-config.test.ts
tests/conformance/03-stages.test.ts
tests/conformance/05-lifecycle.test.ts
tests/conformance/06-service.test.ts
tests/conformance/09-mesh-env.test.ts
tests/conformance/10-global-tester.test.ts
tests/conformance/11-system-orchestration.test.ts
tests/conformance/11-system.test.ts

tests/docker-acceptance/env-roundtrip.test.ts
tests/docker-acceptance/dockerfilePolicy.test.ts
tests/docker-acceptance/stage-policy.test.ts
tests/docker-acceptance/11-system-runtime.test.ts
```

Also run `rg 'EXEC_MODE.*e2e|excludes prod|does not inherit prod|unit.*global E2E' tests` and update every additional hit that asserts the old architecture.

## Edit — public docs

At minimum:

```text
README.md
docs/reference/stage-matrix.md
docs/reference/environment-precedence.md
docs/reference/build-json.md
docs/reference/mesh-json.md
docs/concepts/stages.md
docs/concepts/testing-model.md
docs/guides/configure-service-e2e.md
docs/guides/configure-global-mesh-e2e.md
docs/troubleshooting/tests-and-testers.md
```

## Remove

No production source file needs to be removed.

Do **not** remove `runMeshTestUnit.ts`; it remains useful for the explicit `mesh up test-unit` operation.

Do not delete historical V0.9 specs. They are historical artifacts, not the current normative contract.

---

# 6. Mandatory test-first rule for every confirmed gap

For each gap in Plans 01–03:

1. Add or rewrite the specified regression test **before** editing production code.
2. Run the narrow test file.
3. Confirm the new test fails for the exact architectural reason described.
4. If it unexpectedly passes, stop that individual fix and inspect whether the snapshot has diverged; do not make a speculative production change.
5. Apply the implementation.
6. Run the narrow test again; it must pass.
7. Run the adjacent conformance catalog.
8. Only after the plan group is green, proceed to the next group.

This avoids “fixing” behavior that is already correct and protects the many V2 features that are already implemented.

---

# 7. Final acceptance gates

Run from a real checkout with Docker and the package-manager version declared by the project:

```bash
corepack enable
pnpm install --frozen-lockfile

pnpm check:v2-no-legacy
pnpm typecheck
pnpm test:conformance
pnpm test
pnpm build
pnpm test:docker
pnpm check:full
```

Then run these source/doc contradiction searches; every hit must be intentionally tester-only, historical, or explanatory:

```bash
rg -n 'EXEC_MODE.?[:=].?e2e' src tests docs README.md
rg -n 'does not inherit.*prod|excludes prod|prod.*not.*E2E' docs README.md tests
rg -n 'mesh.*test.*unit.*global E2E|does not run each service.*E2E' docs README.md tests
rg -n 'replaces dependency Compose|compose replacement' docs README.md tests src
```

Expected allowed `EXEC_MODE=e2e` hits after the migration:

- service E2E tester assertions;
- global E2E tester assertions;
- normative documentation describing testers;
- historical archived documents clearly marked superseded.

No application-container assertion may expect `EXEC_MODE=e2e`.

---

# 8. Definition of done

Builder V2 is done only when all of the following are true simultaneously:

- `resolveBuildStage(..., "e2e")` is exactly base -> prod -> e2e;
- `resolveMeshStage(..., "e2e")` is exactly base -> prod -> e2e;
- E2E applications use `prod` target + `EXEC_MODE=prod` + `INFRA_MODE=integrated` + `.env.e2e`;
- both prod and e2e override Compose layers participate in order;
- E2E environment precedence matches the normative source-by-source ordering, not merely the same final value in one happy-path test;
- inherited dependency Compose implementations cannot be replaced by a stage;
- service E2E tester uses `.env.e2e-tester`, `EXEC_MODE=e2e`, and no `INFRA_MODE`;
- global tester uses root `.env.e2e-tester`, `EXEC_MODE=e2e`, no `INFRA_MODE`, public endpoints only, and preserves its helper services;
- canonical mesh `test` runs root service A unit -> A E2E -> teardown, then root service B unit -> B E2E -> teardown, etc., then a clean global E2E;
- root `mesh.json.services` cannot be empty;
- Dockerfile policy enforces a foreground production runtime and examines both CMD and ENTRYPOINT for known daemonization;
- public docs no longer teach the superseded execution model;
- all conformance and real-Docker acceptance gates pass.
