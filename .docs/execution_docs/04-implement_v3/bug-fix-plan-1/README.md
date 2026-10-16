# Builder V3 Codebase Audit & Implementation Fix Plan

This document provides a comprehensive audit of the `@solid-stack/builder` V3 codebase against [spec_v3.0.0.md](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/.docs/specs_v3/spec_v3.0.0.md) and [EXECUTION_MODEL.md](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/.docs/EXECUTION_MODEL.md).

---

## 1. Executive Summary & Audit Verdict

The V3 architecture is implemented across the core compiler, configuration graph, Compose materialization pipeline, and workflow runners. The codebase successfully models:
- Two-tier orchestration (Standalone Service and Multi-Service Mesh).
- Three-stage build inheritance (`base` -> `prod` -> `e2e` and `dev`).
- Directed acyclic graph requisite resolution (`dependency`, `prerequisite`, `requirement`).
- Isolated (`INFRA_MODE=isolated`) vs. Integrated (`INFRA_MODE=integrated`) dependency topologies.
- Two-phase global testing (Phase 1: sequential standalone unit/E2E; Phase 2: global integrated mesh E2E).
- Dynamic local port allocation (`127.0.0.1`, `AUTO`, static conflict checking).
- Strict resource ownership namespacing (`dev.solidstack.builder.owned=true`).

