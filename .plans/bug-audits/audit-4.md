# Solid Stack Builder V2 — Re-Audit and Test-Gated Implementation Fix Plan

## Scope

This audit is based on the newest repository snapshot supplied in `Pasted text(6).txt` and treats these documents as normative:

- `docs/SPECS_V2.md`
- `docs/BUILD_JSON_DOCS.md`
- `docs/MESH_JSON_DOCS.md`

The previous nested `override-compose` build-context defect is **not** included here because the current snapshot now contains the intended fix (`rebaseAppOverridePaths`, canonical context comparison, and the patch changeset).

This plan deliberately uses a **test-first confirmation gate** for every remaining finding. The implementer must not patch production code merely because this audit says a bug exists.

---

# 0. Mandatory confirmation protocol

For every bug below, use this sequence exactly:

1. Add only the proposed regression test. Do not modify production code yet.
2. Run only the smallest test file containing that new test.
3. Classify the result:
   - **FAILS at the intended assertion / intended `ConfigError` mismatch** → the bug is confirmed. Proceed with the fix.
   - **PASSES** → the current code does not reproduce the suspected bug. Do **not** implement the fix. Remove or keep the test as a regression assertion, mark the audit item `NOT REPRODUCED`, and move on.
   - **FAILS for another reason** (bad fixture, missing Dockerfile, primary endpoint invariant, unrelated path validation, etc.) → the bug is **not yet confirmed**. Correct the fixture/test until it isolates the intended behavior, then rerun.
4. After a confirmed bug is fixed, rerun that targeted test and the existing conformance file that owns the affected behavior.
5. Only after all confirmed fixes are green, run the complete verification suite.

Use this helper comment above every newly added audit-gate test:

```ts
// AUDIT GATE: Do not patch production code unless this test fails for the
// exact pre-fix behavior described in the audit plan.
```

Recommended location for most provisional regressions:

```text
tests/conformance/audit-regressions.test.ts
```

These tests must **not** use numbered `CFG-xxx`, `DEP-xxx`, `MEN-xxx`, etc. identifiers because `catalog-coverage.test.ts` expects the existing catalog IDs exactly once.

---

# Audit result overview

| ID | Severity | Finding | Primary fix area |
|---|---|---|---|
| A01 | High | Raw override Compose environment is parsed as Builder JSON references | environment provenance / service compiler |
| A02 | High | Compose bare environment pass-through is converted to an explicit value | Compose environment normalization |
| A03 | High | Override Compose validation is not fail-closed; unsupported declarations can be silently ignored or escape ownership rules | override validator |
| A04 | High | Override-owned resources collide between mesh services | override resource namespace |
| A05 | High | Generated dependency names are delimiter-ambiguous and can collide | generated-name allocation |
| A06 | High | Mesh dependency ownership is inferred by string prefix, causing environment leakage | explicit dependency metadata |
| A07 | High | Mesh adds `networks` to dependency services that use `network_mode` | mesh networking |
| A08 | High | Dependency endpoint healthcheck validator accepts malformed Compose healthchecks | healthcheck validator |
| A09 | High | Dependency Compose `profiles` can defeat atomic materialization | dependency validator |
| A10 | High | Same-file `extends` is renamed but not semantically resolved before endpoint-owner validation | dependency validator / extends policy |
| A11 | Medium-High | Remote Docker build contexts are incorrectly rebased as filesystem paths | Compose path rebasing |
| A12 | High | Build-time Compose secret references are not namespaced / tester resource discovery misses them | build resource references |
| A13 | High | Global tester array-form `depends_on` is lost when Builder adds app readiness edges | tester compiler / depends_on normalization |
| A14 | Medium | Generated `mesh-schema.json` does not preserve service-name/reserved-name constraints | schema generation |

---

# Phase 1 — Environment provenance and override validation

## A01 — HIGH — Raw override Compose environment is incorrectly parsed as Builder JSON reference syntax

### Bug

`compileServiceComposition()` normalizes `services.app.environment` from an `override-compose` file and then calls the Builder JSON reference resolver on it:

```ts
const rawOverrideEnv = normalizeComposeEnvironment(
  prepared.app.environment,
  "override-compose.services.app.environment",
);

const overrideEnv = options.deferReferenceResolution
  ? rawOverrideEnv
  : resolveEnv(
      rawOverrideEnv,
      registry,
      "override-compose.services.app.environment",
    );
```

`resolveEnv()` calls `collectBuilderReferences(..., "build", ...)`, so a normal Compose value such as:

```yaml
services:
  app:
    environment:
      API_TOKEN: "${API_TOKEN}"
```

is treated as if `${API_TOKEN}` were a Builder endpoint reference.

The V2 reference contract assigns `${...}` Builder syntax to **Builder-managed JSON env**. `override-compose` is raw Compose and must preserve Compose interpolation semantics.

### Confirmation test

Edit:

```text
tests/conformance/audit-regressions.test.ts
```

Ensure these imports exist:

```ts
import { env } from "./fixture.js";
```

Add:

```ts
it("audit gate A01: override Compose preserves Compose-native environment interpolation", () => {
  // AUDIT GATE: Do not patch production code unless this test fails for the
  // exact pre-fix behavior described in the audit plan.
  const root = fixture(
    {
      app: {},
      dev: { "override-compose": "o.yml" },
    },
    {
      "o.yml": {
        services: {
          app: {
            environment: {
              API_TOKEN: "${API_TOKEN}",
            },
          },
        },
      },
    },
  );

  const result = compileService("dev", root);
  expect(env(result.compose.services.app).API_TOKEN).toBe("${API_TOKEN}");
});
```

Run:

```bash
pnpm vitest run tests/conformance/audit-regressions.test.ts -t "audit gate A01"
```

### Expected pre-fix result

The test should throw before the assertion with a Builder-reference error for `API_TOKEN` / invalid build endpoint reference.

### Go/no-go decision

- If it throws that reference error: **CONFIRMED**, implement the fix.
- If it returns `${API_TOKEN}` unchanged: **NOT REPRODUCED**, do not change environment provenance.

### Expected behavior

Raw Compose interpolation remains raw Compose interpolation. Builder references continue to be parsed in:

- `build.json app.env`;
- `build.json dependencies.*.env`;
- `mesh.json services.*.env`;
- Builder JSON tester env.

They are **not** implicitly applied to arbitrary Compose YAML environment values.

### Fix design

Edit:

```text
src/core/composition/types.ts
src/core/composition/compileServiceComposition.ts
src/core/mesh/v2/compileMeshComposition.ts
src/core/mesh/runners/runMeshTestUnit.ts
```

Do not solve this by escaping every `$` in the override. The compiler needs to remember the provenance of each environment layer.

#### 1. Extend `CompiledServiceComposition`

In `src/core/composition/types.ts`, replace the environment metadata fields with explicit layers:

```ts
export type ComposeEnvironmentValue = string | null;
export type ComposeEnvironmentMap = Record<string, ComposeEnvironmentValue>;

export interface CompiledServiceComposition {
  compose: ComposeDocument;
  effectiveBuild: EffectiveBuildConfig;
  endpoints: {
    app: Record<string, ResolvedEndpoint>;
    dependencies: Record<string, Record<string, ResolvedEndpoint>>;
  };
  projectName: string;
  testerServiceName?: string;

  // Builder JSON syntax: resolve endpoint references.
  buildJsonAppEnvironment?: Record<string, string>;

  // Raw Compose syntax: do NOT send through Builder reference parser.
  overrideComposeAppEnvironment?: ComposeEnvironmentMap;

  // Mesh JSON syntax: resolve mesh references.
  externalAppEnvironment?: Record<string, string>;

  // Builder authority: always merge last.
  builderInternalEnvironment?: Record<string, string>;

  dependencyEnvironments?: Record<string, Record<string, string>>;
}
```

#### 2. Keep build JSON and override Compose env separate

In `compileServiceComposition.ts`:

```ts
const buildJsonAppEnv = ownEnv(effective, stage);
const resolvedBuildJsonAppEnv = options.deferReferenceResolution
  ? buildJsonAppEnv
  : resolveEnv(buildJsonAppEnv, registry, "app.env");

let overrideComposeAppEnv: ComposeEnvironmentMap = {};
```

Inside the override block:

```ts
overrideComposeAppEnv = normalizeComposeEnvironment(
  prepared.app.environment,
  "override-compose.services.app.environment",
);

if (
  getPrimaryEndpoint(effective.app.endpoints) &&
  "PORT" in overrideComposeAppEnv
) {
  throw new ConfigError({
    sourceFile: overridePath,
    configPath: "services.app.environment.PORT",
    stage,
    composition: "service",
    reason: "Override cannot set Builder-owned PORT",
  });
}
```

Delete the call that sends override env through `resolveEnv()`.

For standalone/non-deferred composition:

```ts
app.environment = {
  ...resolvedBuildJsonAppEnv,
  ...overrideComposeAppEnv,
  ...(options.externalAppEnv ?? {}),
  ...internal,
};
```

For mesh/deferred composition, return the layers rather than losing provenance:

```ts
return {
  compose,
  effectiveBuild: effective,
  endpoints: { app: appEndpoints, dependencies: depEndpoints },
  projectName,
  buildJsonAppEnvironment: { ...buildJsonAppEnv },
  overrideComposeAppEnvironment: { ...overrideComposeAppEnv },
  externalAppEnvironment: { ...(options.externalAppEnv ?? {}) },
  builderInternalEnvironment: { ...internal },
  dependencyEnvironments: Object.fromEntries(
    Object.entries(effective.dependencies).map(([key, dep]) => [key, dep.env]),
  ),
  ...(profile.attachTester && !options.meshMode
    ? { testerServiceName: "tester" }
    : {}),
};
```

#### 3. Reconstruct final mesh environment in correct precedence

In `compileMeshComposition.ts`, replace the current `buildAppEnvironment` resolution block with:

```ts
const resolvedBuildJson = resolveServiceBuildEnvThroughMesh(
  name,
  fragment.buildJsonAppEnvironment ?? {},
  refContext,
  `services.${name}.app.env`,
);

const rawOverrideCompose = fragment.overrideComposeAppEnvironment ?? {};

const resolvedMesh = resolveMeshEnvMap(
  fragment.externalAppEnvironment ?? {},
  refContext,
  `services.${name}.env`,
);

app.environment = {
  ...resolvedBuildJson,
  ...rawOverrideCompose,
  ...resolvedMesh,
  ...(fragment.builderInternalEnvironment ?? {}),
};
```

This exactly preserves precedence:

```text
build JSON env
< override Compose env
< mesh JSON env
< Builder internal env
```

The `.env.<stage>` layer stays in `env_file` and is resolved by Compose.

#### 4. Update mesh unit test compiler path

In `runMeshTestUnit.ts`, reconstruct the environment using the same layer order. Do not call `resolveServiceBuildEnvThroughMesh()` on `overrideComposeAppEnvironment`.

### Post-fix tests

Run:

```bash
pnpm vitest run tests/conformance/audit-regressions.test.ts -t "audit gate A01"
pnpm vitest run tests/conformance/09-mesh-env.test.ts
pnpm vitest run tests/compileApplicationEnv.test.ts
```

---

## A02 — HIGH — Compose bare environment pass-through is converted to an explicit empty/current-process value

### Bug

Current normalization does this:

```ts
if (at < 0) {
  result[item] = process.env[item] ?? "";
  continue;
}
```

and drops null map values:

```ts
if (val === null || val === undefined) continue;
```

A Compose declaration such as:

```yaml
environment:
  - OPTIONAL_TOKEN
```

has pass-through semantics. Builder instead captures the Builder CLI process environment at compile time, or writes an explicit empty string.

That changes the meaning of legal dependency Compose even when `dependencies.<name>.env` is empty.

### Confirmation test

Add to `audit-regressions.test.ts`:

```ts
it("audit gate A02: dependency Compose preserves bare environment pass-through", () => {
  // AUDIT GATE...
  const previous = process.env.OPTIONAL_TOKEN;
  delete process.env.OPTIONAL_TOKEN;

  try {
    const root = fixture(
      {
        app: {},
        dependencies: {
          db: dep("d.yml"),
        },
      },
      {
        "d.yml": {
          services: {
            owner: {
              image: "alpine",
              environment: ["OPTIONAL_TOKEN"],
              healthcheck: { test: ["CMD", "true"] },
            },
          },
        },
      },
    );

    const result = compileService("prod", root);
    const environment = result.compose.services["dep--db--owner"]?.environment;

    expect(environment).toEqual({ OPTIONAL_TOKEN: null });
  } finally {
    if (previous === undefined) delete process.env.OPTIONAL_TOKEN;
    else process.env.OPTIONAL_TOKEN = previous;
  }
});
```

Run:

```bash
pnpm vitest run tests/conformance/audit-regressions.test.ts -t "audit gate A02"
```

### Expected pre-fix result

Expected actual value is currently:

```ts
{ OPTIONAL_TOKEN: "" }
```

so the assertion should fail.

### Go/no-go

If the assertion already receives `null` or otherwise retains pass-through semantics, skip the fix.

### Fix

Edit:

```text
src/core/composition/composeEnvironment.ts
src/core/composition/types.ts
```

Use a Compose-specific environment value type:

```ts
export type ComposeEnvironmentValue = string | null;
export type ComposeEnvironmentMap = Record<string, ComposeEnvironmentValue>;
```

Replace `normalizeComposeEnvironment()` with:

```ts
export function normalizeComposeEnvironment(
  value: unknown,
  context: string,
): ComposeEnvironmentMap {
  const result: ComposeEnvironmentMap = {};

  if (value == null) return result;

  if (Array.isArray(value)) {
    for (const item of value) {
      if (typeof item !== "string") {
        throw new ConfigError({
          configPath: context,
          value: item,
          reason: "Compose environment entries must be strings",
        });
      }

      const at = item.indexOf("=");
      if (at < 0) {
        result[item] = null;
        continue;
      }

      result[item.slice(0, at)] = item.slice(at + 1);
    }
    return result;
  }

  if (typeof value !== "object") {
    throw new ConfigError({
      configPath: context,
      value,
      reason: "Compose environment must be a map or list",
    });
  }

  for (const [key, raw] of Object.entries(value)) {
    if (raw === null || raw === undefined) {
      result[key] = null;
      continue;
    }

    if (typeof raw === "object") {
      throw new ConfigError({
        configPath: `${context}.${key}`,
        value: raw,
        reason: "Compose environment value must be scalar or null",
      });
    }

    result[key] = String(raw);
  }

  return result;
}
```

Update `mergeComposeEnvironment()`:

```ts
export function mergeComposeEnvironment(
  service: ComposeService,
  overlay: Record<string, string>,
): void {
  service.environment = {
    ...normalizeComposeEnvironment(service.environment, "service.environment"),
    ...overlay,
  };
}
```

Update `ComposeService.environment` to allow null-valued maps.

### Required non-regression

A Builder-controlled dependency overlay still wins:

```yaml
environment:
  - OPTIONAL_TOKEN
```

plus:

```json
"env": { "OPTIONAL_TOKEN": "builder-value" }
```

must become:

```ts
{ OPTIONAL_TOKEN: "builder-value" }
```

---

## A03 — HIGH — Override Compose validation is not fail-closed

### Bug

The override validator checks several forbidden fields but leaves other topology/ownership-affecting declarations untouched. The compiler then silently replaces or drops some of them.

Concrete examples:

- root `include` can act as a hidden second composition system, yet the preparer ignores it;
- `services.app.profiles` can cause the Builder app to disappear unless a profile is active;
- `services.app.extends` can inherit forbidden fields after Builder validates only the visible child;
- `services.app.env_file` is accepted and then overwritten by `merged.env_file = app.env_file`;
- unsupported `build` properties are accepted, but only `build.args` is copied into Builder's authoritative build object.

The fail-fast contract forbids silently omitting declared configuration.

### Confirmation tests

Add parameterized gates:

```ts
it.each([
  ["root include", { services: { app: {} }, include: ["other.yml"] }],
  ["profiles", { services: { app: { profiles: ["optional"] } } }],
  ["extends", { services: { app: { extends: { service: "base" } } } }],
  ["env_file", { services: { app: { env_file: ["custom.env"] } } }],
  ["unsupported build key", {
    services: { app: { build: { args: { OK: "1" }, ssh: ["default"] } } },
  }],
])("audit gate A03: rejects unsupported override escape hatch %s", (_name, override) => {
  // AUDIT GATE...
  const root = fixture(
    { app: {}, dev: { "override-compose": "o.yml" } },
    { "o.yml": override },
  );

  expect(() => compileService("dev", root)).toThrow(/override|unsupported|cannot/i);
});
```

For the `extends` fixture, the current validator may fail for an unrelated missing service only if Compose validation is invoked later. The compiler-level test should fail at Builder validation, not Docker. If necessary use an `extends.file` / valid sibling shape that isolates the issue.

### Expected pre-fix result

At least `profiles`, `env_file`, and extra build keys should currently compile rather than fail at Builder validation; some values are later discarded.

### Fix

Edit:

```text
src/core/composition/validateOverrideCompose.ts
```

#### 1. Validate root keys

Add:

```ts
const ALLOWED_ROOT_KEYS = new Set([
  "services",
  "volumes",
  "networks",
  "configs",
  "secrets",
]);

for (const key of Object.keys(document)) {
  if (key.startsWith("x-")) continue;
  if (!ALLOWED_ROOT_KEYS.has(key)) {
    fail(key, "unsupported override Compose top-level field");
  }
}
```

This explicitly rejects `include`, `name`, `version`, etc. rather than ignoring them.

#### 2. Reject topology activation/inheritance fields

Add to the forbidden app fields:

```ts
for (const key of [
  "ports",
  "depends_on",
  "network_mode",
  "container_name",
  "privileged",
  "profiles",
  "extends",
  "env_file",
] as const) {
  if (app[key] !== undefined) {
    fail(
      `services.app.${key}`,
      "override field is unsupported because Builder owns app topology/stage environment semantics",
    );
  }
}
```

`env_file` is rejected rather than supported because V2 defines `.env.<stage>` as the env-file layer and does not define a second override-owned env-file precedence layer.

#### 3. Make `build` an explicit allowlist

After string-form build rejection:

```ts
if (app.build && typeof app.build === "object") {
  const build = app.build as Record<string, unknown>;
  const allowedBuildKeys = new Set(["args", "context"]);

  for (const key of Object.keys(build)) {
    if (!allowedBuildKeys.has(key)) {
      fail(
        `services.app.build.${key}`,
        key === "target" || key === "dockerfile"
          ? "override cannot change Builder-owned build configuration"
          : "unsupported override build field; V2 override build ownership is limited to build.args and an equivalent context",
      );
    }
  }

  // existing canonical context identity check remains unchanged
}
```

### Post-fix gate

All A03 tests must throw a `ConfigError` **before** generated Compose reaches Docker validation.

---

# Phase 2 — Collision isolation and exact dependency ownership

## A04 — HIGH — Override resources collide across mesh services

### Bug

`validateAndPrepareAppOverride()` generates resource keys using only stage + kind + local resource name:

```ts
app-override--dev--volume--cache
```

Two mesh services can independently use an override volume named `cache`. Their fragments then collide at mesh merge time even though neither service referenced the other.

### Confirmation test

```ts
it("audit gate A04: same override resource name is isolated per mesh service", () => {
  // AUDIT GATE...
  const root = meshFixture(
    {
      services: {
        a: { path: "a" },
        b: { path: "b" },
      },
    },
    {
      a: { app: {}, dev: { "override-compose": "o.yml" } },
      b: { app: {}, dev: { "override-compose": "o.yml" } },
    },
    {
      "a/o.yml": {
        services: { app: { volumes: ["cache:/cache"] } },
        volumes: { cache: {} },
      },
      "b/o.yml": {
        services: { app: { volumes: ["cache:/cache"] } },
        volumes: { cache: {} },
      },
    },
  );

  const result = compileMesh("dev", root);
  const overrideVolumes = Object.keys(result.compose.volumes ?? {})
    .filter(name => name.includes("override") && name.includes("cache"));

  expect(overrideVolumes).toHaveLength(2);
  expect(new Set(overrideVolumes).size).toBe(2);
});
```

### Expected pre-fix result

`compileMesh()` should throw `Mesh composition name collision` for the generated override volume.

### Fix

Edit:

```text
src/core/composition/validateOverrideCompose.ts
src/core/composition/compileServiceComposition.ts
```

Extend validation context:

```ts
export interface AppOverrideValidationContext {
  file: string;
  stage: string;
  expectedBuildContext: string;
  buildContextBaseDir: string;
  resourceNamespace?: string;
}
```

Generate resource keys through a helper:

```ts
function overrideResourceName(
  context: AppOverrideValidationContext,
  kind: string,
  localName: string,
): string {
  const prefix = context.resourceNamespace
    ? `${context.resourceNamespace}--app-override`
    : "app-override";

  return `${prefix}--${context.stage}--${kind}--${localName}`;
}
```

In `compileServiceComposition()` pass:

```ts
resourceNamespace: options.meshMode && options.appServiceName
  ? `svc--${options.appServiceName}`
  : undefined,
```

Then replace the hardcoded target with:

```ts
const target = overrideResourceName(
  context,
  kind.slice(0, -1),
  name,
);
```

This fix is acceptable as a targeted patch. A05 below introduces a stronger shared generated-name allocator; if A05 is confirmed, implement the allocator first and have override resources use it instead of creating a second naming mechanism.

---

## A05 — HIGH — Generated dependency names are delimiter-ambiguous

### Bug

Names are created by concatenating raw logical identifiers using `--`:

```ts
`${prefix}--${service}`
```

Valid V2 identifiers may themselves contain repeated hyphens.

These two distinct identities can therefore generate the same service key:

```text
dependency = a--b, service = c
=> dep--a--b--c

dependency = a, service = b--c
=> dep--a--b--c
```

That violates collision isolation.

### Confirmation test

```ts
it("audit gate A05: distinct dependency identities cannot generate the same Compose service key", () => {
  // AUDIT GATE...
  const root = fixture(
    {
      app: {},
      dependencies: {
        "a--b": dep("x.yml", "c", 1001),
        a: dep("y.yml", "b--c", 1002),
      },
    },
    {
      "x.yml": {
        services: {
          c: { image: "alpine", healthcheck: { test: ["CMD", "true"] } },
        },
      },
      "y.yml": {
        services: {
          "b--c": { image: "alpine", healthcheck: { test: ["CMD", "true"] } },
        },
      },
    },
  );

  const result = compileService("prod", root);
  const hosts = [
    result.endpoints.dependencies["a--b"]?.api?.networkHost,
    result.endpoints.dependencies.a?.api?.networkHost,
  ];

  expect(hosts[0]).toBeDefined();
  expect(hosts[1]).toBeDefined();
  expect(hosts[0]).not.toBe(hosts[1]);
});
```

### Expected pre-fix result

Compilation should fail with an internal Compose namespace collision, or both logical endpoints may resolve to the same generated key.

### Fix architecture

Do not merely replace `--` with another printable separator. Any user-controlled string separator can collide unless segments are encoded or allocation is collision-aware.

Add:

```text
src/core/composition/generatedNames.ts
```

Implement an explicit allocator:

```ts
import crypto from "node:crypto";

function digest(identity: string): string {
  return crypto.createHash("sha256").update(identity).digest("hex");
}

function safeHint(value: string): string {
  const normalized = value
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || "item";
}

export class GeneratedComposeNameAllocator {
  private readonly occupied = new Set<string>();

  constructor(initialNames: Iterable<string> = []) {
    for (const name of initialNames) this.occupied.add(name);
  }

  allocate(identity: string, hint: string): string {
    const hash = digest(identity);
    const base = `ssb-${safeHint(hint)}`;

    for (const length of [12, 16, 24, 32, 64]) {
      const candidate = `${base}-${hash.slice(0, length)}`;
      if (!this.occupied.has(candidate)) {
        this.occupied.add(candidate);
        return candidate;
      }
    }

    throw new Error(`Unable to allocate unique Compose name for ${identity}`);
  }
}
```

The generated names are private; readability is secondary to collision-free deterministic identity.

Update `NamespaceDependencyOptions`:

```ts
export interface NamespaceDependencyOptions {
  dependencyKey: string;
  namespacePrefix: string;
  document: ComposeDocument;
  allocator?: GeneratedComposeNameAllocator;
  identityPrefix?: string;
}
```

Generate each name from a structured identity, never by later parsing the generated string:

```ts
const serviceNameMap = new Map(
  Object.keys(doc.services ?? {}).map(original => [
    original,
    allocator.allocate(
      `${identityPrefix}\0service\0${original}`,
      `${dependencyKey}-${original}`,
    ),
  ]),
);
```

Do the same for volume/network/config/secret.

### Critical follow-up

Once A05 is confirmed, **all code that infers logical ownership from generated-name prefixes must be removed**. That is A06.

---

## A06 — HIGH — Mesh dependency environment propagation infers ownership with `startsWith()`

### Bug

Mesh compilation currently applies a dependency environment to services whose generated name starts with:

```ts
const prefix = `svc--${name}--dep--${depName}--`;
if (serviceName.startsWith(prefix)) {
  setEnv(service, resolvedDep);
}
```

With dependency keys `a` and `a--b`, the prefix for `a` also matches generated services for `a--b`.

This can leak one logical dependency's configuration into another dependency implementation.

### Confirmation test

```ts
it("audit gate A06: dependency env is applied only to that exact atomic bundle", () => {
  // AUDIT GATE...
  const healthy = { image: "alpine", healthcheck: { test: ["CMD", "true"] } };

  const root = meshFixture(
    { services: { api: { path: "api" } } },
    {
      api: {
        app: {},
        dependencies: {
          a: {
            ...dep("a.yml", "owner", 1001),
            env: { ONLY_A: "yes" },
          },
          "a--b": dep("ab.yml", "owner", 1002),
        },
      },
    },
    {
      "api/a.yml": { services: { owner: healthy } },
      "api/ab.yml": { services: { owner: healthy } },
    },
  );

  const result = compileMesh("prod", root);
  const aHost = result.endpoints.dependencies.api?.a?.api?.networkHost!;
  const abHost = result.endpoints.dependencies.api?.["a--b"]?.api?.networkHost!;

  expect((result.compose.services[aHost]?.environment as any)?.ONLY_A).toBe("yes");
  expect((result.compose.services[abHost]?.environment as any)?.ONLY_A).toBeUndefined();
});
```

### Expected pre-fix result

`ONLY_A` should incorrectly appear on the `a--b` owner.

### Fix

Edit:

```text
src/core/composition/types.ts
src/core/composition/compileServiceComposition.ts
src/core/mesh/v2/compileMeshComposition.ts
```

Extend `MaterializedDependency`:

```ts
export interface MaterializedDependency {
  // existing fields...
  serviceNames: Set<string>;
}
```

When materializing:

```ts
const serviceNames = new Set(Object.keys(item.services ?? {}));

materialized[key] = {
  key,
  composePath: entry.source,
  compose: item,
  serviceNameMap: entry.map,
  endpointOwnerMap,
  endpointOwners,
  endpoints: {},
  serviceNames,
};
```

Expose exact metadata in `CompiledServiceComposition`:

```ts
dependencyServiceNames?: Record<string, string[]>;
```

Return:

```ts
dependencyServiceNames: Object.fromEntries(
  Object.entries(materialized).map(([key, dep]) => [
    key,
    [...dep.serviceNames],
  ]),
),
```

In mesh compilation replace prefix matching with:

```ts
for (const serviceName of fragment.dependencyServiceNames?.[depName] ?? []) {
  const service = compose.services[serviceName];
  if (service) setEnv(service, resolvedDep);
}
```

