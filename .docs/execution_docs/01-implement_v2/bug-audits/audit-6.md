# Solid Stack Builder V2 — Fresh Specification Audit and Test-Gated Fix Plan

**Audit date:** 2026-10-12  
**Audited snapshot:** newest uploaded repository snapshot, `Pasted text(8).txt`  
**Normative sources:** `docs/SPECS_V2.md`, `docs/BUILD_JSON_DOCS.md`, `docs/MESH_JSON_DOCS.md`  
**Package snapshot:** `@solid-stack/builder` 2.0.x line represented by the uploaded repository export  
**Audit rule:** the three V2 documents win over implementation details, old audits, migration plans, or legacy behavior.

---

# 1. Executive result

This is a fresh audit of the newest code snapshot.

The previous semantic-preservation audit findings are **not carried forward automatically**. The current repository already contains the changeset:

```text
.changeset/fix-v2-compose-semantic-preservation.md
```

and regression gates for the previous A01–A13 findings in:

```text
tests/conformance/audit-regressions.test.ts
```

The current code visibly contains the corresponding fixes: raw override Compose interpolation preservation, bare Compose environment pass-through, fail-closed app-override validation, per-mesh-service override resource namespacing, collision-aware generated names, exact dependency-bundle membership, network-mode-safe private network attachment, strict endpoint-owner healthcheck validation, dependency `profiles`/`extends` rejection, remote build-context preservation, build-secret rewriting, global tester array-form `depends_on` preservation, and generated mesh-schema reserved-name patching.

Those items are therefore **not bugs in this audit unless their existing gates regress**.

The fresh audit found the following new specification/implementation mismatches:

| ID | Severity | Finding | Primary area |
|---|---|---|---|
| B01 | HIGH | Mesh AUTO publication ordering is globally grouped by target type instead of ordered per service | mesh publication / ports |
| B02 | HIGH | `mesh.test` logical dependency bindings are accepted but never semantically validated | mesh test-unit |
| B03 | HIGH | `mesh.test` `publish` declarations are accepted but ignored by test-unit compilation | mesh test-unit / publication |
| B04 | MEDIUM-HIGH | Builder-managed JSON paths documented as relative accept absolute in-project paths | path contract |
| B05 | MEDIUM-HIGH | Dockerfile policy rejects `HEALTHCHECK NONE` globally, including finite `test`/`test-e2e` targets | Dockerfile policy |
| B06 | HIGH | Missing named Compose resource references are not rejected before namespacing | dependency/tester Compose |
| B07 | HIGH | Local `build.additional_contexts` paths are not rebased when Compose files are inlined | Compose path preservation |
| B08 | HIGH | Global tester implementation closure omits `ipc: service:` / `pid: service:` and accepts unresolved `extends` | global tester |
| B09 | MEDIUM-HIGH | Runtime host-port extraction misparses legal Compose short syntax | runtime collision preflight |
| B10 | HIGH, runtime-gated | Dependency service-name DNS semantics are lost when service keys are namespaced | dependency atomicity / DNS |

The first nine findings are directly visible as source/spec mismatches. B10 is also strongly indicated by the generated Compose model, but because its user-visible consequence is Docker DNS behavior, its production patch is explicitly gated by a real-Docker reproduction.

---

# 2. Mandatory test-first decision protocol

This plan deliberately prevents speculative fixes.

For **every finding** below, the implementer must follow this exact sequence:

1. Add only the proposed regression test.
2. Do **not** change production code yet.
3. Run the narrowest test file containing that regression.
4. Classify the result:
   - **FAILS for the exact predicted reason** → bug is reproduced; proceed with the production fix.
   - **PASSES** → stop; do not implement the proposed production fix. Mark the finding `NOT REPRODUCED`.
   - **FAILS for an unrelated reason** → the test is not a valid gate yet. Fix only the fixture/test harness until it reaches the intended assertion. Do not modify production behavior.
5. After a production fix, rerun:
   - the new regression;
   - the entire relevant conformance catalog;
   - `pnpm typecheck`;
   - finally the full test/check commands in §16.
6. Do not weaken a test merely to make the implementation green.
7. Do not combine multiple production fixes before their individual gates have independently reproduced the bugs.

Recommended temporary commit sequence:

```text
test(audit): reproduce B01 mesh AUTO ordering
fix(mesh): preserve per-service AUTO ordering

test(audit): reproduce B02 test-stage dependency binding validation
fix(mesh): validate test-stage bindings

...
```

If a proposed test passes against the unmodified current snapshot, that item must be removed from the fix branch.

---

# 3. Audit scope and evidence model

The audit compares the current implementation against the final V2 contract, especially these rules:

- V2 is fail-fast: declared configuration must not be silently ignored, coerced, remapped, guessed, or weakened.
- mesh stage overlays may add/override `env`, logical dependency bindings, `dependsOn`, `publish`, and scalar service fields; the active stage is validated after overlay resolution.
- mesh AUTO allocation order is deterministic:
  1. services alphabetically;
  2. **within each service**, app endpoints first;
  3. then dependencies alphabetically;
  4. endpoints alphabetically.
- `test-unit` is isolated, but it still uses the effective `mesh.test` and `build.test` configuration.
- Builder-managed paths such as dependency `compose` are relative project paths and must remain within their project boundary.
- `dev` and `prod` require healthchecks; `test` and `test-e2e` are finite runners and do not require healthchecks.
- a materialized dependency is one atomic Compose implementation; its resources and internal Compose relationships must remain semantically valid after namespacing.
- global tester compilation must materialize the Compose implementation required by the selected runner.
- Builder-generated host-port checks must operate on actual published host ports, not container-only ports or host-IP octets.

This is a static source audit of a concatenated repository snapshot. The snapshot is not a normal installed checkout, so this audit does not claim that Vitest/Docker were executed against it. That limitation is why every fix below begins with a mandatory reproducer.

---

# 4. B01 — Mesh AUTO allocation order violates the normative per-service order

**Severity:** HIGH  
**Primary file:** `src/core/mesh/v2/compileMeshComposition.ts`  
**Test file to edit:** `tests/conformance/08-publication.test.ts`

## Bug

The current compiler creates mesh port intents in two global passes:

```ts
for (const name of Object.keys(services).sort()) {
  // all app publications for every service
}

for (const name of Object.keys(services).sort()) {
  // all dependency publications for every service
}
```

That produces:

```text
a.app
b.app
a.dependencies.*
b.dependencies.*
```

for services `a` and `b`.

The V2 ordering is:

```text
a.app
a.dependencies.*
b.app
b.dependencies.*
```

The difference changes deterministic AUTO allocation and therefore changes cached/public endpoint identities.

## Why this is a V2 bug

The specification does not merely require deterministic sorting in general. It prescribes nesting:

```text
service A
  app endpoints
  dependencies
service B
  app endpoints
  dependencies
```

The current implementation instead groups endpoint target types globally.

## Mandatory pre-fix regression

Append to `tests/conformance/08-publication.test.ts`:

```ts
it("AUDIT-B01 allocates AUTO app then dependencies within each mesh service", () => {
  const root = meshFixture(
    {
      services: {
        a: {
          path: "a",
          publish: [
            "app.endpoints.http",
            "dependencies.db.endpoints.api",
          ],
        },
        b: {
          path: "b",
          publish: [
            "app.endpoints.http",
            "dependencies.db.endpoints.api",
          ],
        },
      },
    },
    {
      a: {
        app: {
          endpoints: {
            http: http(3000, { publicPort: "AUTO" }),
          },
        },
        dependencies: {
          db: dep("d.yml", "owner", 6379, { publicPort: "AUTO" }),
        },
      },
      b: {
        app: {
          endpoints: {
            http: http(3000, { publicPort: "AUTO" }),
          },
        },
        dependencies: {
          db: dep("d.yml", "owner", 6379, { publicPort: "AUTO" }),
        },
      },
    },
    {
      "a/d.yml": ownerBundle(),
      "b/d.yml": ownerBundle(),
    },
  );

  const result = compileMesh("prod", root);

  expect(result.endpoints.app.a?.http?.publicPort).toBe(60000);
  expect(result.endpoints.dependencies.a?.db?.api?.publicPort).toBe(59999);
  expect(result.endpoints.app.b?.http?.publicPort).toBe(59998);
  expect(result.endpoints.dependencies.b?.db?.api?.publicPort).toBe(59997);
});
```

