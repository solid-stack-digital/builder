# V2 audit 2: implementation fix plan

Read [REPORT.md](REPORT.md) for the bug list, normative basis, current behavior, and direct reproduction evidence. [REGRESSION_TESTS.md](REGRESSION_TESTS.md) contains a complete test file to copy into `tests/conformance/v220-audit2-materialized-files.test.ts`. The implementation must follow the red-test gate below for **each** item. This document is a plan only; do not treat the audit probes as a substitute for a failing automated test.

## Scope and invariant

The current compiler already checks dependency file-backed configs/secrets through `validateMaterializedComposeFiles.ts`; it checks the application Dockerfile selected by `build.json`; it rejects `mesh.json.test`; and it compiles every `depends_on` edge to `service_healthy`. Keep all of those behaviors. The new work extends fail-fast validation only to source-controlled **materialized** Compose inputs that Docker must read:

1. global tester Compose file-backed configs/secrets;
2. active app override Compose file-backed configs/secrets;
3. local build contexts and Dockerfiles in materialized dependency/tester Compose bundles.

Do not change stage inheritance, service/mesh environment precedence, host publication, dependency substitution, or test execution order. Do not introduce a new `mesh.json.test` shape. Do not reject remote build contexts simply because they have no local directory. Do not validate an inactive stage's override or a suppressed/inert dependency implementation as though it were running.

The user previously prohibited Git mutation commands. Use only read-only Git commands such as `git status`, `git diff`, and `git diff --check`; do not run `git add`, `commit`, `push`, `checkout`, `reset`, or other Git mutations.

## Mandatory gate and order

1. Capture `git status --short` and keep track of any pre-existing changes. Add the test file from `REGRESSION_TESTS.md` without changing `src/`.
2. Run the B2-01 red gate:

   ```bash
   pnpm exec vitest run tests/conformance/v220-audit2-materialized-files.test.ts -t 'B2-01 rejects'
   ```

   The two assertions must fail because compilation returns normally. If either fails because the fixture is invalid for another reason, repair the fixture and rerun. If both unexpectedly pass, B2-01 is **not reproduced** on that implementation: omit its source fix and do not report it as a current bug. After a valid red gate, implement B2-01, run `-t 'B2-01'`, and require every B2-01 control to pass.
3. Run the B2-02 red gate with its source still unchanged:

   ```bash
   pnpm exec vitest run tests/conformance/v220-audit2-materialized-files.test.ts -t 'B2-02 rejects'
   ```

   A valid red result is successful compilation where a contextual `ConfigError` was expected. Do not proceed on a fixture error. If the test passes, omit B2-02's fix. Otherwise implement it and run `-t 'B2-02'` including the path-base and inactive-stage controls.
4. Run the B2-03 red gate before editing build-input validation:

   ```bash
   pnpm exec vitest run tests/conformance/v220-audit2-materialized-files.test.ts -t 'B2-03 rejects'
   ```

   The missing dependency context, missing explicit Dockerfile, and missing tester context should each compile today and fail their `ConfigError` assertion. If any gate passes, inspect that specific fixture and omit a code change for any non-reproduced case. If the failure is unrelated, repair the fixture first. After the valid red results, implement B2-03 and run `-t 'B2-03'`, including its present/remote/suppressed/inert controls.
5. Run the full test file, related existing suites, and final checks listed at the end. Capture the exact red and green command results in the implementation notes. Do not claim a bug fixed solely because a test was added or because a Docker command failed for an unrelated reason.

For a red gate, the expected failure from the provided helper is `expected undefined to be an instance of ConfigError` (or equivalent Vitest wording); that means the current compiler accepted the invalid input. A thrown `ConfigError` with a different path is not proof of this bug—it may be a broken fixture.

## B2-01 — validate file-backed global tester resources

**Change.** Extend `src/core/composition/validateMaterializedComposeFiles.ts` without changing its existing three-argument dependency call. Add an optional fourth argument for a different path base and diagnostic composition. The exact implementation can be:

