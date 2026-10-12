# Audit: Builder V2 Validation Failure Report

## Conclusion

The submitted report is **valid with one qualification**.

It identifies:

1. **One confirmed Builder V2 implementation bug:** build-args-only stage overrides can be falsely interpreted as application build-context changes.
2. **One confirmed repository configuration defect:** a base mesh environment value contains a cross-service endpoint reference that cannot be resolved during isolated `mesh test-unit`.
3. **One inaccurate expectation:** Builder preflight is intentionally cross-stage, so a genuinely invalid prod/e2e declaration is allowed to block a dev command.

The first issue should be fixed in `@solid-stack/builder`. The second should be fixed in the consuming project's `mesh.json`.

---

# Finding 1 — HIGH
## Build-args-only `override-compose` is falsely rejected as a build-context override

### Status

**CONFIRMED BUILDER BUG**

### Affected area

- `src/core/composition/composePaths.ts`
- `src/core/composition/compileServiceComposition.ts`
- `src/core/composition/validateOverrideCompose.ts`

### Configuration

A valid V2 stage configuration may declare:

```json
{
  "prod": {
    "override-compose": ".docker/overrides/docker-compose.web-build.override.yml"
  }
}
```

with:

```yaml
services:
  app:
    build:
      args:
        BASE_PATH: "/web"
```

The override deliberately does **not** specify:

- `build.context`;
- `build.target`;
- `build.dockerfile`;
- ports;
- services other than `app`;
- lifecycle dependencies.

Its only requested modification is a Docker build argument.

This is consistent with Builder V2's intended use of `override-compose`: Docker build arguments are an explicitly supported use case.

### Actual implementation behavior

`rebaseComposePaths()` currently performs logic equivalent to:

```ts
if (svc.build && typeof svc.build === "object") {
  const b = svc.build;

  const context =
    typeof b.context === "string"
      ? b.context
      : ".";

  b.context = rebase(context, base, out);
}
```

That means this user input:

```yaml
build:
  args:
    BASE_PATH: /web
```

is mutated into something conceptually equivalent to:

```yaml
build:
  context: <rebased path>
  args:
    BASE_PATH: /web
```

even though the user never supplied `context`.

The rebased document is then sent to `validateAndPrepareAppOverride()`, which interprets the synthesized field as an explicit attempt to replace Builder's application context.

The resulting error is therefore incorrect:

```text
override cannot change app build context
path=services.app.build.context
```

The configuration never requested such a change.

### Why this is a bug

V2 explicitly permits stage override Compose for Docker build arguments.

The Builder must distinguish:

```yaml
build:
  args:
    X: Y
```

from:

```yaml
build:
  context: ./different-project
  args:
    X: Y
```

The former modifies only build arguments. The latter potentially attempts to take ownership of Builder's application build context.

Synthesizing `context` before semantic validation destroys that distinction.

### Secondary path-normalization defect

The explicit-context diagnostic in the report also exposes another correctness issue.

In standalone compilation, a nested override's:

```yaml
context: ../..
```

can resolve to:

```text
.
```

But in mesh compilation the same physical directory can become:

```text
./services/frontend
```

while Builder's expected context may be:

```text
services/frontend
```

A raw string comparison can therefore reject two paths that identify the same filesystem location.

Build-context ownership must be checked using canonical path identity, not normalized-string spelling.

### Regression test

Add a compiler-level test requiring no Docker daemon:

```ts
it("allows build args without treating them as a context override", () => {
  const root = createFixture({
    "build.json": {
      app: {},
      prod: {
        "override-compose":
          ".docker/overrides/docker-compose.web-build.override.yml",
      },
    },

    ".docker/overrides/docker-compose.web-build.override.yml": `
services:
  app:
    build:
      args:
        BASE_PATH: "/web"