Why these exact numbers are valid in the conformance suite:

```text
compileMesh(...)
  -> compileMeshComposition(..., { validationMode: true })
  -> validation allocator starts at 60000 and decrements
```

### Expected pre-fix result

The test should fail with the current order approximately:

```text
a.app = 60000
b.app = 59999
a.db  = 59998
b.db  = 59997
```

The second expectation should therefore fail:

```text
expected 59999
received 59998
```

### Go/no-go

- If it fails with this ordering discrepancy: **PROCEED**.
- If it already returns `60000, 59999, 59998, 59997` in the normative nested order: **DO NOT PATCH B01**.

## Production fix

In `src/core/mesh/v2/compileMeshComposition.ts`, extract port-intent creation into a small helper so the nesting is obvious and independently testable.

Add near the existing publication helpers:

```ts
function buildMeshPortIntents(
  services: Record<string, LoadedMeshService>,
  publication: EffectivePublication[],
): PortIntent[] {
  const intents: PortIntent[] = [];

  for (const name of Object.keys(services).sort((a, b) => a.localeCompare(b))) {
    const service = services[name]!;

    const appPublications = publication
      .filter(pub =>
        pub.ownerMeshService === name &&
        pub.target === "app"
      )
      .sort((a, b) => a.endpoint.localeCompare(b.endpoint));

    for (const pub of appPublications) {
      const endpoint = service.effectiveBuild.app.endpoints[pub.endpoint]!;
      intents.push({
        logicalPath: pub.logicalPath,
        requested: endpoint.publicPort!,
      });
    }

    const dependencyNames = [
      ...new Set(
        publication
          .filter(pub =>
            pub.ownerMeshService === name &&
            pub.target === "dependency"
          )
          .map(pub => pub.dependency!),
      ),
    ].sort((a, b) => a.localeCompare(b));

    for (const dependency of dependencyNames) {
      const endpointPublications = publication
        .filter(pub =>
          pub.ownerMeshService === name &&
          pub.target === "dependency" &&
          pub.dependency === dependency
        )
        .sort((a, b) => a.endpoint.localeCompare(b.endpoint));

      for (const pub of endpointPublications) {
        const endpoint =
          service.effectiveBuild.dependencies[dependency]!
            .endpoints[pub.endpoint]!;

        intents.push({
          logicalPath: pub.logicalPath,
          requested: endpoint.publicPort!,
        });
      }
    }
  }

  return intents;
}
```

Replace the two current global loops with:

```ts
const publication =
  resolveMeshPublication(services, bindingMap, stage, meshPath);

const intents = buildMeshPortIntents(services, publication);

const ports = allocateHostPorts(
  meshDir,
  stage,
  intents,
  Boolean(options.validationMode),
);
```

Do not change `allocateHostPorts`; the bug is caller ordering.

## Post-fix verification

```bash
pnpm vitest run tests/conformance/08-publication.test.ts
pnpm typecheck
```

Also retain the existing publication ordering tests for:

- alphabetical services;
- app before dependency for one service;
- dependencies alphabetically;
- endpoints alphabetically.

---

# 5. B02 — `mesh.test` dependency bindings are silently ignored instead of validated

**Severity:** HIGH  
**Primary files:**

```text
src/core/mesh/runners/runMeshTestUnit.ts
src/core/mesh/checkers/checkMeshServices.ts
src/core/mesh/v2/substitution.ts
```

**Test file:** `tests/conformance/09-mesh-env.test.ts`

## Bug

The effective `mesh.test` stage is loaded, but test-unit constructs a reference context with:

```ts
bindings: new Map()
```

and never invokes:

```ts
buildDependencyBindings(...)
```

The same omission exists in the test-stage branch of `checkMeshServices`.

Consequently, declarations such as:

```json
{
  "test": {
    "services": {
      "consumer": {
        "dependencies": {
          "typo-slot": "provider"
        }
      }
    }
  }
}
```

can be accepted even when:

```text
consumer.build.json.dependencies["typo-slot"]
```

does not exist.

A provider typo can likewise be silently ignored.

## Why this is a V2 bug

V2 explicitly allows stage overlays—including `test`—to add/override logical dependency bindings.

V2 also says:

```text
The active mesh stage is validated after overlay resolution.
```

and the global fail-fast rule forbids silently omitting a declared configuration.

Isolation means the provider service is not materialized as a runtime dependency of the unit-test container. It does **not** mean the declaration is exempt from semantic validation.

## Mandatory pre-fix tests

Add:

```ts
it("AUDIT-B02 rejects unknown logical dependency binding in mesh.test", async () => {
  const root = meshFixture(
    {
      services: {
        consumer: { path: "consumer" },
        provider: { path: "provider" },
      },
      test: {
        services: {
          consumer: {
            dependencies: {
              "missing-slot": "provider",
            },
          },
        },
      },
    },
    {
      consumer: { app: {} },
      provider: { app: {} },
    },
  );

  await expect(
    runMeshTestUnit({ projectDir: root, dryRun: true }),
  ).rejects.toThrow(/missing-slot|Unknown logical dependency slot/i);
});

it("AUDIT-B02 rejects nonexistent provider binding in mesh.test", async () => {
  const root = meshFixture(
    {
      services: {
        consumer: { path: "consumer" },
      },
      test: {
        services: {
          consumer: {
            dependencies: {
              db: "missing-provider",
            },
          },
        },
      },
    },
    {
      consumer: {
        app: {},
        dependencies: {
          db: dep("d.yml"),
        },
      },
    },
    {
      "consumer/d.yml": ownerBundle(),
    },
  );

  await expect(
    runMeshTestUnit({ projectDir: root, dryRun: true }),
  ).rejects.toThrow(/missing-provider|provider/i);
});
```

### Expected pre-fix result

At least one test should unexpectedly resolve:

```ts
resolves.toBe(0)
```

because test-unit never validates the binding map.

### Go/no-go

Proceed only if the invalid declaration is accepted or fails later for something unrelated to provider/slot semantic validation.

If both already fail directly in `buildDependencyBindings` or equivalent test-stage validation, do not patch.

## Production fix

Create a shared test-stage validation helper rather than duplicating logic.

Add:

```text
src/core/mesh/v2/validateMeshTestStage.ts
```

with:

```ts
import { buildDependencyBindings, bindingsMap } from "./substitution.js";
import type { LoadedMeshService } from "./types.js";

export interface ValidatedMeshTestStage {
  bindings: ReturnType<typeof bindingsMap>;
}

export function validateMeshTestStage(
  services: Record<string, LoadedMeshService>,
  meshPath: string,
): ValidatedMeshTestStage {
  const bindings = buildDependencyBindings(
    services,
    "test",
    meshPath,
  );

  return {
    bindings: bindingsMap(bindings),
  };
}
```

In `runMeshTestUnit.ts`, immediately after `loadEffectiveMeshServices(...)`:

```ts
const { bindings } = validateMeshTestStage(
  services,
  meshPath,
);
```

Important: **do not use that map to make cross-service references available to the isolated unit test**. Keep the per-service runtime reference context isolated:

```ts
const refCtx: MeshReferenceContext = {
  services: { [name]: svc },
  bindings: new Map(),
  endpoints,
  stage: "test",
  meshJsonPath: meshPath,
};
```

The validated map proves the declaration is semantically legal; isolated unit runtime still cannot reach other top-level mesh services.

Do the same semantic call in `checkMeshServices` before its per-service test-stage loop:

```ts
if (stage === "test") {
  validateMeshTestStage(services, meshPath);
}
```

This prevents `builder mesh check` and `builder mesh test-unit --dry-run` from disagreeing.

## Post-fix verification

```bash
pnpm vitest run tests/conformance/09-mesh-env.test.ts
pnpm typecheck
```

Negative controls to retain:

- cross-service mesh env reference during test-unit still fails;
- valid test overlay literal env still succeeds;
- no provider is started during test-unit.

---

# 6. B03 — `mesh.test` publish declarations are silently ignored

**Severity:** HIGH  
**Primary files:**