```ts
import fs from "node:fs";
import path from "node:path";
import { ConfigError } from "../../errors/ConfigError.js";
import type { ComposeDocument } from "./types.js";

export interface MaterializedComposeFileOptions {
  baseDir?: string;
  composition?: "service" | "mesh";
}

export function validateMaterializedComposeFiles(
  document: ComposeDocument,
  sourceFile: string,
  stage: string,
  options: MaterializedComposeFileOptions = {},
): void {
  const baseDir = options.baseDir ?? path.dirname(sourceFile);
  for (const kind of ["configs", "secrets"] as const) {
    for (const [name, raw] of Object.entries(document[kind] ?? {})) {
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
      const file = (raw as Record<string, unknown>).file;
      if (typeof file !== "string") continue;
      const absolute = path.resolve(baseDir, file);
      let regular = false;
      try { regular = fs.statSync(absolute).isFile(); } catch {
        // Convert an absent or inaccessible payload into the same diagnostic.
      }
      if (!regular) throw new ConfigError({
        sourceFile,
        configPath: `${kind}.${name}.file`,
        stage,
        composition: options.composition ?? "service",
        value: file,
        reason: "Materialized Compose file resource is missing or not a regular file",
      });
    }
  }
}
```

This preserves B2-01's dependency predecessor (`compileServiceComposition` still calls the function with three arguments) and leaves `external`, `environment`, and inline `content` resource definitions alone because they have no `.file` field. Do not resolve the tester file path from the mesh root: `e2e/tester.yml` with `file: ./token.txt` means `e2e/token.txt`.

In `src/core/mesh/v2/compileMeshTester.ts`, import the validator, preserve the source document before path rebasing, and call it **only** on the E2E tester path. The beginning of the function should follow this shape (keep all existing downstream validation):

```ts
import { validateMaterializedComposeFiles }
  from "../../composition/validateMaterializedComposeFiles.js";

const meshPath = path.join(meshDir, "mesh.json");
const file = resolveInsideProject(meshDir, tester.compose, {
  sourceFile: meshPath,
  configPath: "tester.compose",
  stage,
});
const sourceDocument = loadComposeDocument(file, {
  sourceFile: meshPath,
  configPath: "tester.compose",
  stage,
  composition: "mesh",
});
const raw = rebaseComposePaths(sourceDocument, file, meshDir);

// Keep the selected-service, resource-reference, internal-service-reference,
// lifecycle, build-context, and runner-network checks already in this function.
validateMaterializedComposeFiles(sourceDocument, file, stage, {
  composition: "mesh",
});
```

Place the call after validating the selected runner and resource references, and before namespacing the tester fragment. `compileMeshTester` is invoked only during E2E compilation, so mesh dev/prod must remain unaffected. Do not call this validator in `getMeshJson` or `checkMeshTester` before materialization.

**Why.** The current `compileMeshTester.ts` loads/rebases/validates reference names but never stats the file-backed payload. A missing resource can survive generation and fail when Docker creates it. The test must show an error naming the **tester YAML** and `secrets.token.file` or `configs.settings.file`, not a generic Docker failure.

**Expected/current/test.** B2-01 tests in `REGRESSION_TESTS.md` cover missing secret, directory-backed config, present nested file, and ordinary prod. Current missing-input tests fail their `.toBeInstanceOf(ConfigError)` assertion because compilation succeeds; after the change, they pass. Run the existing tester suite as an additional guard:

```bash
pnpm exec vitest run tests/v2/meshTester.test.ts tests/conformance/10-global-tester.test.ts
```

## B2-02 — validate file-backed active app override resources

**Change.** In `src/core/composition/compileServiceComposition.ts`, keep the existing active-layer loop, `loadComposeDocument`, `rebaseAppOverridePaths`, and `validateAndPrepareAppOverride` call. Import the extended validator from B2-01 (already imported for dependencies) and add **one** call after the override contract has been validated and before resources are merged:

```ts
const loadedOverride = loadComposeDocument(overridePath, {
  sourceFile: buildPath,
  configPath: `${layer.stage}.override-compose`,
  stage,
  composition: "service",
});
const overrideDocument = rebaseAppOverridePaths(
  loadedOverride, root, outputDir,
);
const prepared = validateAndPrepareAppOverride(overrideDocument, {
  file: overridePath,
  stage: layer.stage === "base" ? stage : layer.stage,
  expectedBuildContext: String(appBuild.context),
  buildContextBaseDir: outputDir,
  allocator: nameAllocator,
  resourceNamespace: options.meshMode ? options.appServiceName ?? "app" : "app",
});
validateMaterializedComposeFiles(loadedOverride, overridePath, stage, {
  baseDir: root,
  composition: "service",
});
// Keep the existing resource merge and app merge below this point.
```