`,
  });

  const compiled =
    compileServiceComposition("prod", root);

  const build =
    compiled.compose.services.app!.build as Record<string, unknown>;

  expect(build.context).toBe(".");
  expect(build.target).toBe("prod");

  expect(build.args).toEqual({
    BASE_PATH: "/web",
  });
});
```

This test should fail against the defective implementation because validation sees the synthesized rebased context.

### Mesh regression test

Create a mesh containing the same service:

```json
{
  "services": {
    "frontend": {
      "path": "./services/frontend"
    }
  }
}
```

Compile `prod` and assert:

```ts
const build =
  compiled.compose.services.frontend!.build as Record<string, unknown>;

expect(build.context).toBe("./services/frontend");
// or Builder's canonical equivalent

expect(build.target).toBe("prod");

expect(build.args).toEqual({
  BASE_PATH: "/web",
});
```

Most importantly, compilation must not throw:

```text
override cannot change app build context
```

### Expected behavior

A build-args-only override must:

1. validate successfully;
2. preserve Builder's application build context;
3. preserve Builder's selected Dockerfile;
4. preserve Builder's selected target;
5. merge only the supplied build arguments.

For standalone prod:

```yaml
services:
  app:
    build:
      context: .
      target: prod
      args:
        BASE_PATH: /web
```

For the same service inside a mesh:

```yaml
services:
  frontend:
    build:
      context: ./services/frontend
      target: prod
      args:
        BASE_PATH: /web
```

The exact textual context spelling is Builder-private; filesystem identity is what matters.

### Required fix

Do **not** synthesize `build.context` while rebasing an override if no context was explicitly supplied.

Change path rebasing from conceptually:

```ts
const context =
  typeof b.context === "string"
    ? b.context
    : ".";

b.context = rebase(context, base, out);
```

to:

```ts
if (typeof b.context === "string") {
  b.context = rebase(b.context, base, out);
}
```

Then let `compileServiceComposition()` reapply Builder's authoritative application context after merging the permitted override fields.

Additionally, context validation must compare canonical filesystem locations rather than raw strings.

Conceptually:

```ts
const actual = canonicalizeContext(
  suppliedContext,
  composeOutputDir,
);

const expected = canonicalizeContext(
  expectedBuildContext,
  composeOutputDir,
);

if (actual !== expected) {
  throw contextChangeError();
}
```

The comparison should normalize:

- `services/frontend`;
- `./services/frontend`;
- equivalent `..` traversal;
- platform separator differences;
- symlinks where relevant.

### Acceptance criteria

All must succeed:

```bash
builder service up prod --dry-run
builder service up test-e2e --dry-run

builder mesh check --require-tester
builder mesh up prod --dry-run
builder mesh up test-e2e --dry-run
```

with the original build-args-only override unchanged.

No workaround requiring:

```yaml
context: ../..
```

should be necessary.

---

# Finding 2 — CONFIGURATION
## Base mesh env contains a cross-service reference that is invalid during isolated test execution

### Status

**CONFIRMED, BUT NOT A BUILDER BUG**

### Configuration

The base mesh contains:

```json
{
  "services": {
    "frontend": {
      "env": {
        "FRONTEND_EXTERNAL_URL":
          "${gateway.app.endpoints.http.public_url}/web"
      }
    }
  },

  "test": {}
}
```

This is valid for an integrated composition where `gateway` exists and its endpoint is effectively published.

However, `mesh test-unit` intentionally runs each service independently.

### Builder behavior

During Frontend's isolated unit stage, Builder constructs a reference environment containing only Frontend.

Gateway does not exist in that isolated composition.

Therefore:

```text
${gateway.app.endpoints.http.public_url}
```

cannot be resolved.

Builder correctly reports:

```text
Unknown mesh service reference "gateway"
```

### Why this is correct

Builder V2 defines `mesh test-unit` as isolated execution:

```text
Frontend test
Backend test
Gateway test
```

not:

```text
Frontend + Backend + Gateway integrated test network
```

Cross-service mesh endpoint references therefore do not have meaningful network/public values during that individual test process.

