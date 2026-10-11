# Solid Stack Builder V2 Migration — Plan 04
## Validation Contracts, CLI Surface, Generated Schemas, Repository Fixtures, Regression Suite, and V1/V1.2 Removal

**Implementation order:** 4 of 4  
**Depends on:** Plans 01, 02, and 03  
**Purpose:** make the V2 architecture the only supported Builder behavior, migrate repository-owned fixtures/examples, and prove no legacy execution path remains.

---

# Edit-location convention

The current repository snapshot is a concatenated source export, so physical line numbers in that snapshot are not stable source-file line numbers and would become wrong immediately after Plan 01 edits. This plan therefore uses **deterministic edit locators** instead: exact file path + exported symbol/function + old field/snippet, or `replace whole file`. Treat those locators as the required edit location. For every whole-file replacement, delete the entire current file contents first; for partial edits, search the exact symbol/snippet named by the step and edit only that block. Do not search for a nearby “similar” implementation and leave the named block untouched.

---

# 1. Objective

Finish the V2 transition by replacing the current checker/policy assumptions, updating CLI/help/export behavior, regenerating JSON Schemas, migrating repository fixtures/examples, removing dead V1 utility modules/templates, and creating a regression suite that covers every normative V2 invariant.

This plan is not optional cleanup. Until it is complete, old fields can remain reachable through checker paths, examples, tests, generated schemas, or package templates even if Plans 01–03 compile V2 correctly.

At the end:

```bash
pnpm typecheck
pnpm test
pnpm build:schemas
pnpm build
pnpm prepublishOnly
```

must all pass with only V2 fixtures.

---

# 2. Files to replace/update/delete

## Replace or substantially rewrite

```text
src/core/checkers/checkInfra.ts
src/core/checkers/checkDockerfile.ts
src/core/checkers/checkDockerfileContract.ts
src/core/checkers/getDeclaredYamlFiles.ts
src/core/checkers/checkYamlFiles.ts
src/core/mesh/checkers/checkMesh.ts
src/core/mesh/checkers/checkMeshJson.ts
src/core/mesh/checkers/checkMeshServices.ts
src/core/mesh/checkers/checkMeshTester.ts
scripts/generate-schemas.ts
scripts/prepublish-check.ts
src/core/templates.ts
src/index.ts
```

## Update CLI command definitions/handlers

```text
src/commands/service/commands/up/command.ts
src/commands/service/commands/up/handler.ts
src/commands/service/commands/export/command.ts
src/commands/service/commands/export/handler.ts
src/commands/service/commands/down/handler.ts
src/commands/mesh/commands/up/command.ts             verify stage list/help only
src/commands/mesh/commands/up/handler.ts             verify V2 compiler call
src/commands/mesh/commands/down/handler.ts           project naming/run state
```

## Delete after zero-import verification

```text
src/utils/extractBuildDeps.ts
src/utils/extractOverrides.ts
src/utils/dependencyPorts.ts
src/utils/ymlMods/addDependenciesToAppService.ts
src/utils/ymlMods/renameServicesWithDependencies.ts
src/core/checkers/checkComposeContract.ts
templates/docker/docker-compose.standalone.yml
```

Delete additional helper files only when they are exclusively V1/V1.2 and `rg` shows zero V2 runtime imports. Do not delete generic Compose utilities such as YAML parsing, deep cloning, path helpers, `normalizeDependsOn`, port occupancy checks, or redaction merely because the old compiler also used them.

## Generate/update

```text
schemas/build-schema.json
schemas/mesh-schema.json
templates/policy/dockerfile/dockerfile.rego
```

---

# 3. Checker architecture

The checker must validate the same effective configuration semantics as the compiler. Do not maintain a second permissive V1 validator.

Use this pipeline for a service project:

```text
load V2 build.json
-> validate Dockerfile file + lint
-> validate Builder-owned Dockerfile contract
-> resolve/validate dev
-> resolve/validate dev --full composition
-> resolve/validate prod
-> resolve/validate test
-> resolve/validate e2e
-> validate every declared dependency/override Compose encountered
-> report success
```

Use this pipeline for a mesh project:

```text
load V2 mesh.json
-> resolve/validate dev effective mesh and service projects
-> resolve/validate prod
-> resolve/validate test service set
-> resolve/validate e2e
-> validate provider bindings/publication/lifecycle per stage
-> if tester exists, validate tester Compose/service/env contract
-> report success
```

`mesh check` does not require a tester merely to validate dev/prod/test configurations. `mesh test-e2e` does require root tester and fails at execution validation if absent.

---

# 4. Replace `src/core/checkers/checkDockerfile.ts`

Current behavior warns and skips when default `Dockerfile` is missing. V2 requires an application Dockerfile because required targets/healthchecks are part of the contract.

Change missing-file behavior to error whether the default path or explicit path was used.

Use:

```ts
if (!existsSync(dockerfilePath)) {
  throw new ConfigError({
    sourceFile: path.join(projectDir, "build.json"),
    configPath: "dockerfile",
    value: dockerfileRel,
    composition: "service",
    reason: `Application Dockerfile not found at ${dockerfilePath}`,
  });
}
```

Keep Hadolint execution.