`baseDir: root` is deliberate. `rebaseAppOverridePaths` currently interprets app override Compose paths from the **service project root** even when the YAML lives in a nested `overrides/` directory. If the validator used `dirname(overridePath)`, it would reject a valid `file: ./settings.txt` located in the service root. Preserve this established contract. Since the code traverses only `effective.layers`, an override under a stage not inherited by this compile remains inactive.

**Why.** `validateAndPrepareAppOverride` checks that an app consumes its declared resource and namespaces it; it does not require a `.file` payload to exist. The missing payload remains in emitted Compose.

**Expected/current/test.** B2-02 tests in `REGRESSION_TESTS.md` cover missing config and secret, a present file in the correct service-root location, and an inactive prod-only override during dev. Current missing-input tests fail because compilation succeeds; after the change, both throw the contextual `ConfigError`. Run related override suites:

```bash
pnpm exec vitest run tests/v2/compileServiceComposition.test.ts tests/conformance/v210-override-resources.test.ts
```

## B2-03 — validate local build inputs only when their bundle is materialized

**Change A: share the existing remote-context classifier.** In `src/core/composition/composePaths.ts`, change the current private `function isRemoteBuildContext(value: string): boolean` to an exported function without altering its body. The rebasing code must continue using the same classifier:

```ts
export function isRemoteBuildContext(value: string): boolean {
  return /^[A-Za-z][A-Za-z0-9+.-]*:\/\//.test(value)
    || /^[^/@\s]+@[^:\s]+:.+/.test(value);
}
```

**Change B: add `src/core/composition/validateMaterializedComposeBuildInputs.ts`.** Validate the **source** Compose document so relative paths have their original meaning. The first argument is the document loaded from disk, not its rebased/namespaced clone. This implementation covers string and object `build`, default and explicit Dockerfile, inline Dockerfile, and remote contexts:

```ts
import fs from "node:fs";
import path from "node:path";
import { ConfigError } from "../../errors/ConfigError.js";
import { isRemoteBuildContext } from "./composePaths.js";
import type { ComposeDocument } from "./types.js";

export function validateMaterializedComposeBuildInputs(
  document: ComposeDocument,
  sourceFile: string,
  stage: string,
  composition: "service" | "mesh",
): void {
  const baseDir = path.dirname(sourceFile);
  for (const [name, service] of Object.entries(document.services ?? {})) {
    const build = service.build;
    if (build === undefined) continue;

    const objectBuild = build && typeof build === "object" && !Array.isArray(build)
      ? build as Record<string, unknown>
      : undefined;
    const context = typeof build === "string"
      ? build : objectBuild?.context ?? ".";
    const configPath = `services.${name}.build`;
    const fail = (field: string, value: unknown, reason: string): never => {
      throw new ConfigError({
        sourceFile,
        configPath: `${configPath}.${field}`,
        stage,
        composition,
        value,
        reason,
      });
    };

    if (typeof context !== "string" || context.trim() === "") {
      fail("context", context, "Local build context must be a non-empty path");
    }
    if (isRemoteBuildContext(context)) continue;

    const absoluteContext = path.resolve(baseDir, context);
    let directory = false;
    try { directory = fs.statSync(absoluteContext).isDirectory(); } catch {
      // Fail with a logical Compose path below.
    }
    if (!directory) {
      fail("context", context,
        "Materialized local build context is missing or not a directory");
    }

    if (objectBuild?.dockerfile_inline !== undefined) continue;
    const dockerfile = objectBuild?.dockerfile ?? "Dockerfile";
    if (typeof dockerfile !== "string" || dockerfile.trim() === "") {
      fail("dockerfile", dockerfile, "Dockerfile path must be a non-empty string");
    }
    const absoluteDockerfile = path.resolve(absoluteContext, dockerfile);
    let regular = false;
    try { regular = fs.statSync(absoluteDockerfile).isFile(); } catch {
      // Fail with a logical Compose path below.
    }
    if (!regular) {
      fail("dockerfile", dockerfile,
        "Materialized local Dockerfile is missing or not a regular file");
    }
  }
}
```

Do not validate `build.additional_contexts` in this patch without its own red test and remote-context controls. The confirmed failures are the primary local `build.context` and Dockerfile. `assertNoServiceBuildContexts` already handles unsupported `service:` additional contexts. Do not use this validator for app override Compose: overrides cannot select a different app build context, and the application's chosen Dockerfile has its own contract validation.