```text
src/core/mesh/runners/runMeshTestUnit.ts
src/core/mesh/checkers/checkMeshServices.ts
src/core/mesh/v2/publication.ts
src/core/mesh/v2/validateMeshTestStage.ts   # created by B02
```

**Tests:** `tests/conformance/08-publication.test.ts` and/or `09-mesh-env.test.ts`

## Bug

The schema and stage resolver allow:

```json
{
  "test": {
    "services": {
      "api": {
        "publish": ["app.endpoints.http"]
      }
    }
  }
}
```

but `runMeshTestUnit` never reads `svc.publish`.

Therefore even an obviously invalid declaration such as:

```json
"publish": ["app.endpoints.does-not-exist"]
```

can survive test-unit compilation.

No test-stage host-port intent is generated, so the V2 rule that every effective publish entry participates in host-port resolution for that stage is not implemented for `test`.

## Why this is a V2 bug

This is not a request to integrate local dependencies into unit tests.

Two separate V2 rules apply:

1. test-unit remains isolated;
2. `publish` is a legal mesh service stage overlay and the active stage is validated;
3. every effective publish entry participates in host-port resolution for its active stage.

The current code satisfies rule 1 by simply ignoring rule 2/3.

## Mandatory pre-fix test A — invalid publish must fail

```ts
it("AUDIT-B03 validates publish declarations in mesh.test", async () => {
  const root = meshFixture(
    {
      services: {
        api: { path: "api" },
      },
      test: {
        services: {
          api: {
            publish: ["app.endpoints.missing"],
          },
        },
      },
    },
    {
      api: {
        app: {
          endpoints: {
            http: http(3000, { publicPort: "AUTO" }),
          },
        },
      },
    },
  );

  await expect(
    runMeshTestUnit({ projectDir: root, dryRun: true }),
  ).rejects.toThrow(/missing|Published app endpoint does not exist/i);
});
```

### Expected pre-fix result

Current code is expected to resolve `0` because `publish` is not consulted.

## Mandatory pre-fix test B — fixed test-stage collisions must be detected

```ts
it("AUDIT-B03 reserves effective mesh.test fixed app publications globally", async () => {
  const root = meshFixture(
    {
      services: {
        a: { path: "a" },
        b: { path: "b" },
      },
      test: {
        services: {
          a: { publish: ["app.endpoints.http"] },
          b: { publish: ["app.endpoints.http"] },
        },
      },
    },
    {
      a: {
        app: {
          endpoints: {
            http: http(3000, { publicPort: 34001 }),
          },
        },
      },
      b: {
        app: {
          endpoints: {
            http: http(3000, { publicPort: 34001 }),
          },
        },
      },
    },
  );

  await expect(
    runMeshTestUnit({ projectDir: root, dryRun: true }),
  ).rejects.toThrow(/34001|collision/i);
});
```

### Go/no-go

Proceed if either invalid publish or fixed collision is silently accepted.

## Required semantics for the fix

Implement test-stage publication without breaking isolated execution:

- only the current service's **app** can be published during its isolated test run;
- dependency publication in `mesh.test` is invalid because test-unit does not materialize local dependency bundles;
- all effective test-stage app publications are validated before running the first service;
- all fixed test-stage public ports are reserved globally before AUTO allocation;
- AUTO allocation follows mesh service ordering;
- the resolved mapping is applied only to the corresponding isolated app composition;
- cross-service references remain unavailable during test-unit.

## Extend `validateMeshTestStage.ts`

Return:

```ts
export interface TestAppPublication {
  meshService: string;
  endpoint: string;
  logicalPath: string;
  containerPort: number;
  requested: number | "AUTO";
}

export interface ValidatedMeshTestStage {
  bindings: Map<string, string>;
  appPublications: TestAppPublication[];
  allocatedPorts: Map<string, number>;
}
```

Implementation sketch:

```ts
export function validateMeshTestStage(
  services: Record<string, LoadedMeshService>,
  meshDir: string,
  meshPath: string,
  validationMode = false,
): ValidatedMeshTestStage {
  const bindings = buildDependencyBindings(
    services,
    "test",
    meshPath,
  );
  const bindingMap = bindingsMap(bindings);

  const publication = resolveMeshPublication(
    services,
    bindingMap,
    "test",
    meshPath,
  );

  for (const pub of publication) {
    if (pub.target === "dependency") {
      throw new ConfigError({
        sourceFile: meshPath,
        configPath: `services.${pub.ownerMeshService}.publish`,
        stage: "test",
        composition: "mesh",
        value: pub.logicalPath,
        reason:
          "mesh.test is isolated; dependency endpoints are not materialized and cannot be published",
      });
    }
  }

  const appPublications = publication
    .filter(pub => pub.target === "app")
    .sort((a, b) =>
      a.ownerMeshService.localeCompare(b.ownerMeshService) ||
      a.endpoint.localeCompare(b.endpoint)
    )
    .map(pub => {
      const ep =
        services[pub.ownerMeshService]!
          .effectiveBuild.app.endpoints[pub.endpoint]!;

      return {
        meshService: pub.ownerMeshService,
        endpoint: pub.endpoint,
        logicalPath: pub.logicalPath,
        containerPort: ep.port,
        requested: ep.publicPort!,
      };
    });

  const allocatedPorts = allocateHostPorts(
    meshDir,
    "test",
    appPublications.map(pub => ({
      logicalPath: pub.logicalPath,
      requested: pub.requested,
    })),
    validationMode,
  );

  return {
    bindings: bindingMap,
    appPublications,
    allocatedPorts,
  };
}
```

In `runMeshTestUnit`, after compiling each isolated service, apply only that service's mappings:

```ts
for (const pub of validated.appPublications) {
  if (pub.meshService !== name) continue;

  const published = validated.allocatedPorts.get(pub.logicalPath)!;
  const ports = Array.isArray(app.ports) ? app.ports : [];

  ports.push({
    target: pub.containerPort,
    published,
    host_ip: PUBLIC_HOST,
    protocol: "tcp",
  });

  app.ports = ports;

  const endpoint = endpoints.app[name]?.[pub.endpoint];
  if (endpoint) {
    endpoint.publicHost = PUBLIC_HOST;
    endpoint.publicPort = published;
    endpoint.effectivelyPublished = true;
  }
}
```

Run the same validation-only helper from `checkMeshServices`, using `validationMode: true`.

## Post-fix verification

```bash
pnpm vitest run tests/conformance/08-publication.test.ts
pnpm vitest run tests/conformance/09-mesh-env.test.ts
pnpm typecheck
```

---

# 7. B04 — Builder-managed JSON paths documented as relative accept absolute paths

**Severity:** MEDIUM-HIGH  
**Primary file:** `src/core/config/pathSafety.ts`  
**Affected declarations include:**

```text
build.json.dockerfile
build.json.dependencies.<name>.compose
build stage override-compose
mesh.json services.<name>.path
mesh.json tester.compose
```

## Bug

`resolveInsideProject()` currently enforces containment, but not relativeness:

```ts
const resolved = path.resolve(projectDir, relativePath);

if (!isPathInside(projectDir, relativePath)) {
  throw ...
}

return resolved;
```

An absolute path that points **inside** the project passes.

That does not implement a field whose V2 grammar says it is relative to the project/service/mesh root.

It also creates inconsistent downstream behavior. For example, an absolute host Dockerfile path can be valid to Node but invalid inside a policy container mounted at `/project`.

## Mandatory pre-fix tests

Add a new section to `tests/conformance/audit-regressions.test.ts`:

```ts
it("AUDIT-B04 rejects absolute dependency compose path even when inside project", () => {
  const root = fixture(
    { app: {} },
    { "infra/d.yml": ownerBundle() },
  );

  write(root, "build.json", {
    app: {},
    dependencies: {
      db: dep(
        path.join(root, "infra/d.yml"),
      ),
    },
  });

  expect(
    () => compileService("prod", root),
  ).toThrow(/relative|absolute/i);
});

it("AUDIT-B04 rejects absolute Dockerfile path even when inside project", () => {
  const root = fixture({ app: {} });

  write(root, "build.json", {
    dockerfile: path.join(root, "Dockerfile"),
    app: {},
  });

  expect(
    () => compileService("dev", root),
  ).toThrow(/relative|absolute/i);
});

it("AUDIT-B04 rejects absolute mesh service path", () => {
  const root = meshFixture(
    { services: { api: { path: "api" } } },
    { api: { app: {} } },
  );

  write(root, "mesh.json", {
    services: {
      api: {
        path: path.join(root, "api"),
      },
    },
  });

  expect(
    () => compileMesh("dev", root),
  ).toThrow(/relative|absolute/i);
});
```