Do not make the Dockerfile optional based on app endpoint count; even endpoint-less command/worker applications still use the required target aliases.

---

# 5. Make Dockerfile contract Builder-owned

V2 removes user `policy` / `policies`. The current `checkDockerfileContract.ts` must stop reading:

```text
buildJson.policy?.dockerfile
buildJson.policies?.dockerfile
```

## 5.1 Add bundled policy

Create:

```text
templates/policy/dockerfile/dockerfile.rego
```

Resolve it from Builder package templates via `getTemplatesDir()`, not the user project.

`checkDockerfileContract.ts` must invoke Conftest against:

```text
<builder package>/templates/policy/dockerfile/
```

and the user's selected Dockerfile.

## 5.2 Required policy rules

The policy must enforce all of these:

1. stages `dev`, `test`, `test-e2e`, `prod` exist;
2. hardcoded `EXPOSE` does not occur anywhere in app Dockerfile;
3. `dev` has/inherits a default `CMD`;
4. `dev` has/inherits a Docker `HEALTHCHECK`;
5. `prod` has/inherits a Docker `HEALTHCHECK`;
6. `prod` contains artifact isolation via at least one `COPY --from=...` in the effective prod lineage;
7. `test` and `test-e2e` need no healthcheck;
8. app runtime stages must not intentionally daemonize/background their main command.

## 5.3 Stage inheritance algorithm in Rego

Conftest Dockerfile AST exposes ordered instructions. Implement stage metadata:

```text
stage alias
FROM source image/stage
instructions belonging to stage
```

For an alias whose `FROM` source equals another local alias, treat parent instructions as inherited.

A stage satisfies `CMD` or `HEALTHCHECK` if found in its own instruction list or recursively in local parent stage lineage.

Avoid an infinite loop by tracking visited aliases. A Dockerfile stage inheritance cycle is invalid.

## 5.4 Healthcheck validity

Reject:

```text
HEALTHCHECK NONE
```

Accept shell or JSON healthcheck commands.

The policy does not need to know endpoint numeric port. The Dockerfile should use Builder-owned `PORT` dynamically when it is a network app. A hardcoded healthcheck port is not universally forbidden by schema, but repository examples must be migrated to use runtime `PORT` so they remain valid for arbitrary endpoint ports.

## 5.5 Background-process rule

Reject obvious runtime command forms that detach from PID 1, including shell command ending in `&`, `nohup ... &`, known daemon flags such as `nginx` without `daemon off`, and equivalent current policy detections.

Do not reject legitimate foreground process managers solely by binary name.

---

# 6. Replace/remove Compose policy checker

Delete `src/core/checkers/checkComposeContract.ts` after removing imports from `checkInfra.ts`.

Reason: V2 has no per-project `policy.compose`; dependency/override/tester Compose validation is a Builder-owned semantic contract implemented directly in Plans 02/03.

Do not replace it with another user-configurable policy field.

---

# 7. Replace `src/core/checkers/getDeclaredYamlFiles.ts`

The old implementation reads dependency `path`, `overrides.*.path`, and `composeFiles`.

Replace its contract with V2 declarations.

Create:

```ts
export interface DeclaredYamlFile {
  relativePath: string;
  absolutePath: string;
  source: string;
  stage?: "dev" | "prod" | "test" | "e2e";
  kind: "dependency-compose" | "override-compose";
}
```

Gather unique paths from:

- base `dependencies.<name>.compose`;
- each stage `dependencies.<name>.compose` if supplied;
- each stage `override-compose`.

Resolve against service root. Preserve source path strings such as:

```text
dependencies.firebase.compose
e2e.dependencies.firebase.compose
prod.override-compose
```

Do not look for `composeFiles`, legacy `overrides`, or dependency `path`.

---

# 8. Replace `src/core/checkers/checkYamlFiles.ts`

Use `getDeclaredYamlFiles` V2 output.

For each file:

1. path must remain inside service project;
2. must exist;
3. must be regular file;
4. parse as YAML;
5. parse errors fail with declared configuration path and filename.

Then invoke the semantic validator appropriate to its effective role:

- dependency Compose: validate when resolved as an effective endpoint-bearing dependency in a stage;
- override Compose: validate via `validateAndPrepareAppOverride` for that stage.

Do not independently reject legal generic Compose keys beyond the V2 semantic contracts.

---

# 9. Replace `src/core/checkers/checkInfra.ts`

Use this exact sequence:

```ts
export function checkInfra(projectDir: string = process.cwd()): void {
  const absProjectDir = resolveProjectDir(projectDir);
  const build = getBuildJson(absProjectDir);

  checkDockerfile(build, absProjectDir);
  checkDockerfileContract(build, absProjectDir);
  checkYamlFiles(build, absProjectDir);
  checkAllEffectiveServiceStages(build, absProjectDir);

  console.log(pc.green("\n✅ All V2 service infrastructure and contract checks passed.\n"));
}
```

Create `checkAllEffectiveServiceStages` in a new:

```text
src/core/checkers/checkEffectiveServiceStages.ts
```

## 9.1 Stage validation matrix

Validate:

```text
dev isolated
dev integrated (--full semantic path)
prod integrated
test isolated
e2e integrated + service tester
```

Reuse compilation/resolution functions rather than rewriting semantics.