However, the deep audit identified **7 concrete defects**:
1. **False Positive `HEALTHCHECK` Rejection on Substring "None"** in [checkDockerfileContract.ts](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/src/core/checkers/checkDockerfileContract.ts#L32).
2. **Dev Foreground Check Falsely Fails Due to Non-Dev Stages** in [checkDockerfileContract.ts](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/src/core/checkers/checkDockerfileContract.ts#L33).
3. **Mesh Publish Validation Attributes Source to Sourced `build.json` Instead of `mesh.json`** in [publication.ts](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/src/core/config/publication.ts#L22-L28).
4. **Compiler Internal Prefix `@mesh:` Leaks into User-Facing Error Messages** in [serviceGraph.ts](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/src/core/config/serviceGraph.ts#L14-L15) and [applyMeshExtends.ts](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/src/core/mesh/applyMeshExtends.ts#L19).
5. **Ordinary Service Top-Level `service` Mismatch with Primary Endpoint Bypasses Validation in Isolated Modes** in [resolveBuildStage.ts](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/src/core/config/resolveBuildStage.ts#L52-L62).
6. **Flaky Multi-Pipeline Test Timeouts in `meshWorkflowMatrix.test.ts`** in [meshWorkflowMatrix.test.ts](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/tests/v3/meshWorkflowMatrix.test.ts#L23-L30).
7. **Real Docker Standalone Graph Race Condition in `[DOC01]`** in [standalone.test.ts](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/tests/v3/docker/standalone.test.ts#L17).

---

## 2. Specification & Execution Model Traceability Matrix

| Area | Normative Reference | Implementation Files | Status | Notes |
|---|---|---|---|---|
| **Runtime Variables** | `EXECUTION_MODEL.md §1`, `spec_v3.0.0.md §4, §54` | [`builderEnvironment.ts`](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/src/core/config/builderEnvironment.ts), [`executionProfile.ts`](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/src/core/config/executionProfile.ts) | **Compliant** | `EXEC_MODE` (`dev`, `test`, `prod`) and `INFRA_MODE` (`isolated`, `integrated`) are strictly assigned to `main`. `tester` receives neither, matching Spec V3 §73 & §1050 (superseding legacy V2 text in `EXECUTION_MODEL.md §2-3`). |
| **Service Execution** | `EXECUTION_MODEL.md §2`, `spec_v3.0.0.md §61, §62` | [`runDev.ts`](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/src/core/runners/runDev.ts), [`runProd.ts`](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/src/core/runners/runProd.ts), [`runTest.ts`](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/src/core/runners/runTest.ts) | **Compliant** | Standalone profiles and CLI flags (`--full`, `--detach`, `--debug`) match lifecycle profiles. |
| **Mesh Lifecycle** | `EXECUTION_MODEL.md §3, §6`, `spec_v3.0.0.md §66-70` | [`runMeshDev.ts`](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/src/core/mesh/runners/runMeshDev.ts), [`runMeshTest.ts`](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/src/core/mesh/runners/runMeshTest.ts) | **Compliant** | Phase 1 runs sequential source service unit/E2E; Phase 2 runs global mesh E2E. Teardown occurs between all phases. |
| **Configuration Inheritance** | `EXECUTION_MODEL.md §4`, `spec_v3.0.0.md §9, §48` | [`stageMerge.ts`](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/src/core/config/stageMerge.ts), [`resolveBuildStage.ts`](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/src/core/config/resolveBuildStage.ts) | **Minor Gap** | Deep merge follows `base -> prod -> e2e`. However, dormant service validation in `resolveBuildStage.ts` missed Section 18 endpoint owner validation (Bug 5). |
| **Tester Precedence** | `EXECUTION_MODEL.md §5`, `spec_v3.0.0.md §58` | [`compileTester.ts`](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/src/core/composition/compileTester.ts) | **Compliant** | Low-to-high precedence (`.env.e2e-tester -> tester.env -> internal`). Never implicitly merges app `.env.e2e`. |
| **Dockerfile Contract** | `spec_v3.0.0.md §3, §87-90` | [`checkDockerfileContract.ts`](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/src/core/checkers/checkDockerfileContract.ts) | **Defective** | Contains false positives for valid HEALTHCHECK commands (Bug 1) and cross-stage leakage in foreground check (Bug 2). |
| **Requisite Graph** | `spec_v3.0.0.md §27-37` | [`serviceGraph.ts`](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/src/core/config/serviceGraph.ts) | **Minor Gap** | Requisites correctly classified (`dependency`, `prerequisite`, `requirement`). Internal `@mesh:` prefix leaks into error reporting (Bug 4). |
| **Publication & Ports** | `spec_v3.0.0.md §22-26, §73-77` | [`publication.ts`](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/src/core/config/publication.ts), [`hostPorts.ts`](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/src/core/config/hostPorts.ts) | **Defective** | Mesh publish errors point to source `build.json` instead of `mesh.json` (Bug 3). |

---

## 3. Detailed Bug Reports

### Bug 1: False Positive HEALTHCHECK Failure on Substring "None" in Dockerfile Contract

- **Location**: [`src/core/checkers/checkDockerfileContract.ts:32`](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/src/core/checkers/checkDockerfileContract.ts#L32)
- **The Bug**:
  ```ts
  if (activeStage !== "test" && (!health || /^NONE$/i.test(health.trim()) || /\bNONE\b/i.test(health))) {
    fail(`${activeStage} requires a valid healthcheck`);
  }
  ```
  The regular expression `/\bNONE\b/i.test(health)` rejects ANY valid healthcheck instruction whose command contains the word "none" (case-insensitive word boundary match).
- **Why It Is a Bug**:
  In standard Dockerfile grammar, healthcheck disabling is strictly written as `HEALTHCHECK NONE`. Healthcheck commands frequently contain Python assertions, curl query parameters, or shell options with the word "none" (e.g., `HEALTHCHECK CMD python -c "assert resp is not None"`, `HEALTHCHECK CMD curl http://localhost/status?filter=none`, or `HEALTHCHECK CMD ./check.sh --mode=none`). The policy rule in [`dockerfile.rego:29`](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/templates/policy/dockerfile/dockerfile.rego#L29) only rejects when the healthcheck value equals `"none"`. `/\bNONE\b/i` incorrectly fails completely valid, production-ready healthchecks.
- **How to Create a Test for the Bug (Failing Test)**:
  ```ts
  import { assertMainDockerfileContract } from "./src/core/checkers/checkDockerfileContract.js";
  import fs from "node:fs";
  import os from "node:os";
  import path from "node:path";

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "df-bug1-"));
  fs.writeFileSync(path.join(tmp, "Dockerfile"), `FROM alpine AS dev
  CMD ["echo", "dev"]
  HEALTHCHECK CMD python -c "assert resp is not None"
  FROM dev AS test
  CMD ["echo", "test"]
  FROM dev AS prod
  CMD ["echo", "prod"]
  `);

  // This currently THROWS: "prod requires a valid healthcheck"
  assertMainDockerfileContract(tmp, "prod");
  ```
  *Current result*: Fails with `ConfigError: prod requires a valid healthcheck`.
- **Expected Behavior**:
  `assertMainDockerfileContract` must accept healthchecks unless healthcheck is absent or explicitly disabled via `HEALTHCHECK NONE`.
- **How to Fix the Bug**:
  In [`src/core/checkers/checkDockerfileContract.ts`](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/src/core/checkers/checkDockerfileContract.ts#L32), check strictly for disabled healthcheck:
  ```ts
  if (activeStage !== "test" && (!health || /^\s*NONE\s*$/i.test(health.trim()))) {
    fail(`${activeStage} requires a valid healthcheck`);
  }
  ```

---

### Bug 2: Dev Foreground Check Fails Based on Non-Dev Stages

- **Location**: [`src/core/checkers/checkDockerfileContract.ts:33`](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/src/core/checkers/checkDockerfileContract.ts#L33)
- **The Bug**:
  ```ts
  if (activeStage === "dev" && lines.some(line => /^(CMD|ENTRYPOINT)\s+.*(?:nohup|&\s*$|--daemon)/i.test(line.trim()))) {
    fail("dev runtime must remain in foreground");
  }
  ```
  `lines.some(...)` scans the entire text of the Dockerfile, regardless of which stage the line belongs to.
- **Why It Is a Bug**:
  Section 3 of `spec_v3.0.0.md` requires that the *development* container runtime remain in the foreground. If a multi-stage Dockerfile defines an auxiliary background worker stage (e.g. `FROM dev AS worker \n CMD nohup ./worker.sh &`), or if a tool stage runs a daemon, `assertMainDockerfileContract(dir, "dev")` rejects the `dev` stage even though `dev` itself runs strictly in the foreground (e.g. `CMD ["npm", "run", "dev"]`).
- **How to Create a Test for the Bug (Failing Test)**:
  ```ts
  import { assertMainDockerfileContract } from "./src/core/checkers/checkDockerfileContract.js";
  import fs from "node:fs";
  import os from "node:os";
  import path from "node:path";

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "df-bug2-"));
  fs.writeFileSync(path.join(tmp, "Dockerfile"), `FROM alpine AS dev
  CMD ["npm", "run", "dev"]
  HEALTHCHECK CMD curl -f http://localhost:3000/health
  FROM dev AS test
  CMD ["npm", "test"]
  FROM dev AS worker
  CMD nohup ./background-job.sh &
  FROM dev AS prod
  CMD ["npm", "start"]
  `);

  // This currently THROWS: "dev runtime must remain in foreground"
  assertMainDockerfileContract(tmp, "dev");
  ```
  *Current result*: Fails with `ConfigError: dev runtime must remain in foreground`.
- **Expected Behavior**:
  Foreground validation must evaluate only the effective command / entrypoint resolved for the `dev` stage lineage.
- **How to Fix the Bug**:
  Track `effectiveCmd` and `effectiveEntrypoint` during the stage resolution loop, and validate only the effective execution instruction of the active `dev` stage:
  ```ts
  let cursor = stages.get(activeStage), runtime = false, health: string | undefined;
  let effectiveCmd: string | undefined, effectiveEntrypoint: string | undefined;
  while (cursor) {
    if (visited.has(cursor.name)) fail(`Dockerfile stage inheritance cycle at ${cursor.name}`);
    visited.add(cursor.name);
    runtime ||= Boolean(cursor.command || cursor.entrypoint);
    if (effectiveCmd === undefined && cursor.command !== undefined) effectiveCmd = cursor.command;
    if (effectiveEntrypoint === undefined && cursor.entrypoint !== undefined) effectiveEntrypoint = cursor.entrypoint;
    if (health === undefined && cursor.health !== undefined) health = cursor.health;
    cursor = stages.get(cursor.parent);
  }
  const effectiveExec = [effectiveEntrypoint, effectiveCmd].filter(Boolean).join(" ");
  if (activeStage === "dev" && /(?:nohup|&\s*$|--daemon)/i.test(effectiveExec)) {
    fail("dev runtime must remain in foreground");
  }
  ```

---

### Bug 3: Mesh Publish Error Reporting Attributes Fault to Sourced `build.json` Instead of `mesh.json`

- **Location**: [`src/core/config/publication.ts:22-28`](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/src/core/config/publication.ts#L22-L28)
- **The Bug**:
  ```ts
  const origin = graph.nodes.get(main)?.origin;
  if (!origin) continue;
  if (!match) throw new ConfigError({ sourceFile: origin.sourceFile, configPath: `services.${root}.publish`, stage, composition, referencedObject: selector, reason: "Invalid publish selector; expected <local>.endpoints.<endpoint>" });
  const id = nodeId(root, match[1]!);
  if (!closure.has(id)) throw new ConfigError({ sourceFile: origin.sourceFile, configPath: `services.${root}.publish`, stage, composition, referencedObject: selector, reason: "publish selector target is not in source main requisite closure" });
  ```
- **Why It Is a Bug**:
  In mesh publication resolution, `publish` is declared in `mesh.json` under `services.${root}.publish`. However, `origin` is fetched from `graph.nodes.get(main)?.origin`, which is the sourced `build.json` (e.g. `services/backend/build.json`). The thrown `ConfigError` reports `sourceFile: /path/to/services/backend/build.json` and `configPath: services.backend.publish`. Users examining `build.json` will find no `publish` field (in fact, `publish` is forbidden in `build.json`). The error message falsely blames the source service's configuration file for an invalid declaration in `mesh.json`.
- **How to Create a Test for the Bug (Failing Test)**:
  ```ts
  import { compileMeshComposition } from "./src/core/mesh/compileMeshComposition.js";
  import { ConfigError } from "./src/errors/ConfigError.js";

  // When mesh.json contains:
  // services.backend.publish: ["invalid_selector"]
  try {
    compileMeshComposition("prod", projectDir, { validationMode: true });
  } catch (e: any) {
    expect(e).toBeInstanceOf(ConfigError);
    // CURRENTLY FAILS: e.context.sourceFile is "/path/to/services/backend/build.json"
    expect(e.context.sourceFile).toBe(path.join(projectDir, "mesh.json"));
  }
  ```
  *Current result*: `e.context.sourceFile` points to `backend/build.json`.
- **Expected Behavior**:
  Mesh publication errors must report `sourceFile: mesh.sourceFile` and `configPath: services.${root}.publish`.
- **How to Fix the Bug**:
  Pass `meshSourceFile?: string` to `resolvePublicationIntent` from `compileGraphComposition`:
  ```ts
  // In publication.ts:
  export function resolvePublicationIntent(
    graph: EffectiveGraph,
    stage: string,
    composition: "service" | "mesh",
    publish?: Map<string, string[]>,
    meshSourceFile?: string
  ): PublicationIntent[] {
    ...
    const sourceFile = meshSourceFile ?? origin.sourceFile;
    if (!match) throw new ConfigError({ sourceFile, configPath: `services.${root}.publish`, stage, composition, referencedObject: selector, reason: "Invalid publish selector; expected <local>.endpoints.<endpoint>" });
    ...
  }
  ```

---

### Bug 4: Compiler Internal Implementation Artifact `@mesh:` Leaks into Error Reporting

- **Location**: [`src/core/mesh/applyMeshExtends.ts:19`](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/src/core/mesh/applyMeshExtends.ts#L19) and [`src/core/config/serviceGraph.ts:14-15`](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/src/core/config/serviceGraph.ts#L14-L15)
- **The Bug**:
  In `applyMeshExtends.ts`, mesh target requisite keys are transformed with an internal prefix:
  `canonicalPatch.requisites = Object.fromEntries(..., [target.startsWith("source.") ? target.slice(7) : `@mesh:${target}`, kind])`.
  When `buildDeclaredGraph` encounters a target validation failure:
  ```ts
  if (key === "tester" || key === "@mesh:tester") fail(origin, input.stage, "tester cannot be a requisite target", key);
  if (!input.nodes.has(target)) fail(origin, input.stage, "Unknown requisite target", key);
  ```
  `key` (`@mesh:tester` or `@mesh:<target>`) is passed directly as `referencedObject`.
- **Why It Is a Bug**:
  The user authored `tester` or `<target>` in `mesh.json.services.<root>.extends.main.requisites`. They never authored `@mesh:`. Leaking private compiler naming conventions into `referencedObject` and error strings violates transparent, actionable diagnostics and breaks client tooling expecting the exact authored key.
- **How to Create a Test for the Bug (Failing Test)**:
  ```ts
  import { compileMeshComposition } from "./src/core/mesh/compileMeshComposition.js";

  // Mesh configuration where backend extends main requisites with: { "tester": "dependency" }
  try {
    compileMeshComposition("prod", projectDir, { validationMode: true });
  } catch (e: any) {
    // CURRENTLY FAILS: e.context.referencedObject is "@mesh:tester"
    expect(e.context.referencedObject).toBe("tester");
  }
  ```
  *Current result*: `e.context.referencedObject` is `"@mesh:tester"`.
- **Expected Behavior**:
  `referencedObject` must equal the authored target identifier (`tester` or `<target>`), with the internal `@mesh:` prefix stripped.
- **How to Fix the Bug**:
  In [`src/core/config/serviceGraph.ts`](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/src/core/config/serviceGraph.ts#L14-L15):
  ```ts
  const displayKey = key.replace(/^@mesh:/, "");
  if (key === "tester" || key === "@mesh:tester") fail(origin, input.stage, "tester cannot be a requisite target", displayKey);
  if (!input.nodes.has(target)) fail(origin, input.stage, "Unknown requisite target", displayKey);
  ```

---

### Bug 5: Ordinary Service Top-Level `service` Mismatch with Primary Endpoint Bypasses Validation in Isolated Modes

- **Location**: [`src/core/config/resolveBuildStage.ts:52-62`](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/src/core/config/resolveBuildStage.ts#L52-L62)
- **The Bug**:
  Section 18 states:
  > *"If top-level `service` is also supplied when endpoints exist, it MUST identify the same Compose service as the primary endpoint."*
  This invariant was only verified inside `validateServiceCompose.ts:28`.
- **Why It Is a Bug**:
  1. `validateServiceCompose.ts` only executes for materialized services in the reachable graph. In `make dev` (isolated mode) or `make test` (unit mode), or for any declared service not reachable from `main`, an ordinary service with a conflicting top-level `service` passes validation without error, violating fail-fast static validation (Section 83).
  2. When `validateServiceCompose.ts` does run, it throws a `ConfigError` attributing the error to the Compose file (`context.composePath`) with `configPath: "service"`, instead of attributing it to `build.json` with `configPath: services.<service>.service`.
- **How to Create a Test for the Bug (Failing Test)**:
  ```ts
  import { compileServiceComposition } from "./src/core/composition/compileServiceComposition.js";

  // build.json has:
  // services.db: { compose: "db.yml", service: "mismatched-name", endpoints: { data: { service: "db", port: 5432, primary: true } } }
  // When compiling in dev (isolated mode):
  expect(() => compileServiceComposition("dev", projectDir, { validationMode: true }))
    .toThrow(/top-level service must equal primary endpoint owner/);
  ```
  *Current result*: In `dev` mode, `compileServiceComposition` succeeds without error because `db` is not reachable in isolated mode.
- **Expected Behavior**:
  `resolveBuildStage.ts` must perform this invariant check statically during stage resolution for all ordinary services, failing fast with `configPath: services.${name}.service`.
- **How to Fix the Bug**:
  In [`src/core/config/resolveBuildStage.ts`](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/src/core/config/resolveBuildStage.ts#L59):
  ```ts
  if (name !== "main" && Object.keys(endpoints).length === 0 && (typeof value.service !== "string" || !value.service.trim())) {
    fail(sourceFile, stage, `services.${name}.service`, "endpoint-less service requires service");
  }
  if (name !== "main" && Object.keys(endpoints).length > 0 && typeof value.service === "string") {
    const primary = Object.values(endpoints).find(endpoint => endpoint.primary);
    if (primary?.service && value.service !== primary.service) {
      fail(sourceFile, stage, `services.${name}.service`, "top-level service must equal primary endpoint owner", value.service);
    }
  }
  ```

---

### Bug 6: Test Suite Flakiness Due to Undersized Timeout in `tests/v3/meshWorkflowMatrix.test.ts`

- **Location**: [`tests/v3/meshWorkflowMatrix.test.ts:23, 25, 28, 30`](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/tests/v3/meshWorkflowMatrix.test.ts#L23-L30)
- **The Bug**:
  Multi-pipeline mesh workflow test cases `[MSH02]`, `[MSH05]`, `[MSH09]`, and `[MSH11]` create multi-service workspaces and execute complete simulated pipelines. They omitted explicit test timeouts.
- **Why It Is a Bug**:
  The default Vitest test timeout is 2000 ms. The test specification in `05_TEST_STRATEGY_AND_FIXTURES.md` explicitly specifies:
  > *"Default Vitest per-test timeout 2000 ms; allow explicit 5000 ms only for batched filesystem/public API tests."*
  Under CPU or I/O contention (such as parallel test runs), these heavy test cases exceed 2000 ms and intermittently fail with timeout errors.
- **How to Create a Test for the Bug (Failing Test)**:
  Run `vitest run tests/v3/meshWorkflowMatrix.test.ts` under CPU throttle: `[MSH05]` intermittently fails with `Error: Test timed out in 2000ms`.
- **Expected Behavior**:
  Batched multi-pipeline filesystem tests must have an explicit 5000 ms timeout as specified in the test plan.
- **How to Fix the Bug**:
  Add `, 5000` to tests `[MSH02]`, `[MSH05]`, `[MSH09]`, and `[MSH11]` in [`tests/v3/meshWorkflowMatrix.test.ts`](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/tests/v3/meshWorkflowMatrix.test.ts).

---

### Bug 7: Real Docker Standalone Graph Race Condition in `[DOC01]`

- **Location**: [`tests/v3/docker/standalone.test.ts:17, 23`](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/tests/v3/docker/standalone.test.ts#L17)
- **The Bug**:
  In `[DOC01]`, `mail.yml` defines:
  ```yaml
  healthcheck:
    test: ["CMD", "python", "-c", "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8025/health',timeout=1)"]
    interval: 1s
    timeout: 1s
    retries: 3
  ```
  with `READY_AFTER: started-main.json`.
- **Why It Is a Bug**:
  `mail` is declared as a `requirement` of `main`. Per Section 31, requirements start concurrently with their consumer. However, `main` also has prerequisites (`db` and `migration`). `main` cannot start until `db` becomes healthy and `migration` completes (which takes ~3–4 seconds). Meanwhile, `mail` starts at $t=0$ and checks health every 1 second. Because `started-main.json` does not exist until `main` starts, `mail` fails 3 checks in 3 seconds and is marked `unhealthy` by Docker before `main` ever starts. Docker Compose aborts with `dependency failed to start: container ... is unhealthy`.
- **How to Create a Test for the Bug (Failing Test)**:
  Run `pnpm vitest run tests/v3/docker/standalone.test.ts --config vitest.v3-docker.config.ts`.
  *Current result*: Fails with `dependency svc--mail--mail failed to start: container is unhealthy`.
- **Expected Behavior**:
  The concurrent requirement's healthcheck must specify an adequate retry window (`retries: 15` or `start_period: 10s`) and the test timeout must be `60000ms` to permit sequential prerequisites to complete.
- **How to Fix the Bug**:
  In [`tests/v3/docker/standalone.test.ts`](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/tests/v3/docker/standalone.test.ts#L17):
  ```ts
  // Update healthcheck in mail.yml:
  retries: 15
  start_period: 10s
  // Update test timeout to 60000ms:
  }, 60000);
  ```

---

## 4. Implementation Fix Plan & Decision Protocol

### Verification & Decision Protocol
For every proposed bug fix:
1. **Reproduce & Confirm Bug (Step 1)**: Run the proposed failing test against the current codebase.
   - If the test **fails** with the expected symptom: The bug is **confirmed real**. Proceed to Step 2.
   - If the test **does not fail**: The bug is **invalid / not real**. Do NOT modify production code.
2. **Apply Code Change (Step 2)**: Make the surgical code modification.
3. **Verify Resolution (Step 3)**: Re-run the test.
   - Verify that the test now **passes**.
   - Verify that the full fast test suite (`pnpm test:v3:fast`) still passes (no regression).

---

### Step-by-Step Fix Action Plan

#### Step 1: Fix Bug 1 & Bug 2 in `checkDockerfileContract.ts`
- **File to Modify**: [`src/core/checkers/checkDockerfileContract.ts`](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/src/core/checkers/checkDockerfileContract.ts)
- **Changes**:
  1. Replace `/\bNONE\b/i.test(health)` with `/^\s*NONE\s*$/i.test(health.trim())`.
  2. Resolve effective `dev` stage command/entrypoint inside the stage inheritance loop, rather than scanning all lines of the Dockerfile.
- **Test to Add**: Add unit tests in [`tests/v3/opsMatrix.test.ts`](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/tests/v3/opsMatrix.test.ts) covering:
  - Healthcheck containing "None" in command (e.g. Python assertion).
  - Multi-stage Dockerfile containing background commands in non-dev stages.

#### Step 2: Fix Bug 3 in `publication.ts` & `compileGraphComposition.ts`
- **Files to Modify**:
  1. [`src/core/config/publication.ts`](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/src/core/config/publication.ts)
  2. [`src/core/composition/compileGraphComposition.ts`](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/src/core/composition/compileGraphComposition.ts)
- **Changes**:
  1. In `compileGraphComposition.ts`, pass `input.mesh?.sourceFile` to `resolvePublicationIntent`.
  2. In `publication.ts`, accept `meshSourceFile?: string` and use it as `sourceFile` for mesh publication errors.
- **Test to Add**: Add test in [`tests/v3/publicationMatrix.test.ts`](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/tests/v3/publicationMatrix.test.ts) asserting `error.context.sourceFile` equals `mesh.json`.

#### Step 3: Fix Bug 4 in `serviceGraph.ts`
- **File to Modify**: [`src/core/config/serviceGraph.ts`](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/src/core/config/serviceGraph.ts)
- **Changes**:
  Strip `@mesh:` prefix from `referencedObject` and error messages: `key.replace(/^@mesh:/, "")`.
- **Test to Add**: Add test in [`tests/v3/meshReferencesMatrix.test.ts`](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/tests/v3/meshReferencesMatrix.test.ts) checking that extends requisite errors do not contain `@mesh:`.

#### Step 4: Fix Bug 5 in `resolveBuildStage.ts`
- **File to Modify**: [`src/core/config/resolveBuildStage.ts`](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/src/core/config/resolveBuildStage.ts)
- **Changes**:
  Add validation that when an ordinary service defines both non-empty `endpoints` and `service`, `value.service` must equal `primary.service`.
- **Test to Add**: Add test in [`tests/v3/stageMatrix.test.ts`](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/tests/v3/stageMatrix.test.ts) ensuring dormant services with mismatched top-level `service` fail in `dev` (isolated) mode.

#### Step 5: Fix Bug 6 in `meshWorkflowMatrix.test.ts`
- **File to Modify**: [`tests/v3/meshWorkflowMatrix.test.ts`](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/tests/v3/meshWorkflowMatrix.test.ts)
- **Changes**:
  Add explicit `5000` ms timeout to `[MSH02]`, `[MSH05]`, `[MSH09]`, and `[MSH11]`.

#### Step 6: Fix Bug 7 in `standalone.test.ts`
- **File to Modify**: [`tests/v3/docker/standalone.test.ts`](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/tests/v3/docker/standalone.test.ts)
- **Changes**:
  Add `retries: 15` and `start_period: 10s` to `mail.yml` healthcheck, and update test timeout to `60000ms`.

---

## 5. Summary of Audit Verification Commands

```bash
# 1. Type check
pnpm typecheck

# 2. Fast conformance test suite & invariant mapping
pnpm test:v3:fast

# 3. Docker acceptance test suite
pnpm test:docker
```
