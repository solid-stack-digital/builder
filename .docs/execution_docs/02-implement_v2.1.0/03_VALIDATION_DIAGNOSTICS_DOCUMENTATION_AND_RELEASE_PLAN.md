# Builder V2 Implementation Plan 03 — Validation, Diagnostics, Documentation, and Release Closure

## 0. Purpose

Plans 01 and 02 correct the execution model, stage inheritance, environment ordering, dependency-compose immutability, tester runtime, and canonical global test pipeline. This plan closes the remaining conformance gaps that are easier to miss because they live at the boundary between schema validation, Dockerfile policy, error reporting, generated artifacts, public documentation, and release gates.

The goal is not to rewrite already-correct V2 machinery. Preserve existing implementations for path safety, dependency namespacing, dependency Compose safety, endpoint publication, AUTO ports, provider substitution, lifecycle health gating, and legacy-field rejection unless a regression test proves a separate defect.

This plan covers:

1. root `mesh.json.services` minimum cardinality in both runtime and generated JSON Schema;
2. stricter Dockerfile runtime-contract checks for `dev`, `prod`, `test`, and `test-e2e`;
3. reference/configuration diagnostics that carry source/stage/composition context;
4. removal of contradictory tests and public docs that still describe superseded V2 behavior;
5. generated-schema regeneration and release verification;
6. a final spec-by-spec acceptance sweep.

---

# 1. Files to change

## Add

- `tests/v2/meshRootValidation.test.ts`
- `tests/v2/referenceDiagnostics.test.ts`
- `tests/v2/publicDocsSemantics.test.ts` **or** `scripts/check-doc-semantics.ts` if the project prefers script-based documentation guards

## Edit

- `src/core/mesh/meshSchema.ts`
- `scripts/generate-schemas.ts`
- `schemas/mesh-schema.json` via generator, never by hand
- `templates/policy/dockerfile/dockerfile.rego`
- `tests/docker-acceptance/dockerfilePolicy.test.ts`
- `src/core/config/references.ts`
- `src/core/composition/compileServiceComposition.ts`
- `src/core/mesh/v2/meshReferences.ts`
- any other caller of `collectBuilderReferences`, `interpolateBuilderReferences`, or `assertTesterReferencesArePublic`
- `README.md`
- `docs/concepts/stages.md`
- `docs/concepts/testing-model.md`
- `docs/concepts/environment.md`
- `docs/guides/configure-service-e2e.md`
- `docs/guides/configure-global-mesh-e2e.md`
- `docs/guides/use-stage-only-services-and-dependencies.md`
- `docs/reference/build-json.md`
- `docs/reference/mesh-json.md`
- `docs/reference/stage-matrix.md`
- `docs/reference/environment-precedence.md`
- `docs/reference/dockerfile-contract.md`
- `docs/reference/cli.md`
- `docs/troubleshooting/tests-and-testers.md`
- `docs/troubleshooting/references-and-environment.md`
- any additional public `docs/**` file found by the semantic grep in Section 8
- `.docs/specs_v2/SPECS_V2.md`, `.docs/specs_v2/BUILD_JSON_DOCS.md`, `.docs/specs_v2/MESH_JSON_DOCS.md`, and `.docs/EXECUTION_MODEL.md` **only if** the uploaded normative versions are newer than the repository copies and the repository is intended to carry those final specs verbatim

## Do not rewrite as implementation truth

Historical files under paths such as:

```text
.docs/specs_v2/specs_v0.9/
.docs/specs_v2/execution_docs/audits/
.docs/specs_v2/execution_docs/bug-audits/
.docs/specs_v2/execution_docs/*old implementation plans*
```

are historical artifacts. Do not mass-edit their original content to pretend they always matched the final architecture. If they are likely to be discovered by agents/developers, add a short banner at the top saying they are historical/superseded and link to the final specs.

---

# 2. Enforce at least one root mesh service

## 2.1 Current bug

The final V2 mesh contract requires `services` and requires at least one **root** service. Current `meshSchema` accepts an empty root `services: {}` and `resolveMeshStage()` only rejects an empty **effective** composition. That means a file whose root is empty but whose active stage adds a service can pass runtime resolution, which violates the root contract and also breaks canonical global Phase-1 semantics because Phase 1 is defined over root services.

## 2.2 Edit `src/core/mesh/meshSchema.ts`

Locate:

```ts
services: z.record(serviceNameSchema, meshServiceSchema),
```

Replace with a schema that requires at least one own key. If the installed Zod version supports `.refine()` reliably:

```ts
const rootServicesSchema = z
  .record(serviceNameSchema, meshServiceSchema)
  .refine(
    services => Object.keys(services).length > 0,
    "mesh.json services must contain at least one root service",
  );
```

Then:

```ts
services: rootServicesSchema,
```

Do **not** apply this minimum to stage overlays. This remains valid:

```json
{
  "services": {
    "api": { "path": "./api" }
  },
  "e2e": {
    "services": {}
  }
}
```

Stage `services` maps are optional and may be empty.

## 2.3 Keep a defensive resolver check

Even after schema validation, keep a defensive assertion in `resolveMeshStage()` that `raw.services` has at least one root entry. Do not rely only on Zod because some internal tests/helpers may pass typed objects directly.

Use:

```ts
if (Object.keys(mesh.services).length === 0) {
  throw new ConfigError({
    sourceFile: meshJsonPath,
    configPath: "services",
    stage,
    composition: "mesh",
    reason: "mesh.json must declare at least one root service",
  });
}
```

This check should occur before stage overlays are merged.

## 2.4 Update generated schema