For `check` mode, avoid binding runtime sockets or starting containers. AUTO publicPort validity can be checked structurally without choosing a final free port; fixed duplicate logical claims are still detectable. If the shared compiler currently allocates ports unconditionally, add internal option:

```ts
validationMode?: boolean
```

with these exact effects:

- do not test OS port availability;
- do not mutate `.builder/ports-v2.json`;
- assign deterministic placeholder numbers to AUTO only for reference-shape validation, from a private sequence beginning at `60000` and descending while skipping every fixed or already-assigned placeholder port;
- still reserve fixed ports and detect fixed-fixed collisions;
- still validate public ref eligibility/scheme/publication.

This option is internal; do not expose CLI flag.

---

# 10. Replace `src/core/mesh/checkers/checkMeshJson.ts`

The old checker knows `provideDependency`/`replaceMocks`. Remove all old graph code.

New purpose:

- optional direct function for tests that validates the raw object through V2 `meshSchema`;
- no provider semantic checking without service builds.

Implement:

```ts
export function checkMeshJson(mesh: unknown): MeshConfig {
  const result = meshSchema.safeParse(mesh);
  if (!result.success) {
    throw new ConfigError({
      sourceFile: "mesh.json",
      configPath: "<root>",
      composition: "mesh",
      reason: `Invalid mesh.json: ${formatZodIssues(result.error)}`,
    });
  }
  return result.data;
}
```

Semantic binding cycles are checked only after effective stage/service builds are loaded.

---

# 11. Replace `src/core/mesh/checkers/checkMeshServices.ts`

The old checker iterates only base services. Replace with stage-aware validation.

Export:

```ts
export function checkMeshServices(
  mesh: MeshConfig,
  meshDir: string,
): void
```

For each config stage `dev`, `prod`, `test`, `e2e`:

1. resolve effective mesh stage;
2. include stage-added services;
3. validate each effective `path` inside mesh root;
4. require directory/build.json;
5. call service `checkInfra` once per unique service path **plus** validate the service's same active effective stage in mesh context;
6. validate dependency binding keys/providers;
7. validate publish entries;
8. validate combined lifecycle graph;
9. validate mesh env references for that stage.

Cache `checkInfra` by absolute service path during one mesh check to avoid repeating Dockerfile lint four times. Stage semantic checks must still run four times.

---

# 12. Replace `src/core/mesh/checkers/checkMeshTester.ts`

New input is root tester:

```json
{
  "compose": "./e2e/docker-compose.yml",
  "service": "playwright",
  "env": {}
}
```

Behavior:

- if absent and `required === false`, return;
- if absent and `required === true`, fail;
- resolve compose within mesh root;
- parse Compose;
- exact selected service must exist;
- compile tester closure in validation mode;
- selected runner host-network compatibility is validated;
- `tester.env` values are strings by schema;
- tester `network_*` Builder refs rejected;
- no tester policy/Dockerfile/path fields.

Do not lint the runner Dockerfile separately through Builder's application Dockerfile contract. The tester Compose owns its own build details.

---

# 13. Replace `src/core/mesh/checkers/checkMesh.ts`

Use:

```ts
export function checkMesh(
  meshDir: string = process.cwd(),
  options: CheckMeshOptions = {},
): void {
  const absMeshDir = resolveProjectDir(meshDir);
  const mesh = getMeshJson(absMeshDir);

  checkMeshServices(mesh, absMeshDir);
  checkMeshTester(mesh, absMeshDir, {
    required: Boolean(options.requireTester),
  });

  console.log(
    pc.bold(pc.green("\n🎉 All V2 mesh infrastructure, services, and contract checks passed!\n")),
  );
}
```

`runMeshTestE2e` invokes check with `requireTester: true` before execution unless `--skip-checks` is an intentional current CLI capability.

---

# 14. Remove `--integrated` CLI alias

V2 command contract uses:

```text
service up dev --full
```

There is no separate config mode named `integrated` at CLI surface; `INFRA_MODE=integrated` remains Builder internal runtime env.

## 14.1 Service up command

In `src/commands/service/commands/up/command.ts` remove:

```text
--integrated
```

Keep:

```text
--full
```

Handler must derive:

```ts
full: Boolean(options.full)
```

and not `options.full || options.integrated`.

## 14.2 Export env command

Current command exposes `--integrated` alias. Remove it.

Keep `--full` for dev integrated export.

## 14.3 Public option types

Plan 01 removed `integrated` from `ServiceUpOptions`. Remove any remaining local command option type/property.

Add CLI parser tests asserting `--integrated` is unknown.

---

# 15. CLI stage mappings

Keep command stage names:

```text
service: dev prod test test-unit test-e2e
mesh:    dev prod test test-unit test-e2e
```

These are command labels, not JSON overlay labels.

Handlers map:

```text
service test-unit -> build config stage test
service test-e2e  -> build config stage e2e
mesh test-unit    -> mesh/build config stage test
mesh test-e2e     -> mesh/build config stage e2e
```

`test` remains orchestration and has no separate JSON stage.

Update help text to make this explicit.

---

# 16. Update down/teardown project-name derivation

`build.json.name` and `mesh.json.name` now define base identities.