Use the same exact list for private-network attachment (A07).

---

# Phase 3 — Dependency Compose semantic correctness

## A07 — HIGH — Mesh adds a bridge network to services using `network_mode`

### Bug

The dependency contract supports internal `network_mode: service:<name>` references. The namespacer rewrites them correctly.

Later mesh composition attaches the consumer-private network to **every generated dependency service**. A helper can therefore end up with both:

```yaml
network_mode: service:<owner>
networks:
  mesh--consumer: null
```

Those are mutually exclusive Compose networking models.

### Confirmation test

```ts
it("audit gate A07: mesh does not attach networks to namespace-sharing dependency helpers", () => {
  // AUDIT GATE...
  const root = meshFixture(
    { services: { api: { path: "api" } } },
    {
      api: {
        app: {},
        dependencies: { db: dep("d.yml") },
      },
    },
    {
      "api/d.yml": {
        services: {
          owner: {
            image: "alpine",
            healthcheck: { test: ["CMD", "true"] },
          },
          helper: {
            image: "alpine",
            network_mode: "service:owner",
          },
        },
      },
    },
  );

  const result = compileMesh("prod", root);
  const helper = Object.entries(result.compose.services)
    .find(([, svc]) => String(svc.network_mode ?? "").startsWith("service:"));

  expect(helper).toBeDefined();
  expect(helper![1].networks).toBeUndefined();
});
```

### Expected pre-fix result

The helper has a `networks` field.

### Fix

In `compileMeshComposition.ts`, replace both broad network loops with exact bundle metadata from A06.

Add:

```ts
function attachNetworkIfCompatible(
  service: ComposeService,
  networkName: string,
): void {
  if (service.network_mode !== undefined) return;

  const current = normalizeNetworks(service.networks);
  current[networkName] = null;
  service.networks = current;
}
```

Then:

```ts
for (const owner of endpointOwners) {
  const ownerService = compose.services[owner];
  if (ownerService) attachNetworkIfCompatible(ownerService, privateName);
}

for (const generated of fragment.dependencyServiceNames?.[dep] ?? []) {
  const dependencyService = compose.services[generated];
  if (dependencyService) {
    attachNetworkIfCompatible(dependencyService, privateName);
  }
}
```

Endpoint owners already fail validation when they declare `network_mode`, so skipping incompatible helpers does not reduce app reachability.

---

## A08 — HIGH — Dependency healthcheck validator accepts malformed Compose healthchecks

### Bug

The current check only verifies that `health.test` is truthy/non-empty. A value such as:

```yaml
healthcheck:
  test: 123
```

passes Builder validation even though it is not a valid Compose healthcheck command.

### Confirmation test

```ts
it("audit gate A08: malformed dependency healthcheck test is rejected", () => {
  // AUDIT GATE...
  const dependency: any = {
    compose: "d.yml",
    env: {},
    dependsOn: [],
    endpoints: {
      api: {
        service: "owner",
        port: 3000,
        primary: true,
      },
    },
  };

  const document: any = {
    services: {
      owner: {
        image: "alpine",
        healthcheck: { test: 123 },
      },
    },
  };

  expect(() =>
    validateDependencyCompose(
      "db",
      dependency,
      document,
      { composePath: "d.yml", stage: "prod" },
    ),
  ).toThrow(/healthcheck/i);
});
```

### Expected pre-fix result

The function should currently **not throw**, so the test fails.

### Fix

Add:

```text
src/core/composition/composeHealthcheck.ts
```

Implement:

```ts
import { ConfigError } from "../../errors/ConfigError.js";

export function isEnabledValidComposeHealthcheck(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;

  const health = value as Record<string, unknown>;
  if (health.disable === true) return false;

  const test = health.test;

  if (typeof test === "string") {
    return test.trim().length > 0;
  }

  if (!Array.isArray(test) || test.length === 0) return false;
  if (!test.every(item => typeof item === "string")) return false;

  const first = test[0];
  if (first === "NONE") return false;
  if (first !== "CMD" && first !== "CMD-SHELL") return false;

  if (test.length < 2) return false;
  return test.slice(1).some(item => item.trim().length > 0);
}
```

Use it in `validateDependencyCompose.ts`:

```ts
if (!isEnabledValidComposeHealthcheck(services[owner]!.healthcheck)) {
  fail(
    `services.${owner}.healthcheck`,
    "endpoint owner requires a valid enabled Compose healthcheck",
  );
}
```

Add table cases for:

```ts
undefined
{ disable: true }
{ test: [] }
{ test: ["NONE"] }
{ test: 123 }
{ test: ["CMD"] }
{ test: ["CMD", 123] }
```

and positive controls:

```ts
{ test: "curl -f http://localhost/health" }
{ test: ["CMD", "true"] }
{ test: ["CMD-SHELL", "test -f /tmp/ready"] }
```

---

## A09 — HIGH — Dependency Compose `profiles` can violate atomic materialization

### Bug

A dependency service can currently retain:

```yaml
profiles: [optional]
```

Builder considers it part of the materialized atomic bundle, but Docker Compose will omit profile-gated services unless the profile is activated.

That contradicts the V2 rule that materializing a dependency materializes the entire atomic implementation.

### Confirmation test

```ts
it("audit gate A09: dependency profiles cannot make an atomic bundle conditional", () => {
  // AUDIT GATE...
  const root = fixture(
    {
      app: {},
      dependencies: { db: dep("d.yml") },
    },
    {
      "d.yml": {
        services: {
          owner: {
            image: "alpine",
            profiles: ["optional"],
            healthcheck: { test: ["CMD", "true"] },
          },
        },
      },
    },
  );

  expect(() => compileService("prod", root)).toThrow(/profiles|atomic/i);
});
```

### Expected pre-fix result

Compilation currently succeeds.

### Fix

In `validateDependencyCompose.ts`, inside every-service validation:

```ts
if (svc.profiles !== undefined) {
  fail(
    `services.${name}.profiles`,
    "dependency Compose profiles are unsupported because a materialized V2 dependency is atomic and cannot conditionally omit services",
  );
}
```

Do not automatically activate profiles and do not strip the field. Both would silently reinterpret user configuration.

---

## A10 — HIGH — Same-file `extends` is renamed but not semantically resolved before validation

### Bug

The previous fix rewrites:

```yaml
extends:
  service: base
```

to the namespaced base service. That prevents a stale reference, but endpoint-owner validation still examines only the child service's direct fields.

Example:

```yaml
services:
  base:
    image: alpine
    network_mode: none

  owner:
    extends:
      service: base
    healthcheck:
      test: [CMD, true]
```

Builder sees no direct `owner.network_mode`, so it passes validation. Compose later inherits `network_mode: none`, making the endpoint owner unreachable.

The inverse also exists: an owner can inherit a valid healthcheck from its base, but Builder rejects it as missing because it does not compute effective `extends` semantics.

### Confirmation test