`zod-to-json-schema` may or may not serialize the refinement. Make the generated contract explicit in `scripts/generate-schemas.ts`.

After:

```ts
const root = (meshJsonSchema as any).definitions.MeshJsonV2;
```

add:

```ts
root.properties.services.minProperties = 1;
```

Do not set `minProperties` on `dev/prod/test/e2e.services`.

Then regenerate:

```bash
pnpm build:schemas
```

Verify `schemas/mesh-schema.json` contains:

```json
"services": {
  "type": "object",
  "minProperties": 1,
  ...
}
```

## 2.5 Tests

Add `tests/v2/meshRootValidation.test.ts`:

```ts
it("rejects an empty root services map", () => {
  expect(meshSchema.safeParse({ services: {} }).success).toBe(false);
});

it("rejects empty root services even when a stage adds a service", () => {
  expect(
    meshSchema.safeParse({
      services: {},
      e2e: {
        services: {
          fixture: { path: "./fixture" },
        },
      },
    }).success,
  ).toBe(false);
});

it("allows an empty stage services overlay when root services exist", () => {
  expect(
    meshSchema.safeParse({
      services: { api: { path: "./api" } },
      e2e: { services: {} },
    }).success,
  ).toBe(true);
});
```

Add generated-schema assertion if schema snapshots are tested:

```ts
expect(schema.definitions.MeshJsonV2.properties.services.minProperties).toBe(1);
```

---

# 3. Complete the Dockerfile runtime contract policy

## 3.1 Current state

The current Rego policy correctly handles several V2 requirements:

- required aliases `dev`, `test`, `test-e2e`, `prod`;
- no hardcoded `EXPOSE`;
- effective healthcheck required for `dev` and `prod`;
- finite test stages may inherit and then disable healthchecks;
- prod artifact isolation through `COPY --from=`;
- foreground-pattern checks on `CMD`.

Keep those rules.

## 3.2 Remaining gap

The final contract also requires:

- `dev` has a foreground default command;
- `prod` has a foreground runtime;
- runtime stages must not daemonize/background the main process;
- `test` is a finite runner;
- `test-e2e` is a finite runner.

Current policy only establishes a default `CMD` for `dev` and scans `CMD`, not `ENTRYPOINT`, for obvious daemonization. It does not require an effective runtime instruction for `prod`, `test`, or `test-e2e`.

Static policy cannot prove arbitrary process finiteness, so implement only requirements that the normative contract makes statically enforceable:

1. keep the explicit `dev` default-command requirement;
2. require `prod` to resolve a foreground runtime instruction from the Dockerfile stage lineage;
3. scan both Dockerfile `CMD` and `ENTRYPOINT` instructions for known background/daemon patterns;
4. do **not** add a new rule requiring `test` or `test-e2e` to contain a literal Dockerfile `CMD`/`ENTRYPOINT`, because a valid target may inherit runtime metadata from its base image and the spec defines these targets by finite behavior, not by a specific instruction form;
5. do not require healthchecks on finite test targets;
6. verify representative `test` and `test-e2e` finiteness with Docker-backed runtime tests.

## 3.3 Refactor effective runtime instruction helpers

In `templates/policy/dockerfile/dockerfile.rego`, replace the CMD-only helper with generalized helpers.

Keep stage/lineage logic. Add:

```rego
runtime_instruction_indices[a] := {i |
  some i
  stage_at[i] in lineage[a]
  input[i].Cmd in {"cmd", "entrypoint"}
} if {
  some j
  a := alias_at[j]
}

has_runtime_instruction(a) if {
  count(runtime_instruction_indices[a]) > 0
}
```

If Conftest Dockerfile parser represents commands differently and set-membership syntax above is unsupported by installed Rego version, use two explicit branches.

Preserve `commands[a]` only if another rule needs it; otherwise remove it.

## 3.4 Require a runtime instruction for `prod`

Keep the existing explicit `dev` default-command rule. Add a `prod` requirement:

```rego
deny contains "prod stage requires an effective CMD or ENTRYPOINT" if {
  "prod" in stages
  not has_runtime_instruction("prod")
}
```

This catches a production stage that contains only artifacts/healthcheck and has no Dockerfile-defined runtime. Do **not** apply the same static instruction-presence rule to `test`/`test-e2e`; their normative property is that they are finite runners, which is verified in real Docker acceptance tests below.

## 3.5 Scan both CMD and ENTRYPOINT for foreground violations

Refactor current daemon checks from:

```rego
input[i].Cmd == "cmd"
```

to:

```rego
input[i].Cmd in {"cmd", "entrypoint"}
```

If necessary, implement:

```rego
runtime_command_instruction(i) if { input[i].Cmd == "cmd" }
runtime_command_instruction(i) if { input[i].Cmd == "entrypoint" }
```

Then:

```rego
deny contains msg if {
  some i
  runtime_command_instruction(i)
  command := lower(concat(" ", input[i].Value))
  regex.match("(^|[ ;])nohup[ ;]|&[[:space:]]*$|pm2[[:space:]]+start.*--daemon|nginx(.*[[:space:]])?-g[[:space:]]*['\"]?daemon[[:space:]]+on", command)
  msg := sprintf("Runtime CMD/ENTRYPOINT must remain in foreground (instruction %v)", [i])
}
```

Apply nginx foreground check to both instruction kinds too.

## 3.6 Do not invent over-strict rules

Do not require a literal `CMD` when an inherited/effective `ENTRYPOINT` is a valid foreground runtime.

Do not require a test target healthcheck.

Do not require a specific shell or framework.

Do not reject long-running strings based only on names like `server` or `start`; only reject concrete known daemonization/background patterns.