Update service/mesh down handlers and `src/utils/runState.ts` so teardown candidate names are:

Service:

```text
dev  <build.name or dirname>
prod <base>-prod
test <base>-test
e2e  <base>-e2e
```

Mesh:

```text
dev  <mesh.name or dirname>
prod <base>-prod
e2e  <base>-e2e
```

Persisted actual `runState.projectName` remains first teardown candidate.

Do not derive mesh service project names from nested `build.json.name`.

---

# 17. Update generated JSON Schemas

`src/core/buildSchema.ts` and mesh schema from Plan 01 are source of truth.

Update `scripts/generate-schemas.ts` names to make version visible:

```ts
const meshJsonSchema = zodToJsonSchema(meshSchema, {
  name: "MeshJsonV2",
  $refStrategy: "none",
});

const buildSchemaOutput = zodToJsonSchema(buildJsonSchema, {
  name: "BuildJsonV2",
  $refStrategy: "none",
});
```

Keep filenames:

```text
schemas/build-schema.json
schemas/mesh-schema.json
```

so existing `$schema` URLs do not need a filename change.

Run:

```bash
pnpm build:schemas
```

Commit the generated files.

## 17.1 Schema assertions

Add tests reading generated JSON and assert legacy properties are absent while V2 properties are present. This prevents source Zod and published schema drift.

---

# 18. Update `scripts/prepublish-check.ts`

Remove required presence check for:

```text
templates/docker/docker-compose.standalone.yml
```

Add required check for:

```text
templates/policy/dockerfile/dockerfile.rego
schemas/build-schema.json
schemas/mesh-schema.json
```

Keep `pnpm pack --dry-run` and verify package file list contains:

```text
dist/**
templates/docker/**
templates/policy/dockerfile/dockerfile.rego
schemas/build-schema.json
schemas/mesh-schema.json
```

Fail prepublish if any are missing.

---

# 19. Update `src/core/templates.ts`

Remove any template enum/path support for standalone port template.

Retain accessors for:

```text
docker-compose.base.yml
docker-compose.dev.yml
docker-compose.prod.yml
docker-compose.test.yml
docker-compose.e2e.yml
```

Add this accessor:

```ts
export function getDockerfilePolicyDir(): string
```

that returns packaged `templates/policy/dockerfile`.

Do not expose a user-selected policy path.

---

# 20. Delete V1 utility modules

After Plans 02/03 have landed, run:

```bash
rg -n 'extractBuildDeps|extractOverrides|dependencyPorts|addDependenciesToAppService|renameServicesWithDependencies' src tests scripts
```

For each remaining import, replace it with the V2 equivalent. Then delete:

```text
src/utils/extractBuildDeps.ts
src/utils/extractOverrides.ts
src/utils/dependencyPorts.ts
src/utils/ymlMods/addDependenciesToAppService.ts
src/utils/ymlMods/renameServicesWithDependencies.ts
```

Do not leave compatibility wrappers with the same names.

Delete:

```text
src/core/checkers/checkComposeContract.ts
templates/docker/docker-compose.standalone.yml
```

after imports/prepublish references are removed.

---

# 21. Add a source-level V1 regression gate

Create:

```text
scripts/check-no-v1-config-code.ts
```

The script scans runtime source (`src`, `templates/docker`) and fails if removed configuration identifiers appear in executable runtime code.

Search tokens:

```text
provideDependency
replaceMocks
preservePort
envOverrides
composeFiles
buildJson.port
policies
policy.compose
policy.dockerfile
inherit-published
meshHealthcheck
includeTester
PUBLIC_PORT
```

Exceptions:

- V2 error messages/tests may mention removed fields to say they are invalid;
- comments in migration docs are irrelevant because script scans runtime source only;
- generic word `port` is obviously not banned.

Implement token checks with precise regexes, not blanket substring `policy`.

Add package script:

```json
"check:v2-no-legacy": "tsx scripts/check-no-v1-config-code.ts"
```

Include it in `check` and `prepublishOnly` before build/package.

---

# 22. Migrate repository-owned `build.json` examples/fixtures

The current tests explicitly exercise example projects such as `examples/backend` and `examples/largeProject`. Convert every repository-owned Builder config to V2; do not keep old examples as valid runtime fixtures.

Enumerate deterministically:

```bash
find examples tests -name build.json -o -name mesh.json
```

For every returned runtime fixture, apply the transformation rules below. Legacy-rejection fixtures under a clearly named `tests/fixtures/v1-invalid/` directory may intentionally retain old fields.

## 22.1 Build JSON conversion template

Old:

```json
{
  "name": "gateway",
  "port": 3000,
  "dependencies": {
    "backend": {
      "path": ".docker/mocks/backend.yml",
      "service": "mock-backend"
    }
  },
  "envOverrides": {
    "BACKEND_URL": "${backend.network_url}"
  },
  "tester": {
    "envOverrides": {
      "API_URL": "${app.public_url}"
    }
  }
}
```

Replace with explicit endpoint declarations:

```json
{
  "name": "gateway",
  "app": {
    "env": {
      "BACKEND_URL": "${dependencies.backend.endpoints.http.network_url}"
    },
    "endpoints": {
      "http": {
        "port": 3000,
        "publicPort": "AUTO",
        "primary": true,
        "scheme": "http"
      }
    }
  },
  "dependencies": {
    "backend": {
      "compose": ".docker/mocks/backend.yml",
      "endpoints": {
        "http": {
          "service": "mock-backend",
          "port": 3000,
          "primary": true,
          "scheme": "http"
        }
      }
    }
  },
  "tester": {
    "env": {
      "API_URL": "${app.endpoints.http.public_url}"
    }
  }
}
```

Only give a dependency endpoint `publicPort` if repository tests/users genuinely need host access to that local dependency.

## 22.2 Old dependency `ports` conversion

For each old auxiliary mapping such as:

```json
"ports": ["4000:4000"]
```

create a named logical endpoint:

```json
"ui": {
  "service": "firebase-ui",
  "port": 4000,
  "publicPort": 4000,
  "scheme": "http"
}
```

The endpoint owner must be the exact Compose service actually listening on that container port. Do not mechanically attach all old mappings to the old primary service without inspecting the fixture Compose.

## 22.3 Old overrides conversion

Old:

```json
"overrides": {
  "dev": { "path": ".docker/dev.override.yml" }
}
```

becomes:

```json
"dev": {
  "override-compose": ".docker/dev.override.yml"
}
```

Then modify the override file so it contains only `services.app` and no ports/depends_on/extra services.

## 22.4 Old stage semantics

If a fixture previously relied on prod Compose override during E2E, duplicate only the intended E2E-specific scalar/env change into `e2e` explicitly. V2 E2E does not inherit prod stage config.

---

# 23. Migrate repository-owned dependency Compose fixtures

For every Compose file referenced by new `dependencies.*.compose`:

1. remove every `ports` field;
2. remove fixed `container_name`;
3. remove `network_mode: host`;
4. remove privileged mode;
5. remove host-root binds;
6. add valid healthcheck to every service that owns a declared Builder endpoint;
7. keep companion services/resources otherwise intact;
8. internal Compose `depends_on` may remain;
9. do not rename services manually—the Builder namespacer owns generated names.

If old host publication existed only for developer convenience, declare endpoint `publicPort` instead. In mesh, additionally add `publish` in `mesh.json` when host exposure is desired.

---

# 24. Migrate repository-owned Dockerfiles

Every service fixture/example Dockerfile must satisfy:

```text
dev
test
test-e2e
prod
```

and both `dev` and `prod` must have/inherit healthcheck.

## 24.1 Add dev healthcheck where currently absent

Typical Node network service:

```dockerfile
HEALTHCHECK --interval=2s --timeout=2s --start-period=3s --retries=10 \
  CMD ["node", "-e", "const p=Number(process.env.PORT); if(!p) process.exit(1); const s=require('net').connect(p,'127.0.0.1'); s.on('connect',()=>{s.end();process.exit(0)}); s.on('error',()=>process.exit(1));"]
```

Place/inherit it in both `dev` and `prod` lineages.

Do not use `process.env.PORT || 3000` in canonical examples; V2 primary endpoint owns the effective port and Builder injects it. A missing `PORT` should fail the network health probe rather than guess 3000.

## 24.2 Frontend dev commands

For the repository Next.js frontend fixture, replace a hardcoded `-p 3000` dev command with `CMD ["sh", "-c", "exec pnpm exec next dev -H 0.0.0.0 -p \"$PORT\""]`. For any other repository fixture whose runtime CLI requires an explicit port argument, use the same `sh -c` + `exec` pattern with `$PORT`. Never add hardcoded `EXPOSE`.

## 24.3 Production artifact isolation

Keep existing `COPY --from=builder` pattern.

## 24.4 Workers with no endpoints

A V2 Dockerfile still requires dev/prod healthcheck. For a non-network worker, healthcheck may test process/application readiness without `PORT`; do not invent a network endpoint just for checker compliance.

---

# 25. Migrate repository-owned mesh fixtures

Old mesh:

```json
{
  "dependencies": {},
  "services": {
    "frontend": {
      "path": "./services/frontend",
      "port": 3000,
      "provideDependency": { "backend": "backend" },
      "envOverrides": {}
    }
  }
}
```

becomes:

```json
{
  "services": {
    "backend": {
      "path": "./services/backend"
    },
    "frontend": {
      "path": "./services/frontend",
      "dependencies": {
        "backend": "backend"
      },
      "publish": [
        "app.endpoints.http"
      ]
    }
  }
}
```

Move endpoint/publicPort definitions into each service's build JSON.

Move service env to mesh `env`.

Move old healthcheck declarations into service Dockerfiles.

Convert tester to:

```json
"tester": {
  "compose": "./e2e/docker-compose.yml",
  "service": "playwright",
  "env": {
    "SYSTEM_URL": "${gateway.app.endpoints.http.public_url}"
  }
}
```

Do not add root mesh dependencies.

---

# 26. Update `.env.*.example` files

Repository examples currently may document `PORT` and `PUBLIC_PORT` as user-owned inputs.

For each service example:

- remove `PUBLIC_PORT` completely;
- remove `PORT` from normal user configuration documentation when that service has app endpoints; Builder owns it;
- keep unrelated app configuration;
- add a comment to README/build docs that endpoint container/public ports are declared in `build.json`.