```ts
it("audit gate A10: endpoint-owner validation cannot ignore inherited extends networking", () => {
  // AUDIT GATE...
  const root = fixture(
    {
      app: {},
      dependencies: { db: dep("d.yml") },
    },
    {
      "d.yml": {
        services: {
          base: {
            image: "alpine",
            network_mode: "none",
          },
          owner: {
            extends: { service: "base" },
            healthcheck: { test: ["CMD", "true"] },
          },
        },
      },
    },
  );

  expect(() => compileService("prod", root)).toThrow(/extends|network_mode|endpoint owner/i);
});
```

### Expected pre-fix result

Current Builder validation should accept it.

### Recommended fix

V2 does not require Builder to implement the full Compose `extends` merge algorithm. The minimal deterministic fix is to reject **all dependency service `extends` declarations**.

In `validateDependencyCompose.ts`:

```ts
if (svc.extends !== undefined) {
  fail(
    `services.${name}.extends`,
    "dependency Compose extends is unsupported because Builder must validate effective endpoint-owner networking/health before namespacing",
  );
}
```

Then remove `extends` rewrite support from `namespaceDependencyCompose.ts` because the validator guarantees it cannot reach that phase.

### Required test maintenance

The current audit regression:

```text
preserves inherited explicit networking when a default network also exists
```

must be changed. It currently asserts same-file `extends` support even though Builder does not resolve effective Compose semantics.

Replace it with:

```ts
it("rejects dependency Compose extends until Builder supports effective extends semantics", () => {
  expect(() => validateDependencyCompose(
    "db",
    { compose: "d.yml", endpoints: {}, env: {}, dependsOn: [] },
    {
      services: {
        base: { networks: ["internal"] },
        owner: { extends: { service: "base" } },
      },
      networks: { internal: {} },
    },
    { composePath: "d.yml", stage: "prod" },
  )).toThrow(/extends/);
});
```

If the team intentionally wants same-file extends as a supported feature, **do not use this rejection fix**. Instead implement full effective-service flattening with Compose-compatible merge rules and cycle detection before validation. That is materially larger and should be a separate feature project.

---

## A11 — MEDIUM-HIGH — Remote Docker build contexts are rebased as filesystem paths

### Bug

`rebase()` treats every non-absolute string as a local filesystem path. Therefore:

```yaml
build:
  context: https://github.com/example/project.git
```

is transformed into a local path such as:

```text
./dependencies/https:/github.com/example/project.git
```

V2 permits dependency Compose services to use `build:` internally.

### Confirmation test

Add import:

```ts
import { rebaseComposePaths } from "../../src/core/composition/composePaths.js";
```

Test:

```ts
it("audit gate A11: remote Docker build contexts are not filesystem-rebased", () => {
  // AUDIT GATE...
  const document: any = {
    services: {
      owner: {
        build: {
          context: "https://github.com/acme/example.git",
        },
      },
    },
  };

  const result = rebaseComposePaths(
    document,
    "/project/dependencies/d.yml",
    "/project",
  );

  expect((result.services.owner.build as any).context)
    .toBe("https://github.com/acme/example.git");
});
```

Also test string build:

```ts
owner: { build: "https://github.com/acme/example.git" }
```

### Expected pre-fix result

The context is rewritten as a local path.

### Fix

In `composePaths.ts` add:

```ts
function isRemoteBuildContext(value: string): boolean {
  return (
    /^[A-Za-z][A-Za-z0-9+.-]*:\/\//.test(value) ||
    /^[^/@\s]+@[^:\s]+:.+/.test(value)
  );
}
```

Do **not** put this inside generic `rebase()` because `env_file`, bind mounts, and config files do not use remote build-context syntax.

Handle build specifically:

```ts
if (typeof svc.build === "string") {
  if (!isRemoteBuildContext(svc.build)) {
    svc.build = rebase(svc.build, base, out);
  }
} else if (svc.build && typeof svc.build === "object") {
  const build = svc.build as Record<string, unknown>;
  const context = typeof build.context === "string" ? build.context : ".";

  if (!isRemoteBuildContext(context)) {
    build.context = rebase(context, base, out);
  }
}
```

Add at least these positive remote cases:

```text
https://...
http://...
ssh://...
git://...
git@github.com:org/repo.git
```

---

## A12 — HIGH — Build-time Compose secret references are not namespaced

### Bug

The namespacer rewrites runtime service secrets:

```yaml
services:
  owner:
    secrets:
      - npm-token
```

but does not rewrite build-time secrets:

```yaml
services:
  owner:
    build:
      context: .
      secrets:
        - npm-token
```

The top-level secret key is renamed, leaving the build reference stale.

The global tester resource collector also examines only runtime `service.secrets`; it can omit a secret used only by `build.secrets` from the tester closure.

### Confirmation test 1 — dependency namespacing

```ts
it("audit gate A12: dependency build.secrets follows namespaced top-level secret", () => {
  // AUDIT GATE...
  const result = namespaceDependencyCompose({
    dependencyKey: "db",
    namespacePrefix: "dep--db",
    document: {
      services: {
        owner: {
          build: {
            context: ".",
            secrets: ["npm-token"],
          },
        },
      },
      secrets: {
        "npm-token": { file: "./token.txt" },
      },
    },
  }).document;

  expect((result.services["dep--db--owner"]?.build as any).secrets)
    .toEqual(["dep--db--secret--npm-token"]);
});
```

### Expected pre-fix result

The build secret remains `npm-token`.

### Confirmation test 2 — global tester resource closure

Add to `tests/conformance/10-global-tester.test.ts` or `audit-regressions.test.ts` a mesh E2E fixture whose selected runner has:

```yaml
build:
  context: .
  secrets:
    - token
secrets:
  token:
    file: ./token.txt
```

Assert generated tester Compose has both:

- namespaced top-level secret;
- namespaced `runner.build.secrets` reference.

### Fix

Add:

```text
src/core/composition/composeBuildResources.ts
```

Implement:

```ts
export function rewriteBuildSecretReferences(
  service: ComposeService,
  secretNames: Map<string, string>,
): void {
  if (!service.build || typeof service.build !== "object" || Array.isArray(service.build)) {
    return;
  }

  const build = service.build as Record<string, unknown>;
  if (!Array.isArray(build.secrets)) return;

  build.secrets = build.secrets.map(entry => {
    if (typeof entry === "string") {
      return secretNames.get(entry) ?? entry;
    }

    if (entry && typeof entry === "object") {
      const value = entry as Record<string, unknown>;
      if (typeof value.source !== "string") return entry;
      return {
        ...value,
        source: secretNames.get(value.source) ?? value.source,
      };
    }

    return entry;
  });
}

export function collectBuildSecretReferences(service: ComposeService): string[] {
  if (!service.build || typeof service.build !== "object" || Array.isArray(service.build)) {
    return [];
  }

  const build = service.build as Record<string, unknown>;
  if (!Array.isArray(build.secrets)) return [];

  return build.secrets.flatMap(entry => {
    if (typeof entry === "string") return [entry];
    if (entry && typeof entry === "object") {
      const source = (entry as Record<string, unknown>).source;
      return typeof source === "string" ? [source] : [];
    }
    return [];
  });
}
```