## 3.7 Extend `tests/docker-acceptance/dockerfilePolicy.test.ts`

Add:

### DFP-001 — prod runtime required

Remove prod `CMD`; expect nonzero policy status.

### DFP-002 — prod ENTRYPOINT satisfies runtime requirement

Use:

```dockerfile
ENTRYPOINT ["sh", "-c", "exec sleep 30"]
```

and expect pass.

### DFP-003 — test/test-e2e may rely on inherited/base-image runtime metadata

Add a fixture that does not introduce a literal command in the `test`/`test-e2e` stage while still using a runnable finite base image/target. The static policy must **not** reject it solely because the stage lacks its own `CMD`/`ENTRYPOINT` instruction.

Then add a Docker-backed runtime fixture whose `test` and `test-e2e` targets actually exit with a known code, proving the finite-runner behavior.

### DFP-004 — detached ENTRYPOINT rejected

Example:

```dockerfile
ENTRYPOINT ["sh", "-c", "sleep 30 &"]
```

expect fail.

### DFP-005 — finite target may disable inherited healthcheck

Keep current `AUDIT-B05` pass case.

### DFP-006 — inherited foreground runtime accepted

A target inheriting a valid base CMD/ENTRYPOINT should pass.

### DFP-007 — dev/prod HEALTHCHECK NONE still fails

Keep current coverage.

---

# 4. Give reference errors complete source/stage/composition context

## 4.1 Current bug

`ConfigError` can already represent:

```ts
sourceFile
configPath
value
referencedObject
stage
composition
reason
```

but `src/core/config/references.ts` accepts only a string `sourcePath`, so grammar/property/tester-public errors often lose source file, active stage, and composition. This violates the V2 fail-fast diagnostic contract even though the underlying validation itself works.

## 4.2 Define a reusable reference context

In `src/core/config/references.ts`, add:

```ts
export interface ReferenceDiagnosticContext {
  sourceFile: string;
  configPath: string;
  stage: string;
  composition: "service" | "mesh";
}
```

Change internal `parse` and `valid` to accept this context instead of `sourcePath: string`.

## 4.3 Rewrite parse errors

Use:

```ts
throw new ConfigError({
  sourceFile: context.sourceFile,
  configPath: context.configPath,
  stage: context.stage,
  composition: context.composition,
  referencedObject: raw,
  value: raw,
  reason: `Invalid ${scope} endpoint reference`,
});
```

Unknown property:

```ts
throw new ConfigError({
  sourceFile: context.sourceFile,
  configPath: context.configPath,
  stage: context.stage,
  composition: context.composition,
  referencedObject: ref.raw,
  value: ref.property,
  reason: "Unknown endpoint property",
});
```

## 4.4 Change public APIs

Change:

```ts
collectBuilderReferences(value, scope, sourcePath)
```

to:

```ts
collectBuilderReferences(value, scope, context)
```

Change:

```ts
interpolateBuilderReferences(value, scope, resolve)
```

to:

```ts
interpolateBuilderReferences(value, scope, resolve, context)
```

Do not have interpolation call `parse(..., "environment")` with a synthetic path.

Change:

```ts
assertTesterReferencesArePublic(env, scope, sourcePrefix)
```

to:

```ts
assertTesterReferencesArePublic(
  env,
  scope,
  baseContext: Omit<ReferenceDiagnosticContext, "configPath"> & {
    configPath: string;
  },
)
```

For each key construct:

```ts
const context = {
  ...baseContext,
  configPath: `${baseContext.configPath}.${key}`,
};
```

## 4.5 Update service compiler caller

In `compileServiceComposition.ts`, change local `resolveEnv()` signature to carry context:

```ts
function resolveEnv(
  input: Record<string, string>,
  registry: (ref: ParsedBuilderReference) => string,
  context: {
    sourceFile: string;
    configPath: string;
    stage: string;
    composition: "service";
  },
): Record<string, string> {
  const out: Record<string, string> = {};

  for (const [key, value] of Object.entries(input)) {
    const refContext = {
      ...context,
      configPath: `${context.configPath}.${key}`,
    };

    collectBuilderReferences(value, "build", refContext);
    out[key] = interpolateBuilderReferences(
      value,
      "build",
      registry,
      refContext,
    ).replace(/\$/g, "$$$$");
  }

  return out;
}
```

For base/stage app layers from Plan 01, pass the actual logical config path for each layer. Examples:

```text
app.env
prod.app.env
e2e.app.env
dependencies.redis.env
prod.dependencies.redis.env
```

For override-Compose environment, source file should be the override file and config path should be `services.app.environment.<key>`.

For service tester:

```ts
assertTesterReferencesArePublic(testerConfigEnv, "build", {
  sourceFile: buildPath,
  configPath: "tester.env",
  stage: "e2e",
  composition: "service",
});
```

## 4.6 Update mesh reference utilities

`MeshReferenceContext` already has:

```ts
stage
meshJsonPath
services
bindings
endpoints
```

Update every `collectBuilderReferences()` call in `meshReferences.ts` to pass:

```ts
{
  sourceFile: ctx.meshJsonPath,
  configPath: source,
  stage: ctx.stage,
  composition: "mesh",
}
```

For service-owned build env resolved while compiling a mesh, use the service's actual `build.json` path where available rather than always `mesh.json`. If `LoadedMeshService` does not currently expose `buildJsonPath`, add:

```ts
buildJsonPath: path.join(absolutePath, "build.json")
```

to its loaded metadata and use that for build-scope syntax errors.

For mesh-owned env, use `mesh.json`.

For global tester env, use `mesh.json` path `tester.env.<key>`.

## 4.7 Endpoint property resolution context