If a user layer defines `PORT`, V2 compiler should fail because Builder owns it for endpoint-bearing apps.

---

# 27. Rewrite legacy test files

## 27.1 `tests/compileEnvironment.test.ts`

Remove old cases asserting:

- root port mapping;
- old `--full` V1 dependency shape;
- first-service fallback;
- old envOverrides;
- old URLs.

Replace the whole file. Do not delete it. Rebuild `tests/compileEnvironment.test.ts` as the standalone V2 integration suite that exercises the fixtures created in Plan 02 and the migrated examples from this plan. The replacement file must cover dev isolated, dev `--full`, prod integrated, test isolated, service E2E, endpoint publication, dependency materialization/inertness, environment precedence, and fail-fast invalid configuration. Keep this filename as the stable integration-test entry point.

## 27.2 `tests/mesh.test.ts`

Delete/replace all cases for:

- `mesh.port` precedence;
- `preservePort`;
- `provideDependency`;
- `replaceMocks`;
- mesh healthcheck override;
- old network/public URL syntax;
- synthesized port 3000 healthcheck;
- first tester service behavior.

Retain CLI/check/down tests only after converting their inputs to V2.

## 27.3 `tests/templates.test.ts`

Remove expectation that standalone template exists.

Add expectations:

- no template contains `PUBLIC_PORT`;
- no template contains default `3000` port mapping;
- E2E template does not hardcode `API_URL`;
- packaged Dockerfile policy exists.

## 27.4 CLI tests

Add/modify:

- `service up dev --full` accepted;
- `--integrated` rejected;
- stage choices unchanged;
- mesh test invokes unit phase then global E2E;
- mesh E2E requires tester;
- help describes build/mesh V2 semantics without legacy terms.

---

# 28. Required final V2 regression matrix

The final test suite must contain explicit automated coverage for every item below.

## Configuration and schema

- [ ] every removed build field rejected;
- [ ] every removed mesh field rejected;
- [ ] identifier regex and reserved mesh names;
- [ ] non-string env rejected;
- [ ] port range/type;
- [ ] scheme grammar;
- [ ] stage partial objects accepted structurally;
- [ ] effective stage completeness enforced semantically;
- [ ] exactly one primary for every nonempty endpoint set.

## Stage overlays

- [ ] map deep merge;
- [ ] scalar replacement;
- [ ] omitted inheritance;
- [ ] stage-only map additions;
- [ ] build dependency `dependsOn` union;
- [ ] mesh `dependsOn` union;
- [ ] mesh `publish` union;
- [ ] no removal syntax;
- [ ] E2E does not inherit prod.

## References

- [ ] all eight endpoint properties;
- [ ] URL scheme required;
- [ ] public requires effective publication;
- [ ] literal `$$`;
- [ ] unresolved references fail;
- [ ] build grammar exact;
- [ ] mesh grammar exact/no `services.` prefix;
- [ ] tester network refs fail.

## Dependencies

- [ ] no endpoints -> inert;
- [ ] inert `dependsOn` target fails;
- [ ] atomic multi-service materialization;
- [ ] atomic suppression on substitution;
- [ ] endpoint owner exact/no fallback;
- [ ] dependency env to all services;
- [ ] forbidden Compose ports;
- [ ] forbidden host network/privileged/container_name/root bind;
- [ ] services/resources namespace isolation;
- [ ] internal refs rewrite;
- [ ] all distinct endpoint owners require healthcheck;
- [ ] app automatically depends on all owners healthy;
- [ ] dependency module lifecycle owner-to-owner healthy;
- [ ] cycles fail.

## Override Compose

- [ ] only app;
- [ ] no publication/lifecycle ownership;
- [ ] build args allowed explicitly;
- [ ] Builder internal env authoritative;
- [ ] override Compose cannot set `healthcheck.test` or `disable`; only health timing/retry fields are accepted, preserving the Dockerfile-owned readiness command.

## Service testing

- [ ] dev isolated;
- [ ] dev full integrated;
- [ ] prod integrated;
- [ ] test-unit isolated target test;
- [ ] test-e2e prod app + e2e runtime + integrated deps + host tester;
- [ ] `service test` unit failure prevents E2E.

## Mesh

- [ ] stage-added service support;
- [ ] logical slot/provider validation;
- [ ] actual-reference-driven provider compatibility;
- [ ] provider can use different ports;
- [ ] explicit publication only;
- [ ] local substituted publish target fails;
- [ ] fixed collisions global;
- [ ] AUTO deterministic global order;
- [ ] explicit lifecycle health edge;
- [ ] substitution lifecycle health edge;
- [ ] combined graph cycles;
- [ ] env refs do not imply lifecycle;
- [ ] no service_started.

## Global tester

- [ ] root tester shape only;
- [ ] exact service selection;
- [ ] runner closure;
- [ ] only runner host network;
- [ ] tester env only runner;
- [ ] only public refs;
- [ ] all top-level apps health gate;
- [ ] selected runner is exit-code source.

## Host ports

- [ ] fixed reserved before AUTO;
- [ ] fixed collision exact endpoint diagnostics;
- [ ] non-published mesh endpoint does not allocate;
- [ ] cache reuse;
- [ ] occupied cache value replaced;
- [ ] disposable cache behavior.