Also add equivalent tests for:

- stage `override-compose`;
- `tester.compose`.

### Expected pre-fix result

At least the absolute in-root declarations are expected to compile because containment succeeds.

### Go/no-go

If absolute in-root paths are already rejected as relative-path violations, do not patch.

## Production fix

Do not put the new check in generic Compose path rebasing. Generic Compose-owned bind/build paths are allowed to be absolute.

Restrict it to the Builder-managed path resolver.

In `src/core/config/pathSafety.ts` add:

```ts
function isAbsoluteManagedPath(value: string): boolean {
  return (
    path.isAbsolute(value) ||
    /^[A-Za-z]:[\\/]/.test(value) ||
    /^\\\\/.test(value) ||
    /^\/\//.test(value)
  );
}
```

Then update:

```ts
export function resolveInsideProject(
  projectDir: string,
  relativePath: string,
  context: {
    sourceFile: string;
    configPath: string;
    stage?: string;
  },
): string {
  if (!relativePath.trim()) {
    throw new ConfigError({
      ...context,
      value: relativePath,
      reason: "Path must not be empty",
    });
  }

  if (isAbsoluteManagedPath(relativePath)) {
    throw new ConfigError({
      ...context,
      value: relativePath,
      reason: "Builder-managed path must be relative to its project root",
    });
  }

  const resolved = path.resolve(projectDir, relativePath);

  if (!isPathInside(projectDir, relativePath)) {
    throw new ConfigError({
      ...context,
      value: relativePath,
      reason: "Path escapes the project directory",
    });
  }

  return resolved;
}
```

Keep all existing canonical/symlink escape protection.

## Post-fix verification

```bash
pnpm vitest run tests/conformance/audit-regressions.test.ts
pnpm typecheck
```

Positive controls:

- `Dockerfile`
- `.docker/dependencies/db.yml`
- `./e2e/docker-compose.yml`
- nested relative paths remaining inside project

must still succeed.

---

# 8. B05 — Dockerfile policy globally rejects `HEALTHCHECK NONE` even on finite targets

**Severity:** MEDIUM-HIGH  
**Primary file:** `templates/policy/dockerfile/dockerfile.rego`  
**Test file:** `tests/docker-acceptance/dockerfilePolicy.test.ts`

## Bug

The policy has a global rule:

```rego
deny contains msg if {
  some i
  input[i].Cmd == "healthcheck"
  lower(concat(" ", input[i].Value)) == "none"
  msg := sprintf("HEALTHCHECK NONE is forbidden (instruction %v)", [i])
}
```

This rejects:

```dockerfile
FROM base AS test
HEALTHCHECK NONE
```

and:

```dockerfile
FROM base AS test-e2e
HEALTHCHECK NONE
```

even though V2 explicitly says finite `test` and `test-e2e` do not require healthchecks.

A legitimate reason to use `HEALTHCHECK NONE` is to disable a healthcheck inherited from a runtime base stage in a finite runner.

## Mandatory pre-fix test

In `tests/docker-acceptance/dockerfilePolicy.test.ts`:

```ts
it("allows HEALTHCHECK NONE on finite test targets", () => {
  const dockerfile = `
FROM alpine AS base
CMD ["sh", "-c", "exec sleep 30"]
HEALTHCHECK CMD true

FROM base AS dev

FROM base AS test
HEALTHCHECK NONE
CMD ["sh", "-c", "exit 0"]

FROM base AS test-e2e
HEALTHCHECK NONE
CMD ["sh", "-c", "exit 0"]

FROM alpine AS builder
RUN echo data > /artifact

FROM alpine AS prod
COPY --from=builder /artifact /artifact
HEALTHCHECK CMD true
CMD ["sh", "-c", "exec sleep 30"]
`;

  const result = policy(dockerfile);

  expect(
    result.status,
    result.stdout + result.stderr,
  ).toBe(0);
});
```

### Expected pre-fix result

Conftest should fail specifically with:

```text
HEALTHCHECK NONE is forbidden
```

### Go/no-go

Proceed only if this finite-target Dockerfile is rejected for NONE.

## Correct production fix

Do **not** simply delete all healthcheck validation.

The correct contract is:

```text
effective dev healthcheck  != NONE and exists
effective prod healthcheck != NONE and exists
test/test-e2e may have NONE
```

The current `healthchecks[a]` implementation also counts any earlier valid healthcheck in the lineage. That becomes incorrect if a descendant later disables it with `HEALTHCHECK NONE`.

Replace the healthcheck model with **effective last healthcheck in lineage by instruction order**.

Add:

```rego
healthcheck_indices[a] := {i |
  some i
  stage_at[i] in lineage[a]
  input[i].Cmd == "healthcheck"
} if {
  some j
  a := alias_at[j]
}

effective_healthcheck_index[a] := max(healthcheck_indices[a]) if {
  count(healthcheck_indices[a]) > 0
}

effective_healthcheck_value[a] := lower(
  concat(
    " ",
    input[effective_healthcheck_index[a]].Value,
  ),
) if {
  effective_healthcheck_index[a]
}

has_valid_effective_healthcheck(a) if {
  effective_healthcheck_value[a]
  effective_healthcheck_value[a] != "none"
}
```

Replace:

```rego
deny contains "dev stage requires a valid HEALTHCHECK" if {
  "dev" in stages
  count(healthchecks.dev) == 0
}

deny contains "prod stage requires a valid HEALTHCHECK" if {
  "prod" in stages
  count(healthchecks.prod) == 0
}
```

with:

```rego
deny contains "dev stage requires a valid HEALTHCHECK" if {
  "dev" in stages
  not has_valid_effective_healthcheck("dev")
}

deny contains "prod stage requires a valid HEALTHCHECK" if {
  "prod" in stages
  not has_valid_effective_healthcheck("prod")
}
```

Delete the global `HEALTHCHECK NONE is forbidden` rule.

## Required negative controls

Add:

```ts
it("rejects HEALTHCHECK NONE when it is effective for dev", () => {
  ...
});

it("rejects HEALTHCHECK NONE when it is effective for prod", () => {
  ...
});

it("accepts inherited healthcheck when a later dev/prod stage does not disable it", () => {
  ...
});
```

This prevents the fix from weakening runtime readiness.

## Post-fix verification

```bash
pnpm vitest run --config vitest.docker.config.ts \
  tests/docker-acceptance/dockerfilePolicy.test.ts
```

---

# 9. B06 — Missing named Compose resources are not fail-fast validated

**Severity:** HIGH  
**Primary files:**

```text
src/core/composition/validateDependencyCompose.ts
src/core/mesh/v2/compileMeshTester.ts
```

**New helper:**

```text
src/core/composition/validateComposeResourceReferences.ts
```

## Bug

Current dependency validation checks internal service references but does not verify that service-level named resource references actually exist at the top level.

Examples currently capable of reaching namespacing unchanged:

```yaml
services:
  owner:
    volumes:
      - missing-volume:/data
```

without:

```yaml
volumes:
  missing-volume: {}
```

or:

```yaml
services:
  owner:
    configs:
      - missing-config
```

without a top-level config.

The same applies to:

- runtime secrets;
- service networks;
- `build.secrets`.

The namespacer only rewrites names present in its generated resource maps. Missing names therefore survive as dangling references.

Global tester resource discovery is similarly permissive: it adds a resource only when it finds a matching top-level definition, otherwise silently omitting it.

## Why this is a V2 bug

A declared dependency is supposed to be validated before runtime, and namespacing must preserve a valid atomic implementation.

Silently carrying a dangling resource through compilation defers a deterministic configuration error to Docker Compose runtime/config parsing, violating the fail-fast contract.

## Mandatory pre-fix tests

Add to `tests/conformance/04-dependencies.test.ts` or a focused new file:

```ts
describe("AUDIT-B06 named resource reference validation", () => {
  const healthy = {
    image: "alpine",
    healthcheck: { test: ["CMD", "true"] },
  };

  it.each([
    [
      "volume",
      {
        services: {
          owner: {
            ...healthy,
            volumes: ["missing:/data"],
          },
        },
      },
    ],
    [
      "network",
      {
        services: {
          owner: {
            ...healthy,
            networks: ["missing"],
          },
        },
      },
    ],
    [
      "config",
      {
        services: {
          owner: {
            ...healthy,
            configs: ["missing"],
          },
        },
      },
    ],
    [
      "secret",
      {
        services: {
          owner: {
            ...healthy,
            secrets: ["missing"],
          },
        },
      },
    ],
    [
      "build secret",
      {
        services: {
          owner: {
            ...healthy,
            build: {
              context: ".",
              secrets: ["missing"],
            },
          },
        },
      },
    ],
  ])("rejects missing %s definition", (_name, dependencyCompose) => {
    const root = fixture(
      {
        app: {},
        dependencies: {
          db: dep("d.yml"),
        },
      },
      {
        "d.yml": dependencyCompose,
      },
    );

    expect(
      () => compileService("prod", root),
    ).toThrow(/missing|undefined|resource/i);
  });
});
```

Add a tester control:

```ts
it("AUDIT-B06 rejects tester helper missing named secret", () => {
  const root = meshFixture(
    {
      services: {
        gateway: { path: "gateway" },
      },
      tester: {
        compose: "t.yml",
        service: "runner",
      },
    },
    {
      gateway: { app: {} },
    },
    {
      "t.yml": {
        services: {
          runner: {
            image: "alpine",
            secrets: ["missing"],
          },
        },
      },
    },
  );

  expect(
    () => compileMesh("e2e", root),
  ).toThrow(/missing|secret|resource/i);
});
```

### Expected pre-fix result

The compiler is expected not to throw at least for several cases; the dangling name remains in generated Compose.

### Go/no-go

Proceed only for the resource forms whose test actually demonstrates silent acceptance.

## Production fix

Create:

```text
src/core/composition/validateComposeResourceReferences.ts
```

with a reusable validator:

```ts
import { collectBuildSecretReferences } from "./composeBuildResources.js";
import { parseVolume } from "./composeVolumes.js";
import { ConfigError } from "../../errors/ConfigError.js";
import type {
  ComposeDocument,
  ComposeService,
} from "./types.js";

export function validateComposeResourceReferences(
  document: ComposeDocument,
  context: {
    sourceFile: string;
    configPathPrefix?: string;
    stage?: string;
    composition: "service" | "mesh";
  },
  onlyServices?: Iterable<string>,
): void {
  const selected = onlyServices
    ? new Set(onlyServices)
    : undefined;

  const fail = (
    path: string,
    kind: string,
    name: string,
  ): never => {
    throw new ConfigError({
      sourceFile: context.sourceFile,
      configPath: path,
      stage: context.stage,
      composition: context.composition,
      referencedObject: name,
      reason: `Compose ${kind} reference "${name}" has no top-level definition`,
    });
  };

  for (const [serviceName, service] of Object.entries(document.services ?? {})) {
    if (selected && !selected.has(serviceName)) continue;

    validateServiceResources(
      serviceName,
      service,
      document,
      fail,
    );
  }
}
```

Implement `validateServiceResources()` with these rules.

### Volumes

```ts
for (const mount of Array.isArray(service.volumes) ? service.volumes : []) {
  const parsed = parseVolume(mount);

  if (
    parsed?.type === "volume" &&
    parsed.source &&
    !document.volumes?.[parsed.source]
  ) {
    fail(
      `services.${serviceName}.volumes`,
      "volume",
      parsed.source,
    );
  }
}
```

Anonymous volumes have no source and remain valid.

Bind mounts are not top-level named resources.

### Networks

Collect array entries or object keys.

For each name:

```ts
if (name === "default") {
  // Compose implicit default is permitted.
  continue;
}

if (!document.networks?.[name]) {
  fail(...);
}
```

### Configs and runtime secrets

For each short string or long form `{source}`:

```ts
const source =
  typeof entry === "string"
    ? entry
    : typeof entry?.source === "string"
      ? entry.source
      : undefined;
```

Require the corresponding top-level map.

### Build secrets

Use:

```ts
collectBuildSecretReferences(service)
```

and require each name in `document.secrets`.

## Integration points

In `validateDependencyCompose` call this before namespacing:

```ts
validateComposeResourceReferences(
  document,
  {
    sourceFile: context.composePath,
    stage: context.stage,
    composition: "service",
  },
);
```

In `compileMeshTester`, after discovering the closure but before selecting/namespacing it:

```ts
validateComposeResourceReferences(
  raw,
  {
    sourceFile: file,
    stage,
    composition: "mesh",
  },
  included,
);
```

Do not merely rely on `docker compose config`; this invariant is cheap to prove in Builder itself.

## Post-fix verification

```bash
pnpm vitest run tests/conformance/04-dependencies.test.ts
pnpm vitest run tests/conformance/10-global-tester.test.ts
pnpm typecheck
```

---

# 10. B07 — Local `build.additional_contexts` paths are not rebased

**Severity:** HIGH  
**Primary files:**

```text
src/core/composition/composePaths.ts
src/core/composition/composeBuildResources.ts
```

**Test file:** `tests/conformance/audit-regressions.test.ts`

## Bug

`rebaseComposePaths()` rebases:

- `build` string;
- `build.context`;
- `env_file`;
- bind mounts;
- top-level config/secret files.

It does not rebase local filesystem values inside:

```yaml
build:
  additional_contexts:
    fixtures: ../fixtures
```

or:

```yaml
build:
  additional_contexts:
    - fixtures=../fixtures
```

The implementation only checks `additional_contexts` for unsupported `service:` references.

Once the dependency/tester Compose file is inlined into a generated Compose rooted elsewhere, `../fixtures` is interpreted against the wrong directory.

## Mandatory pre-fix tests

Add:

```ts
it("AUDIT-B07 rebases map-form local build.additional_contexts", () => {
  const result = rebaseComposePaths(
    {
      services: {
        owner: {
          build: {
            context: ".",
            additional_contexts: {
              fixtures: "../fixtures",
            },
          },
        },
      },
    },
    "/project/infra/dependency.yml",
    "/project",
  );

  expect(
    (result.services.owner!.build as any)
      .additional_contexts.fixtures,
  ).toBe("./fixtures");
});

it("AUDIT-B07 rebases list-form local build.additional_contexts", () => {
  const result = rebaseComposePaths(
    {
      services: {
        owner: {
          build: {
            context: ".",
            additional_contexts: [
              "fixtures=../fixtures",
            ],
          },
        },
      },
    },
    "/project/infra/dependency.yml",
    "/project",
  );

  expect(
    (result.services.owner!.build as any)
      .additional_contexts,
  ).toEqual([
    "fixtures=./fixtures",
  ]);
});
```

Add remote-preservation controls:

```ts
it.each([
  "https://github.com/org/repo.git",
  "docker-image://alpine:3.20",
  "git@github.com:org/repo.git",
])("does not rebase remote additional context %s", value => {
  ...
});
```

### Expected pre-fix result

The local value should remain:

```text
../fixtures
```

and the first test should fail.

### Go/no-go

If local additional contexts are already rebased correctly in the current branch, do not patch.

## Production fix

Move/build a shared classification helper in `composePaths.ts`:

```ts
function isRemoteComposeBuildContext(value: string): boolean {
  return (
    /^[A-Za-z][A-Za-z0-9+.-]*:\/\//.test(value) ||
    /^[^/@\s]+@[^:\s]+:.+/.test(value)
  );
}

function rebaseAdditionalContextValue(
  value: string,
  base: string,
  out: string,
): string {
  if (value.startsWith("service:")) {
    return value; // validator rejects this separately
  }

  if (isRemoteComposeBuildContext(value)) {
    return value;
  }

  return rebase(value, base, out);
}
```

Then:

```ts
function rebaseAdditionalContexts(
  value: unknown,
  base: string,
  out: string,
): unknown {
  if (Array.isArray(value)) {
    return value.map(entry => {
      if (typeof entry !== "string") return entry;

      const equals = entry.indexOf("=");
      if (equals < 0) return entry;

      const name = entry.slice(0, equals);
      const context = entry.slice(equals + 1);

      return `${name}=${rebaseAdditionalContextValue(
        context,
        base,
        out,
      )}`;
    });
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .map(([name, context]) => [
          name,
          typeof context === "string"
            ? rebaseAdditionalContextValue(
                context,
                base,
                out,
              )
            : context,
        ]),
    );
  }

  return value;
}
```

In the object-form `build` branch:

```ts
if (b.additional_contexts !== undefined) {
  b.additional_contexts = rebaseAdditionalContexts(
    b.additional_contexts,
    base,
    out,
  );
}
```

Use the same `isRemoteComposeBuildContext()` for primary `build.context` so remote classification cannot diverge.

Do not remove `assertNoServiceBuildContexts`; `service:` is a different semantic category and remains explicitly unsupported.

## Post-fix verification

```bash
pnpm vitest run tests/conformance/audit-regressions.test.ts
pnpm typecheck
```

---

# 11. B08 — Global tester implementation closure is incomplete

**Severity:** HIGH  
**Primary file:** `src/core/mesh/v2/compileMeshTester.ts`  
**Test file:** `tests/conformance/10-global-tester.test.ts`

## Bug

The current tester closure traversal follows:

```text
depends_on
links
volumes_from
network_mode: service:<name>
```

It does not follow:

```text
ipc: service:<name>
pid: service:<name>
```

even though the general dependency namespacer knows how to rewrite those constructs.

Therefore:

```yaml
services:
  runner:
    ipc: service:helper
  helper:
    image: alpine
```

selects only `runner`, omits `helper`, and leaves an unresolved `service:helper` reference after namespacing.

There is a second related fail-closed defect: tester Compose can contain `extends`, but the tester compiler neither implements effective extends semantics nor rejects it. The current dependency validator intentionally rejects dependency `extends`; tester should not silently emit a partial implementation either.

## Mandatory pre-fix tests

### IPC closure

```ts
it("AUDIT-B08 includes tester ipc service dependency", () => {
  const root = meshFixture(
    {
      services: {
        gateway: { path: "gateway" },
      },
      tester: {
        compose: "t.yml",
        service: "runner",
      },
    },
    {
      gateway: { app: {} },
    },
    {
      "t.yml": {
        services: {
          runner: {
            image: "alpine",
            ipc: "service:helper",
          },
          helper: {
            image: "alpine",
          },
        },
      },
    },
  );

  const result = compileMesh("e2e", root);
  const runner =
    result.compose.services[result.testerServiceName!]!;

  const helperName = Object.keys(result.compose.services)
    .find(name => name.includes("helper"));

  expect(helperName).toBeDefined();
  expect(runner.ipc).toBe(`service:${helperName}`);
});
```

### PID closure

Duplicate using:

```yaml
pid: service:helper
```

### Extends rejection

```ts
it("AUDIT-B08 fails closed for tester extends", () => {
  const root = meshFixture(
    {
      services: {
        gateway: { path: "gateway" },
      },
      tester: {
        compose: "t.yml",
        service: "runner",
      },
    },
    {
      gateway: { app: {} },
    },
    {
      "t.yml": {
        services: {
          base: {
            image: "alpine",
          },
          runner: {
            extends: {
              service: "base",
            },
          },
        },
      },
    },
  );

  expect(
    () => compileMesh("e2e", root),
  ).toThrow(/extends|unsupported/i);
});
```

### Expected pre-fix result

- IPC/PID test: helper is absent or runner still contains `service:helper`.
- extends test: compilation succeeds instead of producing a fail-closed error.

### Go/no-go

Patch only the subcases that reproduce.

## Production fix

Refactor `refs()` for readable exhaustive service-namespace references:

```ts
function referencedTesterServices(
  svc: ComposeService,
): string[] {
  const out = new Set<string>();

  const add = (value: unknown): void => {
    if (typeof value === "string" && value) {
      out.add(value);
    }
  };

  if (Array.isArray(svc.depends_on)) {
    for (const value of svc.depends_on) add(value);
  } else if (
    svc.depends_on &&
    typeof svc.depends_on === "object"
  ) {
    for (const value of Object.keys(svc.depends_on)) {
      add(value);
    }
  }

  for (const value of Array.isArray(svc.links) ? svc.links : []) {
    if (typeof value === "string") {
      add(value.split(":")[0]);
    }
  }

  for (
    const value of Array.isArray(svc.volumes_from)
      ? svc.volumes_from
      : []
  ) {
    if (typeof value === "string") {
      add(value.split(":")[0]);
    }
  }

  for (const property of [
    "network_mode",
    "ipc",
    "pid",
  ] as const) {
    const value = svc[property];

    if (
      typeof value === "string" &&
      value.startsWith("service:")
    ) {
      add(value.slice("service:".length));
    }
  }

  return [...out];
}
```

Before recursive closure traversal, reject `extends` on any visited service:

```ts
if (svc.extends !== undefined) {
  throw new ConfigError({
    sourceFile: file,
    configPath: `services.${name}.extends`,
    stage,
    composition: "mesh",
    reason:
      "Tester Compose extends is unsupported until effective Compose inheritance can be validated before host-network rewriting",
  });
}
```

Then recurse using:

```ts
for (const ref of referencedTesterServices(svc)) {
  visit(ref);
}
```

Do not re-enable generic `extends` rewriting as a shortcut. For the selected host-network runner, inherited networks/ports/other fields would have to be evaluated before Builder can safely force host networking.

## Post-fix verification

```bash
pnpm vitest run tests/conformance/10-global-tester.test.ts
pnpm typecheck
```

---

# 12. B09 — Runtime host-port extraction misparses Compose short syntax

**Severity:** MEDIUM-HIGH  
**Primary files:**

```text
src/utils/checkPortCollision.ts
src/utils/assertUniqueHostPortMappings.ts
```

**New helper recommended:**

```text
src/utils/composePublishedPort.ts
```

## Bug

Current runtime extraction uses:

```ts
const parts = p.split(":");

const hostPort =
  parts.length > 1
    ? parseInt(parts[0]!, 10)
    : parseInt(p, 10);
```

This is incorrect for:

```yaml
ports:
  - "127.0.0.1:18080:80"
```

It reports host port:

```text
127
```

instead of:

```text
18080
```

It is also wrong for target-only short syntax:

```yaml
ports:
  - "3000"
```

which requests no fixed published host port. The current extractor reports `3000` and may falsely report it occupied.

Static duplicate detection already uses different parsing logic, so the two collision systems can disagree.

## Mandatory pre-fix unit tests

Create:

```text
tests/v2/composePublishedPort.test.ts
```

or add to the existing port utility test.

```ts
import {
  extractHostPorts,
} from "../../src/utils/checkPortCollision.js";

it("AUDIT-B09 extracts published port from IPv4 short syntax", () => {
  const yaml = `
services:
  helper:
    image: alpine
    ports:
      - "127.0.0.1:18080:80"
`;

  expect(extractHostPorts(yaml)).toEqual([18080]);
});

it("AUDIT-B09 ignores target-only short syntax", () => {
  const yaml = `
services:
  helper:
    image: alpine
    ports:
      - "3000"
`;

  expect(extractHostPorts(yaml)).toEqual([]);
});

it("AUDIT-B09 extracts ordinary HOST:TARGET short syntax", () => {
  const yaml = `
services:
  helper:
    image: alpine
    ports:
      - "18081:81"
`;

  expect(extractHostPorts(yaml)).toEqual([18081]);
});
```

Add a protocol case:

```text
127.0.0.1:18082:82/tcp
```

and a bracketed IPv6 case if the project intends IPv6 Compose support:

```text
[::1]:18083:83
```

### Expected pre-fix result

Expected current results include:

```text
"127.0.0.1:18080:80" -> 127
"3000"                -> 3000
```

so both tests should fail.

### Go/no-go

If current extraction already returns only actual published host ports, do not patch.

## Production fix

Create one shared parser used by both runtime occupancy checks and static duplicate checks.

