# Builder V3 Codebase Audit & Implementation Fix Plan (Generation 2)

This document provides a second-generation (Gen 2) deep audit of the `@solid-stack/builder` V3 codebase against [spec_v3.0.0.md](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/.docs/specs_v3/spec_v3.0.0.md) and [EXECUTION_MODEL.md](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/.docs/EXECUTION_MODEL.md).

---

## 1. Executive Summary & Audit Verdict

Following the successful merging of Generation 1 fixes (`feat: implemented bug fix 1`, commit `4cff865`), the codebase has achieved compliance on fundamental Dockerfile contracts, multi-pipeline execution timings, and service top-level ownership validation.

However, a rigorous second-generation audit of the composition pipeline, dotenv parser, lifecycle acyclicity validator, Dockerfile contract engine, environment compiler, and Compose resource validator revealed **6 concrete defects**:

1. **`readDotenvValues` Truncates Double-Quoted Values Containing Escaped Quotes (`\"`)** in [`src/core/composition/dotenv.ts`](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/src/core/composition/dotenv.ts#L14-L16).
2. **Colon Separator (`:`) in `.env` Files Completely Bypasses Builder-Owned Variable Enforcement** in [`src/core/config/builderEnvironment.ts`](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/src/core/config/builderEnvironment.ts#L15).
3. **Multi-Platform and Flagged `FROM` Instructions Break Dockerfile Contract Validation** in [`src/core/checkers/checkDockerfileContract.ts`](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/src/core/checkers/checkDockerfileContract.ts#L17).
4. **Stale V2 `dependsOn` Property Name Leaks in Compose Lifecycle Cycle Error Diagnostics** in [`src/core/config/lifecycleGraph.ts`](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/src/core/config/lifecycleGraph.ts#L5).
5. **`compileApplicationEnv` Overrides Caller-Provided `validationMode: false`** in [`src/core/compileApplicationEnv.ts`](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/src/core/compileApplicationEnv.ts#L25).
6. **Top-Level `service` Mismatch in `validateServiceCompose` Misattributes Error Origin to Compose File** in [`src/core/composition/validateServiceCompose.ts`](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/src/core/composition/validateServiceCompose.ts#L28).

---

## 2. Specification & Execution Model Traceability Matrix

| Area | Normative Reference | Implementation Files | Status | Notes |
|---|---|---|---|---|
| **Runtime Variables** | `EXECUTION_MODEL.md §1`, `spec_v3.0.0.md §4, §54, §55` | [`builderEnvironment.ts`](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/src/core/config/builderEnvironment.ts), [`compileGraphComposition.ts`](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/src/core/composition/compileGraphComposition.ts) | **Defective** | Colon separators (`KEY: val`) in `.env` files bypass `assertDotenvDoesNotDefineKeys`, causing `EXEC_MODE` to leak into tester containers (Bug 2). |
| **Dotenv Parsing** | `EXECUTION_MODEL.md §5`, `spec_v3.0.0.md §58, §63, §64` | [`dotenv.ts`](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/src/core/composition/dotenv.ts), [`compileTester.ts`](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/src/core/composition/compileTester.ts) | **Defective** | Escaped double quotes (`\"`) truncate double-quoted string values in `readDotenvValues` (Bug 1). |
| **Dockerfile Contract** | `spec_v3.0.0.md §3, §87-90` | [`checkDockerfileContract.ts`](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/src/core/checkers/checkDockerfileContract.ts) | **Defective** | `FROM` instructions with flags like `--platform=<platform>` fail regex, causing false positive `Missing required Dockerfile target dev` (Bug 3). |
| **Lifecycle Graphs & Cycles** | `spec_v3.0.0.md §15, §95, §96` | [`lifecycleGraph.ts`](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/src/core/config/lifecycleGraph.ts), [`assertComposeLifecycleAcyclic.ts`](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/src/core/composition/assertComposeLifecycleAcyclic.ts) | **Defective** | Lifecycle cycle errors report `configPath: "dependsOn"` (removed V2 field) instead of `"services.depends_on"` (Bug 4). |
| **Environment Export & Ports** | `spec_v3.0.0.md §21, §55`, `EXECUTION_MODEL.md §2` | [`compileApplicationEnv.ts`](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/src/core/compileApplicationEnv.ts), [`hostPorts.ts`](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/src/core/config/hostPorts.ts) | **Defective** | `compileApplicationEnv` overrides `{ ...options, validationMode: true }`, preventing callers from resolving live/cached port assignments (Bug 5). |
| **Compose Validation Attribution** | `spec_v3.0.0.md §18, §67, §68` | [`validateServiceCompose.ts`](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/src/core/composition/validateServiceCompose.ts) | **Defective** | Mismatch between `declaration.service` and primary endpoint owner reports `sourceFile: composePath` instead of the JSON config origin (Bug 6). |
| **Service Execution & Profiles** | `EXECUTION_MODEL.md §2`, `spec_v3.0.0.md §61, §62` | [`runDev.ts`](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/src/core/runners/runDev.ts), [`runProd.ts`](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/src/core/runners/runProd.ts), [`runTest.ts`](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/src/core/runners/runTest.ts) | **Compliant** | All flags (`--full`, `--detach`, `--debug`) and sequential phase 1 / phase 2 execution match specs. |
| **Tester Precedence** | `EXECUTION_MODEL.md §5`, `spec_v3.0.0.md §58` | [`compileTester.ts`](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/src/core/composition/compileTester.ts) | **Compliant** | Precedence chain (`.env.e2e-tester -> tester.env -> internal`) correctly enforced. |
| **Mesh Lifecycle & Scopes** | `EXECUTION_MODEL.md §3, §6`, `spec_v3.0.0.md §36-46` | [`runMeshDev.ts`](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/src/core/mesh/runners/runMeshDev.ts), [`runMeshTest.ts`](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/src/core/mesh/runners/runMeshTest.ts) | **Compliant** | Two-phase global testing, source service isolation, and teardown boundaries comply with execution model. |

---

## 3. Detailed Bug Reports

---

### Bug 1: `readDotenvValues` Truncates Double-Quoted Values Containing Escaped Quotes (`\"`)

- **Location**: [`src/core/composition/dotenv.ts:14-16`](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/src/core/composition/dotenv.ts#L14-L16)
- **The Bug**:
  ```ts
  if (value.startsWith("'") || value.startsWith('"')) {
    const quote = value[0]!; value = value.slice(1);
    while (!value.includes(quote) && offset < source.length) { ... }
    const end = value.indexOf(quote);
    if (end >= 0) value = value.slice(0, end);
    if (quote === '"') value = value.replace(/\\([nrt"\\])/g, (_all, char: string) => ...);
  }
  ```
  `value.indexOf(quote)` slices double-quoted values at the *first* double-quote character encountered, regardless of whether that quote is escaped as `\"`.
- **Why It Is a Bug**:
  In standard Compose dotenv syntax and shell quoting, an escaped double quote `\"` inside double quotes is literal content and must NOT terminate the string.
  When a `.env` file contains:
  ```dotenv
  GREETING="hello \"world\""
  ```
  `value.indexOf(quote)` matches the quote at `\"world\""`.
  `value.slice(0, end)` slices the value to `"hello \\"`, completely discarding the remainder (`world\""`).
  Furthermore, [`serializeApplicationEnv`](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/src/core/compileApplicationEnv.ts#L54) explicitly serializes double quotes using `\"` (`value.replace(/"/g, '\\"')`). Consequently, environment variables exported by Builder containing quotes cannot be successfully round-tripped back by Builder's own `readDotenvValues`.
- **How to Create a Test for the Bug (Failing Test)**:
  ```ts
  import { describe, it, expect } from "vitest";
  import { readDotenvValues } from "./src/core/composition/dotenv.js";
  import fs from "node:fs";
  import path from "node:path";

  it("preserves escaped double quotes and continues to closing quote in dotenv values", () => {
    const dir = fs.mkdtempSync("/tmp/dotenv-test-");
    const file = path.join(dir, ".env.test");
    fs.writeFileSync(file, 'MSG="hello \\"world\\""\n');
    try {
      const parsed = readDotenvValues(file);
      expect(parsed.MSG).toBe('hello "world"');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
  ```
  **Current Result on Codebase:** Fails with:
  ```text
  AssertionError: expected 'hello \\' to be 'hello "world"'
  - Expected: "hello \"world\""
  + Received: "hello \\"
  ```
- **Expected Behavior**:
  `readDotenvValues` must ignore escaped quotes (`\"`) when searching for the closing double quote, slicing only at an unescaped double quote (preceded by an even number of backslashes), and unescaping `\"` to `"` in the final value.
- **How to Fix the Bug**:
  In [`src/core/composition/dotenv.ts`](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/src/core/composition/dotenv.ts), scan for the true unescaped closing quote:
  ```ts
  if (value.startsWith("'") || value.startsWith('"')) {
    const quote = value[0]!;
    value = value.slice(1);
    if (quote === "'") {
      while (!value.includes("'") && offset < source.length) {
        const nextStart = offset;
        while (offset < source.length && source[offset] !== "\n") offset++;
        value += "\n" + source.slice(nextStart, offset).replace(/\r$/, "");
        offset++;
      }
      const end = value.indexOf("'");
      if (end >= 0) value = value.slice(0, end);
    } else {
      let i = 0;
      let found = false;
      while (!found) {
        while (i < value.length) {
          if (value[i] === '"') {
            let backslashes = 0;
            let k = i - 1;
            while (k >= 0 && value[k] === "\\") { backslashes++; k--; }
            if (backslashes % 2 === 0) {
              value = value.slice(0, i);
              found = true;
              break;
            }
          }
          i++;
        }
        if (found || offset >= source.length) break;
        const nextStart = offset;
        while (offset < source.length && source[offset] !== "\n") offset++;
        value += "\n" + source.slice(nextStart, offset).replace(/\r$/, "");
        offset++;
      }
      value = value.replace(/\\([nrt"\\])/g, (_all, char: string) =>
        char === "n" ? "\n" : char === "r" ? "\r" : char === "t" ? "\t" : char
      );
    }
  } else {
    value = value.replace(/\s+#.*$/, "").trim();
  }
  ```

---

### Bug 2: Colon Separator (`:`) in `.env` Files Completely Bypasses Builder-Owned Variable Enforcement

- **Location**: [`src/core/config/builderEnvironment.ts:15`](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/src/core/config/builderEnvironment.ts#L15)
- **The Bug**:
  ```ts
  export function assertDotenvDoesNotDefineKeys(filePath:string,keys:readonly string[],context:Omit<BuilderEnvContext,"sourceFile">):void{
    if(!fs.existsSync(filePath))return;const forbidden=new Set(keys),lines=fs.readFileSync(filePath,"utf8").split(/\r?\n/);
    for(let index=0;index<lines.length;index+=1){
      const match=/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/.exec(lines[index]!);
      if(!match)continue;
      const key=match[1]!;
      if(!forbidden.has(key))continue;
      throw new ConfigError({ ... });
    }
  }
  ```
  The regex `/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/` tests exclusively for `=` as the key-value separator.
- **Why It Is a Bug**:
  Docker Compose and standard dotenv specifications support both `:` and `=` (e.g. `KEY: value` and `KEY=value`). Builder's own `readDotenvValues` parser in [`dotenv.ts:9`](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/src/core/composition/dotenv.ts#L9) explicitly accepts both:
  ```ts
  const match=/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*[:=]\s*(.*)$/.exec(line);
  ```
  Because `assertDotenvDoesNotDefineKeys` only tests for `=`, a user can write:
  ```dotenv
  EXEC_MODE: test
  INFRA_MODE: isolated
  ```
  in `.env.e2e-tester`, or:
  ```dotenv
  PORT: 8080
  ```
  in `.env.dev`.
  `assertDotenvDoesNotDefineKeys` completely ignores the line.
  Then, during E2E composition in [`compileTester.ts:54-55`](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/src/core/composition/compileTester.ts#L54-L55):
  ```ts
  const testerDotenv = Object.fromEntries(Object.entries(readDotenvValues(dotenv)).map(...));
  service.environment = { ...serviceDefaults, ...testerDotenv, ...testerEnv, ...internalEnv };
  ```
  `readDotenvValues` parses `EXEC_MODE: test` and injects it directly into the tester service environment (`environment: { EXEC_MODE: 'test' }`).
  This directly violates:
  - `spec_v3.0.0.md §4.1`: "`e2e` is not an application execution mode. It is used only by E2E tester processes."
  - `spec_v3.0.0.md §4.2`: "E2E testers do not receive `INFRA_MODE`."
  - `spec_v3.0.0.md §55`: "Tester receives neither `EXEC_MODE` nor `INFRA_MODE`."
  - `EXECUTION_MODEL.md §1 & §2`: "E2E testers do not receive `INFRA_MODE`."
- **How to Create a Test for the Bug (Failing Test)**:
  ```ts
  import { describe, it, expect } from "vitest";
  import { compileServiceComposition } from "./src/core/composition/compileServiceComposition.js";
  import { basicBuild, writeBasic } from "./tests/v3/support/fixtures.js";
  import fs from "node:fs";
  import path from "node:path";

  it("assertDotenvDoesNotDefineKeys rejects Builder-owned variables defined with colon separator", () => {
    const root = writeBasic();
    fs.writeFileSync(path.join(root, ".env.e2e-tester"), "EXEC_MODE: custom_mode\n");
    try {
      expect(() => compileServiceComposition("e2e", root, { validationMode: true }))
        .toThrow(/Environment file cannot set Builder-owned key "EXEC_MODE"/);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
  ```
  **Current Result on Codebase:** The test fails because `compileServiceComposition` succeeds without throwing, and emits the tester with `EXEC_MODE: 'custom_mode'`.
- **Expected Behavior**:
  `assertDotenvDoesNotDefineKeys` must reject any attempt to define Builder-owned variables in `.env` files regardless of whether `=` or `:` is used.
- **How to Fix the Bug**:
  In [`src/core/config/builderEnvironment.ts:15`](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/src/core/config/builderEnvironment.ts#L15), change:
  ```ts
  const match=/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*[:=]/.exec(lines[index]!);
  ```

---

### Bug 3: Multi-Platform and Flagged `FROM` Instructions Break Dockerfile Contract Validation

- **Location**: [`src/core/checkers/checkDockerfileContract.ts:17`](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/src/core/checkers/checkDockerfileContract.ts#L17)
- **The Bug**:
  ```ts
  const from = /^FROM\s+(\S+)(?:\s+AS\s+(\S+))?/i.exec(line);
  if (from) {
    current = {
      name: (from[2] ?? `__${stages.size}`).toLowerCase(),
      parent: from[1]!.toLowerCase(),
    };
    stages.set(current.name, current);
    continue;
  }
  ```
  The regex assumes the first token after `FROM` is the parent image or stage.
- **Why It Is a Bug**:
  In standard Docker grammar and Docker buildx, `FROM` accepts leading flags:
  `FROM [--platform=<platform>] <image> [AS <name>]`
  (e.g., `FROM --platform=linux/amd64 alpine:3 AS dev` or `FROM --platform=$BUILDPLATFORM node:22-alpine AS dev`).
  When `--platform=...` is present:
  - `from[1]` captures `--platform=linux/amd64` (not the image).
  - `from[2]` is `undefined` (because `(?:\s+AS\s+(\S+))` does not match after the flag and image).
  - `current.name` defaults to `__0`.
  - `stages.has("dev")` evaluates to `false`.
  Builder immediately rejects the completely valid Dockerfile with:
  `ConfigError: Missing required Dockerfile target dev`.
  While the conftest Rego policy ([`dockerfile.rego:7-12`](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/templates/policy/dockerfile/dockerfile.rego#L7-L12)) extracts alias as `Value[count(Value)-1]` after `"as"`, the TypeScript validator [`assertMainDockerfileContract`](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/src/core/checkers/checkDockerfileContract.ts#L12) crashes on multi-platform Dockerfiles.
- **How to Create a Test for the Bug (Failing Test)**:
  ```ts
  import { describe, it, expect } from "vitest";
  import { assertMainDockerfileContract } from "./src/core/checkers/checkDockerfileContract.js";
  import fs from "node:fs";
  import path from "node:path";

  it("assertMainDockerfileContract accepts FROM with --platform flags", () => {
    const dir = fs.mkdtempSync("/tmp/dockerfile-platform-");
    fs.writeFileSync(path.join(dir, "Dockerfile"), `
  FROM --platform=linux/amd64 alpine:3 AS dev
  CMD ["echo"]
  HEALTHCHECK CMD true
  FROM --platform=linux/amd64 alpine:3 AS prod
  CMD ["echo"]
  HEALTHCHECK CMD true
  FROM --platform=linux/amd64 alpine:3 AS test
  CMD ["echo"]
    `);
    try {
      expect(() => assertMainDockerfileContract(dir, "dev")).not.toThrow();
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
  ```
  **Current Result on Codebase:** Fails with:
  ```text
  ConfigError: Missing required Dockerfile target dev (source=.../Dockerfile, path=Dockerfile.dev, stage=dev, composition=service)
  ```
- **Expected Behavior**:
  `assertMainDockerfileContract` must allow arbitrary flags (such as `--platform=...`) on `FROM` instructions, extracting the correct image parent and stage alias.
- **How to Fix the Bug**:
  In [`src/core/checkers/checkDockerfileContract.ts:17`](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/src/core/checkers/checkDockerfileContract.ts#L17), update the regex:
  ```ts
  const from = /^FROM\s+(?:--\S+\s+)*(\S+)(?:\s+AS\s+(\S+))?/i.exec(line);
  ```

---

### Bug 4: Stale V2 `dependsOn` Property Name Leaks in Compose Lifecycle Cycle Error Diagnostics

- **Location**: [`src/core/config/lifecycleGraph.ts:5`](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/src/core/config/lifecycleGraph.ts#L5)
- **The Bug**:
  ```ts
  const visit = (node: string): void => {
    if (visiting.has(node)) {
      const start = stack.indexOf(node);
      const cycle = [...stack.slice(start), node];
      throw new ConfigError({
        ...context,
        configPath: "dependsOn",
        referencedObject: cycle.join(" -> "),
        reason: `Lifecycle cycle detected: ${cycle.join(" -> ")}`
      });
    }
    ...
  };
  ```
  The error thrown attributes Compose lifecycle cycle violations to `configPath: "dependsOn"`.
- **Why It Is a Bug**:
  In Builder V3, `dependsOn` is an obsolete V2 concept. `spec_v3.0.0.md §95` ("Removed Build Concepts") and `§96` ("Removed Mesh Concepts") explicitly list `dependsOn` as removed.
  In Compose YAML, service lifecycle ordering is declared via `services.<name>.depends_on`.
  When `assertComposeLifecycleAcyclic` runs on a Compose file (such as `e2e/compose.yml` or an ordinary service compose file), attributing the error to `configPath: "dependsOn"`:
  1. Points the developer to a property name that does not exist in Compose specification (`dependsOn` instead of `depends_on`).
  2. Breaks programmatic error handlers and IDE linters that expect valid V3 configuration paths (e.g. `services.depends_on`).
- **How to Create a Test for the Bug (Failing Test)**:
  ```ts
  import { describe, it, expect } from "vitest";
  import { assertComposeLifecycleAcyclic } from "./src/core/composition/assertComposeLifecycleAcyclic.js";
  import { ConfigError } from "./src/errors/ConfigError.js";

  it("assertComposeLifecycleAcyclic attributes cycle error to services.depends_on rather than V2 dependsOn", () => {
    try {
      assertComposeLifecycleAcyclic(
        {
          runner: { image: "node:22-alpine", depends_on: ["helper"] },
          helper: { image: "node:22-alpine", depends_on: ["runner"] },
        },
        { sourceFile: "compose.yml", stage: "e2e", composition: "service" }
      );
      expect.unreachable("Expected cycle error");
    } catch (err) {
      expect(err).toBeInstanceOf(ConfigError);
      expect((err as ConfigError).context.configPath).toBe("services.depends_on");
    }
  });
  ```
  **Current Result on Codebase:** Fails with:
  ```text
  AssertionError: expected 'dependsOn' to be 'services.depends_on'
  - Expected: "services.depends_on"
  + Received: "dependsOn"
  ```
- **Expected Behavior**:
  The `configPath` on `ConfigError` must be `"services.depends_on"`.
- **How to Fix the Bug**:
  In [`src/core/config/lifecycleGraph.ts:5`](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/src/core/config/lifecycleGraph.ts#L5), replace:
  ```ts
  configPath: "dependsOn"
  ```
  with:
  ```ts
  configPath: "services.depends_on"
  ```

---

### Bug 5: `compileApplicationEnv` Overrides Caller-Provided `validationMode: false`

- **Location**: [`src/core/compileApplicationEnv.ts:25`](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/src/core/compileApplicationEnv.ts#L25)
- **The Bug**:
  ```ts
  export function compileApplicationEnv(
    stage: Environment,
    projectDir: string,
    options: CompileEnvironmentOptions = {},
    resolver: ResolveComposeConfig = resolveComposeConfig,
  ): Record<string, string> {
    const dir = resolveProjectDir(projectDir);
    const compiled = compileServiceComposition(stage, dir, { ...options, validationMode: true });
  ```
  `{ ...options, validationMode: true }` hardcodes `validationMode: true`, clobbering `options.validationMode`.
- **Why It Is a Bug**:
  `CompileEnvironmentOptions` ([`compileEnvironment.ts:4`](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/src/core/compileEnvironment.ts#L4)) defines:
  ```ts
  export interface CompileEnvironmentOptions {
    silenceWarnings?: boolean | undefined;
    full?: boolean | undefined;
    validationMode?: boolean | undefined;
  }
  ```
  When `validationMode` is `true`, [`allocateHostPorts`](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/src/core/config/hostPorts.ts#L19-L27) assigns dummy placeholder port `60000` for `AUTO` ports rather than reading existing cached ports from `.builder/ports-v3.json` or probing available ports.
  When an SDK consumer or CLI command calls `compileApplicationEnv(stage, dir, { validationMode: false })` to retrieve the real runtime environment for execution outside of Docker (e.g. running a binary locally against services), `validationMode: true` overrides the option and returns dummy port 60000.
- **How to Create a Test for the Bug (Failing Test)**:
  ```ts
  import { describe, it, expect } from "vitest";
  import { compileApplicationEnv } from "./src/core/compileApplicationEnv.js";
  import { basicBuild, writeBasic } from "./tests/v3/support/fixtures.js";
  import fs from "node:fs";
  import path from "node:path";

  it("compileApplicationEnv preserves caller-specified validationMode: false", () => {
    const b = basicBuild();
    b.services.main.endpoints = { http: { port: 8080, publicPort: "AUTO", primary: true } };
    b.services.main.env = { PORT: "${main.endpoints.http.public_port}" };
    const root = writeBasic(b);
    fs.mkdirSync(path.join(root, ".builder"), { recursive: true });
    fs.writeFileSync(
      path.join(root, ".builder/ports-v3.json"),
      JSON.stringify({ version: 1, allocations: { "main.endpoints.http": 9450 } })
    );
    try {
      const env = compileApplicationEnv("dev", root, { validationMode: false }, () => ({
        services: { main: { environment: { PORT: "9450" } } }
      }));
      expect(env.PORT).toBe("9450");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
  ```
  **Current Result on Codebase:** The test fails because `compileApplicationEnv` passes `validationMode: true`, causing `allocateHostPorts` to ignore `.builder/ports-v3.json` and allocate `60000`.
- **Expected Behavior**:
  `compileApplicationEnv` should default to `validationMode: true` when `options.validationMode` is omitted, but respect `validationMode: false` when explicitly provided.
- **How to Fix the Bug**:
  In [`src/core/compileApplicationEnv.ts:25`](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/src/core/compileApplicationEnv.ts#L25), change:
  ```ts
  const compiled = compileServiceComposition(stage, dir, { validationMode: true, ...options });
  ```

---

### Bug 6: Compose `validateServiceCompose` Misattributes `build.json` `service` Mismatch to Compose File

- **Location**: [`src/core/composition/validateServiceCompose.ts:28`](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/src/core/composition/validateServiceCompose.ts#L28)
- **The Bug**:
  ```ts
  if (Object.keys(endpoints).length) {
    const primary = Object.values(endpoints).find(endpoint => endpoint.primary);
    representative = primary!.service;
    if (declaration.service && declaration.service !== representative) {
      fail("service", "top-level service must equal primary endpoint owner");
    }
  }
  ```
  `fail` throws `ConfigError` with `sourceFile: context.composePath` and `configPath: "service"`.
- **Why It Is a Bug**:
  `declaration.service` is declared in `build.json` (or `mesh.json`'s `extends` overlay) under `services.<name>.service`.
  Compose files do NOT have a top-level `service` field (they have `services: { ... }`).
  When this validation fires during composition (e.g., if mesh `extends` overwrites `service` or `endpoints`), the error claims that `redis.compose.yml` has an invalid property `service: top-level service must equal primary endpoint owner`.
  The developer examines `redis.compose.yml` and finds no `service` key, causing severe confusion.
- **How to Create a Test for the Bug (Failing Test)**:
  ```ts
  import { describe, it, expect } from "vitest";
  import { validateServiceCompose } from "./src/core/composition/validateServiceCompose.js";
  import { ConfigError } from "./src/errors/ConfigError.js";

  it("validateServiceCompose does not report compose file as origin of build.json service mismatch", () => {
    const decl: any = {
      compose: "db.yml",
      service: "wrong-container",
      endpoints: { db: { port: 5432, service: "db", primary: true } }
    };
    const doc: any = { services: { db: { image: "postgres:16" } } };
    try {
      validateServiceCompose("db", decl, doc, {
        composePath: "/app/db.yml",
        stage: "prod",
        composition: "service",
        healthRequired: false,
        prerequisite: false
      });
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(ConfigError);
      // The error should NOT attribute the top-level service mismatch to db.yml
      expect((err as ConfigError).context.sourceFile).not.toBe("/app/db.yml");
    }
  });
  ```
  **Current Result on Codebase:** Fails because `(err as ConfigError).context.sourceFile` is `"/app/db.yml"`.
- **Expected Behavior**:
  The error must attribute `sourceFile` to the JSON file where `declaration.service` originated, or `applyMeshExtends` must validate the invariant so that composition never receives an invalid `declaration.service`.
- **How to Fix the Bug**:
  In [`src/core/composition/validateServiceCompose.ts:28`](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/src/core/composition/validateServiceCompose.ts#L28), if `declaration.origin` is present, use `declaration.origin.sourceFile` and `${declaration.origin.configPath}.service` for the `ConfigError`.

---

## 4. Implementation Fix Plan

### 4.1 Decision Protocol: Test-Driven Verification

Each proposed fix MUST be gated by a reproducing test:
1. **Write Reproduction Test**: Before applying any source code change, execute the proposed reproduction test against the current codebase.
2. **Evaluate Test Result**:
   - If the test **FAILS** with the exact error documented above, the bug is confirmed real and reproducible. **PROCEED** with the code change.
   - If the test **PASSES**, the bug is NOT real (or already addressed). **ABORT** the code change and document the finding.
3. **Apply Fix**: Make the minimal, surgical edit to the implementation file.
4. **Re-run Test**: Confirm the test now **PASSES**.
5. **Full Regression Check**: Run `pnpm test:v3:fast` to ensure 0 regressions across all 367+ tests.

---

### 4.2 Step-by-Step Code Changes

#### Change 1: Fix `readDotenvValues` Quote Slicing
- **Target File**: [`src/core/composition/dotenv.ts`](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/src/core/composition/dotenv.ts#L12-L18)
- **Change Description**: Replace `value.indexOf(quote)` with an unescaped double-quote scanner that counts backslashes before quotes to find the true terminating quote.
- **Test File**: Add test case `[ENV21] readDotenvValues preserves escaped double quotes and unescapes correctly` to [`tests/v3/environmentMatrix.test.ts`](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/tests/v3/environmentMatrix.test.ts).

#### Change 2: Add Colon Separator Support in `assertDotenvDoesNotDefineKeys`
- **Target File**: [`src/core/config/builderEnvironment.ts`](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/src/core/config/builderEnvironment.ts#L15)
- **Change Description**: Change `\s*=` to `\s*[:=]` in the regex matching dotenv keys.
- **Test File**: Add test case `[ENV22] assertDotenvDoesNotDefineKeys catches Builder-owned keys defined with colon separator` to [`tests/v3/environmentMatrix.test.ts`](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/tests/v3/environmentMatrix.test.ts).

#### Change 3: Allow Platform and Build Flags on `FROM` in Dockerfile Contract
- **Target File**: [`src/core/checkers/checkDockerfileContract.ts`](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/src/core/checkers/checkDockerfileContract.ts#L17)
- **Change Description**: Change `^FROM\s+(\S+)` to `^FROM\s+(?:--\S+\s+)*(\S+)` so leading flags like `--platform=<platform>` do not consume the image token or suppress the stage alias.
- **Test File**: Add test case `[LIF23] assertMainDockerfileContract accepts FROM with --platform flags` to [`tests/v3/lifecycleMatrix.test.ts`](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/tests/v3/lifecycleMatrix.test.ts).

#### Change 4: Update Lifecycle Cycle Error `configPath` to V3 Naming
- **Target File**: [`src/core/config/lifecycleGraph.ts`](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/src/core/config/lifecycleGraph.ts#L5)
- **Change Description**: Change `configPath: "dependsOn"` to `configPath: "services.depends_on"`.
- **Test File**: Add test case `[LIF24] assertComposeLifecycleAcyclic attributes cycle error to services.depends_on` to [`tests/v3/lifecycleMatrix.test.ts`](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/tests/v3/lifecycleMatrix.test.ts).

#### Change 5: Respect `validationMode: false` in `compileApplicationEnv`
- **Target File**: [`src/core/compileApplicationEnv.ts`](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/src/core/compileApplicationEnv.ts#L25)
- **Change Description**: Change `{ ...options, validationMode: true }` to `{ validationMode: true, ...options }`.
- **Test File**: Add test case `[CLI09] compileApplicationEnv respects caller-specified validationMode: false` to [`tests/v3/publicApiMatrix.test.ts`](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/tests/v3/publicApiMatrix.test.ts).

#### Change 6: Preserve Error Attribution in `validateServiceCompose`
- **Target File**: [`src/core/composition/validateServiceCompose.ts`](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/src/core/composition/validateServiceCompose.ts#L28)
- **Change Description**: Use `declaration.origin` (when available) for `sourceFile` and `configPath` when reporting top-level `service` mismatch.
- **Test File**: Add test case to [`tests/v3/composeMatrix.test.ts`](file:///home/erwin/Documents/solid-stack-digital/test/ssd-ecosystem/builder/tests/v3/composeMatrix.test.ts).

---

## 5. Verification Commands

Upon implementing the fix plan, run the complete suite of verification commands:

```bash
# 1. Typecheck the codebase
pnpm typecheck

# 2. Run all fast V3 tests
pnpm test:v3:fast

# 3. Run all unit and conformance tests
pnpm test

# 4. Verify Docker acceptance tests (when Docker daemon is active)
pnpm test:docker
```