---

# 29. Add canonical V2 fixture set

Create one self-contained fixture tree rather than making every test construct JSON inline:

```text
tests/fixtures/v2/
  service-basic/
  service-multidependency/
  service-override/
  service-e2e/
  mesh-basic/
  mesh-substitution/
  mesh-e2e/
  invalid/
```

`invalid/` subdirectories should have one defect each and descriptive names:

```text
legacy-build-port/
legacy-mesh-preserve-port/
invalid-primary/
missing-dependency-owner/
owner-without-health/
dependency-compose-ports/
dependency-cycle/
unpublished-public-reference/
provider-missing-used-endpoint/
mesh-lifecycle-cycle/
tester-network-reference/
```

Keep legacy configs only in these explicitly invalid fixtures.

---

# 30. Exact JSON Schema publication sanity tests

Add `tests/v2/generatedSchemas.test.ts`:

1. run/import generated schema JSON;
2. assert build schema includes root `app`, `dependencies`, `tester`, `dev`, `prod`, `test`, `e2e`;
3. assert root `port`, `envOverrides`, `overrides`, `composeFiles`, `services`, `policy`, `policies` absent;
4. assert dependency `compose`, `env`, `endpoints`, `dependsOn` present;
5. assert dependency-level `service`, `port`, `ports`, `path` absent;
6. assert mesh service `path`, `env`, `dependencies`, `dependsOn`, `publish` present;
7. assert old mesh fields absent;
8. assert mesh tester `compose`, `service`, `env` only.

Do not use snapshot-only tests; make explicit semantic assertions so schema formatting changes do not create noise.

---

# 31. Documentation/source-comment cleanup

Search runtime package and examples:

```bash
rg -n 'envOverrides|provideDependency|replaceMocks|preservePort|composeFiles|PUBLIC_PORT|dependency.*path|mock.*port|service_started|inherit-published' \
  src templates examples tests scripts README.md
```

For each match:

- runtime source: remove/replace unless it is an intentional rejection error/token list;
- examples: migrate;
- tests: keep only rejection tests;
- README/help: rewrite to V2;
- spec docs: do not edit normative `SPECS_V2.md`, `BUILD_JSON_DOCS.md`, `MESH_JSON_DOCS.md` unless correcting an actual contradiction separately.

Do not add a legacy migration translator.

---

# 32. Final package exports

Ensure `src/index.ts` exports:

```ts
export * from "./types/index.js";
export { createCli, runCli } from "./cli.js";
export { compileEnvironment, type CompileEnvironmentOptions } from "./core/compileEnvironment.js";
export { compileMeshEnvironment } from "./core/mesh/compileMeshEnvironment.js";
export { compileApplicationEnv, serializeApplicationEnv } from "./core/compileApplicationEnv.js";
export { teardownCompose } from "./core/teardownCompose.js";
export { runCompose } from "./core/runCompose.js";
export { buildJsonSchema } from "./core/buildSchema.js";
export { meshSchema } from "./core/mesh/meshSchema.js";
export { ScriptError } from "./errors/ScriptError.js";
export { NotFoundError } from "./errors/NotFoundError.js";
export { ConfigError } from "./errors/ConfigError.js";
export { PortConflictError } from "./errors/PortConflictError.js";
export { version } from "./version.js";
```

Do not export internal composition types, generated service names, namespace functions, or cache internals unless there is already a documented public API requirement.

---

# 33. Full verification sequence

Run in this exact order from Builder package root:

```bash
pnpm typecheck
pnpm test
pnpm build:schemas
pnpm typecheck
pnpm test
pnpm check:v2-no-legacy
pnpm build
pnpm prepublishOnly
```

Then run targeted CLI smoke tests against canonical fixtures:

```bash
pnpm builder check -C tests/fixtures/v2/service-basic
pnpm builder service up dev --dry-run -C tests/fixtures/v2/service-basic
pnpm builder service up dev --full --dry-run -C tests/fixtures/v2/service-multidependency
pnpm builder service up prod --dry-run -C tests/fixtures/v2/service-basic
pnpm builder service up test-unit --dry-run -C tests/fixtures/v2/service-basic
pnpm builder service up test-e2e --dry-run -C tests/fixtures/v2/service-e2e

pnpm builder mesh check -C tests/fixtures/v2/mesh-basic
pnpm builder mesh up dev --dry-run -C tests/fixtures/v2/mesh-basic
pnpm builder mesh up prod --dry-run -C tests/fixtures/v2/mesh-basic
pnpm builder mesh test-unit --dry-run -C tests/fixtures/v2/mesh-basic
pnpm builder mesh test-e2e --dry-run -C tests/fixtures/v2/mesh-e2e
```

Then run negative smoke tests and assert nonzero exit:

```bash
pnpm builder check -C tests/fixtures/v2/invalid/legacy-build-port
pnpm builder check -C tests/fixtures/v2/invalid/owner-without-health
pnpm builder mesh check -C tests/fixtures/v2/invalid/legacy-mesh-preserve-port
pnpm builder mesh check -C tests/fixtures/v2/invalid/mesh-lifecycle-cycle
```

---

# 34. Manual generated-YAML inspection gate