```ts
export function parsePublishedHostPort(
  value: unknown,
): number | undefined {
  if (value && typeof value === "object") {
    const published =
      (value as Record<string, unknown>).published;

    if (
      typeof published === "number" &&
      Number.isInteger(published) &&
      published >= 1 &&
      published <= 65535
    ) {
      return published;
    }

    if (
      typeof published === "string" &&
      /^\d+$/.test(published)
    ) {
      const port = Number(published);

      return port >= 1 && port <= 65535
        ? port
        : undefined;
    }

    return undefined;
  }

  if (typeof value !== "string") {
    return undefined;
  }

  const withoutProtocol =
    value.replace(/\/(?:tcp|udp|sctp)$/i, "");

  // TARGET only: Compose allocates/chooses publication;
  // there is no fixed host port for Builder to preflight.
  if (/^\d+(?:-\d+)?$/.test(withoutProtocol)) {
    return undefined;
  }

  let hostPortText: string | undefined;

  if (withoutProtocol.startsWith("[")) {
    const close = withoutProtocol.indexOf("]");

    if (close < 0) return undefined;

    const suffix = withoutProtocol.slice(close + 1);

    // :HOST:TARGET
    const match = suffix.match(
      /^:(\d+):\d+(?:-\d+)?$/,
    );

    hostPortText = match?.[1];
  } else {
    const parts = withoutProtocol.split(":");

    if (parts.length === 2) {
      // HOST:TARGET
      hostPortText = parts[0];
    } else if (parts.length === 3) {
      // IP:HOST:TARGET
      hostPortText = parts[1];
    }
  }

  if (!hostPortText || !/^\d+$/.test(hostPortText)) {
    return undefined;
  }

  const port = Number(hostPortText);

  return (
    Number.isInteger(port) &&
    port >= 1 &&
    port <= 65535
  )
    ? port
    : undefined;
}
```

Then `extractHostPorts` becomes:

```ts
for (const mapping of svc.ports ?? []) {
  const published = parsePublishedHostPort(mapping);

  if (published !== undefined) {
    ports.push(published);
  }
}
```

And `assertUniqueHostPortMappings` must use the same helper.

Do not maintain two Compose port parsers.

## Post-fix verification

```bash
pnpm vitest run tests/v2/composePublishedPort.test.ts
pnpm test:conformance
pnpm typecheck
```

---

# 13. B10 — Dependency internal DNS identities are lost after service-key namespacing

**Severity:** HIGH  
**Status:** source-indicated, **real-Docker reproduction required before patching**  
**Primary files:**

```text
src/core/composition/namespaceDependencyCompose.ts
src/core/composition/compileServiceComposition.ts
```

**Runtime test:** `tests/docker-acceptance/docker-behavior.test.ts`

## Bug

V2 renames dependency Compose services to private generated names.

Example input:

```yaml
services:
  owner:
    environment:
      DB_HOST: db
  db:
    image: postgres
```

In normal Compose, the service key `db` is a network DNS name.

Current namespacing changes:

```text
owner -> dep--x--owner
db    -> dep--x--db
```

and rewrites structured fields such as:

- `depends_on`;
- `links`;
- `network_mode: service:`;
- `volumes_from`;
- `ipc`;
- `pid`.

It cannot safely rewrite arbitrary application strings such as:

```text
DB_HOST=db
command: ["client", "--host", "db"]
healthcheck: ["CMD", "probe", "db"]
```

No original service-name alias is added.

That means a previously valid atomic Compose implementation can become unable to resolve its own peers.

## Why this violates V2

The exact generated names are explicitly Builder-private. Dependency-owned Compose environment remains legal. Internal Compose relationships are required to survive atomic namespacing.

Builder therefore cannot require third-party dependency implementations to know generated names.

## Mandatory real-Docker gate

Do not patch B10 based only on static reasoning.

Add a runtime test where one dependency service must resolve another by its original Compose service key.

Suggested test body for `tests/docker-acceptance/docker-behavior.test.ts`:

```ts
it("preserves original dependency service DNS inside the atomic bundle", () => {
  const resolvePeer = `
    const dns = require("dns");
    const fs = require("fs");

    const tryResolve = () => {
      dns.lookup("db", err => {
        if (!err) {
          fs.writeFileSync("/tmp/peer-ready", "yes");
        } else {
          setTimeout(tryResolve, 100);
        }
      });
    };

    tryResolve();
    setInterval(() => {}, 1000);
  `;

  const dependency = {
    services: {
      owner: {
        image: "node:22-alpine",
        command: ["node", "-e", resolvePeer],
        healthcheck: {
          test: [
            "CMD-SHELL",
            "test -f /tmp/peer-ready",
          ],
          interval: "250ms",
          timeout: "1s",
          retries: 20,
        },
      },
      db: {
        image: "node:22-alpine",
        command: [
          "node",
          "-e",
          "setInterval(()=>{},1000)",
        ],
      },
    },
  };

  const root = runtimeMesh(
    {
      services: {
        api: { path: "api" },
      },
    },
    {
      api: {
        app: {},
        dependencies: {
          dbslot: {
            compose: "dependency.yml",
            endpoints: {
              ready: {
                service: "owner",
                port: 3000,
                primary: true,
              },
            },
          },
        },
      },
    },
    {
      "api/dependency.yml": dependency,
    },
  );

  const compiled =
    compileMeshComposition("prod", root);

  const file = emitCompose(
    root,
    compiled.compose,
  );

  try {
    const up = dockerCompose(
      root,
      file,
      ["up", "-d", "--wait", "--build"],
      60_000,
    );

    expect(
      up.status,
      `${up.stdout}${up.stderr}`,
    ).toBe(0);
  } finally {
    down(root, file);
  }
}, 90_000);
```

The exact fixture may need to provide an endpoint listener depending on the runtime harness; the invariant being tested is only this:

```text
inside namespaced dependency owner:
dns.lookup("db") succeeds
```

### Expected pre-fix result

The endpoint-owner healthcheck never becomes healthy because hostname `db` is no longer present on its dependency network.

### Go/no-go

- If the real Docker test fails because `db` cannot resolve: **PROCEED**.
- If Docker still resolves `db` with current generated Compose: **DO NOT PATCH B10** and document why.

## Production fix architecture

Do not solve this by globally aliasing every original dependency service name onto the shared app/default or mesh network. That would make two dependencies with service key `db` collide.

Preserve original names **only on dependency-owned networks**.

### Step 1 — model the implicit Compose default network as dependency-owned

Before creating `networkNameMap`, determine whether any service uses implicit default networking:

```ts
function usesImplicitDefaultNetwork(
  service: ComposeService,
): boolean {
  return (
    service.network_mode === undefined &&
    service.networks === undefined
  );
}
```

If at least one service does, ensure the namespace map contains logical local network `default` even when the source document omitted top-level `networks.default`.

Conceptually:

```ts
const originalNetworkNames =
  new Set(Object.keys(doc.networks ?? {}));

if (
  Object.values(doc.services ?? {})
    .some(usesImplicitDefaultNetwork)
) {
  originalNetworkNames.add("default");

  doc.networks ??= {};
  doc.networks.default ??= {};
}
```

Now create `networkNameMap` from that complete set.

### Step 2 — record original service names before key rewriting

For each source service:

```ts
const originalServiceName = name;
```

determine its dependency-owned attached networks.

If networking is implicit, attach it explicitly to the generated dependency-default network.

### Step 3 — add original service name as alias on dependency-owned networks

Helper:

```ts
function addNetworkAlias(
  service: ComposeService,
  network: string,
  alias: string,
): void {
  const current =
    service.networks &&
    typeof service.networks === "object" &&
    !Array.isArray(service.networks)
      ? service.networks as Record<string, unknown>
      : {};

  const existing = current[network];

  if (
    existing &&
    typeof existing === "object" &&
    !Array.isArray(existing)
  ) {
    const aliases = Array.isArray(
      (existing as any).aliases,
    )
      ? (existing as any).aliases
      : [];

    current[network] = {
      ...existing,
      aliases: [...new Set([...aliases, alias])],
    };
  } else {
    current[network] = {
      aliases: [alias],
    };
  }

  service.networks = current;
}
```

Only apply this to the namespaced form of networks that belonged to the dependency implementation.

### Step 4 — never add original aliases to Builder communication networks

After namespacing, the service compiler may additionally attach endpoint owners to:

```text
standalone default
mesh
mesh--<consumer>
```