Call `rewriteBuildSecretReferences()` inside `namespaceDependencyCompose()` before top-level keys are renamed.

In `compileMeshTester.referencedResources()` add:

```ts
for (const name of collectBuildSecretReferences(svc)) {
  if (doc.secrets?.[name]) sets.secrets.add(name);
}
```

### Additional contexts

While implementing, inspect `build.additional_contexts` for `service:<name>` references. If Builder does not support rewriting them, reject those specific service-reference forms in dependency/tester Compose rather than silently emitting stale references. Do not expand this patch into speculative support without a failing gate test.

---

# Phase 4 — Global tester preservation

## A13 — HIGH — Global tester array-form `depends_on` is lost

### Bug

The tester closure correctly follows array-form `depends_on`, and namespacing rewrites it. But after selecting the runner, Builder does:

```ts
const depends = runnerSvc.depends_on &&
  typeof runnerSvc.depends_on === "object" &&
  !Array.isArray(runnerSvc.depends_on)
    ? runnerSvc.depends_on
    : {};
```

So an existing array is replaced with `{}` before Builder app readiness edges are added.

### Confirmation test

```ts
it("audit gate A13: global tester preserves array depends_on helper edges", () => {
  // AUDIT GATE...
  const root = meshFixture(
    {
      services: { gateway: { path: "gateway" } },
      tester: { compose: "t.yml", service: "runner" },
    },
    {
      gateway: { app: {} },
    },
    {
      "t.yml": {
        services: {
          runner: {
            image: "alpine",
            depends_on: ["browser"],
          },
          browser: {
            image: "alpine",
          },
        },
      },
    },
  );

  const result = compileMesh("e2e", root);
  const runner = result.compose.services[result.testerServiceName!];
  const depends = runner?.depends_on as Record<string, unknown>;

  const browserName = Object.keys(result.compose.services)
    .find(name => name.includes("browser"));

  expect(browserName).toBeDefined();
  expect(depends).toHaveProperty(browserName!);
  expect(depends.gateway).toEqual({ condition: "service_healthy" });
});
```

### Expected pre-fix result

The browser service is included, but the runner's final `depends_on` contains only `gateway`.

### Fix

Add a shared composition helper rather than using the legacy util that injects `service_healthy` into user-declared short syntax.

Create:

```text
src/core/composition/composeDependsOn.ts
```

```ts
export function normalizeComposeDependsOn(
  value: unknown,
): Record<string, unknown> {
  if (Array.isArray(value)) {
    return Object.fromEntries(
      value
        .filter((item): item is string => typeof item === "string")
        .map(name => [name, {}]),
    );
  }

  if (value && typeof value === "object") {
    return { ...(value as Record<string, unknown>) };
  }

  return {};
}
```

Do **not** convert user short syntax to `service_healthy`; `{}` preserves ordinary Compose short-dependency semantics. Builder only adds `service_healthy` to its own app readiness edges.

In `compileMeshTester.ts`:

```ts
const depends = normalizeComposeDependsOn(runnerSvc.depends_on);

for (const app of effectiveTopLevelApps) {
  depends[app] = { condition: "service_healthy" };
}

runnerSvc.depends_on = depends;
```

Consider reusing this helper in `dependencyLifecycle.ts` where appropriate, while preserving the current rule that Builder-generated dependency lifecycle edges are health-gated.

---

# Phase 5 — JSON schema parity

## A14 — MEDIUM — Generated `mesh-schema.json` loses runtime service-name constraints

### Bug

Runtime Zod uses:

```ts
const serviceNameSchema = identifierSchema.refine(
  name => !RESERVED_MESH_SERVICE_NAMES.has(name),
  ...
);
```

but the generated JSON schema currently has no `propertyNames` constraint for root/stage `services`, and provider/dependsOn value schemas retain only the regex. The Zod refinement excluding reserved names is not represented.

Therefore an editor/tool validating against `schemas/mesh-schema.json` can accept a mesh that Builder runtime rejects.

### Confirmation test

Create:

```text
tests/schema-generation.test.ts
```

or append to an existing schema generation test.

```ts
import fs from "node:fs";
import path from "node:path";
import { expect, it } from "vitest";

it("audit gate A14: generated mesh schema enforces runtime service-name restrictions", () => {
  // AUDIT GATE...
  const schema = JSON.parse(
    fs.readFileSync(path.resolve("schemas/mesh-schema.json"), "utf8"),
  );

  const rootServices = schema.definitions.MeshJsonV2.properties.services;

  expect(rootServices.propertyNames).toBeDefined();
  expect(JSON.stringify(rootServices.propertyNames))
    .toContain("^[a-z][a-z0-9-]*$");
  expect(JSON.stringify(rootServices.propertyNames))
    .toContain("tester");

  for (const stage of ["dev", "prod", "test", "e2e"]) {
    const stageServices = schema.definitions.MeshJsonV2
      .properties[stage]
      .properties.services;

    expect(stageServices.propertyNames).toBeDefined();
  }
});
```

### Expected pre-fix result

`rootServices.propertyNames` is currently `undefined`.

### Fix

Edit:

```text
scripts/generate-schemas.ts
```

Keep runtime `meshSchema` unchanged.

Add constants:

```ts
const MESH_SERVICE_PATTERN = "^[a-z][a-z0-9-]*$";
const RESERVED = [
  "app",
  "dependencies",
  "tester",
  "services",
  "dev",
  "prod",
  "test",
  "e2e",
];

const serviceNameJsonSchema = {
  allOf: [
    { type: "string", pattern: MESH_SERVICE_PATTERN },
    { not: { enum: RESERVED } },
  ],
};
```

After `zodToJsonSchema()`:

```ts
const root = (meshJsonSchema as any).definitions.MeshJsonV2;

root.properties.services.propertyNames = serviceNameJsonSchema;

for (const stage of ["dev", "prod", "test", "e2e"]) {
  root.properties[stage].properties.services.propertyNames = serviceNameJsonSchema;
}
```

Also patch service provider and lifecycle value constraints. Because `$refStrategy: "none"` inlines repeated schemas, write a small recursive traversal:

```ts
function patchMeshServiceObject(serviceObject: any): void {
  if (!serviceObject?.properties) return;

  if (serviceObject.properties.dependencies) {
    serviceObject.properties.dependencies.additionalProperties = serviceNameJsonSchema;
  }

  if (serviceObject.properties.dependsOn) {
    serviceObject.properties.dependsOn.items = serviceNameJsonSchema;
  }
}

patchMeshServiceObject(root.properties.services.additionalProperties);

for (const stage of ["dev", "prod", "test", "e2e"]) {
  patchMeshServiceObject(
    root.properties[stage].properties.services.additionalProperties,
  );
}
```

Then write the schema as before.

Run:

```bash
pnpm build:schemas
pnpm vitest run tests/schema-generation.test.ts
```

The generated file should change. Do not hand-edit `schemas/mesh-schema.json` without updating the generator.

---

# Phase 6 — Additional generated-name / override integration work

