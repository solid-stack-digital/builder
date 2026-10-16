# Builder V3 Codebase Audit & Implementation Fix Plan (Generation 4)

This document provides a fourth-generation (Gen 4) deep audit of the `@solid-stack/builder` V3 codebase against [spec_v3.0.0.md](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/.docs/specs_v3/spec_v3.0.0.md) and [EXECUTION_MODEL.md](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/.docs/EXECUTION_MODEL.md).

---

## 1. Executive Summary & Audit Verdict

Following the upstream integration of Generation 1 (`feat: implemented bug fix 1`, commit `4cff865`), Generation 2 (`feat: bug fix 2`, commit `ba3abcc`), and Generation 3 (`feat: bug fix 3`, commit `2a0ab63`), the codebase passes:
- `pnpm typecheck` (0 errors)
- `pnpm test:v3:fast` (378/378 tests across 28 files passed in 8.51s, 61 final invariants mapped)
- `pnpm test:docker` (`DOC01`, `DOC02`, `DOC03` passed in 56.46s)

A thorough verification of all **18 prior bugs** across Generations 1, 2, and 3 confirmed that all 18 are completely resolved and covered by regression tests.

However, an exhaustive fourth-generation audit evaluating tester overlay diagnostic attribution, ordinary Compose declaration origins, host-root bind mount safety restrictions, healthcheck command casing normalization, and publication validation granularity revealed **5 new concrete defects**:

1. **Tester Overlay Diagnostics Misattributed to Base `services.tester`** in [`src/core/composition/compileGraphComposition.ts:130`](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/src/core/composition/compileGraphComposition.ts#L130) and [`src/core/composition/compileTester.ts:24,26,37,50`](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/src/core/composition/compileTester.ts#L24).
2. **Ordinary Service Compose Validation Misattributes `service` and Endpoint Errors to Compose File** in [`src/core/composition/validateServiceCompose.ts:29,30,32`](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/src/core/composition/validateServiceCompose.ts#L29).
3. **`validateAndPrepareMainOverride` and `compileTester` Fail to Reject Host-Root Filesystem Bind Mounts** in [`src/core/composition/validateOverrideCompose.ts:37,88-105`](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/src/core/composition/validateOverrideCompose.ts#L37) and [`src/core/composition/compileTester.ts:30-35`](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/src/core/composition/compileTester.ts#L30).
4. **Case-Insensitive Array Healthcheck Commands (`["cmd", ...]` / `["cmd-shell", ...]`) are Falsely Rejected as Invalid** in [`src/core/composition/composeHealthcheck.ts:9`](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/src/core/composition/composeHealthcheck.ts#L9).
5. **`resolvePublicationIntent` Conflates Nonexistent Endpoints with Lacking Public Port Capability** in [`src/core/config/publication.ts:12-14`](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/src/core/config/publication.ts#L12).

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

---

## 3. Specification & Execution Model Traceability Matrix

| Area | Normative Reference | Implementation Files | Status | Notes |
|---|---|---|---|---|
| **Tester Diagnostic Attribution** | `spec_v3.0.0.md §6, §25, §35, §46` | [`compileGraphComposition.ts`](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/src/core/composition/compileGraphComposition.ts), [`compileTester.ts`](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/src/core/composition/compileTester.ts) | **Defective** | `testerOrigin` hardcodes `services.tester`. Overlays defining invalid runner services, forbidden env variables, or broken references report `services.tester` instead of `e2e.services.tester` (Bug 4.1). |
| **Ordinary Service Diagnostics** | `spec_v3.0.0.md §26, §68, §83` | [`validateServiceCompose.ts`](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/src/core/composition/validateServiceCompose.ts) | **Defective** | Nonexistent endpoint owners and lifecycle representatives throw with `sourceFile: composePath` and `configPath: "endpoints.<endpoint>.service"` / `"service"`, which do not exist in Compose YAML (Bug 4.2). |
| **Host-Root Mount Safety** | `spec_v3.0.0.md §66, §67, §83` | [`validateOverrideCompose.ts`](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/src/core/composition/validateOverrideCompose.ts), [`compileTester.ts`](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/src/core/composition/compileTester.ts) | **Defective** | `validateOverrideCompose` and `compileTester` fail to check `isHostFilesystemRoot`, allowing `/:/host` bind mounts to bypass Builder ownership (Bug 4.3). |
| **Healthcheck Command Casing** | `spec_v3.0.0.md §69, §83` | [`composeHealthcheck.ts`](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/src/core/composition/composeHealthcheck.ts) | **Defective** | `test[0]` in Compose healthcheck array is checked with strict case sensitivity (`!== "CMD" && !== "CMD-SHELL"`), falsely rejecting valid lowercase `["cmd", ...]` and `["cmd-shell", ...]` commands (Bug 4.4). |
| **Publication Error Granularity** | `spec_v3.0.0.md §49, §83, §89, §90` | [`publication.ts`](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/src/core/config/publication.ts) | **Defective** | When a publish selector names a nonexistent endpoint, `resolvePublicationIntent` claims "requires an endpoint with publicPort capability", falsely asserting the endpoint exists (Bug 4.5). |
| **Runtime Variables & Boundary** | `EXECUTION_MODEL.md §1, §7`, `spec_v3.0.0.md §4, §54, §55` | [`builderEnvironment.ts`](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/src/core/config/builderEnvironment.ts) | **Compliant** | `EXEC_MODE` and `INFRA_MODE` strictly assigned to `main`; tester receives neither; `.env` validation catches `=` and `:` keys. |
| **Environment Precedence** | `spec_v3.0.0.md §56-64`, `EXECUTION_MODEL.md §5` | [`compileGraphComposition.ts`](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/src/core/composition/compileGraphComposition.ts) | **Compliant** | Precedence strictly adheres to `sourceEnv -> override -> meshEnv -> Builder-owned`. Tester precedence `.env.e2e-tester -> tester.env -> internal` is preserved. |
| **Requisite Graph & Acyclicity** | `spec_v3.0.0.md §7-15` | [`serviceGraph.ts`](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/src/core/config/serviceGraph.ts) | **Compliant** | Requisite lowering (`requirement`, `dependency`, `prerequisite`) and cycle detection fully match specification. |
| **Two-Phase Global Testing** | `EXECUTION_MODEL.md §6`, `spec_v3.0.0.md §78` | [`runMeshTest.ts`](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/src/core/mesh/runners/runMeshTest.ts) | **Compliant** | Phase 1 runs sequential source unit/E2E; Phase 2 runs global mesh E2E; teardown between phases is verified in Docker integration tests. |

---

## 4. Generation 4 Defect Reports

### Bug 4.1: Tester Overlay Diagnostics Misattributed to Base `services.tester`

- **Location**:
  - [`src/core/composition/compileGraphComposition.ts:130`](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/src/core/composition/compileGraphComposition.ts#L130)
  - [`src/core/composition/compileTester.ts:24,26,37,50`](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/src/core/composition/compileTester.ts#L24)
- **The Bug**:
  In `compileGraphComposition.ts:130`:
  ```ts
  const testerOrigin: Origin = input.mesh
    ? { sourceFile: input.mesh.sourceFile, configPath: "services.tester", projectDir: input.projectDir, scope: "mesh", layer: "base" }
    : { sourceFile: input.instances.get("")!.sourceFile, configPath: "services.tester", projectDir: input.projectDir, scope: "build", layer: "base" };
  ```
  `testerOrigin` is hardcoded as `configPath: "services.tester"`.
  When an overlay stage (e.g. `e2e` in `build.json` or `mesh.json`) introduces an invalid configuration in `services.tester`—such as an invalid `service` runner name, a forbidden env variable like `EXEC_MODE`, or an invalid endpoint reference in `tester.env`—`compileTester` builds child diagnostic paths using `origin.configPath` (`"services.tester"`):
  ```ts
  const leaf = { ...origin, configPath: `${origin.configPath}.env.${key}` };
  ```
  Consequently, errors originating in `e2e.services.tester.service` or `e2e.services.tester.env.TARGET` report:
  `configPath: "services.tester.service"` or `configPath: "services.tester.env.TARGET"`.
- **Why It Is a Bug**:
  Under Spec V3 §6, §25, §35, §46, and §83:
  E2E is a structured configuration overlay (`base -> prod -> e2e`). When an overlay declares a property that fails validation, the error must point to the declaring overlay configuration path.
  Reporting `services.tester` misattributes the error to the base configuration, where the property may have been valid or not present at all.
- **How to Create a Test for the Bug (Failing Test)**:
  ```ts
  it("[TST08] tester overlay diagnostic identifies stage path", () => {
    const b = basicBuild();
    b.e2e = {
      services: {
        tester: {
          service: "missing-runner",
        },
      },
    };
    const root = writeBasic(b);
    try {
      compileServiceComposition("e2e", root, { validationMode: true });
      expect.unreachable("Expected invalid runner error");
    } catch (error) {
      expect(error).toBeInstanceOf(ConfigError);
      expect((error as ConfigError).context.configPath).toBe("e2e.services.tester.service");
    }
  });
  ```
  **Current Result on Codebase:** Fails with:
  ```text
  AssertionError: expected 'services.tester.service' to be 'e2e.services.tester.service'
  - Expected: "e2e.services.tester.service"
  + Received: "services.tester.service"
  ```
- **Expected Behavior**:
  The diagnostic `configPath` must be `"e2e.services.tester.service"` (or `"e2e.services.tester.env.<key>"`).
- **How to Fix the Bug**:
  1. In `src/core/composition/compileTester.ts`, accept `envOrigins?: Map<string, Origin>` and `serviceOrigin?: Origin` on `TesterCompileInput`.
  2. In `src/core/composition/compileGraphComposition.ts:130`:
     - For standalone builds, extract `serviceOrigin` from `input.instances.get("")!.origins.get("tester")` and `envOrigins` from `input.instances.get("")!.envOrigins.get("tester")`.
     - For meshes, extract `serviceOrigin` and `envOrigins` from `input.mesh.testerLayers`.
  3. In `compileTester.ts`:
     - Line 26: use `serviceOrigin?.configPath ?? `${origin.configPath}.service``.
     - Line 50: use `envOrigins?.get(key) ?? { ...origin, configPath: `${origin.configPath}.env.${key}` }`.

---

### Bug 4.2: Ordinary Service Compose Validation Misattributes `service` and Endpoint Errors to Compose File

- **Location**:
  - [`src/core/composition/validateServiceCompose.ts:29, 30, 32`](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/src/core/composition/validateServiceCompose.ts#L29)
- **The Bug**:
  In `validateServiceCompose.ts`:
  ```ts
  29: else {if(!declaration.service)fail("service","endpoint-less service requires service");representative=declaration.service!;}
  30: if(!services[representative])fail("service","lifecycle representative does not exist",representative);
  31: for(const [endpoint,definition] of Object.entries(endpoints)){
  32:   if(!services[definition.service])fail(`endpoints.${endpoint}.service`,"endpoint owner does not exist",definition.service);
  33:   if(services[definition.service]!.network_mode!==undefined)fail(`services.${definition.service}.network_mode`,"endpoint owner cannot use network_mode");
  34: }
  ```
  Where `fail` is defined as:
  ```ts
  const fail = (configPath: string, reason: string, value?: unknown): never => {
    throw new ConfigError({ sourceFile: context.composePath, configPath, stage: context.stage, composition: context.composition, referencedObject: name, reason, value });
  };
  ```
  When an ordinary service's endpoint in `build.json` (or `mesh.json`'s `extends`) specifies a container that does not exist in Compose (line 32), or when an endpoint-less service specifies a nonexistent lifecycle container (line 30), `validateServiceCompose` throws a `ConfigError` with:
  - `sourceFile: context.composePath` (the Compose YAML file, e.g. `api.yml`)
  - `configPath: "endpoints.<endpoint>.service"` or `"service"`
- **Why It Is a Bug**:
  Docker Compose YAML files do NOT have an `endpoints` section or a top-level `service` field (Compose defines `services: <map>`).
  The field `services.<name>.endpoints.<endpoint>.service` and `services.<name>.service` are declared in `build.json` (or `mesh.json`).
  Reporting the Compose YAML file with path `endpoints.<endpoint>.service` misattributes a Builder JSON configuration defect to the Compose file.
  (In Bug 2.6 / `[CMP25]`, line 28 was fixed for service owner mismatch to use `origin.sourceFile` and `origin.configPath`, but lines 30 and 32 were missed).
- **How to Create a Test for the Bug (Failing Test)**:
  ```ts
  it("[CMP27] nonexistent endpoint owner identifies build.json declaration origin", () => {
    const declaration: any = {
      compose: "api.yml",
      endpoints: {
        http: { service: "web", port: 8080, primary: true },
        metrics: { service: "missing-metrics", port: 9090 }
      },
      origin: {
        sourceFile: "/app/build.json",
        configPath: "services.api"
      }
    };
    try {
      validateServiceCompose("api", declaration, { services: { web: { image: "nginx" } } }, {
        composePath: "/app/api.yml",
        stage: "dev",
        composition: "service",
        healthRequired: false,
        prerequisite: false,
        declarationOrigin: declaration.origin
      });
      expect.unreachable("Expected missing endpoint owner error");
    } catch (error) {
      expect(error).toBeInstanceOf(ConfigError);
      expect((error as ConfigError).context).toMatchObject({
        sourceFile: "/app/build.json",
        configPath: "services.api.endpoints.metrics.service",
        referencedObject: "api"
      });
    }
  });
  ```
  **Current Result on Codebase:** Fails with:
  ```text
  AssertionError: expected '/app/api.yml' to be '/app/build.json'
  - Expected: "/app/build.json"
  + Received: "/app/api.yml"
  ```
- **Expected Behavior**:
  The `sourceFile` must be the JSON declaration file (`/app/build.json` or `mesh.json`), and `configPath` must be `${origin.configPath}.endpoints.<endpoint>.service` (or `${origin.configPath}.service`).
- **How to Fix the Bug**:
  In [`src/core/composition/validateServiceCompose.ts:28-32`](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/src/core/composition/validateServiceCompose.ts#L28-L32):
  ```ts
  const origin = (declaration as EffectiveOrdinary & {origin?: Origin}).origin ?? context.declarationOrigin;
  if (!services[representative]) {
    if (origin) throw new ConfigError({ sourceFile: origin.sourceFile, configPath: `${origin.configPath}.service`, stage: context.stage, composition: context.composition, referencedObject: name, reason: "lifecycle representative does not exist", value: representative });
    fail("service", "lifecycle representative does not exist", representative);
  }
  for (const [endpoint, definition] of Object.entries(endpoints)) {
    if (!services[definition.service]) {
      if (origin) throw new ConfigError({ sourceFile: origin.sourceFile, configPath: `${origin.configPath}.endpoints.${endpoint}.service`, stage: context.stage, composition: context.composition, referencedObject: name, reason: "endpoint owner does not exist", value: definition.service });
      fail(`endpoints.${endpoint}.service`, "endpoint owner does not exist", definition.service);
    }
    if (services[definition.service]!.network_mode !== undefined) fail(`services.${definition.service}.network_mode`, "endpoint owner cannot use network_mode");
  }
  ```

---

### Bug 4.3: `validateAndPrepareMainOverride` and `compileTester` Fail to Reject Host-Root Filesystem Bind Mounts

- **Location**:
  - [`src/core/composition/validateOverrideCompose.ts:37, 88-105`](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/src/core/composition/validateOverrideCompose.ts#L37)
  - [`src/core/composition/compileTester.ts:30-35`](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/src/core/composition/compileTester.ts#L30)
- **The Bug**:
  In `validateOverrideCompose.ts`:
  `validateAndPrepareMainOverride` checks `main` override fields for forbidden keys (`ports`, `network_mode`, `container_name`, `privileged`, etc.). However, it processes `main.volumes` solely to namespace named volumes and never invokes `isHostFilesystemRoot`.
  Similarly, in `compileTester.ts:30-35`, tester Compose files are checked for `ports`, `container_name`, and `privileged: true`, but `service.volumes` is never validated for host-root bind mounts.
  As a result, a service or tester defining `volumes: ["/:/host"]` or `volumes: [{ type: "bind", source: "/", target: "/host" }]` is accepted without error.
- **Why It Is a Bug**:
  Spec V3 §67 ("Normal-Service Compose Restrictions") explicitly states:
  > "Builder owns cross-module networking and host publication. ... Builder SHOULD reject configurations that bypass its runtime ownership, including:
  > - fixed `container_name`;
  > - `network_mode: host`;
  > - `privileged: true`;
  > - host-root filesystem mounts;
  > - host port mappings that bypass Builder endpoint publication.
  > The tester is a special test-runner exception where host-network semantics may be used by the tester runtime."
  While ordinary services reject host root mounts in `validateServiceCompose.ts:17`, `main` overrides and tester Compose files bypass this restriction.
- **How to Create a Test for the Bug (Failing Test)**:
  ```ts
  it("[CMP28] main override and tester reject host root bind mounts", () => {
    expect(() => validateAndPrepareMainOverride({
      services: {
        main: { volumes: ["/:/host-root"] }
      }
    } as any, {
      file: "docker-compose.override.yml",
      stage: "dev",
      expectedBuildContext: ".",
      buildContextBaseDir: "/tmp"
    })).toThrow(/host root bind mounts are forbidden/);
  });
  ```
  **Current Result on Codebase:** Fails because `validateAndPrepareMainOverride` returns `{ main: { volumes: ["/:/host-root"], ... }, resources: {} }` instead of throwing.
- **Expected Behavior**:
  Both `validateAndPrepareMainOverride` and `compileTester` must reject host-root bind mounts with `ConfigError: host root bind mounts are forbidden`.
- **How to Fix the Bug**:
  1. In `src/core/composition/validateOverrideCompose.ts`:
     Import `isHostFilesystemRoot` from `./composeVolumes.js`.
     Check `main.volumes`:
     ```ts
     for (const volume of Array.isArray(main.volumes) ? main.volumes : []) {
       const mount = parseVolume(volume);
       if (mount?.type === "bind" && mount.source && isHostFilesystemRoot(mount.source)) {
         fail("services.main.volumes", "host root bind mounts are forbidden");
       }
     }
     ```
  2. In `src/core/composition/compileTester.ts`:
     Import `isHostFilesystemRoot` and `parseVolume` from `./composeVolumes.js`.
     Check `service.volumes` in the loop over `raw.services`:
     ```ts
     for (const volume of Array.isArray(service.volumes) ? service.volumes : []) {
       const mount = parseVolume(volume);
       if (mount?.type === "bind" && mount.source && isHostFilesystemRoot(mount.source)) {
         throw new ConfigError({ sourceFile: file, configPath: `services.${name}.volumes`, stage, composition, reason: "host root bind mounts are forbidden" });
       }
     }
     ```

---

### Bug 4.4: Case-Insensitive Array Healthcheck Commands (`["cmd", ...]` / `["cmd-shell", ...]`) are Falsely Rejected as Invalid

- **Location**:
  - [`src/core/composition/composeHealthcheck.ts:9`](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/src/core/composition/composeHealthcheck.ts#L9)
- **The Bug**:
  In `composeHealthcheck.ts:8-10`:
  ```ts
  if (!Array.isArray(test) || !test.every(item => typeof item === "string")) return false;
  if (test[0] !== "CMD" && test[0] !== "CMD-SHELL") return false;
  return test.length >= 2 && test.slice(1).some(item => item.trim().length > 0);
  ```
  Line 9 performs a strict case-sensitive check against `"CMD"` and `"CMD-SHELL"`.
  If a service author writes lowercase `test: ["cmd-shell", "curl -f http://localhost:8080/"]` or `test: ["cmd", "curl", "-f", "http://localhost:8080/"]`, line 9 evaluates to `true` and immediately returns `false`.
- **Why It Is a Bug**:
  In the official Docker Compose specification and Docker engine semantics, healthcheck test array prefixes (`NONE`, `CMD`, `CMD-SHELL`) are case-insensitive.
  Valid compose configurations using `["cmd", ...]` or `["cmd-shell", ...]` are falsely classified as invalid/disabled healthchecks, causing `validateServiceCompose.ts:35` to abort compilation with `ConfigError: requires a valid healthcheck`.
- **How to Create a Test for the Bug (Failing Test)**:
  ```ts
  it("[LIF27] isEnabledValidComposeHealthcheck accepts lowercase cmd and cmd-shell", () => {
    expect(isEnabledValidComposeHealthcheck({ test: ["cmd-shell", "curl -f http://localhost/"] })).toBe(true);
    expect(isEnabledValidComposeHealthcheck({ test: ["cmd", "curl", "http://localhost/"] })).toBe(true);
    expect(isEnabledValidComposeHealthcheck({ test: ["none"] })).toBe(false);
  });
  ```
  **Current Result on Codebase:** Fails with:
  ```text
  AssertionError: expected false to be true // for ["cmd-shell", ...]
  ```
- **Expected Behavior**:
  Array test commands starting with `"cmd"`, `"CMD"`, `"cmd-shell"`, or `"CMD-SHELL"` must be accepted as valid.
- **How to Fix the Bug**:
  In [`src/core/composition/composeHealthcheck.ts:9`](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/src/core/composition/composeHealthcheck.ts#L9), normalize casing before checking:
  ```ts
  const type = test[0]?.toUpperCase();
  if (type !== "CMD" && type !== "CMD-SHELL") return false;
  ```

---

### Bug 4.5: `resolvePublicationIntent` Conflates Nonexistent Endpoints with Lacking Public Port Capability

- **Location**:
  - [`src/core/config/publication.ts:12-14`](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/src/core/config/publication.ts#L12)
- **The Bug**:
  In `publication.ts:12-14`:
  ```ts
  const def = node.declaration.endpoints[endpoint];
  if (!def || def.publicPort === undefined) throw new ConfigError({ sourceFile: origin.sourceFile, configPath: origin.configPath, stage, composition, referencedObject: selector, reason: "publish selector requires an endpoint with publicPort capability" });
  ```
  When a selector targets an endpoint name that does not exist on the service (e.g. `main.endpoints.nonexistent`), `!def` is true. `publication.ts` throws:
  `reason: "publish selector requires an endpoint with publicPort capability"`.
- **Why It Is a Bug**:
  Spec V3 §49 explicitly specifies distinct validation requirements:
  > "49. Publication Validation
  > A publish selector is valid only when:
  > 1. the selected source service exists;
  > 2. the service is in that sourced build's effective reachable requisite tree;
  > 3. the selected endpoint exists;
  > 4. the endpoint has an effective publicPort.
  > If any condition fails, Builder MUST reject the mesh."
  Reporting that an endpoint lacks `publicPort` capability when the endpoint does not exist at all misleads users into thinking the endpoint is defined, obscuring typographical errors.
- **How to Create a Test for the Bug (Failing Test)**:
  ```ts
  it("[PUB22] publication selector for nonexistent endpoint fails with endpoint existence error", () => {
    const { root, config } = meshFixture();
    config.services.api.publish = ["main.endpoints.nonexistent"];
    save(root, config);
    try {
      compileMeshComposition("prod", root, { validationMode: true });
      expect.unreachable("Expected error for nonexistent endpoint");
    } catch (error) {
      expect(error).toBeInstanceOf(ConfigError);
      expect((error as ConfigError).context.reason).toMatch(/target endpoint does not exist|endpoint nonexistent does not exist/i);
    }
  });
  ```
  **Current Result on Codebase:** Fails with:
  ```text
  AssertionError: expected 'publish selector requires an endpoint with publicPort capability' to match /target endpoint does not exist/i
  ```
- **Expected Behavior**:
  If the endpoint does not exist, `reason` must report that the endpoint does not exist (`publish selector target endpoint does not exist`).
- **How to Fix the Bug**:
  In [`src/core/config/publication.ts:12-14`](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/src/core/config/publication.ts#L12-L14), differentiate the two conditions:
  ```ts
  const def = node.declaration.endpoints[endpoint];
  if (!def) throw new ConfigError({ sourceFile: origin.sourceFile, configPath: origin.configPath, stage, composition, referencedObject: selector, reason: "publish selector target endpoint does not exist" });
  if (def.publicPort === undefined) throw new ConfigError({ sourceFile: origin.sourceFile, configPath: origin.configPath, stage, composition, referencedObject: selector, reason: "publish selector requires an endpoint with publicPort capability" });
  ```

---

## 5. Implementation Fix Plan

### 5.1 Test-Driven Decision Protocol

For each defect, execute the following strict 3-step decision gate:

```text
[Step 1: Pre-Fix Verification]
Execute the proposed reproduction test against unmodified codebase.
    │
    ├── Test FAILS with documented defect assertion?
    │       └── PROCEED: Bug is confirmed real.
    │
    └── Test PASSES?
            └── HALT: Defect is invalid or already addressed. Do not proceed with code changes.

[Step 2: Apply Code Modification]
Apply the minimal, targeted code fix to the identified file(s).

[Step 3: Post-Fix Verification & Regression]
Re-run the reproduction test (must PASS).
Execute full test suite (pnpm typecheck && pnpm test:v3:fast && pnpm test:docker).
```

---

### 5.2 Step-by-Step Code Modifications

#### Fix 1: Dynamically Track Tester Origins for Overlay Stages
- **Files**:
  - [`src/core/composition/compileTester.ts`](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/src/core/composition/compileTester.ts#L20): Add `envOrigins?: Map<string, Origin>` and `serviceOrigin?: Origin` to `TesterCompileInput`.
  - [`src/core/composition/compileTester.ts:26,50`](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/src/core/composition/compileTester.ts#L26):
    - Replace line 26 `configPath: `${origin.configPath}.service`` with `configPath: input.serviceOrigin?.configPath ?? `${origin.configPath}.service``.
    - Replace line 50 `leaf = { ...origin, configPath: `${origin.configPath}.env.${key}` }` with `leaf = input.envOrigins?.get(key) ?? { ...origin, configPath: `${origin.configPath}.env.${key}` }`.
  - [`src/core/composition/compileGraphComposition.ts:130`](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/src/core/composition/compileGraphComposition.ts#L130):
    - Pass `envOrigins` and `serviceOrigin` to both validation and materialization calls to `compileTester`.
- **Test File**: Add test case `[TST08] tester overlay diagnostic identifies stage path` to [`tests/v3/lifecycleMatrix.test.ts`](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/tests/v3/lifecycleMatrix.test.ts).

#### Fix 2: Attribute Ordinary Service Endpoints and Service Errors to Declaration Origin
- **File**: [`src/core/composition/validateServiceCompose.ts:28-32`](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/src/core/composition/validateServiceCompose.ts#L28-L32)
- **Change**:
  Extract `const origin = (declaration as EffectiveOrdinary & {origin?: Origin}).origin ?? context.declarationOrigin;` before the checks.
  If `!services[representative]`, throw with `origin.sourceFile` and `${origin.configPath}.service` if `origin` exists.
  If `!services[definition.service]`, throw with `origin.sourceFile` and `${origin.configPath}.endpoints.${endpoint}.service` if `origin` exists.
- **Test File**: Add test case `[CMP27] nonexistent endpoint owner identifies build.json declaration origin` to [`tests/v3/composeMatrix.test.ts`](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/tests/v3/composeMatrix.test.ts).

#### Fix 3: Reject Host-Root Bind Mounts in `validateOverrideCompose` and `compileTester`
- **Files**:
  - [`src/core/composition/validateOverrideCompose.ts`](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/src/core/composition/validateOverrideCompose.ts#L4): Import `isHostFilesystemRoot`. In `validateAndPrepareMainOverride`, validate `main.volumes` using `isHostFilesystemRoot(mount.source)`.
  - [`src/core/composition/compileTester.ts`](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/src/core/composition/compileTester.ts#L19): Import `isHostFilesystemRoot` and `parseVolume`. Validate `service.volumes` in `compileTester`.
- **Test File**: Add test case `[CMP28] main override and tester reject host root bind mounts` to [`tests/v3/composeMatrix.test.ts`](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/tests/v3/composeMatrix.test.ts).

#### Fix 4: Support Case-Insensitive Array Healthcheck Commands
- **File**: [`src/core/composition/composeHealthcheck.ts:9`](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/src/core/composition/composeHealthcheck.ts#L9)
- **Change**: Replace line 9 with:
  ```ts
  const type = test[0]?.toUpperCase();
  if (type !== "CMD" && type !== "CMD-SHELL") return false;
  ```
- **Test File**: Add test case `[LIF27] isEnabledValidComposeHealthcheck accepts lowercase cmd and cmd-shell` to [`tests/v3/lifecycleMatrix.test.ts`](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/tests/v3/lifecycleMatrix.test.ts).

#### Fix 5: Split Publication Endpoint Existence from Capability Check
- **File**: [`src/core/config/publication.ts:12-14`](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/src/core/config/publication.ts#L12-L14)
- **Change**:
  ```ts
  const def = node.declaration.endpoints[endpoint];
  if (!def) throw new ConfigError({ sourceFile: origin.sourceFile, configPath: origin.configPath, stage, composition, referencedObject: selector, reason: "publish selector target endpoint does not exist" });
  if (def.publicPort === undefined) throw new ConfigError({ sourceFile: origin.sourceFile, configPath: origin.configPath, stage, composition, referencedObject: selector, reason: "publish selector requires an endpoint with publicPort capability" });
  ```
- **Test File**: Add test case `[PUB22] publication selector for nonexistent endpoint fails with endpoint existence error` to [`tests/v3/publicationMatrix.test.ts`](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/tests/v3/publicationMatrix.test.ts).

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