Do not add `db`, `redis`, `helper`, etc. aliases there.

External callers continue to use generated endpoint-owner names or logical Builder endpoint references.

### Step 5 — network-mode services

A service with:

```yaml
network_mode: service:owner
```

must not receive its own networks/aliases. It shares `owner`'s namespace.

### Step 6 — add a structural unit test after the runtime reproducer

Once the runtime bug is confirmed, also assert the generated dependency-owned network contains:

```yaml
aliases:
  - db
```

so the semantic fix cannot silently regress.

---

# 14. Cross-finding implementation order

Do not implement in severity order blindly. Use this dependency-aware sequence:

## Phase 1 — pure deterministic compiler fixes

1. **B01** mesh port intent ordering.
2. **B04** managed relative-path enforcement.
3. **B09** shared Compose published-port parser.

These are isolated and have minimal cross-effects.

## Phase 2 — test-stage semantics

4. **B02** validate `mesh.test` dependency bindings.
5. **B03** validate/allocate/apply `mesh.test` app publications.

Implement B02 before B03 because B03 publication validation needs the effective binding map.

## Phase 3 — Compose semantic preservation

6. **B06** shared named-resource reference validator.
7. **B07** additional-context path rebasing.
8. **B08** tester closure for IPC/PID and fail-closed extends.

Run all conformance tests after this phase because these changes touch raw Compose ingestion.

## Phase 4 — policy

9. **B05** effective Dockerfile healthcheck policy.

This uses real Docker/conftest tests, so keep it separate from pure TypeScript changes.

## Phase 5 — runtime-gated DNS

10. Add only the **B10 runtime test**.
11. Run it.
12. Implement B10 only if the test proves original service DNS is lost.

---

# 15. Exact file-change map

If all gates reproduce, the final branch should touch approximately:

```text
src/core/config/pathSafety.ts
src/core/composition/composePaths.ts
src/core/composition/validateDependencyCompose.ts
src/core/composition/validateComposeResourceReferences.ts        # new
src/core/composition/namespaceDependencyCompose.ts               # B10 only if reproduced
src/core/mesh/checkers/checkMeshServices.ts
src/core/mesh/runners/runMeshTestUnit.ts
src/core/mesh/v2/compileMeshComposition.ts
src/core/mesh/v2/compileMeshTester.ts
src/core/mesh/v2/validateMeshTestStage.ts                        # new
src/utils/checkPortCollision.ts
src/utils/assertUniqueHostPortMappings.ts
src/utils/composePublishedPort.ts                                # new
templates/policy/dockerfile/dockerfile.rego

tests/conformance/08-publication.test.ts
tests/conformance/09-mesh-env.test.ts
tests/conformance/10-global-tester.test.ts
tests/conformance/04-dependencies.test.ts
tests/conformance/audit-regressions.test.ts
tests/v2/composePublishedPort.test.ts                            # new
tests/docker-acceptance/dockerfilePolicy.test.ts
tests/docker-acceptance/docker-behavior.test.ts                  # B10 gate
```

Do not touch a production file merely because it appears in this map. Its associated pre-fix test must reproduce first.

---

# 16. Full verification sequence

After every narrow regression is green, execute:

```bash
pnpm typecheck
```

Then:

```bash
pnpm test:conformance
```

Then the ordinary test suite:

```bash
pnpm test
```

Then V2 legacy-token guard:

```bash
pnpm check:v2-no-legacy
```

Then schema/build:

```bash
pnpm build
```

Then Docker acceptance when Docker is available:

```bash
pnpm test:docker
```

Finally:

```bash
pnpm check:full
```

If Docker acceptance is intentionally unavailable in a CI lane, the B05 and B10 changes must not be merged based solely on mocked tests. They are Docker-semantic findings.

---

# 17. Required no-regression assertions

Regardless of which new bugs reproduce, the branch must retain all of these current behaviors:

- app override `${VAR}` remains raw Compose interpolation and is not treated as Builder endpoint syntax;
- bare Compose env `KEY` remains pass-through/null semantics;
- app override root/service/build unsupported fields fail closed;
- override-owned resources remain isolated across mesh consumers;
- generated names remain collision-aware;
- dependency environment is applied through exact bundle membership, not textual prefix matching;
- services with `network_mode` are not also attached to incompatible Builder networks;
- malformed endpoint-owner healthchecks fail;
- dependency `profiles` fail;
- dependency `extends` fails;
- remote primary build contexts remain untouched;
- build secrets are namespaced;
- tester build-only secret resources are included;
- tester array `depends_on` edges survive;
- mesh JSON generated schema preserves service-name restrictions;
- test-unit cross-service mesh references remain unavailable;
- test overlay can replace an integrated URL with an isolated literal;
- symlink boundary protection remains canonical/realpath-aware;
- Windows drive-root host binds remain rejected.

Do not “fix” a new issue by weakening any of these.

---

# 18. Suggested changeset

Only after the reproduced fixes are complete, add one changeset. Do not list a finding that did not reproduce.

Suggested template:

```md
---
"@solid-stack/builder": patch
---

Fix additional Builder V2 conformance gaps discovered by a fresh
specification audit.

- preserve normative per-service mesh AUTO port allocation order;
- validate effective mesh test-stage dependency bindings and publication;
- enforce relative syntax for Builder-managed project paths;
- allow finite test targets to disable inherited Docker healthchecks while
  keeping dev/prod readiness mandatory;
- fail fast on dangling Compose named-resource references;
- preserve local build additional-context paths when Compose files are inlined;
- complete global tester service-reference closure;
- use one correct Compose published-port parser for runtime/static checks.

If confirmed by Docker acceptance, also preserve dependency-internal original
service DNS identities on dependency-owned networks.
```

If B10 does not reproduce, remove the last paragraph.

---

# 19. Definition of done

The audit/fix cycle is complete only when:

- [ ] every listed finding has a committed pre-fix regression or is explicitly marked `NOT REPRODUCED`;
- [ ] no production patch exists for a finding whose gate passed pre-fix;
- [ ] B01 demonstrates `service -> app -> dependencies` AUTO ordering across at least two services;
- [ ] invalid `mesh.test` dependency bindings fail before unit execution;
- [ ] invalid `mesh.test` publish declarations fail before unit execution;
- [ ] valid test-unit remains isolated;
- [ ] absolute Builder-managed JSON paths are rejected while legal relative paths remain accepted;
- [ ] finite test targets can use `HEALTHCHECK NONE`;
- [ ] effective dev/prod healthcheck cannot be disabled;
- [ ] dangling named volumes/networks/configs/secrets/build-secrets fail before Docker runtime;
- [ ] local `additional_contexts` retain their original filesystem meaning after inlining;
- [ ] global tester IPC/PID helper closure is complete;
- [ ] unsupported tester extends fails closed;
- [ ] runtime port preflight extracts actual published host ports only;
- [ ] B10 real-Docker DNS gate has been run, regardless of whether the production fix was needed;
- [ ] `pnpm typecheck` passes;
- [ ] `pnpm test:conformance` passes;
- [ ] `pnpm test` passes;
- [ ] `pnpm build` passes;
- [ ] `pnpm check:v2-no-legacy` passes;
- [ ] `pnpm test:docker` passes on a Docker-capable lane;
- [ ] `pnpm check:full` passes.

---

# 20. Final implementation guidance

Do not convert this audit into a broad refactor.

The intended implementation strategy is:

```text
reproducer
    ↓
does it fail exactly as predicted?
    ├─ no  → close finding, no patch
    └─ yes
         ↓
smallest semantic fix
         ↓
narrow regression green
         ↓
relevant conformance catalog green
         ↓
full verification
```

In particular:

- do not rewrite the whole mesh compiler for B01;
- do not make mesh test-unit integrated to solve B02/B03;
- do not apply relative-path restrictions to raw Compose-owned bind/build paths for B04;
- do not remove dev/prod health requirements for B05;
- do not delegate B06 entirely to runtime Docker validation;
- do not treat remote additional contexts as filesystem paths for B07;
- do not partially implement `extends` for B08;
- do not maintain separate short-port parsers for B09;
- do not add original dependency service aliases to shared Builder networks for B10.

The final behavior must remain the exact V2 architecture, not a compatibility translation layer.