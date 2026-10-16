# Builder V3 Codebase Audit & Implementation Fix Plan (Generation 3)

This document provides a third-generation (Gen 3) deep audit of the `@solid-stack/builder` V3 codebase against [spec_v3.0.0.md](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/.docs/specs_v3/spec_v3.0.0.md) and [EXECUTION_MODEL.md](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/.docs/EXECUTION_MODEL.md).

---

## 1. Executive Summary & Audit Verdict

Following the upstream integration of Generation 1 fixes (`feat: implemented bug fix 1`, commit `4cff865`) and Generation 2 fixes (`feat: bug fix 2`, commit `ba3abcc`), the codebase passes:
- `pnpm typecheck` (0 errors)
- `pnpm test:v3:fast` (373/373 tests across 28 files passed in 8.68s)
- `pnpm test:docker` (`DOC01`, `DOC02`, `DOC03` passed in 49.50s)

A thorough verification of all 13 prior bugs confirmed they have been successfully resolved and covered by regression tests.

However, an exhaustive third-generation audit analyzing healthcheck negation semantics, stage-added mesh source services, build additional context constraints, and overlay diagnostic paths revealed **5 new concrete defects**:

1. **Compose Healthcheck Validator Accepts `test: "NONE"` / `"none"` as a Valid Enabled Healthcheck** in [`src/core/composition/composeHealthcheck.ts:7`](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/src/core/composition/composeHealthcheck.ts#L7).
2. **`checkMeshServices` Skips Dockerfile Contract Policy on Stage-Added Mesh Source Services** in [`src/core/mesh/checkers/checkMeshServices.ts:10-14`](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/src/core/mesh/checkers/checkMeshServices.ts#L10-L14).
3. **Mesh Publication Validation Misattributes Overlay Selector Errors to Base `services.<root>.publish`** in [`src/core/config/publication.ts:24-27`](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/src/core/config/publication.ts#L24-L27) and [`src/core/config/resolveMeshStage.ts:33`](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/src/core/config/resolveMeshStage.ts#L33).
4. **Unused Validator `assertNoServiceBuildContexts` Leaves `service:` Additional Build Contexts Unchecked** in [`src/core/composition/composeBuildResources.ts:31`](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/src/core/composition/composeBuildResources.ts#L31) and [`src/core/composition/validateMaterializedComposeBuildInputs.ts:15`](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/src/core/composition/validateMaterializedComposeBuildInputs.ts#L15).
5. **`loadMeshSources` Hardcodes `services.<root>.source` Diagnostic Path for Stage-Added Source Services** in [`src/core/mesh/loadMeshSources.ts:10`](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/src/core/mesh/loadMeshSources.ts#L10).

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

---

## 3. Specification & Execution Model Traceability Matrix

| Area | Normative Reference | Implementation Files | Status | Notes |
|---|---|---|---|---|
| **Healthcheck Validation** | `spec_v3.0.0.md §69` | [`composeHealthcheck.ts`](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/src/core/composition/composeHealthcheck.ts), [`validateServiceCompose.ts`](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/src/core/composition/validateServiceCompose.ts) | **Defective** | `isEnabledValidComposeHealthcheck` returns `true` for `test: "NONE"` / `"none"`, allowing disabled healthchecks to pass validation (Bug 3.1). |
| **Mesh Preflight & Policies** | `spec_v3.0.0.md §39, §87-90` | [`checkMeshServices.ts`](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/src/core/mesh/checkers/checkMeshServices.ts), [`checkDockerfileContract.ts`](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/src/core/checkers/checkDockerfileContract.ts) | **Defective** | `checkMeshServices` only validates base `mesh.services`; stage-added source services (`dev`, `prod`, `e2e`) bypass Dockerfile contract policy checking (Bug 3.2). |
| **Mesh Publication Diagnostics** | `spec_v3.0.0.md §48, §49` | [`publication.ts`](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/src/core/config/publication.ts), [`resolveMeshStage.ts`](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/src/core/config/resolveMeshStage.ts) | **Defective** | Publication validation hardcodes `configPath: "services.<root>.publish"` even when the invalid selector is introduced in an overlay stage like `dev.services.<root>.publish` (Bug 3.3). |
| **Compose Build Contexts** | `spec_v3.0.0.md §27, §67` | [`composeBuildResources.ts`](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/src/core/composition/composeBuildResources.ts), [`validateMaterializedComposeBuildInputs.ts`](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/src/core/composition/validateMaterializedComposeBuildInputs.ts) | **Defective** | `assertNoServiceBuildContexts` is defined but never invoked, allowing `additional_contexts: ["service:..."]` to bypass validation (Bug 3.4). |
| **Mesh Source Stage Diagnostics** | `spec_v3.0.0.md §36, §39` | [`loadMeshSources.ts`](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/src/core/mesh/loadMeshSources.ts) | **Defective** | Path escape errors for stage-added mesh sources report `services.<root>.source` instead of `${layer}.services.<root>.source` (Bug 3.5). |
| **Runtime Variables** | `EXECUTION_MODEL.md §1`, `spec_v3.0.0.md §4, §54, §55` | [`builderEnvironment.ts`](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/src/core/config/builderEnvironment.ts) | **Compliant** | `EXEC_MODE` and `INFRA_MODE` are strictly assigned to `main`; tester receives neither; `.env` validation catches `=` and `:` keys. |
| **Environment Precedence** | `spec_v3.0.0.md §56-64`, `EXECUTION_MODEL.md §5` | [`compileGraphComposition.ts`](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/src/core/composition/compileGraphComposition.ts) | **Compliant** | Precedence matches `sourceEnv -> override -> meshEnv -> Builder-owned`. Tester precedence chain `.env.e2e-tester -> tester.env -> internal` is preserved. |
| **Requisite Graph** | `spec_v3.0.0.md §7-15` | [`serviceGraph.ts`](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/src/core/config/serviceGraph.ts) | **Compliant** | Requisite lowering (`requirement`, `dependency`, `prerequisite`) and cycle detection fully match specification. |
| **Two-Phase Global Testing** | `EXECUTION_MODEL.md §6`, `spec_v3.0.0.md §78` | [`runMeshTest.ts`](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/src/core/mesh/runners/runMeshTest.ts) | **Compliant** | Phase 1 runs sequential source unit/E2E; Phase 2 runs global mesh E2E; teardown between phases is verified in Docker integration tests. |

---

## 4. Detailed Bug Reports

---

### Bug 3.1: Compose Healthcheck Validator Accepts `test: "NONE"` / `"none"` as a Valid Enabled Healthcheck

- **Location**: [`src/core/composition/composeHealthcheck.ts:7`](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/src/core/composition/composeHealthcheck.ts#L7)
- **The Bug**:
  ```ts
  export function isEnabledValidComposeHealthcheck(value: unknown): boolean {
    if (!value || typeof value !== "object" || Array.isArray(value)) return false;
    const health = value as Record<string, unknown>;
    if (health.disable === true) return false;
    const test = health.test;
    if (typeof test === "string") return test.trim().length > 0;
    if (!Array.isArray(test) || !test.every(item => typeof item === "string")) return false;
    if (test[0] !== "CMD" && test[0] !== "CMD-SHELL") return false;
    return test.length >= 2 && test.slice(1).some(item => item.trim().length > 0);
  }
  ```
  Line 7 unconditionally returns `true` for any non-empty string in `test`, including `"NONE"` and `"none"`.
- **Why It Is a Bug**:
  In Docker Compose YAML grammar, disabling an inherited healthcheck is supported via:
  ```yaml
  healthcheck:
    test: NONE
  ```
  or
  ```yaml
  healthcheck:
    test: ["NONE"]
  ```
  or
  ```yaml
  healthcheck:
    disable: true
  ```
  While `isEnabledValidComposeHealthcheck` correctly identifies `disable: true` and `test: ["NONE"]` as disabled, it treats `test: "NONE"` or `test: "none"` as a valid, enabled healthcheck.
  When an ordinary service (acting as a dependency for `main` or another service) specifies `test: NONE`:
  1. [`validateServiceCompose.ts:35`](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/src/core/composition/validateServiceCompose.ts#L35) checks `isEnabledValidComposeHealthcheck(health)`.
  2. Because `test: "NONE"` returns `true`, validation passes.
  3. At runtime, Docker Compose disables the container's healthcheck. The container never reports `healthy`.
  4. Any consumer waiting for `condition: service_healthy` hangs indefinitely until reaching the 120-second startup deadline.
  This directly violates [spec_v3.0.0.md §69](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/.docs/specs_v3/spec_v3.0.0.md#L69):
  *"A service with required health MUST define an enabled, valid healthcheck command. Disabled healthchecks (such as `test: ["NONE"]`, `test: NONE`, `disable: true`, or `HEALTHCHECK NONE`) MUST NOT satisfy the requirement."*
- **How to Create a Test for the Bug (Failing Test)**:
  ```ts
  import { describe, it, expect } from "vitest";
  import { isEnabledValidComposeHealthcheck } from "./src/core/composition/composeHealthcheck.js";

  it("isEnabledValidComposeHealthcheck rejects string-form test: NONE and test: none", () => {
    expect(isEnabledValidComposeHealthcheck({ test: "NONE" })).toBe(false);
    expect(isEnabledValidComposeHealthcheck({ test: "none" })).toBe(false);
    expect(isEnabledValidComposeHealthcheck({ test: "  NONE  " })).toBe(false);
    expect(isEnabledValidComposeHealthcheck({ test: "curl -f http://localhost/" })).toBe(true);
  });
  ```
  **Current Result on Codebase:**
  ```text
  AssertionError: expected true to be false
  - Expected: false
  + Received: true
  ```
- **Expected Behavior**:
  `isEnabledValidComposeHealthcheck` must return `false` when `test` is `"NONE"` or `"none"` (case-insensitive, trimmed).
- **How to Fix the Bug**:
  In [`src/core/composition/composeHealthcheck.ts:7`](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/src/core/composition/composeHealthcheck.ts#L7), update the string validation:
  ```ts
  if (typeof test === "string") return test.trim().length > 0 && !/^NONE$/i.test(test.trim());
  ```

---

### Bug 3.2: `checkMeshServices` Skips Dockerfile Contract Policy on Stage-Added Mesh Source Services

- **Location**: [`src/core/mesh/checkers/checkMeshServices.ts:10-14`](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/src/core/mesh/checkers/checkMeshServices.ts#L10-L14)
- **The Bug**:
  ```ts
  export function checkMeshServices(mesh:MeshConfig,meshDir:string,policy:typeof checkDockerfileContract=checkDockerfileContract):void {
    const root=resolveProjectDir(meshDir),checked=new Set<string>();
    for(const [name,entry] of Object.entries(mesh.services)){
      if(name==="tester")continue;
      const dir=resolveInsideProject(root,(entry as MeshSourceService).source,{sourceFile:path.join(root,"mesh.json"),configPath:`services.${name}.source`});
      if(!checked.has(dir)){policy(getBuildJson(dir),dir);checked.add(dir);}
    }
    for(const stage of MESH_CONFIG_STAGES)compileMeshComposition(stage,root,{validationMode:true});
  }
  ```
  The loop checking the Dockerfile contract policy iterates exclusively over `mesh.services` (base services).
- **Why It Is a Bug**:
  Under [spec_v3.0.0.md §39](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/.docs/specs_v3/spec_v3.0.0.md#L39) (*"Mesh Stage-Added Services"*), a mesh stage overlay (such as `dev`, `prod`, or `e2e`) may declare a new source service that is not present in base `mesh.services` (e.g. `dev.services.inspector = { source: "./services/inspector" }`).
  When running `builder mesh check` or `checkMesh()`, `checkMeshServices` invokes `policy(getBuildJson(dir), dir)` only for base services. Stage-added services declared in `mesh.dev.services`, `mesh.prod.services`, or `mesh.e2e.services` are completely skipped and never validated against the OPA Dockerfile contract policy.
- **How to Create a Test for the Bug (Failing Test)**:
  ```ts
  import { describe, it, expect, vi } from "vitest";
  import { checkMeshServices } from "./src/core/mesh/checkers/checkMeshServices.js";
  import { basicBuild, writeBasic } from "./tests/v3/support/fixtures.js";
  import fs from "node:fs";
  import path from "node:path";

  it("checkMeshServices validates Dockerfile contract for stage-added source services", () => {
    const dir = fs.mkdtempSync("/tmp/mesh-stage-check-");
    const feDir = path.join(dir, "fe");
    const extraDir = path.join(dir, "extra");
    fs.mkdirSync(feDir, { recursive: true });
    fs.mkdirSync(extraDir, { recursive: true });

    const feBuild = basicBuild();
    fs.writeFileSync(path.join(feDir, "build.json"), JSON.stringify(feBuild));
    fs.writeFileSync(path.join(feDir, "Dockerfile"), "FROM alpine:3 AS dev\nCMD true\nHEALTHCHECK CMD true\nFROM dev AS prod\nFROM dev AS test\n");
    fs.writeFileSync(path.join(feDir, "e2e/compose.yml"), "services: { runner: { image: alpine:3 } }\n");

    const extraBuild = basicBuild();
    fs.writeFileSync(path.join(extraDir, "build.json"), JSON.stringify(extraBuild));
    fs.writeFileSync(path.join(extraDir, "Dockerfile"), "FROM alpine:3 AS dev\nCMD true\nHEALTHCHECK CMD true\nFROM dev AS prod\nFROM dev AS test\n");
    fs.writeFileSync(path.join(extraDir, "e2e/compose.yml"), "services: { runner: { image: alpine:3 } }\n");

    const mesh = {
      name: "my-mesh",
      services: {
        fe: { source: "./fe" },
        tester: { compose: "./fe/e2e/compose.yml", service: "runner" }
      },
      dev: {
        services: {
          extra: { source: "./extra" }
        }
      }
    };
    fs.writeFileSync(path.join(dir, "mesh.json"), JSON.stringify(mesh));

    const policy = vi.fn();
    try {
      checkMeshServices(mesh as any, dir, policy);
      const checkedPaths = policy.mock.calls.map(call => path.resolve(call[1]));
      expect(checkedPaths).toContain(path.resolve(extraDir));
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
  ```
  **Current Result on Codebase:** Fails because `policy` is called only once (for `feDir`), and `extraDir` is absent from `checkedPaths`.
- **Expected Behavior**:
  `checkMeshServices` must execute `policy` for all unique source services declared in `mesh.services` and across all stage overlays (`dev`, `prod`, `e2e`).
- **How to Fix the Bug**:
  In [`src/core/mesh/checkers/checkMeshServices.ts:10-14`](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/src/core/mesh/checkers/checkMeshServices.ts#L10-L14), iterate through all service declarations across all stages:
  ```ts
  const layers = [mesh.services, mesh.dev?.services, mesh.prod?.services, mesh.e2e?.services];
  for (const layer of layers) {
    if (!layer) continue;
    for (const [name, entry] of Object.entries(layer)) {
      if (name === "tester") continue;
      const source = (entry as { source?: string }).source;
      if (!source) continue;
      const dir = resolveInsideProject(root, source, { sourceFile: path.join(root, "mesh.json"), configPath: `services.${name}.source` });
      if (!checked.has(dir)) { policy(getBuildJson(dir), dir); checked.add(dir); }
    }
  }
  ```

---

### Bug 3.3: Mesh Publication Validation Misattributes Overlay Selector Errors to Base `services.<root>.publish`

- **Location**: [`src/core/config/publication.ts:24-27`](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/src/core/config/publication.ts#L24-L27) and [`src/core/config/resolveMeshStage.ts:33`](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/src/core/config/resolveMeshStage.ts#L33)
- **The Bug**:
  ```ts
  const origin:Origin=meshSourceFile?{...mainOrigin,sourceFile:meshSourceFile,configPath:`services.${root}.publish`,scope:"mesh"}:mainOrigin;
  if (!match) throw new ConfigError({sourceFile:origin.sourceFile,configPath:`services.${root}.publish`,stage,composition,referencedObject:selector,reason:"Invalid publish selector; expected <local>.endpoints.<endpoint>"});
  const id=nodeId(root,match[1]!);
  if (!closure.has(id)) throw new ConfigError({sourceFile:origin.sourceFile,configPath:`services.${root}.publish`,stage,composition,referencedObject:selector,reason:"publish selector target is not in source main requisite closure"});
  ```
- **Why It Is a Bug**:
  In a mesh, endpoint publication can be declared either in base `services.<root>.publish` or in a stage overlay: `dev.services.<root>.publish` or `prod.services.<root>.publish`.
  When a stage overlay declares an invalid publish selector (e.g. `dev.services.api.publish = ["bad.selector"]`), `publication.ts` hardcodes `configPath: "services.<root>.publish"`.
  The error reported to the user claims:
  `configPath: "services.api.publish"`.
  However, in `mesh.json`, `services.api` has no `publish` property (or defines a valid base publish list). The user is directed to a non-existent configuration path in base rather than the stage overlay where the error originated.
- **How to Create a Test for the Bug (Failing Test)**:
  ```ts
  import { describe, it, expect } from "vitest";
  import { compileMeshComposition } from "./src/core/mesh/compileMeshComposition.js";
  import { ConfigError } from "./src/errors/ConfigError.js";
  import fs from "node:fs";
  import path from "node:path";

  it("publication error in stage overlay reports stage-qualified configPath", () => {
    const dir = fs.mkdtempSync("/tmp/publish-stage-test-");
    const feDir = path.join(dir, "fe");
    fs.mkdirSync(feDir, { recursive: true });
    fs.writeFileSync(path.join(feDir, "build.json"), JSON.stringify({
      name: "fe",
      services: {
        main: { endpoints: { http: { port: 3000, primary: true } } },
        tester: { compose: "test.yml", service: "tester" }
      }
    }));
    fs.writeFileSync(path.join(feDir, "Dockerfile"), "FROM alpine:3 AS dev\nCMD true\nHEALTHCHECK CMD true\nFROM dev AS prod\nFROM dev AS test\n");
    fs.writeFileSync(path.join(feDir, "test.yml"), "services: { tester: { image: alpine:3 } }\n");

    const mesh = {
      name: "my-mesh",
      services: {
        fe: { source: "./fe" },
        tester: { compose: "./fe/test.yml", service: "tester" }
      },
      dev: {
        services: {
          fe: { publish: ["invalid-selector"] }
        }
      }
    };
    fs.writeFileSync(path.join(dir, "mesh.json"), JSON.stringify(mesh));

    try {
      compileMeshComposition("dev", dir, { validationMode: true });
      expect.unreachable("Expected invalid selector to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(ConfigError);
      expect((error as ConfigError).context.configPath).toBe("dev.services.fe.publish");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
  ```
  **Current Result on Codebase:**
  ```text
  AssertionError: expected 'services.fe.publish' to be 'dev.services.fe.publish'
  - Expected: "dev.services.fe.publish"
  + Received: "services.fe.publish"
  ```
- **Expected Behavior**:
  The `configPath` on `ConfigError` must point to `dev.services.<root>.publish` (or whichever stage declared the publish selector).
- **How to Fix the Bug**:
  1. In [`src/core/config/types.ts`](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/src/core/config/types.ts), add `publishOrigin?: Origin` to `EffectiveMeshSource`.
  2. In [`src/core/config/resolveMeshStage.ts`](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/src/core/config/resolveMeshStage.ts#L18), initialize `publishOrigin: originFor(sourceFile, \`services.${name}.publish\`, "base")`. When `next.publish !== undefined` at line 33, set `entry.publishOrigin = originFor(sourceFile, \`${layer}.services.${name}.publish\`, layer)`.
  3. In [`src/core/config/publication.ts:24-27`](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/src/core/config/publication.ts#L24-L27), use the resolved `publishOrigin.configPath`.

---

### Bug 3.4: Unused Validator `assertNoServiceBuildContexts` Leaves `service:` Additional Build Contexts Unchecked

- **Location**: [`src/core/composition/composeBuildResources.ts:31`](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/src/core/composition/composeBuildResources.ts#L31) and [`src/core/composition/validateMaterializedComposeBuildInputs.ts:15`](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/src/core/composition/validateMaterializedComposeBuildInputs.ts#L15)
- **The Bug**:
  The function `assertNoServiceBuildContexts` is fully implemented in `composeBuildResources.ts`:
  ```ts
  export function assertNoServiceBuildContexts(service: ComposeService, configPath: string, sourceFile: string): void {
    const contexts = buildObject(service)?.additional_contexts;
    const values = Array.isArray(contexts)
      ? contexts.map(entry => typeof entry === "string" ? entry.slice(entry.indexOf("=") + 1) : entry)
      : contexts && typeof contexts === "object" ? Object.values(contexts) : [];
    if (values.some(value => typeof value === "string" && value.startsWith("service:"))) {
      throw new ConfigError({
        sourceFile,
        configPath: `${configPath}.build.additional_contexts`,
        reason: "Compose service-reference additional_contexts are unsupported",
      });
    }
  }
  ```
  However, it is **never called anywhere** in the compiler or composition validation pipeline.
- **Why It Is a Bug**:
  Docker Compose supports `build.additional_contexts: ["pkg=service:builder-service"]` to copy artifacts from another service container during image build.
  This creates implicit inter-container build ordering dependencies that are invisible to Builder's DAG and lifecycle graph (`dependency`, `prerequisite`, `requirement`).
  Builder intentionally disallows this feature to preserve explicit DAG execution semantics.
  Because `assertNoServiceBuildContexts` was never wired into `validateMaterializedComposeBuildInputs`, Compose files containing `service:` additional contexts bypass validation.
- **How to Create a Test for the Bug (Failing Test)**:
  ```ts
  import { describe, it, expect } from "vitest";
  import { compileServiceComposition } from "./src/core/composition/compileServiceComposition.js";
  import { basicBuild, writeBasic } from "./tests/v3/support/fixtures.js";
  import { ConfigError } from "./src/errors/ConfigError.js";
  import fs from "node:fs";
  import path from "node:path";

  it("compileServiceComposition rejects service: additional_contexts in build", () => {
    const b = basicBuild();
    b.services.db = { compose: "db.yml", service: "db" };
    const root = writeBasic(b);
    fs.writeFileSync(path.join(root, "db.yml"), `
  services:
    db:
      build:
        context: .
        additional_contexts:
          - other=service:other
      image: custom-db
  `);
    try {
      expect(() => compileServiceComposition("dev", root, { validationMode: true }))
        .toThrow(/Compose service-reference additional_contexts are unsupported/);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
  ```
  **Current Result on Codebase:** The test fails because `compileServiceComposition` succeeds without throwing.
- **Expected Behavior**:
  `compileServiceComposition` must throw `ConfigError` ("Compose service-reference additional_contexts are unsupported") when a materialized build contains `service:` additional contexts.
- **How to Fix the Bug**:
  In [`src/core/composition/validateMaterializedComposeBuildInputs.ts`](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/src/core/composition/validateMaterializedComposeBuildInputs.ts#L17), import `assertNoServiceBuildContexts` and invoke it:
  ```ts
  import { assertNoServiceBuildContexts } from "./composeBuildResources.js";
  ...
  assertNoServiceBuildContexts(service, `services.${name}`, sourceFile);
  ```

---

### Bug 3.5: `loadMeshSources` Hardcodes `services.<root>.source` Diagnostic Path for Stage-Added Source Services

- **Location**: [`src/core/mesh/loadMeshSources.ts:10`](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/src/core/mesh/loadMeshSources.ts#L10)
- **The Bug**:
  ```ts
  export function loadMeshSources(mesh: EffectiveMeshConfig, stage: MeshConfigStage): Map<string, EffectiveBuildConfig> {
    const result = new Map<string,EffectiveBuildConfig>();
    for (const [root, entry] of Object.entries(mesh.services).sort(([a],[b]) => a.localeCompare(b))) {
      const projectDir = resolveInsideProject(mesh.projectDir, entry.source, {
        sourceFile: mesh.sourceFile,
        configPath: `services.${root}.source`,
        stage
      });
  ```
  The diagnostic `configPath` passed to `resolveInsideProject` is hardcoded as `services.${root}.source`.
- **Why It Is a Bug**:
  For a stage-added mesh source service (e.g. `dev.services.inspector = { source: "../../../escape" }`), `entry.origin.configPath` is `dev.services.inspector`.
  If `entry.source` escapes the project root or contains an invalid path, `resolveInsideProject` throws `ConfigError` with `configPath: "services.inspector.source"`.
  The error claims `services.inspector.source` in `mesh.json` is invalid. In reality, `services.inspector` does not exist in base `mesh.services`.
- **How to Create a Test for the Bug (Failing Test)**:
  ```ts
  import { describe, it, expect } from "vitest";
  import { loadMeshSources } from "./src/core/mesh/loadMeshSources.js";
  import { resolveMeshStage } from "./src/core/config/resolveMeshStage.js";
  import { ConfigError } from "./src/errors/ConfigError.js";

  it("loadMeshSources reports stage-qualified configPath for stage-added source path escape", () => {
    const rawMesh: any = {
      name: "my-mesh",
      services: { tester: { compose: "e2e.yml", service: "runner" } },
      dev: {
        services: { inspector: { source: "../../../outside" } }
      }
    };
    const effective = resolveMeshStage(rawMesh, "dev", "/project/mesh.json");
    try {
      loadMeshSources(effective, "dev");
      expect.unreachable("Expected path escape to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(ConfigError);
      expect((error as ConfigError).context.configPath).toBe("dev.services.inspector.source");
    }
  });
  ```
  **Current Result on Codebase:**
  ```text
  AssertionError: expected 'services.inspector.source' to be 'dev.services.inspector.source'
  - Expected: "dev.services.inspector.source"
  + Received: "services.inspector.source"
  ```
- **Expected Behavior**:
  `loadMeshSources` must pass `${entry.origin.configPath}.source` to `resolveInsideProject`.
- **How to Fix the Bug**:
  In [`src/core/mesh/loadMeshSources.ts:10`](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/src/core/mesh/loadMeshSources.ts#L10), change:
  ```ts
  configPath: `services.${root}.source`,
  ```
  to:
  ```ts
  configPath: `${entry.origin.configPath}.source`,
  ```

---

## 5. Implementation Fix Plan

### 5.1 Decision Protocol: Test-Driven Gating

Before applying any source code change, the following verification protocol MUST be executed:
1. **Author the Test**: Add the exact reproduction test to the relevant test file in `tests/v3/`.
2. **Execute Test on Current Code**: Run `pnpm exec vitest run <test-file>`.
3. **Decision Rule**:
   - **Proceed**: If the test **FAILS** with the exact error described in the bug report, the bug is real and confirmed. Apply the minimal source fix.
   - **Abort**: If the test **PASSES**, the bug is not real or was already resolved. Do NOT modify the source code.
4. **Post-Fix Verification**: Re-run the test to confirm it now passes cleanly.
5. **Full Regression Check**: Run `pnpm test:v3:fast` to ensure 0 regressions.

---

### 5.2 Step-by-Step Code Modifications

#### Fix 1: Reject String-Form `test: NONE` in Compose Healthcheck Validator
- **File**: [`src/core/composition/composeHealthcheck.ts`](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/src/core/composition/composeHealthcheck.ts#L7)
- **Change**: Replace line 7 with `if (typeof test === "string") return test.trim().length > 0 && !/^NONE$/i.test(test.trim());`.
- **Test File**: Add test case `[LIF25] isEnabledValidComposeHealthcheck rejects string-form test: NONE and none` to [`tests/v3/lifecycleMatrix.test.ts`](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/tests/v3/lifecycleMatrix.test.ts).

#### Fix 2: Check Dockerfile Contract for Stage-Added Mesh Source Services
- **File**: [`src/core/mesh/checkers/checkMeshServices.ts`](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/src/core/mesh/checkers/checkMeshServices.ts#L10-L14)
- **Change**: Iterate over `[mesh.services, mesh.dev?.services, mesh.prod?.services, mesh.e2e?.services]` to collect all unique source directories before calling `policy`.
- **Test File**: Add test case `[MSH14] checkMeshServices validates Dockerfile contract for stage-added source services` to [`tests/v3/meshWorkflowMatrix.test.ts`](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/tests/v3/meshWorkflowMatrix.test.ts).

#### Fix 3: Accurately Attribute Mesh Publication Origin in Stage Overlays
- **Files**:
  - [`src/core/config/types.ts`](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/src/core/config/types.ts#L18): Add `publishOrigin?: Origin` to `EffectiveMeshSource`.
  - [`src/core/config/resolveMeshStage.ts`](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/src/core/config/resolveMeshStage.ts#L18,L33): Track `publishOrigin` for base and overlays.
  - [`src/core/config/publication.ts`](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/src/core/config/publication.ts#L24-L27): Use `entry.publishOrigin.configPath`.
- **Test File**: Add test case `[PUB17] publication errors in stage overlays report stage-qualified configPath` to [`tests/v3/publicationMatrix.test.ts`](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/tests/v3/publicationMatrix.test.ts).

#### Fix 4: Invoke `assertNoServiceBuildContexts` in Build Input Validation
- **File**: [`src/core/composition/validateMaterializedComposeBuildInputs.ts`](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/src/core/composition/validateMaterializedComposeBuildInputs.ts#L17)
- **Change**: Import `assertNoServiceBuildContexts` and call it for every service with a `build` object.
- **Test File**: Add test case `[CMP26] materialized Compose build rejects service: additional_contexts` to [`tests/v3/composeMatrix.test.ts`](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/tests/v3/composeMatrix.test.ts).

#### Fix 5: Attribute Stage-Added Mesh Source Path Diagnostics Correctly
- **File**: [`src/core/mesh/loadMeshSources.ts`](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/src/core/mesh/loadMeshSources.ts#L10)
- **Change**: Replace `services.${root}.source` with `${entry.origin.configPath}.source`.
- **Test File**: Add test case `[MSH15] loadMeshSources attributes stage-added source path errors to stage configPath` to [`tests/v3/meshWorkflowMatrix.test.ts`](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/tests/v3/meshWorkflowMatrix.test.ts).

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
