# Builder V3 Codebase Audit & Implementation Fix Plan (Generation 5)

This document provides a fifth-generation (Gen 5) deep audit of the `@solid-stack/builder` V3 codebase against [spec_v3.0.0.md](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/.docs/specs_v3/spec_v3.0.0.md) and [EXECUTION_MODEL.md](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/.docs/EXECUTION_MODEL.md).

---

## 1. Executive Summary & Audit Verdict

Following the upstream integration of Generation 1 (`feat: implemented bug fix 1`, commit `4cff865`), Generation 2 (`feat: bug fix 2`, commit `ba3abcc`), Generation 3 (`feat: bug fix 3`, commit `2a0ab63`), and Generation 4 (`fix: implemented bug fixes 4`, commit `d573411`), the codebase passes:
- `pnpm typecheck` (0 errors)
- `pnpm test:v3:fast` (383/383 tests across 28 files passed in 8.19s, 61 final invariants mapped)
- `pnpm test:docker` (`DOC01`, `DOC02`, `DOC03` passed)

A thorough verification of all **23 prior bugs** across Generations 1, 2, 3, and 4 confirmed that all 23 are completely resolved and covered by regression tests.

However, an exhaustive fifth-generation audit evaluating stage-introduced service diagnostics, mesh extends override-compose path resolution, Compose document error attribution, Dockerfile exec-form foreground verification, and platform path canonicalization revealed **5 new concrete defects**:

1. **Stage-Added Services Post-Merge Diagnostics Hardcoded to Base `services.<name>`** in [`src/core/config/resolveBuildStage.ts:47-66`](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/src/core/config/resolveBuildStage.ts#L47-L66).
2. **`selectedOverride` Duplicates Service Name on Mesh-Authored Overrides (`.main.main.override-compose`)** in [`src/core/composition/compileGraphComposition.ts:59`](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/src/core/composition/compileGraphComposition.ts#L59).
3. **`loadComposeDocument` Throws Nonexistent File Path as `sourceFile` instead of Declaring Configuration File** in [`src/core/composition/loadCompose.ts:6-7`](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/src/core/composition/loadCompose.ts#L6-L7).
4. **Exec-Form Background Commands (`CMD ["sh", "-c", "... &"]` / `ENTRYPOINT ["...", "&"]`) Bypass Main Dockerfile Foreground Check** in [`src/core/checkers/checkDockerfileContract.ts:36`](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/src/core/checkers/checkDockerfileContract.ts#L36).
5. **`checkYamlFiles.ts` Uses Non-Canonical POSIX Slashes on Windows for `sourceFile`** in [`src/core/checkers/checkYamlFiles.ts:13-14`](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/src/core/checkers/checkYamlFiles.ts#L13-L14).

---

## 2. Verification of Prior Generation Audits

| Generation | Bug ID | Description | Resolution Status | Verified Implementation |
|---|---|---|---|---|
| **Gen 1** | Bug 1.1 | HEALTHCHECK false positive on "none" substring | **Fixed** (`4cff865`) | Exact `^NONE$` regex in [`checkDockerfileContract.ts:35`](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/src/core/checkers/checkDockerfileContract.ts#L35). |
| **Gen 1** | Bug 1.2 | Dev foreground check evaluates non-dev stages | **Fixed** (`4cff865`) | Guarded by `activeStage === "dev"` in [`checkDockerfileContract.ts:36`](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/src/core/checkers/checkDockerfileContract.ts#L36). |
| **Gen 1** | Bug 1.3 | Mesh publish misattributes error to `build.json` | **Fixed** (`4cff865`) | Uses `meshSourceFile` and `services.${root}.publish` in [`publication.ts:24`](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/src/core/config/publication.ts#L24). |
| **Gen 1** | Bug 1.4 | Internal `@mesh:` prefix leaks into diagnostics | **Fixed** (`4cff865`) | Stripped via `.replace(/^@mesh:/, "")` in [`serviceGraph.ts:14`](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/src/core/config/serviceGraph.ts#L14). |
| **Gen 1** | Bug 1.5 | Ordinary service top-level `service` mismatch bypassed in isolated dev | **Fixed** (`4cff865`) | Checked across all stages in [`resolveBuildStage.ts:60-63`](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/src/core/config/resolveBuildStage.ts#L60-L63). |
| **Gen 1** | Bug 1.6 | Flaky multi-pipeline test timeouts | **Fixed** (`4cff865`) | Configured dedicated timeouts in [`meshWorkflowMatrix.test.ts`](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/tests/v3/meshWorkflowMatrix.test.ts). |
| **Gen 1** | Bug 1.7 | Real Docker standalone graph race condition | **Fixed** (`4cff865`) | Cleaned in [`standalone.test.ts`](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/tests/v3/docker/standalone.test.ts). |
| **Gen 2** | Bug 2.1 | `readDotenvValues` truncates values with escaped quotes `\"` | **Fixed** (`ba3abcc`) | Backslash-aware quote counter in [`dotenv.ts:14-16`](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/src/core/composition/dotenv.ts#L14-L16); tested by `[ENV21]`. |
| **Gen 2** | Bug 2.2 | Colon separator `:` in `.env` bypasses Builder-owned key check | **Fixed** (`ba3abcc`) | Regex updated to `\s*[:=]` in [`builderEnvironment.ts:15`](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/src/core/config/builderEnvironment.ts#L15); tested by `[ENV22]`. |
| **Gen 2** | Bug 2.3 | Flagged `FROM` (e.g. `--platform=...`) breaks Dockerfile contract | **Fixed** (`ba3abcc`) | Regex updated to `^FROM\s+(?:--\S+\s+)*(\S+)` in [`checkDockerfileContract.ts:17`](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/src/core/checkers/checkDockerfileContract.ts#L17); tested by `[LIF23]`. |
| **Gen 2** | Bug 2.4 | Stale V2 `dependsOn` in Compose cycle diagnostics | **Fixed** (`ba3abcc`) | Changed to `configPath: "services.depends_on"` in [`lifecycleGraph.ts:5`](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/src/core/config/lifecycleGraph.ts#L5); tested by `[LIF24]`. |
| **Gen 2** | Bug 2.5 | `compileApplicationEnv` overrides `validationMode: false` | **Fixed** (`ba3abcc`) | Default set as `{ validationMode: true, ...options }` in [`compileApplicationEnv.ts:25`](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/src/core/compileApplicationEnv.ts#L25); tested by `[CLI11]`. |
| **Gen 2** | Bug 2.6 | `validateServiceCompose` misattributes `service` mismatch to Compose file | **Fixed** (`ba3abcc`) | Revalidated in [`applyMeshExtends.ts:21-25`](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/src/core/mesh/applyMeshExtends.ts#L21-L25) and origin passed to `validateServiceCompose.ts:28`; tested by `[CMP25]`. |
| **Gen 3** | Bug 3.1 | String-form `test: "NONE"` accepted as enabled healthcheck | **Fixed** (`2a0ab63`) | `!/^NONE$/i.test(test.trim())` in [`composeHealthcheck.ts:7`](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/src/core/composition/composeHealthcheck.ts#L7); tested by `[LIF25]`. |
| **Gen 3** | Bug 3.2 | Dockerfile contract skipped for stage-added mesh source services | **Fixed** (`2a0ab63`) | Multi-layer iteration in [`checkMeshServices.ts:10-14`](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/src/core/mesh/checkers/checkMeshServices.ts#L10-L14); tested by `[MSH16]`. |
| **Gen 3** | Bug 3.3 | Overlay publish selector misattributed to base path | **Fixed** (`2a0ab63`) | `publishOrigin` tracked on `EffectiveMeshSource` in [`resolveMeshStage.ts:18,33`](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/src/core/config/resolveMeshStage.ts#L18) and used in [`publication.ts:24`](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/src/core/config/publication.ts#L24); tested by `[PUB21]`. |
| **Gen 3** | Bug 3.4 | Materialized Compose build input unvalidated for `service:` context | **Fixed** (`2a0ab63`) | `assertNoServiceBuildContexts` invoked in [`validateMaterializedComposeBuildInputs.ts:19`](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/src/core/composition/validateMaterializedComposeBuildInputs.ts#L19); tested by `[CMP26]`. |
| **Gen 3** | Bug 3.5 | Stage-added mesh source path error misattributes configPath | **Fixed** (`2a0ab63`) | Used `${entry.origin.configPath}.source` in [`loadMeshSources.ts:10`](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/src/core/mesh/loadMeshSources.ts#L10); tested by `[MSH17]`. |
| **Gen 4** | Bug 4.1 | Tester overlay diagnostics misattributed to base `services.tester` | **Fixed** (`d573411`) | Pass `envOrigins` and `serviceOrigin` to `compileTester` in [`compileGraphComposition.ts:134-135`](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/src/core/composition/compileGraphComposition.ts#L134-L135); tested by `[TST08]`. |
| **Gen 4** | Bug 4.2 | Ordinary Compose validation misattributes endpoint owners to Compose | **Fixed** (`d573411`) | Attributed missing representative and endpoint owner containers to `declarationOrigin` in [`validateServiceCompose.ts:28,32,34`](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/src/core/composition/validateServiceCompose.ts#L28); tested by `[CMP27]`. |
| **Gen 4** | Bug 4.3 | Main override and tester fail to reject host-root bind mounts | **Fixed** (`d573411`) | Added `isHostFilesystemRoot` checks in [`validateOverrideCompose.ts:37`](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/src/core/composition/validateOverrideCompose.ts#L37) and [`compileTester.ts:33`](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/src/core/composition/compileTester.ts#L33); tested by `[CMP28]`. |
| **Gen 4** | Bug 4.4 | Lowercase array healthcheck commands falsely rejected | **Fixed** (`d573411`) | Normalized `test[0]?.toUpperCase()` in [`composeHealthcheck.ts:9`](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/src/core/composition/composeHealthcheck.ts#L9); tested by `[LIF27]`. |
| **Gen 4** | Bug 4.5 | Nonexistent endpoint conflated with missing `publicPort` capability | **Fixed** (`d573411`) | Split endpoint check into two steps in [`publication.ts:12-14`](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/src/core/config/publication.ts#L12-L14); tested by `[PUB22]`. |

---

## 3. Specification & Execution Model Traceability Matrix

| Area | Normative Reference | Implementation Files | Status | Notes |
|---|---|---|---|---|
| **Stage-Added Services Validation** | `spec_v3.0.0.md §28, §83` | [`resolveBuildStage.ts`](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/src/core/config/resolveBuildStage.ts) | **Defective** | Errors on stage-added services (e.g. `dev.services.worker`) report `services.worker.*` instead of `dev.services.worker.*` (Bug 5.1). |
| **Mesh-Authored Overrides** | `spec_v3.0.0.md §37, §65, §83` | [`compileGraphComposition.ts`](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/src/core/composition/compileGraphComposition.ts) | **Defective** | `selectedOverride` duplicates the service name on mesh layers, producing `services.<root>.extends.main.main.override-compose` (Bug 5.2). |
| **Missing Compose Files Attribution** | `spec_v3.0.0.md §83` | [`loadCompose.ts`](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/src/core/composition/loadCompose.ts) | **Defective** | When a declared Compose file does not exist, `loadComposeDocument` overwrites `sourceFile` with the nonexistent file path instead of preserving the declaring JSON configuration file (Bug 5.3). |
| **Dockerfile Foreground Runtime** | `spec_v3.0.0.md §5, §83`, `EXECUTION_MODEL.md §1` | [`checkDockerfileContract.ts`](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/src/core/checkers/checkDockerfileContract.ts) | **Defective** | JSON array exec-form commands (e.g. `CMD ["sh", "-c", "node server.js &"]` or `ENTRYPOINT ["...", "&"]`) bypass the regex check and are accepted in background mode (Bug 5.4). |
| **Windows Path Portability** | `spec_v3.0.0.md §83`, General Architecture | [`checkYamlFiles.ts`](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/src/core/checkers/checkYamlFiles.ts) | **Defective** | `sourceFile: `${root}/build.json`` produces mixed slashes on Windows platforms (Bug 5.5). |
| **Execution Variables & Modes** | `EXECUTION_MODEL.md §1, §7`, `spec_v3.0.0.md §4, §54, §55` | [`builderEnvironment.ts`](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/src/core/config/builderEnvironment.ts) | **Compliant** | `EXEC_MODE` and `INFRA_MODE` strictly assigned to `main`; tester receives neither; `.env` validation catches `=` and `:` keys. |
| **Environment Precedence** | `spec_v3.0.0.md §56-64`, `EXECUTION_MODEL.md §5` | [`compileGraphComposition.ts`](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/src/core/composition/compileGraphComposition.ts) | **Compliant** | Precedence strictly adheres to `sourceEnv -> override -> meshEnv -> Builder-owned`. Tester precedence `.env.e2e-tester -> tester.env -> internal` is preserved. |
| **Requisite Graph & Acyclicity** | `spec_v3.0.0.md §7-15` | [`serviceGraph.ts`](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/src/core/config/serviceGraph.ts) | **Compliant** | Requisite lowering (`requirement`, `dependency`, `prerequisite`) and cycle detection fully match specification. |
| **Two-Phase Global Testing** | `EXECUTION_MODEL.md §6`, `spec_v3.0.0.md §78` | [`runMeshTest.ts`](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/src/core/mesh/runners/runMeshTest.ts) | **Compliant** | Phase 1 runs sequential source unit/E2E; Phase 2 runs global mesh E2E; teardown between phases is verified in Docker integration tests. |

---

## 4. Generation 5 Defect Reports

### Bug 5.1: Stage-Added Services Post-Merge Diagnostics Hardcoded to Base `services.<name>`

- **Location**: [`src/core/config/resolveBuildStage.ts:47-66`](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/src/core/config/resolveBuildStage.ts#L47-L66)
- **The Bug**:
  In `resolveBuildStage.ts`:
  ```ts
  47:   for (const [name, value] of Object.entries(services)) {
  48:     if (name === "tester") {
  49:       if (typeof value.compose !== "string" || typeof value.service !== "string") fail(sourceFile, stage, `services.${name}`, "Effective tester requires compose and service");
  50:       continue;
  51:     }
  52:     const endpoints = (value.endpoints ?? {}) as Record<string, { port?: number; service?: string; primary?: boolean }>;
  53:     for (const [endpointName, endpoint] of Object.entries(endpoints)) {
  54:       if (!Number.isInteger(endpoint.port) || endpoint.port! < 1 || endpoint.port! > 65535) fail(sourceFile, stage, `services.${name}.endpoints.${endpointName}.port`, "Effective endpoint requires port in 1..65535", endpoint.port);
  55:       if (name !== "main" && (typeof endpoint.service !== "string" || !endpoint.service.trim())) fail(sourceFile, stage, `services.${name}.endpoints.${endpointName}.service`, "Effective ordinary endpoint requires service");
  56:     }
  57:     assertPrimaryEndpointInvariant(endpoints, { sourceFile, stage, configPath: `services.${name}.endpoints` });
  58:     if (name !== "main" && (typeof value.compose !== "string" || !value.compose.trim())) fail(sourceFile, stage, `services.${name}.compose`, "Effective ordinary service requires compose");
  59:     if (name !== "main" && Object.keys(endpoints).length === 0 && (typeof value.service !== "string" || !value.service.trim())) fail(sourceFile, stage, `services.${name}.service`, "endpoint-less service requires service");
  60:     if (name !== "main" && Object.keys(endpoints).length > 0 && typeof value.service === "string") {
  61:       const primary = Object.values(endpoints).find(endpoint => endpoint.primary);
  62:       if (primary?.service && value.service !== primary.service) fail(sourceFile, stage, `services.${name}.service`, "top-level service must equal primary endpoint owner", value.service);
  63:     }
  ```
  `origins.get(name)` tracks where each service was introduced or declared. For a stage-added service (such as `dev.services.worker`), `origins.get("worker")!.configPath` is `"dev.services.worker"`.
  However, lines 49, 54, 55, 57, 58, 59, and 62 completely ignore `origins.get(name)` and hardcode `services.${name}`.
  Consequently, when `dev.services.worker` has no endpoints and no `service`, line 59 throws `configPath: "services.worker.service"`. `services.worker` does not exist in `build.json`.
- **Why It Is a Bug**:
  Under Spec V3 §28 and §83:
  Stage-introduced services must provide their required declaration under `${stage}.services.<name>`. Diagnostic paths must attribute errors to the configuration path in `build.json` where the declaration was authored, not a nonexistent base path.
- **How to Create a Test for the Bug (Failing Test)**:
  ```ts
  it("[STG08] stage-introduced service validation errors identify the declaring stage", () => {
    const b = basicBuild();
    b.dev = { services: { worker: { compose: "worker.yml" } } };
    expect(() => resolveBuildStage(b as any, "dev", "/app/build.json")).toThrowError(
      expect.objectContaining({
        context: expect.objectContaining({
          configPath: "dev.services.worker.service",
        }),
      })
    );
  });
  ```
  *Current behavior:* Throws with `configPath: "services.worker.service"`.
- **Expected Behavior**: Error must report `configPath: "dev.services.worker.service"`.
- **How to Fix the Bug**:
  In [`src/core/config/resolveBuildStage.ts:47-66`](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/src/core/config/resolveBuildStage.ts#L47-L66), extract `const originPath = origins.get(name)?.configPath ?? `services.${name}`;` and prefix all child diagnostic paths with `originPath`:
  - Line 49: `fail(sourceFile, stage, originPath, "Effective tester requires compose and service");`
  - Line 54: `fail(sourceFile, stage, `${originPath}.endpoints.${endpointName}.port`, "Effective endpoint requires port in 1..65535", endpoint.port);`
  - Line 55: `fail(sourceFile, stage, `${originPath}.endpoints.${endpointName}.service`, "Effective ordinary endpoint requires service");`
  - Line 57: `assertPrimaryEndpointInvariant(endpoints, { sourceFile, stage, configPath: `${originPath}.endpoints` });`
  - Line 58: `fail(sourceFile, stage, `${originPath}.compose`, "Effective ordinary service requires compose");`
  - Line 59: `fail(sourceFile, stage, `${originPath}.service`, "endpoint-less service requires service");`
  - Line 62: `fail(sourceFile, stage, `${originPath}.service`, "top-level service must equal primary endpoint owner", value.service);`

---

### Bug 5.2: `selectedOverride` Duplicates Service Name on Mesh-Authored Overrides (`.main.main.override-compose`)

- **Location**: [`src/core/composition/compileGraphComposition.ts:59`](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/src/core/composition/compileGraphComposition.ts#L59)
- **The Bug**:
  In `compileGraphComposition.ts:59`:
  ```ts
  function selectedOverride(build:EffectiveBuildConfig,name:string):{path:string;origin:Origin}|undefined {
    let result:{path:string;origin:Origin}|undefined;
    for(const layer of build.layers){
      const patch=layer.services[name];
      const value=patch?.["override-compose"];
      if(typeof value==="string")result={path:value,origin:{...layer.origin,configPath:`${layer.origin.configPath}.${name}.override-compose`}};
    }
    return result;
  }
  ```
  In `applyMeshExtends.ts:10,37`:
  ```ts
  const origin: Origin = { ...layer.origin, meshRoot: root, configPath: `${layer.origin.configPath}.${name}` };
  build.layers.push({ stage: layer.layer, services: { [name]: structuredClone(patch) }, origin });
  ```
  When a mesh authors an `override-compose` for `main` inside `extends`:
  `layer.origin.configPath` on the pushed layer is ALREADY `services.<root>.extends.${name}` (e.g. `services.api.extends.main`).
  When `selectedOverride` runs for `name = "main"`, line 59 computes:
  `${layer.origin.configPath}.${name}.override-compose`, resulting in `services.api.extends.main.main.override-compose`!
  Notice the duplicated `.main.main.`.
- **Why It Is a Bug**:
  Under Spec V3 §37, §65, and §83:
  In `mesh.json`, the property is authored at `services.api.extends.main.override-compose`. Duplicating the service name produces an invalid diagnostic path that does not exist in `mesh.json`.
- **How to Create a Test for the Bug (Failing Test)**:
  ```ts
  it("[MSH18] mesh-authored override error path does not duplicate service name", () => {
    const { root, mesh, save } = setup();
    mesh.services.backend.extends = { main: { "override-compose": "missing.yml" } };
    save();
    try {
      compileMeshComposition("prod", root, { validationMode: true });
      throw new Error("Expected failure");
    } catch (error) {
      expect(error).toBeInstanceOf(ConfigError);
      expect((error as ConfigError).context.configPath).toBe("services.backend.extends.main.override-compose");
    }
  });
  ```
  *Current behavior:* Throws `configPath: "services.backend.extends.main.main.override-compose"`.
- **Expected Behavior**: Error must report `configPath: "services.backend.extends.main.override-compose"`.
- **How to Fix the Bug**:
  In [`src/core/composition/compileGraphComposition.ts:59`](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/src/core/composition/compileGraphComposition.ts#L59), do not append `.${name}` if `layer.origin.configPath` already ends with `.${name}`:
  ```ts
  const base = layer.origin.configPath.endsWith(`.${name}`) ? layer.origin.configPath : `${layer.origin.configPath}.${name}`;
  result = { path: value, origin: { ...layer.origin, configPath: `${base}.override-compose` } };
  ```

---

### Bug 5.3: `loadComposeDocument` Throws Nonexistent File Path as `sourceFile` instead of Declaring Configuration File

- **Location**: [`src/core/composition/loadCompose.ts:6-7`](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/src/core/composition/loadCompose.ts#L6-L7)
- **The Bug**:
  In `loadComposeDocument`:
  ```ts
  export function loadComposeDocument(absolutePath:string, context:{sourceFile:string;configPath:string;stage:string;composition:"service"|"mesh"}):ComposeDocument {
   const fail=(reason:string,value?:unknown):never=>{throw new ConfigError({...context,sourceFile:absolutePath,...(value===undefined?{}:{value}),reason});};
   if(!existsSync(absolutePath)||!statSync(absolutePath).isFile()) fail("Compose file does not exist or is not a regular file");
  ```
  When `!existsSync(absolutePath)`, `fail(...)` sets `sourceFile: absolutePath` (the nonexistent file).
  The resulting diagnostic reports:
  `sourceFile: "/app/nonexistent.yml"`, `configPath: "services.db.compose"`.
  However, the error is that `/app/build.json` specified a Compose file that does not exist.
  Claiming that `/app/nonexistent.yml` contains a `services.db.compose` field is nonsensical, and IDE error highlighters fail to navigate because the file does not exist on disk.
- **Why It Is a Bug**:
  Under Spec V3 §83:
  When a referenced file does not exist, the error originates in the configuration file that declared the invalid reference (`context.sourceFile`), not the nonexistent target file itself.
- **How to Create a Test for the Bug (Failing Test)**:
  ```ts
  it("[CMP29] missing compose file error identifies declaring build.json", () => {
    const b = basicBuild();
    b.services.db = { compose: "nonexistent.yml", service: "db" };
    const root = writeBasic(b);
    try {
      compileServiceComposition("prod", root, { validationMode: true });
      throw new Error("Expected missing compose file");
    } catch (error) {
      expect(error).toBeInstanceOf(ConfigError);
      expect((error as ConfigError).context).toMatchObject({
        sourceFile: path.join(root, "build.json"),
        configPath: "services.db.compose",
      });
    }
  });
  ```
  *Current behavior:* Throws `sourceFile: "/app/nonexistent.yml"`.
- **Expected Behavior**: Diagnostic must report `sourceFile: path.join(root, "build.json")` and `configPath: "services.db.compose"`.
- **How to Fix the Bug**:
  In [`src/core/composition/loadCompose.ts:7`](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/src/core/composition/loadCompose.ts#L7), fail with `context.sourceFile` when the file does not exist:
  ```ts
  if (!existsSync(absolutePath) || !statSync(absolutePath).isFile()) {
    throw new ConfigError({ ...context, value: absolutePath, reason: "Compose file does not exist or is not a regular file" });
  }
  ```

---

### Bug 5.4: Exec-Form Background Commands (`CMD ["sh", "-c", "... &"]` / `ENTRYPOINT ["...", "&"]`) Bypass Main Dockerfile Foreground Check

- **Location**: [`src/core/checkers/checkDockerfileContract.ts:36`](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/src/core/checkers/checkDockerfileContract.ts#L36)
- **The Bug**:
  In `checkDockerfileContract.ts:36`:
  ```ts
  if(activeStage==="dev"&&[effectiveEntrypoint,effectiveCmd].some(instruction=>instruction!==undefined&&/(?:nohup|&\s*$|--daemon)/i.test(instruction)))fail("dev runtime must remain in foreground");
  ```
  The regex `/(?:nohup|&\s*$|--daemon)/i` checks for `&` immediately followed by the end of the instruction line (`$`).
  When Dockerfile JSON exec-form syntax is used, such as:
  `CMD ["sh", "-c", "node server.js &"]`
  or
  `ENTRYPOINT ["node", "server.js", "&"]`
  the line ends with `"]` rather than `&`.
  Because `&\s*$` does not match before `"]`, backgrounded commands in exec-form format completely bypass validation and succeed.
- **Why It Is a Bug**:
  Under Spec V3 §5:
  "`dev` SHOULD support hot reload and MUST run in the foreground."
  Permitting dev containers to detach or background via exec form violates the mandatory foreground contract.
- **How to Create a Test for the Bug (Failing Test)**:
  ```ts
  it("[LIF28] exec-form backgrounded dev command fails foreground contract", () => {
    const root = writeBasic();
    fs.writeFileSync(path.join(root, "Dockerfile"), `
  FROM alpine:3 AS dev
  CMD ["sh", "-c", "node server.js &"]
  HEALTHCHECK CMD true
  FROM dev AS test
  CMD true
  FROM dev AS prod
  CMD true
  `);
    expect(() => assertMainDockerfileContract(root, "dev")).toThrow(/dev runtime must remain in foreground/);
  });
  ```
  *Current behavior:* `assertMainDockerfileContract(root, "dev")` succeeds without throwing.
- **Expected Behavior**: Throws `ConfigError` with `dev runtime must remain in foreground`.
- **How to Fix the Bug**:
  In [`src/core/checkers/checkDockerfileContract.ts:36`](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/src/core/checkers/checkDockerfileContract.ts#L36), adjust the regex to match `&` before closing brackets or quotes:
  ```ts
  if(activeStage==="dev"&&[effectiveEntrypoint,effectiveCmd].some(instruction=>instruction!==undefined&&/(?:nohup|&\s*(?:["']?\s*\]|\s*$)|\bdaemon\b|--daemon)/i.test(instruction)))fail("dev runtime must remain in foreground");
  ```

---

### Bug 5.5: `checkYamlFiles.ts` Uses Non-Canonical POSIX Slashes on Windows for `sourceFile`

- **Location**: [`src/core/checkers/checkYamlFiles.ts:13-14`](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/src/core/checkers/checkYamlFiles.ts#L13-L14)
- **The Bug**:
  In `checkYamlFiles.ts`:
  ```ts
  13:     const absolutePath = resolveInsideProject(root, file.relativePath, {sourceFile: `${root}/build.json`, configPath: file.source, ...(file.stage ? {stage:file.stage} : {})});
  14:     loadComposeDocument(absolutePath, {sourceFile:`${root}/build.json`, configPath:file.source, stage:file.stage ?? "base", composition:"service"});
  ```
  `checkYamlFiles` constructs `sourceFile: `${root}/build.json`` by raw string interpolation with a forward slash.
  On Windows systems, `root` uses backslashes (e.g. `C:\Users\app`), producing mixed-slash paths like `C:\Users\app/build.json`.
  Every other file in the codebase uses `path.join(root, "build.json")`.
- **Why It Is a Bug**:
  Under Spec V3 §83 and cross-platform guidelines:
  `sourceFile` paths in `ConfigError.context` must use canonical OS filesystem paths to guarantee reliable path matching and test assertions across POSIX and Windows environments.
- **How to Create a Test for the Bug (Failing Test)**:
  ```ts
  it("[CHK05] checkYamlFiles uses canonical path.join for sourceFile", () => {
    const b = basicBuild();
    b.services.db = { compose: "db.yml", service: "db" };
    const root = writeBasic(b);
    fs.writeFileSync(path.join(root, "db.yml"), "invalid: yaml: :");
    try {
      checkYamlFiles(b, root);
      throw new Error("Expected failure");
    } catch (error) {
      expect(error).toBeInstanceOf(ConfigError);
      expect((error as ConfigError).context.sourceFile).toBe(path.join(root, "build.json"));
    }
  });
  ```
- **Expected Behavior**: `sourceFile` must match `path.join(root, "build.json")`.
- **How to Fix the Bug**:
  In [`src/core/checkers/checkYamlFiles.ts:13-14`](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/src/core/checkers/checkYamlFiles.ts#L13-L14), replace `${root}/build.json` with `path.join(root, "build.json")`.

---

## 5. Implementation Fix Plan & Test-Driven Decision Protocol

### 5.1 Protocol Rule
For every defect:
1. Implement the reproduction test in the relevant test matrix.
2. Run the test against the unmodified code:
   - **If the test FAILS** due to the defect: **PROCEED** with the code fix.
   - **If the test PASSES**: **ABORT** the fix. It is not an actual bug.
3. Apply the minimal code fix.
4. Verify the test passes and run the full regression test suite (`pnpm test:v3:fast && pnpm test:docker`).

---

### 5.2 Step-by-Step Code Modifications

#### Fix 1: Stage-Added Services Diagnostics in `resolveBuildStage.ts`
- **File**: [`src/core/config/resolveBuildStage.ts:47-66`](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/src/core/config/resolveBuildStage.ts#L47-L66)
- **Change**:
  Extract `const originPath = origins.get(name)?.configPath ?? `services.${name}`;` before validating each merged service, and use `originPath` for all diagnostic error paths.
- **Test File**: Add test case `[STG08] stage-introduced service validation errors identify the declaring stage` to [`tests/v3/stages.test.ts`](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/tests/v3/stages.test.ts).

#### Fix 2: Disambiguate Mesh Layer Override Paths in `compileGraphComposition.ts`
- **File**: [`src/core/composition/compileGraphComposition.ts:59`](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/src/core/composition/compileGraphComposition.ts#L59)
- **Change**:
  Check if `layer.origin.configPath.endsWith(`.${name}`)` before appending `.${name}`:
  ```ts
  const base = layer.origin.configPath.endsWith(`.${name}`) ? layer.origin.configPath : `${layer.origin.configPath}.${name}`;
  result = { path: value, origin: { ...layer.origin, configPath: `${base}.override-compose` } };
  ```
- **Test File**: Add test case `[MSH18] mesh-authored override error path does not duplicate service name` to [`tests/v3/meshScopes.test.ts`](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/tests/v3/meshScopes.test.ts).

#### Fix 3: Attribute Missing Compose File Error to Declaring Configuration
- **File**: [`src/core/composition/loadCompose.ts:6-7`](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/src/core/composition/loadCompose.ts#L6-L7)
- **Change**:
  When `!existsSync(absolutePath) || !statSync(absolutePath).isFile()`, throw `ConfigError` preserving `context.sourceFile`:
  ```ts
  if (!existsSync(absolutePath) || !statSync(absolutePath).isFile()) {
    throw new ConfigError({ ...context, value: absolutePath, reason: "Compose file does not exist or is not a regular file" });
  }
  ```
- **Test File**: Add test case `[CMP29] missing compose file error identifies declaring build.json` to [`tests/v3/composeMatrix.test.ts`](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/tests/v3/composeMatrix.test.ts).

#### Fix 4: Validate Exec-Form Background Commands in Dockerfile Contract
- **File**: [`src/core/checkers/checkDockerfileContract.ts:36`](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/src/core/checkers/checkDockerfileContract.ts#L36)
- **Change**:
  Update regex to catch backgrounding in exec-form JSON arrays:
  ```ts
  if(activeStage==="dev"&&[effectiveEntrypoint,effectiveCmd].some(instruction=>instruction!==undefined&&/(?:nohup|&\s*(?:["']?\s*\]|\s*$)|\bdaemon\b|--daemon)/i.test(instruction)))fail("dev runtime must remain in foreground");
  ```
- **Test File**: Add test case `[LIF28] exec-form backgrounded dev command fails foreground contract` to [`tests/v3/lifecycleMatrix.test.ts`](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/tests/v3/lifecycleMatrix.test.ts).

#### Fix 5: Use Canonical Path in `checkYamlFiles.ts`
- **File**: [`src/core/checkers/checkYamlFiles.ts:13-14`](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/src/core/checkers/checkYamlFiles.ts#L13-L14)
- **Change**:
  Use `path.join(root, "build.json")` instead of `${root}/build.json`.
- **Test File**: Add test case `[CHK05] checkYamlFiles uses canonical path.join for sourceFile` to [`tests/v3/composeMatrix.test.ts`](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/tests/v3/composeMatrix.test.ts).

---

## 6. Verification Commands

Following implementation, execute the standard verification suite:

```bash
# 1. Typecheck the codebase
pnpm typecheck

# 2. Run all fast V3 tests
pnpm test:v3:fast

# 3. Run full unit and conformance suites
pnpm test

# 4. Run real Docker acceptance tests
pnpm test:docker
```