Audit `resolveEndpointProperty()` callers. Every call that can fail due to:

- missing scheme for `network_url` / `public_url`;
- unpublished `public_*`;

must receive source file, config path, and stage. Add `composition` to its error context if the function's options support it; if not, extend the options interface.

## 4.8 Add `tests/v2/referenceDiagnostics.test.ts`

### REF-DIAG-001 — invalid service reference includes build path

Compile a service with:

```json
{
  "app": {
    "env": {
      "URL": "${not.valid}"
    }
  }
}
```

Catch `ConfigError` and assert:

```ts
expect(error.context.sourceFile).toBe(path.join(root, "build.json"));
expect(error.context.configPath).toBe("app.env.URL");
expect(error.context.stage).toBe("dev");
expect(error.context.composition).toBe("service");
expect(error.context.referencedObject).toBe("not.valid");
```

### REF-DIAG-002 — invalid mesh reference includes mesh path

Use `services.gateway.env.URL` and assert analogous mesh context.

### REF-DIAG-003 — missing scheme identifies reference

Reference `network_url` to endpoint without scheme and verify error context identifies source/reference.

### REF-DIAG-004 — unpublished public endpoint identifies reference

Tester env `public_url` to unpublished endpoint and verify source/path/stage/composition.

### REF-DIAG-005 — stage-only endpoint outside stage

Reference a stage-only endpoint from a stage where absent and verify diagnostics name the active stage and reference.

---

# 5. Re-audit fail-fast coverage without changing conforming code

Before modifying more code, run targeted tests against these already-implemented invariants. Only change code when a new regression test fails.

## 5.1 Keep as-is if tests pass

### JSON/schema strictness

- unknown V1/V1.2 top-level and nested fields rejected;
- all JSON env values are strings; no coercion;
- endpoint/dependency/service identifiers follow `^[a-z][a-z0-9-]*$`;
- reserved mesh names rejected.

### Path safety

- Dockerfile path inside service project;
- dependency Compose path inside service project;
- override Compose path inside service project;
- mesh service path inside mesh root;
- mesh tester Compose path inside mesh root;
- symlink traversal cannot escape root;
- Builder-managed paths require relative syntax.

### Dependency Compose contract

- has services;
- multiple services allowed;
- no `services.*.ports`;
- no host networking;
- no privileged services;
- no hardcoded `container_name`;
- no host-root bind mount;
- supported resources and service references are namespaced/rewritten;
- endpoint owner exists;
- every distinct endpoint owner has valid healthcheck.

### Override Compose restrictions

- no arbitrary extra services;
- no host publication;
- no app `depends_on`;
- no Builder target replacement;
- no Builder-owned env override;
- no required-healthcheck weakening;
- build context remains service project;
- E2E applies prod override then e2e override after Plan 01.

### Lifecycle

- app automatically health-depends on local materialized endpoint owners;
- dependency `dependsOn` targets materialized dependencies only;
- generated edges use `condition: service_healthy`;
- self/unknown/cyclic dependencies fail;
- mesh service lifecycle cycles fail;
- substitution adds consumer-to-provider health edge.

### Publication

- standalone publishable endpoints auto-publish;
- mesh requires explicit `publish`;
- mesh cannot publish endpoint lacking `publicPort`;
- substituted local dependency endpoint cannot be published through consumer;
- fixed collision fails;
- AUTO allocation occurs only for actually published endpoints;
- mesh allocation ordering remains deterministic and cached.

### Provider compatibility

- compatibility is reference-driven, not full endpoint-set equality;
- endpoint name must match;
- provider port may differ from local implementation;
- only actually consumed property capability is required.

If all current tests prove these behaviors, do not touch the code paths.

---

# 6. Update public README semantics

## 6.1 Service E2E paragraph

In `README.md`, replace current sentence around line 252:

```text
E2E is its own runtime configuration. It uses the production app image target, but it does not inherit `.env.prod` or the `prod` JSON overlay.
```

with:

```text
E2E uses production-shaped structured configuration: `base -> prod -> e2e`. The application runs Docker target `prod` with `EXEC_MODE=prod` and `INFRA_MODE=integrated`, while the environment-file source remains `.env.e2e`. `.env.prod` is not merged into `.env.e2e`.
```

## 6.2 Mesh stages table

Change E2E descriptions so application runtime says `prod`, not `e2e`.

For canonical complete test pipeline, replace row semantics from “test overlay then e2e overlay” to:

```text
Phase 1: each root service's own standalone unit + service-E2E lifecycle, sequentially.
Phase 2: clean global base -> prod -> e2e mesh + global tester.
```

If `mesh up test-unit` remains an explicit diagnostic command, keep it in a separate row and explicitly say it is **not** Phase 1 of canonical `mesh up test`.

## 6.3 Replace line around 365

Current:

```text
mesh test first runs isolated per-service unit tests. If they succeed, Builder runs one global E2E composition.
```

Replace with:

```text
`mesh test` has two phases. Phase 1 runs every root service's complete standalone test lifecycle—unit/isolated tests followed by that service's own E2E tester—sequentially with full teardown. Phase 2 starts a clean `base -> prod -> e2e` mesh and runs the global E2E tester. Stage-only mesh services are not Phase-1 members unless they also exist in root `services`.
```

## 6.4 Global tester section

Add:

```text
The selected global tester runner executes with `EXEC_MODE=e2e`, receives no `INFRA_MODE`, is host-networked, reads root `.env.e2e-tester`, and may use only effectively published `public_*` endpoint references. The tester Compose file may also define helper services; Builder preserves that tester implementation and selects `tester.service` as the exit-code source.
```