**Change C: call only after materialization is known.** In `compileServiceComposition.ts`, import the new helper and call it inside the existing integrated dependency loop **after** `suppressDependencies` and **before** `mergeDocument`:

```ts
for (const [key, entry] of Object.entries(namespaced)) {
  if (options.suppressDependencies?.has(key)) continue;
  validateMaterializedComposeFiles(entry.raw, entry.source, stage);
  validateMaterializedComposeBuildInputs(
    entry.raw, entry.source, stage, "service",
  );
  // Keep the existing item clone, merge, endpoint owner map, and materialized record.
}
```

The `namespaced` map is created only for endpoint-bearing dependencies, so the check does not run for inert dependencies. It does not run for isolated `test` or ordinary dev because those phases do not materialize local dependency containers.

In `compileMeshTester.ts`, call the new helper on `sourceDocument` alongside B2-01's file-resource check, before namespace/merge:

```ts
validateMaterializedComposeFiles(sourceDocument, file, stage, {
  composition: "mesh",
});
validateMaterializedComposeBuildInputs(
  sourceDocument, file, stage, "mesh",
);
```

**Why.** `rebaseComposePaths` adjusts paths but does not stat them, while `validateDependencyCompose` and `compileMeshTester` only reject unsupported service-reference additional contexts. Docker's build step discovers a missing local context/Dockerfile later. Validation is possible at compile time because the source Compose file and base directory are already known.

**Expected/current/test.** B2-03 tests in `REGRESSION_TESTS.md` cover the missing local context, missing explicit Dockerfile, missing tester context, existing local inputs, remote context, suppressed dependency, and inert dependency. Current missing-input cases fail their expected-error assertions; after the change, all controls pass. Add one extra control using `dockerfile_inline` so no physical Dockerfile is required when the Compose build uses the inline source:

```ts
it("B2-03 accepts dockerfile_inline without a physical Dockerfile", () => {
  const root = dependencyRoot({
    build: { context: "./build-context", dockerfile_inline: "FROM alpine:latest" },
    healthcheck: { test: ["CMD", "true"] },
  });
  write(root, "build-context/.keep", "");
  expect(() => compileServiceComposition("prod", root, { validationMode: true }))
    .not.toThrow();
});
```

Run existing path and Compose suite controls:

```bash
pnpm exec vitest run tests/path-boundaries-regression.test.ts tests/v2/dependencyCompose.test.ts tests/conformance/04-dependencies.test.ts tests/conformance/10-global-tester.test.ts
```

## Documentation work after green implementation

The four official normative files already say missing declared files fail whenever possible and already allow the relevant Compose forms. Do not rephrase or expand those files unless a direct contradiction is found while implementing. Update only the affected public guidance under `./docs`:

- `docs/reference/dependency-compose-contract.md`: local `build.context` and its Dockerfile must exist when the dependency is materialized; remote contexts are not local-file checks.
- `docs/reference/override-compose-contract.md`: file-backed app configs/secrets must exist when the override is active, with paths interpreted from the service project root.
- `docs/guides/configure-global-mesh-e2e.md`: file-backed tester configs/secrets and local tester/helper build inputs are validated from the tester Compose file's directory during E2E compilation.

Keep these edits short and factual. Avoid changing user-facing stage or testing semantics. If existing documentation uses a different path convention for an override, stop and resolve that contract conflict before implementing B2-02; do not silently change path semantics through validation.

## Final validation and review

Run the complete new test file and all normal project checks after fixes:

```bash
pnpm exec vitest run tests/conformance/v220-audit2-materialized-files.test.ts
pnpm typecheck
pnpm test
pnpm test:docker
pnpm build
pnpm check:v2-no-legacy
git diff --check
git status --short
```

The Docker suite is the final integration guard for existing dependency, override, and tester behavior; the new red/green compiler tests establish the specific missing-file failures without depending on image pulls. Review that no fixed helper replaced the exact selected tester's exit status, no `service_started` edge was emitted, and no root mesh `test` field was accepted. Final implementation notes should list, for each ID, the red command, the observed failure, the green command, the changed files, and any limitation. If an item failed to reproduce, explicitly mark it **not reproduced** and omit its proposed source change.