Builder is explicitly required to fail rather than fabricate a value.

### Regression test

This should remain a **negative Builder test**:

```ts
it("rejects cross-service mesh references during isolated test-unit", async () => {
  const mesh = createMeshFixture({
    services: {
      frontend: {
        path: "./frontend",
        env: {
          FRONTEND_EXTERNAL_URL:
            "${gateway.app.endpoints.http.public_url}/web",
        },
      },

      gateway: {
        path: "./gateway",
        publish: ["app.endpoints.http"],
      },
    },

    test: {},
  });

  await expect(
    runMeshTestUnit({
      projectDir: mesh,
      dryRun: true,
    }),
  ).rejects.toThrow(
    /Unknown mesh service reference "gateway"/,
  );
});
```

This passing negative test confirms Builder is behaving correctly.

### Repository fix

The consuming application needs a test-stage override:

```json
{
  "test": {
    "services": {
      "frontend": {
        "env": {
          "FRONTEND_EXTERNAL_URL":
            "http://127.0.0.1:3000/web"
        }
      }
    }
  }
}
```

The literal should be whatever origin Frontend's isolated tests actually expect.

The important property is that it must not depend on a mesh service absent from the isolated test composition.

### Expected behavior after repository fix

Integrated stages continue using:

```text
${gateway.app.endpoints.http.public_url}/web
```

while isolated test execution receives its test-specific literal/configuration.

Therefore:

```bash
builder mesh up test-unit --dry-run
```

should compile all individual service tests without attempting to resolve Gateway from Frontend's isolated reference context.

---

# Finding 3 — DOCUMENTATION / EXPECTATION
## A dev command may legitimately fail because another declared stage is invalid

### Status

**REPORT WORDING SHOULD BE CORRECTED**

The report states that root dev execution should not be blocked by an override used only by prod/E2E.

That is not consistent with Builder's current V2 validation architecture.

Service infrastructure checking intentionally validates:

```text
dev
dev --full
prod
test
e2e
```

and all declared dependency/override Compose files.

Mesh checking similarly validates effective:

```text
dev
prod
test
e2e
```

configurations.

Therefore, if:

```text
prod.override-compose
```

is genuinely invalid, a dev command running the ordinary preflight is allowed to fail before starting dev.

This is desirable fail-fast behavior: Builder reports an invalid declared configuration before starting a partially valid project.

### What should change in the report

Replace:

> The root dev command should not be blocked by an override used only by production and E2E.

with:

> The dev command is expected to run Builder's cross-stage infrastructure preflight. It may therefore fail because of an actually invalid prod/E2E declaration. In this case, however, the prod/E2E override is valid and is being falsely rejected because Builder manufactures and misvalidates `build.context`.

That precisely separates the checker policy from the implementation bug.

---

# Severity assessment

| Finding | Classification | Severity | Owner |
|---|---|---:|---|
| Build-args-only override treated as context change | Builder defect | **High** | Builder |
| Equivalent standalone/mesh context strings compared textually | Builder defect, part of Finding 1 | **High** | Builder |
| Cross-service reference during isolated test | Repository configuration | **Medium** | Application repository |
| Dev preflight validates prod/e2e too | Intended behavior | Not a bug | — |

---

# Final determination

The application's report should be accepted as a **valid Builder bug report for Failure 1**.

Its technical root-cause analysis is consistent with the Builder implementation:

```text
build.args-only override
        ↓
rebaseComposePaths()
        ↓
implicit context "."
        ↓
rebased into nested/mesh-relative path
        ↓
validateAndPrepareAppOverride()
        ↓
interprets synthetic context as user context change
        ↓
false validation failure
```

The follow-on Frontend `test-unit` issue is also correctly diagnosed by the report itself as a consuming-project configuration problem.

The only substantive correction needed in the report is to remove the claim that dev preflight should categorically ignore invalid declarations belonging to other stages. Builder V2's checker is intentionally whole-project/cross-stage validation.