---

# 7. Update public documentation by file

## 7.1 `docs/reference/stage-matrix.md`

Rewrite service E2E rows to distinguish app and tester modes.

Recommended columns:

```text
Command | Effective config | App target | App EXEC_MODE | App INFRA_MODE | Tester target | Tester EXEC_MODE | Tester INFRA_MODE | App dotenv | Tester dotenv
```

Required rows:

```text
service dev          base->dev       dev   dev   isolated   —          —    —    .env.dev   —
service dev --full   base->dev       dev   dev   integrated —          —    —    .env.dev   —
service prod         base->prod      prod  prod  integrated —          —    —    .env.prod  —
service test-unit    base->test      test  test  isolated   —          —    —    .env.test  —
service test-e2e     base->prod->e2e prod  prod  integrated test-e2e   e2e  —    .env.e2e   .env.e2e-tester
```

Mesh rows:

```text
mesh dev             base->dev       apps dev/prod? -> dev, EXEC dev, INFRA integrated
mesh prod            base->prod      target prod, EXEC prod, INFRA integrated
mesh global E2E      base->prod->e2e target prod, EXEC prod, INFRA integrated
mesh global tester                   target test-e2e/equivalent, EXEC e2e, no INFRA
```

Then describe canonical `mesh test` two phases outside the single-stage table.

Delete sentence saying production target does not mean production runtime config. It is backwards under final V2: E2E application intentionally behaves as production code while using E2E values.

## 7.2 `docs/reference/environment-precedence.md`

Replace generic E2E paragraph with exact ordered lists.

### Ordinary standalone app

```text
.env.<stage>
-> build base app.env
-> active-stage app.env
-> active-stage override-compose app environment
-> Builder internal base environment
-> Builder internal active-stage environment
```

### Ordinary mesh app

```text
.env.<stage>
-> build base app.env
-> build active-stage app.env
-> active-stage override-compose app env
-> mesh base service env
-> mesh active-stage service env
-> Builder internal base env
-> Builder internal active-stage env
```

### Service E2E

```text
.env.e2e
-> build base app.env
-> prod app.env
-> prod override-compose app env
-> e2e app.env
-> e2e override-compose app env
-> Builder internal base env
-> Builder internal E2E environment
```

### Global E2E app

```text
.env.e2e
-> build base app.env
-> prod app.env
-> prod override-compose app env
-> e2e app.env
-> e2e override-compose app env
-> mesh base service env
-> mesh prod service env
-> mesh e2e service env
-> Builder internal base env
-> Builder internal E2E environment
```

### Tester

```text
.env.e2e-tester
-> tester.env
-> Builder internal tester environment
```

State explicitly:

```text
.env.prod is not merged into .env.e2e.
Production structured overlays ARE inherited by E2E.
```

## 7.3 `docs/concepts/testing-model.md`

Replace current content entirely if necessary. It must say:

### Standalone service

```text
unit/isolated -> service E2E
```

### Global mesh

```text
Phase 1:
for each root service, sequentially:
  unit/isolated
  service E2E
  teardown

Phase 2:
clean base -> prod -> e2e mesh
  -> global E2E tester
```

State:

- any failure aborts subsequent work;
- no Phase-1 state leaks to Phase 2;
- stage-only services are not Phase-1 members;
- service/global E2E apps use production execution;
- tester alone uses `EXEC_MODE=e2e`.

## 7.4 `docs/concepts/stages.md`

Document inheritance exactly:

```text
dev  = base -> dev
prod = base -> prod
test = base -> test
e2e  = base -> prod -> e2e
```

Explain that E2E inherits structured prod configuration but selects `.env.e2e`, not `.env.prod`.

## 7.5 `docs/concepts/environment.md`

State composition-level mesh service env is intentionally allowed and may override service app env. Do not reintroduce the superseded “mesh env prohibited” rule.

Include the final precedence references from `environment-precedence.md`.

## 7.6 `docs/guides/configure-service-e2e.md`

Ensure example shows:

```json
"tester": {
  "env": {
    "APP_URL": "${app.endpoints.http.public_url}"
  }
}
```

and explains:

```text
app: target prod, EXEC_MODE prod, INFRA_MODE integrated, .env.e2e
runner: target test-e2e, EXEC_MODE e2e, no INFRA_MODE, .env.e2e-tester
```

Mention app endpoint must be published in standalone E2E for tester public reference.

## 7.7 `docs/guides/configure-global-mesh-e2e.md`

Explain:

- `tester.compose` points directly to tester Compose;
- `tester.service` selects finite exit-code source;
- Compose may contain helper services and those remain part of tester implementation;
- selected runner host-networked;
- root `.env.e2e-tester` plus `tester.env`;
- only published `public_*` refs;
- global apps run base->prod->e2e as production applications.

## 7.8 `docs/guides/use-stage-only-services-and-dependencies.md`

State:

- E2E can add stage-only services/dependencies;
- prod additions are inherited by E2E;
- E2E additions exist only where inherited;
- stage-only mesh services participate in global Phase 2 but not Phase 1 unless root members.

## 7.9 `docs/reference/build-json.md`

Cross-check every field against final `BUILD_JSON_DOCS`:

```text
$schema
name
dockerfile
app.env
app.endpoints.*.{port,publicPort,primary,scheme}
dependencies.*.{compose,env,endpoints,dependsOn}
dependency endpoint {service,port,publicPort,primary,scheme}
tester.env
dev/prod/test/e2e
override-compose
stage app/env/endpoints
stage dependency env/endpoints/dependsOn
stage-only dependency compose
```

Correct E2E inheritance and immutable dependency compose.