For one service full-dev output and one mesh E2E output, inspect the generated YAML and confirm all of these manually before merge:

```text
no generic :3000 assumptions
no PUBLIC_PORT
no legacy envOverrides artifacts
no inferred dependency owner
no service_started
all dependency owner lifecycle edges service_healthy
all top-level mesh lifecycle edges service_healthy
no raw dependency Compose host ports
substituted dependency local services/resources absent
private mesh endpoints lack host port mappings
published endpoints map to 127.0.0.1
E2E app target prod but EXEC_MODE=e2e
service E2E tester host network
mesh selected tester runner host network
helper tester services not forced host network
```

This is a release gate, not a substitute for automated tests.

---

# 35. Migration commit order

Use these exact commit boundaries so failures are bisectable:

```text
1. feat(builder): add V2 schemas, effective-stage resolution, reference and port primitives
2. feat(builder): replace standalone service compiler with V2 composition
3. feat(builder): replace mesh compiler and tester with V2 composition
4. feat(builder): enforce Builder-owned V2 validation contracts
5. test(builder): migrate fixtures and add complete V2 regression matrix
6. chore(builder): remove V1/V1.2 utilities/templates and regenerate schemas
```

Do not mix application feature work or unrelated generator changes into these commits.

---

# 36. Final zero-legacy grep gate

Run:

```bash
rg -n '\b(port|envOverrides|overrides|composeFiles|policy|policies|injects|sidecars)\b' src/core/buildSchema.ts src/types/index.ts
rg -n 'provideDependency|replaceMocks|preservePort|envOverrides|healthcheck' src/core/mesh/meshSchema.ts src/core/mesh/types.ts
rg -n 'service_started' src
rg -n 'PUBLIC_PORT' src templates/docker
rg -n 'buildJson\.port|dependency\.port|dependency\.ports|dependency\.path|dependency\.service' src
```

Interpretation:

- schema/types searches should show none of the removed fields except legitimate endpoint `port` and Dockerfile healthcheck concepts where regex is broad;
- `service_started` must have zero runtime hits;
- `PUBLIC_PORT` zero runtime/template hits;
- old dependency-level accessors zero runtime hits.

Then run:

```bash
find src -type f \( -name '*.ts' -o -name '*.tsx' \) -print0 | xargs -0 rg -n 'extractBuildDeps|extractOverrides|dependencyPorts|addDependenciesToAppService|renameServicesWithDependencies'
```

Expected: zero hits.

---

# 37. Release acceptance criteria mapped directly to V2

Do not call the migration complete until every statement is true:

### Configuration ownership

- [ ] `build.json` is the only service-local source of app/dependency endpoint truth;
- [ ] `mesh.json` does not define endpoint ports/schemes/healthchecks;
- [ ] no legacy field is translated.

### Endpoints

- [ ] ports exist only under named endpoints;
- [ ] one primary per non-empty endpoint set;
- [ ] app primary injects internal `PORT`;
- [ ] dependency primary has no extra runtime side effect;
- [ ] no scheme is inferred;
- [ ] all eight endpoint properties behave exactly.

### Dependencies

- [ ] dependency has no dependency-level service field;
- [ ] every endpoint explicitly selects owner service;
- [ ] zero endpoints means inert;
- [ ] materialization is atomic;
- [ ] substitution suppression is atomic;
- [ ] raw dependency Compose cannot publish host ports;
- [ ] implementation names/resources are isolated per consumer+dependency.

### Health/lifecycle

- [ ] dev/prod app healthcheck contract enforced;
- [ ] all dependency endpoint owners healthchecked;
- [ ] app automatically waits on all local endpoint owners;
- [ ] dependency module edges health-gated;
- [ ] mesh explicit edges health-gated;
- [ ] substitution edges health-gated;
- [ ] zero generated `service_started` fallback;
- [ ] env references do not create readiness edges.

### Stages/testing

- [ ] dev isolated by default;
- [ ] dev --full integrated;
- [ ] prod integrated;
- [ ] test-unit isolated;
- [ ] service E2E prod target + e2e runtime;
- [ ] mesh unit tests isolated per service with mesh test env;
- [ ] mesh global E2E uses e2e overlay, not prod overlay;
- [ ] unit failure stops E2E.

### Mesh

- [ ] service key is authoritative mesh identity;
- [ ] logical dependency binding is service-local;
- [ ] provider compatibility is usage/property specific;
- [ ] mesh publication explicit/private by default;
- [ ] one global host-port namespace;
- [ ] deterministic AUTO order/cache;
- [ ] global tester explicit Compose + explicit runner service;
- [ ] selected runner host-networked and public-ref only.

### Packaging

- [ ] generated JSON schemas are V2;
- [ ] Builder-owned Dockerfile policy is packaged;
- [ ] old standalone port template absent;
- [ ] package prepublish checks pass;
- [ ] no runtime V1 identifiers remain.

---

# 38. Final result

After this plan, there must be no “old mode” and no hidden compatibility branch. A configuration either satisfies V2 or fails with an actionable error identifying the source file, configuration path, active stage/composition, reference/value, and reason.

That is the final migration state required by `SPECS_V2.md`, `BUILD_JSON_DOCS.md`, and `MESH_JSON_DOCS.md`.