If A04, A05, and A06 are all confirmed, do them as **one implementation series** in this order:

1. Add `GeneratedComposeNameAllocator`.
2. Change dependency namespacing to allocator-backed exact maps.
3. Return exact dependency service-name ownership metadata.
4. Remove every `startsWith(generatedPrefix)` ownership query from mesh compiler.
5. Put override resources through the same allocator or an equivalent service-qualified allocator identity.
6. Pass the same occupied-name set across all fragments merged into a mesh.
7. Add an assertion before final output that every service/resource key is unique by construction.

Do not partially implement A05 while leaving A06's prefix parsing. Once generated names stop encoding logical identity textually, prefix parsing will be even less valid.

Suggested allocator identity strings:

```text
service:<mesh-service>:dependency:<logical-dep>:service:<raw-compose-service>
service:<mesh-service>:dependency:<logical-dep>:volume:<raw-volume>
service:<mesh-service>:override:<stage>:volume:<raw-volume>
mesh-tester:service:<raw-service>
mesh-tester:secret:<raw-secret>
```

The identity string is private and never emitted to user config.

---

# Phase 7 — Full test matrix for confirmed fixes

After each individual test-first gate and fix, run the focused test. After all confirmed fixes:

```bash
pnpm typecheck
pnpm vitest run tests/conformance/audit-regressions.test.ts
pnpm vitest run tests/conformance/03-stages.test.ts
pnpm vitest run tests/conformance/04-dependencies.test.ts
pnpm vitest run tests/conformance/09-mesh-env.test.ts
pnpm vitest run tests/conformance/10-global-tester.test.ts
pnpm test:conformance
pnpm test
pnpm build:schemas
pnpm build
pnpm check:v2-no-legacy
```

Then, if Docker is available:

```bash
pnpm test:docker
```

Finally:

```bash
pnpm prepublishOnly
```

---

# Phase 8 — Suggested changeset

Only after at least one production bug is confirmed and fixed, add:

```text
.changeset/fix-v2-compose-semantic-preservation.md
```

Suggested contents:

```md
---
"@solid-stack/builder": patch
---

Fix V2 Compose semantic-preservation edge cases across app overrides, dependency namespacing, mesh dependency ownership, healthcheck validation, global tester composition, and generated mesh JSON Schema constraints.
```

If the generated-name change is considered externally observable despite names being documented as private, it is still contractually a patch because user configuration must not depend on generated names. Document the internal name change in the release notes nevertheless.

---

# File-by-file edit map

## `src/core/composition/types.ts`

Potential confirmed changes:

- allow Compose environment map values to be `string | null`;
- expose explicit app environment provenance layers;
- add exact generated service ownership per materialized dependency.

## `src/core/composition/composeEnvironment.ts`

Potential confirmed changes:

- preserve bare/null Compose environment values;
- never read `process.env` merely to normalize dependency/override Compose.

## `src/core/composition/compileServiceComposition.ts`

Potential confirmed changes:

- keep override Compose env separate from Builder JSON env;
- expose internal env layer separately;
- propagate exact dependency service-name metadata;
- pass override resource namespace/allocator.

## `src/core/composition/validateOverrideCompose.ts`

Potential confirmed changes:

- fail closed for unsupported root/app/build fields;
- service-qualified override resource namespace;
- retain canonical build-context fix already present.

## `src/core/composition/generatedNames.ts` — new

Add only if A05 confirms generated-name collision.

## `src/core/composition/validateDependencyCompose.ts`

Potential confirmed changes:

- reject `profiles`;
- reject `extends` unless full effective semantics are implemented;
- use dedicated healthcheck validator.

## `src/core/composition/composeHealthcheck.ts` — new

Add if A08 confirmed.

## `src/core/composition/composePaths.ts`

Potential confirmed change:

- preserve remote build contexts.

Do not regress the already implemented `rebaseAppOverridePaths()` behavior.

## `src/core/composition/namespaceDependencyCompose.ts`

Potential confirmed changes:

- allocator-backed names;
- build-time secret reference rewriting;
- remove partial extends support if A10 uses fail-fast rejection.

## `src/core/composition/composeBuildResources.ts` — new

Add if A12 confirmed.

## `src/core/composition/composeDependsOn.ts` — new

Add if A13 confirmed.

## `src/core/mesh/v2/compileMeshComposition.ts`

Potential confirmed changes:

- exact bundle membership instead of prefix matching;
- skip network attachment for `network_mode` services;
- environment reconstruction using provenance layers.

## `src/core/mesh/v2/compileMeshTester.ts`

Potential confirmed changes:

- preserve array-form `depends_on`;
- discover build-time secret references.

## `scripts/generate-schemas.ts`

Potential confirmed changes:

- post-process non-serializable Zod refinement constraints into JSON Schema.

## `tests/conformance/audit-regressions.test.ts`

Add A01-A13 gate tests here where possible.

## `tests/schema-generation.test.ts`

Add A14 schema parity gate.

---

# Bugs deliberately NOT included in this re-audit

The following previously discussed issues are not part of this report because the newest snapshot visibly contains their fixes or current evidence no longer supports them as active defects:

1. Nested app override `build.args` inventing/changing build context — fixed by `rebaseAppOverridePaths` and canonical context validation.
2. Override bind/named-volume source corruption — existing Compose-aware volume parser/regressions present.
3. Mesh discarding override-defined app networks — current mesh app networks are unioned.
4. Missing application Dockerfile not failing compilation — compiler resolves the Dockerfile up front.
5. Symlink project-boundary escape — canonical-path logic is present.
6. Windows drive-root bind handling — drive/root-aware parsing is present.
7. Raw same-file `extends.service`, `ipc: service:`, and `pid: service:` names not being renamed — raw references are now renamed; A10 is a deeper semantic-validation problem, not the old stale-reference bug.
8. Mesh anonymous `/app/node_modules` teardown leak — current snapshot contains anonymous-volume tracking and Docker acceptance coverage.
9. Blanket claim that `HEALTHCHECK NONE` must be allowed in finite targets — not included. V2 says finite targets do not require healthchecks, but current policy and migration plan explicitly reject `HEALTHCHECK NONE`; that is not strong enough evidence for an implementation bug.

---

# Definition of done

This audit/fix cycle is complete only when:

- every A01-A14 proposed gate has been run;
- each item is marked either `CONFIRMED + FIXED` or `NOT REPRODUCED`;
- no production code is changed for a gate that already passes;
- every confirmed pre-fix test failed for the intended reason;
- every confirmed post-fix test passes;
- `pnpm typecheck` passes;
- `pnpm test:conformance` passes;
- `pnpm test` passes;
- generated schemas are regenerated from code;
- `pnpm build` passes;
- `pnpm check:v2-no-legacy` passes;
- Docker acceptance passes when Docker is available;
- `pnpm prepublishOnly` passes;
- no fix weakens V2 fail-fast behavior;
- no fix introduces service/endpoint inference;
- no fix introduces `service_started` fallback;
- no fix requires user configuration to reference Builder-private generated Compose names.