## 7.10 `docs/reference/mesh-json.md`

Cross-check every field:

```text
$schema
name
tester.{compose,service,env}
services.<name>.{path,env,dependencies,dependsOn,publish}
dev/prod/test/e2e.services overlays
stage path/env/dependencies/dependsOn/publish
```

Add explicit root minimum one service.

Correct E2E inheritance and canonical global testing.

## 7.11 `docs/reference/dockerfile-contract.md`

List:

```text
required targets dev/test/test-e2e/prod
no EXPOSE
dev/prod effective healthcheck required
test/test-e2e healthcheck not required
prod must have an effective foreground runtime; dev retains its default-command requirement
no foreground daemonization in Dockerfile CMD/ENTRYPOINT
test/test-e2e finite behavior verified by runtime acceptance
prod artifact isolation
```

## 7.12 `docs/reference/cli.md`

For `service up test` explain both standalone phases.

For `mesh up test` explain root service full test lifecycles then global E2E.

If `mesh up test-unit` remains, explicitly label it as explicit `mesh.test` stage tooling, not canonical Phase 1.

## 7.13 Troubleshooting

### `tests-and-testers.md`

Correct advice that suggests E2E app sees `EXEC_MODE=e2e`. It should see `prod`; only tester sees `e2e`.

### `references-and-environment.md`

Correct advice implying prod JSON is excluded from E2E. Clarify only `.env.prod` file is excluded.

---

# 8. Run a semantic grep and eliminate contradictory public statements

After manual doc edits, run:

```bash
rg -n \
  'does not inherit.*prod|prod.*does not.*e2e|EXEC_MODE.?=.?e2e|E2E runtime configuration|per-service unit tests|does not run each service.*E2E|unit then global E2E|mesh.*test-unit.*Phase 1' \
  README.md docs
```

Review every match manually.

Allowed matches include tester-specific `EXEC_MODE=e2e` and explicit diagnostic `mesh test-unit` descriptions.

Forbidden public statements include any claim that:

- E2E application `EXEC_MODE` is `e2e`;
- E2E excludes the `prod` structured overlay;
- canonical mesh Phase 1 consists only of unit tests;
- canonical mesh test skips service-level E2E;
- `.env.prod` is inherited by E2E;
- mesh service `env` is forbidden;
- dependency `compose` may be replaced in a later stage.

## 8.1 Add a lightweight regression guard

Prefer a script because prose docs are not TypeScript imports.

Add `scripts/check-doc-semantics.ts`:

```ts
import fs from "node:fs";
import path from "node:path";

const publicFiles = ["README.md", ...walk("docs")];
const forbidden: Array<[RegExp, string]> = [
  [/E2E[^\n]*does not inherit[^\n]*prod[^\n]*(JSON|overlay)/i,
   "E2E must inherit the prod structured overlay"],
  [/mesh[^\n]*test[^\n]*(only|first runs)[^\n]*unit[^\n]*then[^\n]*global E2E/i,
   "Canonical mesh test Phase 1 includes each service's service E2E"],
  [/E2E[^\n]*(app|application)[^\n]*EXEC_MODE[^\n]*e2e/i,
   "E2E applications use EXEC_MODE=prod"],
];

// scan and process.exitCode=1 with file/line/message
```

Do not use a regex that flags tester-specific `EXEC_MODE=e2e`.

Add package script:

```json
"check:docs-semantics": "tsx scripts/check-doc-semantics.ts"
```

Then include it in `check:full` or `prepublishOnly`.

If maintainers do not want a docs-semantic script, implement the same assertions in `tests/v2/publicDocsSemantics.test.ts`.

---

# 9. Sync repository-internal final specifications

Compare the uploaded normative files with repository copies:

```text
.docs/specs_v2/SPECS_V2.md
.docs/specs_v2/BUILD_JSON_DOCS.md
.docs/specs_v2/MESH_JSON_DOCS.md
.docs/EXECUTION_MODEL.md
```

The uploaded versions are the authority for this transition.

If repository copies differ, replace the repository final-spec copies with the uploaded final text verbatim or apply only formatting/path-link changes that do not alter semantics.

Do not copy implementation-specific conclusions from old execution plans back into normative specs.

At the top of historical directories, add one `README.md` banner if missing:

```md
# Historical Builder V2 design material

These files record earlier design/audit/implementation iterations and may describe superseded behavior. They are not normative. The authoritative Builder V2 contract is:

- `../SPECS_V2.md`
- `../BUILD_JSON_DOCS.md`
- `../MESH_JSON_DOCS.md`
- `../../EXECUTION_MODEL.md`
```

Adjust relative paths based on directory.

---

# 10. Remove or rewrite tests that assert superseded semantics

Search:

```bash
rg -n \
  'EXEC_MODE.*e2e|not.*prod|prod.*not.*inherit|runMeshTestUnit|only.*helper closure|Only the selected tester runner may use host networking|does not run each service' \
  tests
```

Every result must be classified:

1. **valid tester-specific expectation** — keep;
2. **historical/explicit diagnostic mesh.test command** — keep only if command remains;
3. **superseded E2E application expectation** — rewrite;
4. **superseded canonical global test behavior** — rewrite;
5. **invented tester helper restriction** — remove.

Known rewrites from the audit:

- `tests/conformance/09-mesh-env.test.ts` MEN-028: app `EXEC_MODE=e2e` -> `prod`;
- `tests/v2/meshTester.test.ts`: unrelated tester helper should be preserved, not pruned;
- `tests/v2/meshTester.test.ts`: helper host networking should not fail solely due to helper role;
- `tests/v2/meshRunners.test.ts`: mock root-service full lifecycle, not unit-only phase;
- dependency-stage test that currently expects E2E `compose` replacement to work must be inverted to expect `ConfigError`;
- stage-resolution tests that currently expect prod to be excluded from E2E must be rewritten to expect `base -> prod -> e2e`.

Do not weaken a correct test merely to make the new implementation pass.

---

# 11. Generated schema and package artifacts

After code/schema changes:

```bash
pnpm build:schemas
```

Then inspect diffs:

```bash
git diff -- schemas/build-schema.json schemas/mesh-schema.json
```

Expected material schema changes:

- root mesh `services.minProperties = 1`;
- no reintroduction of V1 fields;
- service `env` remains allowed at root/stages;
- tester remains root-only in mesh;
- stage service `path` optional; root path required;
- build dependency stage `compose` remains schema-optional because immutability/new-dependency legality is semantic validation, not expressible by static schema alone.

Do not manually patch generated JSON and skip generator changes.

---

# 12. Full acceptance sequence

The environment used during this audit did not have a locally usable pnpm toolchain and had no network access to fetch it, so this exact sequence must be run in the normal repository development/CI environment after implementation.

## 12.1 Focused TypeScript/static tests

```bash
pnpm vitest run tests/v2/meshRootValidation.test.ts
pnpm vitest run tests/v2/referenceDiagnostics.test.ts
pnpm vitest run tests/v2/stageMerge.test.ts
pnpm vitest run tests/v2/testerRuntime.test.ts
pnpm vitest run tests/v2/meshTester.test.ts
pnpm vitest run tests/v2/meshServiceTestPipeline.test.ts
pnpm vitest run tests/v2/meshRunners.test.ts
```

Use actual test filenames if Plan 01 names them differently.

## 12.2 Conformance suite

```bash
pnpm test:conformance
```

Zero tests may continue asserting superseded architecture.

## 12.3 Typecheck

```bash
pnpm typecheck
```

This is especially important after changing reference function signatures and effective config/layer types.

## 12.4 Legacy-field guard

```bash
pnpm check:v2-no-legacy
```

No V1 compatibility translation is to be reintroduced.

## 12.5 Schema build

```bash
pnpm build:schemas
```

## 12.6 Standard unit suite

```bash
pnpm test
```

## 12.7 Docker acceptance

```bash
pnpm test:docker
```

This verifies real Compose semantics, healthchecks, runtime target selection, tester env-file precedence, publication, and Dockerfile Rego rules.

## 12.8 Full project gate

```bash
pnpm check:full
```

If documentation semantic guard was added separately, ensure it is included in `check:full` and `prepublishOnly`.

## 12.9 Prepublish gate

```bash
pnpm prepublishOnly
```

or the package-manager-equivalent lifecycle invocation used by CI.

---

# 13. Final spec-by-spec audit checklist

Use this as the release sign-off, not merely as a reading checklist. Each item must have a code test, a generated-schema check, or a documented reason that it is non-runtime metadata.

## 13.1 Execution model

- [ ] app application `EXEC_MODE` values are only `dev`, `test`, `prod`;
- [ ] `EXEC_MODE=e2e` appears only on tester processes;
- [ ] app `INFRA_MODE` is only `isolated` or `integrated`;
- [ ] testers receive no `INFRA_MODE`;
- [ ] standalone dev uses target dev / EXEC dev / INFRA isolated / `.env.dev`;
- [ ] standalone dev `--full` changes only infra to integrated plus dependency materialization;
- [ ] standalone prod uses target prod / EXEC prod / INFRA integrated / `.env.prod`;
- [ ] unit uses target test / EXEC test / INFRA isolated / `.env.test`;
- [ ] service E2E app uses target prod / EXEC prod / INFRA integrated / `.env.e2e`;
- [ ] service E2E tester uses target test-e2e / EXEC e2e / no INFRA / `.env.e2e-tester`;
- [ ] mesh dev apps use target dev / EXEC dev / INFRA integrated;
- [ ] mesh prod apps use target prod / EXEC prod / INFRA integrated;
- [ ] global E2E apps use target prod / EXEC prod / INFRA integrated / each service `.env.e2e`;
- [ ] global tester uses EXEC e2e / no INFRA / root `.env.e2e-tester`;
- [ ] canonical global test uses full root-service test lifecycle then clean global E2E.

## 13.2 Stage inheritance

- [ ] dev = base -> dev;
- [ ] prod = base -> prod;
- [ ] test = base -> test;
- [ ] e2e = base -> prod -> e2e for build config;
- [ ] e2e = base -> prod -> e2e for mesh config;
- [ ] E2E uses `.env.e2e`, not `.env.prod`;
- [ ] prod and e2e override Compose files both apply in order;
- [ ] prod mesh service env then e2e mesh service env apply in order.

## 13.3 Build JSON

- [ ] `app` required;
- [ ] `$schema`, `name`, `dockerfile` optional;
- [ ] Dockerfile default is `Dockerfile`;
- [ ] app env strict strings;
- [ ] app endpoint identifiers/ranges/scheme validated;
- [ ] exactly one primary per non-empty app endpoint set;
- [ ] primary app endpoint determines Builder-owned `PORT`;
- [ ] dependencies are logical slots with one local Compose implementation;
- [ ] no dependency-level `service`;
- [ ] no dependency classification by third-party/fellow-service;
- [ ] dependency endpoint owner explicit;
- [ ] exactly one dependency primary per non-empty set;
- [ ] dependency with no endpoints inert;
- [ ] local dependency materializes only integrated and only when not substituted;
- [ ] inherited dependency Compose immutable;
- [ ] stage-only dependency may provide Compose;
- [ ] dependency env merges keywise;
- [ ] dependency `dependsOn` union-merges;
- [ ] dependency lifecycle validates unknown/inert/self/cycle;
- [ ] tester only has env in build.json;
- [ ] stage override Compose obeys restrictions.

## 13.4 Mesh JSON

- [ ] root services required and non-empty;
- [ ] service name grammar and reserved names enforced;
- [ ] root service path required;
- [ ] stage may override path/add service;
- [ ] service env root/stage allowed and strict strings;
- [ ] dependency binding key must exist in consumer build;
- [ ] provider must exist;
- [ ] substitution atomically suppresses local dependency implementation;
- [ ] substitution adds health lifecycle edge;
- [ ] reference-driven compatibility enforced;
- [ ] explicit `dependsOn` union-merges and uses health gating;
- [ ] `publish` union-merges;
- [ ] publish cannot create capability absent `publicPort`;
- [ ] substituted local dependency cannot be published via consumer;
- [ ] root tester required only for global E2E;
- [ ] no stage tester overlay;
- [ ] tester Compose helpers preserved;
- [ ] stage-only service not Phase-1 root member.

## 13.5 Environment precedence

- [ ] ordinary standalone order exact;
- [ ] ordinary mesh order exact;
- [ ] service E2E interleaves prod/e2e structured env and override Compose in exact order;
- [ ] global E2E adds mesh base/prod/e2e env after build layers;
- [ ] Builder internal env always final;
- [ ] lower user layers attempting Builder-owned keys fail rather than silently lose;
- [ ] tester dotenv -> tester.env -> internal exact;
- [ ] runtime env is not copied to build args;
- [ ] override Compose remains the build-arg mechanism.

## 13.6 Endpoint properties/publication

- [ ] all eight properties supported;
- [ ] URLs require scheme;
- [ ] public properties require effective publication;
- [ ] public host default is `127.0.0.1`;
- [ ] standalone publicPort auto-publishes;
- [ ] mesh publicPort only grants capability;
- [ ] mesh publish required for actual exposure;
- [ ] fixed collision fails without silent remap;
- [ ] AUTO is deterministic and cache-backed;
- [ ] non-published mesh endpoint reserves no host port.

## 13.7 Compose/runtime safety

- [ ] dependency Compose atomic multi-service bundle supported;
- [ ] internal resources namespaced;
- [ ] internal service/resource references rewritten;
- [ ] forbidden dependency Compose host controls rejected;
- [ ] endpoint owners healthchecked;
- [ ] app dev/prod Docker healthchecks required;
- [ ] Builder does not synthesize healthchecks;
- [ ] all Builder-generated lifecycle edges use `service_healthy`;
- [ ] no `service_started` fallback introduced by Builder lifecycle synthesis.

## 13.8 Fail-fast diagnostics

- [ ] invalid JSON/YAML identifies source;
- [ ] missing path identifies logical config path;
- [ ] project-escaping path identifies source/path/value;
- [ ] legacy field rejected;
- [ ] non-string env rejected;
- [ ] invalid identifier rejected;
- [ ] unresolved reference identifies full reference;
- [ ] missing scheme identifies full reference;
- [ ] unpublished public reference identifies full reference;
- [ ] invalid provider identifies consumer slot/provider/stage;
- [ ] lifecycle cycle identifies cycle participants;
- [ ] missing healthcheck identifies owner service;
- [ ] fixed collision identifies both endpoint paths;
- [ ] stage-only unavailable reference identifies active stage;
- [ ] substituted local dependency reference/publish identifies suppression reason.

## 13.9 Removed V1/V1.2 fields

- [ ] build `port` rejected;
- [ ] `envOverrides` rejected;
- [ ] `overrides` rejected;
- [ ] `composeFiles` rejected;
- [ ] build `services` rejected;
- [ ] `policy`/`policies` rejected;
- [ ] `injects` rejected;
- [ ] `sidecars` rejected;
- [ ] legacy dependency `path/service/port/ports` rejected;
- [ ] mesh root dependencies rejected;
- [ ] service `port/preservePort/provideDependency/replaceMocks/envOverrides/healthcheck` rejected;
- [ ] tester `path/dockerfile/envOverrides/policy` rejected;
- [ ] `inherit-published` rejected;
- [ ] no silent translation exists.

---

# 14. Release changeset

After all tests pass, add one Changesets entry rather than several overlapping ones unless repository maintainers prefer split release notes.

Example `.changeset/finalize-builder-v2-execution-model.md`:

```md
---
"@solid-stack/builder": minor
---

Finalize Builder V2 conformance across stage inheritance, production-shaped E2E execution, ordered environment precedence, immutable dependency implementations, canonical two-phase mesh testing, service/global tester runtime semantics, mesh root validation, Dockerfile runtime checks, and diagnostics/documentation.
```

Use `minor` because behavior changes are architecturally meaningful. If the package has not yet released V2 or changes are being folded into an unreleased branch, follow the repository's existing release policy instead of blindly adding a second release bump.

---

# 15. Definition of done

This transition is complete only when:

1. every normative V2 requirement is either implemented and covered or explicitly non-runtime metadata;
2. no current test expects superseded behavior;
3. generated schemas match runtime schema constraints;
4. public docs match the same execution model as code;
5. historical docs are clearly marked non-normative instead of silently edited into false history;
6. typecheck, conformance, standard tests, Docker acceptance, legacy guard, build, and prepublish checks all pass;
7. a final `rg` audit finds no contradictory public E2E/global-test statements;
8. no implementation workaround reintroduces V1/V1.2 translation or changes the architectural decisions to make old tests pass.
