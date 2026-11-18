# Output Modes (`--silent`, `--logfile`) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add global `--silent` and `--logfile <dir>` flags so Builder prints only a one-line result while all output (Builder's and every child process's) is either discarded or written to a per-run log file.

**Architecture:** A single output layer (`src/core/output/`) owns every write. Builder code calls `currentOutput().log/warn/error/write`, and child processes take their stdio from `currentOutput().childStdio()` and `pipeChild()`. The CLI builds the `Output` in a root `preAction` hook and reports the result in `runCli`. Library callers can scope one with `runWithOutput` (AsyncLocalStorage). Normal mode delegates to `console.*` and `inherit`, so 3.2 behavior and the existing console spies in tests are unchanged.

**Tech Stack:** TypeScript ESM, Node ≥ 20 (`node:async_hooks`, `node:util` `stripVTControlCharacters`/`format`), commander, vitest, Docker Compose v2 (`up --wait`, `logs --follow`).

**Spec:** `.docs/specs_v3/feature_spec_v3.3.0.md`

## Global Constraints

- Result copy, exact: `success` (stdout), `failure: <message>` (stderr, silent), `failure (see <absolute log path>)` (stderr, logfile), `running (press Ctrl-C to stop)` (stdout).
- Log file name: `<epoch-ms>-<pid>-<command>.log`. The file is created with flag `wx`, mode `0600`, and synchronous writes. ANSI is stripped, nothing is redacted.
- Guard errors are `ScriptError` with `exitCode: 2` and the exact messages from spec §6.
- Normal mode (no flag) output and exit codes must stay byte-for-byte as in 3.2, except §5 (live test logs), which applies to all modes.
- Fast tests must not spawn `docker`/`curl`/`wget`/`npm`/`pnpm`. Use the existing adapters (`compose`, `spawnProcess`, `spawn` params) and fake children (`EventEmitter` + `PassThrough`).
- Test names carry `[OUTnn]` IDs. Each task registers its IDs in `tests/v3/requirementsCatalog.ts` in the same commit, so `pnpm test:v3:fast` (coverage gate) passes after every task.
- No new `console.*` in `src/` outside `src/core/output/` and `src/bin.ts` (Task 3 enforces this).

## Review Focus

1. **Ctrl-C during a quiet attached run.** The user presses Ctrl-C after `running …`. Teardown must still run, the result must be `success`, and the exit code must be 0. Test: Task 5 `[OUT20]`.
2. **Child output after the log is closed.** A late `data` event from a piped child after `close()` must be ignored, not crash with `EBADF`. Test: Task 1 `[OUT08]` (write-after-close assertion).
3. **Relative `--logfile` with `-C`.** `builder service up prod -C ./svc --logfile logs` must write to `<cwd>/logs`, not `./svc/logs`. Test: Task 4 `[OUT18]`.
4. **Multi-line or prefixed error messages.** AggregateError from `runWithCleanup` and `❌ `-prefixed ScriptErrors must still give a single `failure: …` line. Test: Task 1 `[OUT05]`.
5. **`--logfile` pointing at an existing file.** The command must fail with exit 2 before Docker is touched, and must not overwrite the file. Test: Task 1 `[OUT02]`.

---

### Task 1: Output core

**Files:**
- Create: `src/core/output/types.ts`, `src/core/output/createOutput.ts`, `src/core/output/logFile.ts`, `src/core/output/context.ts`, `src/core/output/index.ts` (re-exports)
- Modify: `tests/v3/requirementsCatalog.ts` (add OUT block, see Step 1b)
- Test: `tests/v3/outputModes.test.ts`

**Interfaces:**
- Produces:
  ```ts
  // types.ts
  export type OutputMode = "normal" | "silent" | "logfile";
  export type ChildStdio = ["inherit","inherit"] | ["ignore","ignore"] | ["pipe","pipe"];
  export type ResultLine = { kind:"success" } | { kind:"running" } | { kind:"failure"; message:string };
  export type OutputOptions = { mode:"normal" } | { mode:"silent" } | { mode:"logfile"; dir:string; command:string };
  export interface OutputSinks { stdout?:NodeJS.WritableStream; stderr?:NodeJS.WritableStream; now?:()=>number; pid?:number; cwd?:string }
  export interface Output {
    readonly mode: OutputMode;
    readonly logPath: string | undefined;          // absolute, logfile mode only
    log(...args:unknown[]):void;                   // util.format semantics
    warn(...args:unknown[]):void;
    error(...args:unknown[]):void;
    write(stream:"stdout"|"stderr", chunk:string|Uint8Array):void; // raw child/captured output
    childStdio():ChildStdio;
    pipeChild(child:{ stdout?:NodeJS.ReadableStream|null; stderr?:NodeJS.ReadableStream|null }):void; // no-op unless logfile
    result(line:ResultLine):void;                  // no-op in normal mode
    close():void;                                  // idempotent; later writes are ignored
  }
  // logFile.ts
  export function logFileName(command:string, now:number, pid:number):string;
  export function openLogFile(dir:string, command:string, sinks?:OutputSinks):{ fd:number; path:string }; // throws ScriptError exitCode 2
  export function formatFailureMessage(error:unknown):string; // strips leading "❌ ", collapses \s*\n\s* to " ", trims
  // createOutput.ts
  export function createOutput(options:OutputOptions, sinks?:OutputSinks):Output;
  // context.ts
  export function currentOutput():Output;          // ALS store ?? process output ?? lazily-created normal output
  export function setProcessOutput(output:Output|undefined):void; // CLI only
  export function runWithOutput<T>(output:Output, fn:()=>T):T;
  ```

- [ ] **Step 1: Write the failing tests** in `tests/v3/outputModes.test.ts`, using a temp dir from `fixtureDir("output")` and `PassThrough` sinks that collect strings.
  - `[OUT01] log file name is <ms>-<pid>-<command>.log`: `logFileName("service up test",1763452800123,48211)` → `"1763452800123-48211-service-up-test.log"`. `logFileName("  Mesh  UP/dev ",1,2)` → `"1-2-mesh-up-dev.log"`. `logFileName("",1,2)` → `"1-2-builder.log"`.
  - `[OUT02] logfile directory is created and a file path is rejected`: opening under `<tmp>/a/b` creates both directories. When the dir path is an existing file, `openLogFile` throws a `ScriptError` with `exitCode` 2 and a message containing `is not a directory`. The existing file's content is unchanged.
  - `[OUT03] log file is private and ANSI-free`: `(fs.statSync(path).mode & 0o777) === 0o600`. After `out.log("\u001b[32mok\u001b[39m")` and `out.write("stdout","\u001b[1mraw\u001b[22m\n")`, the file is `"ok\nraw\n"`.
  - `[OUT04] silent mode prints only the result`: `log`/`warn`/`error`/`write` produce nothing on either sink. `result({kind:"success"})` writes `"success\n"` to stdout. `childStdio()` returns `["ignore","ignore"]`.
  - `[OUT05] silent failure is one line on stderr`: `result({kind:"failure",message:formatFailureMessage(new ScriptError("❌ Bad\n  thing"))})` writes `"failure: Bad thing\n"` to stderr and nothing to stdout. `formatFailureMessage(new AggregateError([],"a\nb"))` returns `"a b"`.
  - `[OUT06] logfile mode streams to file and reports the path`: log lines go to the file only. `result({kind:"success"})` writes `"success\n"` to the terminal stdout and appends `success\n` to the file. A failure writes `` `failure (see ${out.logPath})\n` `` to stderr. `logPath` is absolute and resolved against `sinks.cwd`.
  - `[OUT07] normal mode delegates to console and has no result line`: spying on `console.log`/`warn`/`error`, `out.log("a",1)` calls `console.log("a",1)`. `result(...)` writes nothing. `childStdio()` returns `["inherit","inherit"]`.
  - `[OUT08] piped child output reaches the file in arrival order and late writes are ignored`: `pipeChild({stdout:a,stderr:b})` with two `PassThrough`s. Writing `a:"1\n"`, `b:"2\n"`, `a:"3\n"` gives the file `"1\n2\n3\n"`. After `close()`, `a.write("4\n")` doesn't throw and the file is unchanged. `runWithOutput(silentOut,()=>currentOutput())` returns `silentOut`, and outside it `currentOutput().mode` is `"normal"`.
- [ ] **Step 1b: Register IDs.** In `tests/v3/requirementsCatalog.ts`, add an `outputModeCases` list using the same pattern as `isolatedOverlayCases`, but as explicit `[id, setup]` pairs so later tasks append to it. Use action `"Run V3.3 output mode acceptance case"` and expected `"Output mode behavior matches the V3.3 feature specification"`. Add `OUT01`–`OUT08` now.
- [ ] **Step 2: Run** `pnpm exec vitest run --config vitest.v3.config.ts tests/v3/outputModes.test.ts`. Expected: FAIL, module `src/core/output` not found.
- [ ] **Step 3: Implement** the files in the Interfaces block.
  - Implementation notes:
    - Logfile writes use `fs.writeSync(fd, stripVTControlCharacters(text))`.
    - `log` uses `format(...args)+"\n"`.
    - `pipeChild` attaches `data` listeners that call `write`.
    - `close` uses `closeSync` and sets a closed flag that makes all writes no-ops.
    - The normal output's `write` goes to `process.stdout`/`process.stderr`.
    - `context.ts` uses one module-level `AsyncLocalStorage<Output>`.
  - In `openLogFile`, use `mkdirSync(dir,{recursive:true})`. Catch `EEXIST`/`ENOTDIR` and throw ``new ScriptError(`--logfile path is not a directory: ${abs}`,{exitCode:2})``. Then `openSync(file,"wx",0o600)`.
- [ ] **Step 4: Run** the same command. Expected: PASS. Then run `pnpm test:v3:fast && pnpm typecheck`. Expected: PASS.
- [ ] **Step 5: Commit** `git add src/core/output tests/v3/outputModes.test.ts tests/v3/requirementsCatalog.ts && git commit -m "feat(output): add output modes core"`

### Task 2: Route child-process stdio through Output

**Files:**
- Modify: `src/core/runCompose.ts`, `src/core/teardownCompose.ts`, `src/core/checkers/runStep.ts`, `src/commands/prune/handler.ts`
- Test: `tests/v3/outputChildren.test.ts`

**Interfaces:**
- Consumes: `currentOutput`, `runWithOutput`, `createOutput`, `Output.childStdio/pipeChild/write` (Task 1).
- Produces:
  ```ts
  // runCompose.ts (new export, alongside runCompose)
  export interface FollowHandle { done:Promise<number>; stop():Promise<number> }
  export function followCompose(args:string[], yamlConfig:string, projectDir:string, options?:{ spawnProcess?:typeof spawn }):FollowHandle;
  // teardownCompose.ts
  export interface TeardownOptions { /* existing */ spawnProcess?: typeof spawn }
  ```
  - `followCompose` spawns `docker compose --project-directory <abs> -f - ...args` with stdin `pipe` and output stdio from `currentOutput()`. It does **not** call `registerActiveCompose` or `setActiveChild`, so the signal and cleanup logic stays bound to the primary child. `stop()` sends SIGTERM, resolves with `done`, and is a no-op if the child has already exited.

- [ ] **Step 1: Write the failing tests.** Use a fake child: `EventEmitter` with `stdout`/`stderr` `PassThrough`, `stdin` stub, `kill`. Capture the `stdio` option passed to `spawnProcess`.
  - `[OUT09] runCompose takes stdio from the active output`:
    - Normal mode passes `["pipe","inherit","inherit"]`.
    - Inside `runWithOutput(logfileOut, …)` it passes `["pipe","pipe","pipe"]`. After the fake child writes `"built\n"` to stdout and `"warn\n"` to stderr, then emits `close` 0, the log file contains `"built\nwarn\n"` and the promise resolves to 0.
    - Silent mode passes `["pipe","ignore","ignore"]`.
  - `[OUT10] teardownCompose honors output mode but keeps its own silent flag`:
    - With `spawnProcess` injected under silent output, the stdio is `[…,"ignore","ignore"]`.
    - Under logfile output, it is `"pipe"` and the child is piped.
    - With `{silent:true}`, it is `"ignore"` regardless of mode.
  - `[OUT11] runStep sends captured output through Output`: stub `spawnSync` with `vi.spyOn` on the mocked module, returning `{status:0,stdout:"lint ok\n",stderr:""}`. Under logfile, the file contains `lint ok`. Under silent, nothing reaches `process.stdout.write` (spy). On failure (`status:1`), the check-failed banner lines are in the logfile and it still throws `ScriptError`.
  - `[OUT12] prune output follows the mode`: `handlePrune({}, fakeSpawnSync)` under silent passes `stdio:"pipe"` and nothing is printed. Under logfile, the fake's `stdout` and the final `Builder-owned Docker resources pruned.` line are in the file. Normal mode still passes `"inherit"`.
  - `[OUT12] followCompose does not take over the active child`: after `followCompose(...)`, `isProcessAlive` on the registered active child is unaffected. Assert via `registerActiveCompose` not being called, by checking that `process.listenerCount("SIGINT")` is unchanged. `stop()` calls `kill("SIGTERM")` and resolves with the close code.
- [ ] **Step 1b:** Register `OUT09`–`OUT12` in the catalog.
- [ ] **Step 2: Run** `pnpm exec vitest run --config vitest.v3.config.ts tests/v3/outputChildren.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - **runCompose:** `stdio: ["pipe", ...out.childStdio()]` and `out.pipeChild(child)` after spawn.
  - **teardownCompose `runSpawn`:** the same, unless `silent`, and accept `spawnProcess`.
  - **runStep:** replace `process.stdout.write`/`process.stderr.write`/`console.error` with `out.write`/`out.error`.
  - **prune:** `stdio: out.mode==="normal" ? "inherit" : "pipe"`, then `out.write` the result's stdout/stderr. Its two `console.log` calls become `out.log`.
- [ ] **Step 4: Run** the test file, then `pnpm test:v3:fast && pnpm typecheck`. Expected: PASS. The existing `RUN10` fake-child test must still pass, since normal mode is unchanged.
- [ ] **Step 5: Commit** `feat(output): route child process stdio through output modes`

### Task 3: Migrate every Builder write to Output and gate it

**Files:**
- Modify (each `console.x(...)` → `currentOutput().x(...)`, capture `const out=currentOutput()` once per function):
  - `src/cli.ts` (error printing only. The banner is handled in Task 4)
  - `src/core/runners/{runTest,runTestUnit,runTestE2e,runLongLived,runFiniteTester}.ts`
  - `src/core/mesh/runners/{runMeshTest,runMeshServiceTests,runMeshTestE2e}.ts`
  - `src/core/checkers/{checkInfra,checkDockerfile,checkDockerfileContract,checkYamlFiles}.ts`
  - `src/core/mesh/checkers/checkMesh.ts`
  - `src/core/composeCleanup.ts`, `src/utils/checkDependencies.ts`
  - `src/commands/{service,mesh}/commands/down/handler.ts`
  - `src/commands/service/commands/export/handler.ts` (its `process.stdout.isTTY` checks and readline stay as is)
- Create: `scripts/check-no-console.ts`
- Modify: `package.json` (script `"check:no-console": "tsx scripts/check-no-console.ts"`), `scripts/test-v3.ts` (add `command("console gate","pnpm",["check:no-console"],durations)` next to the legacy gate at line 35)
- Test: `tests/v3/outputModes.test.ts`

**Interfaces:**
- Consumes: `currentOutput` (Task 1).
- Produces: `export function findConsoleWrites(root:string):string[]` in `scripts/check-no-console.ts`. It returns `file:line` entries matching `/\bconsole\.(log|info|warn|error|debug)\(|process\.(stdout|stderr)\.write\(/` under `root`, excluding `src/core/output/**` and `src/bin.ts`. The script exits 1 and prints the list when it is non-empty.

- [ ] **Step 1: Write the failing test** `[OUT24] Builder sources write only through the output layer`: `expect(findConsoleWrites("src")).toEqual([])`. Register `OUT24`.
- [ ] **Step 2: Run** it. Expected: FAIL, listing about 55 locations.
- [ ] **Step 3: Migrate** each call site in the file list. This is mechanical, with no wording changes. Normal mode delegates to `console.*`, so existing spies (`CLI06`, `CLI10`, `RUN14`) keep passing.
- [ ] **Step 4: Run** `pnpm test:v3:fast && pnpm typecheck && pnpm check:no-console`. Expected: PASS.
- [ ] **Step 5: Commit** `refactor(output): send all Builder writes through the output layer`

### Task 4: CLI flags, guards and result reporting

**Files:**
- Create: `src/errors/CommandExitError.ts`
- Modify: `src/cli.ts`, plus every action that calls `process.exit(exitCode)`:
  - `src/commands/check/command.ts:23`
  - `src/commands/prune/command.ts:16`
  - `src/commands/service/commands/{up,down}/command.ts`
  - `src/commands/mesh/commands/{up,down,check}/command.ts`
- Test: `tests/v3/outputCli.test.ts`

**Interfaces:**
- Consumes: `createOutput`, `setProcessOutput`, `currentOutput`, `formatFailureMessage` (Task 1).
- Produces:
  ```ts
  export class CommandExitError extends ScriptError { constructor(exitCode:number) } // message `exited with code ${exitCode}`
  export function outputOptionsFor(rootOpts:{silent?:boolean; logfile?:string}, action:Command):OutputOptions; // in src/cli.ts
  export function assertOutputFlagCombination(quiet:boolean, action:Command):void; // in src/cli.ts; throws ScriptError exitCode 2
  ```
- **Behavior:**
  - Root options: `.option("--silent","Print only the result (success or failure)")` and `.option("--logfile <dir>","Write all output to a new log file in <dir>; print only the result")`.
  - A root `preAction` hook runs `assertOutputFlagCombination`, then `setProcessOutput(createOutput(...))`.
    - In quiet mode, it then logs the banner `pc.dim(\`builder v${version}\`)` through the output.
    - The pre-parse banner in `runCli` is skipped when argv contains `--silent` or `--logfile`.
    - `<command>` for the file name is the ancestor names after the root, plus `action.name()`, plus `action.args`, joined by spaces.
  - In `runCli`:
    - After `parseAsync` resolves: `currentOutput().result({kind:"success"})`.
    - In the catch, in quiet mode, write the existing `❌` text and stack through `out.error`, then `out.result({kind:"failure",message:formatFailureMessage(err)})`.
    - In normal mode, a `CommandExitError` prints nothing (as 3.2 did with `process.exit`). Other errors print as today.
    - Always `out.close()` and `setProcessOutput(undefined)` before exiting.
  - Actions replace `process.exit(exitCode)` with `throw new CommandExitError(exitCode)`.

- [ ] **Step 1: Write the failing tests.** Drive `runCli([...])` with `basicBuild`/`writeBasic` fixtures, `--skip-checks --dry-run` (no Docker), and `vi.spyOn(process.stdout,"write")`/`process.stderr` collectors.
  - `[OUT13] export env rejects output flags`: `runCli(["node","builder","service","export","env","dev","-C",root,"--silent"])` rejects with `ScriptError` `exitCode` 2 and message `--silent and --logfile cannot be used with service export env`. Assert that `checkComposeAvailability` wasn't reached: `spawnSync` for `docker` was never called, which the fast-suite setup would throw on.
  - `[OUT14] dry-run debug rejects output flags`: `service up prod --dry-run --debug --logfile <tmp>` rejects with exit 2 and the §6 message. No file is created in `<tmp>`.
  - `[OUT15] help and version win over output flags`: `runCli(["node","builder","--silent","--version"])` writes the version to stdout. `["node","builder","service","--help","--silent"]` prints help. Neither writes `success`.
  - `[OUT16] silent dry-run prints only success`: `service up prod -C root --skip-checks --dry-run --silent` gives stdout exactly `"success\n"`, empty stderr, and no `builder v` banner.
  - `[OUT17] non-zero exit becomes a failure line`: stub `runProd` via `vi.mock` of `src/core/runners/runProd.js` to resolve 3.
    - Under `--silent`: stderr is `"failure: exited with code 3\n"` and the thrown error has `exitCode` 3.
    - Without flags: nothing extra is printed for the exit and `exitCode` is still 3.
  - `[OUT18] logfile captures the run and resolves relative to cwd`:
    - Run with `--logfile logs` while `process.chdir(tmp)` and `-C <other dir>`.
    - Exactly one `*.log` file exists in `<tmp>/logs`, matching `/^\d{13}-\d+-service-up-prod\.log$/`.
    - Its contents include `builder v` and end with `success\n`.
    - The terminal stdout is exactly `"success\n"`.
  - `[OUT19] output flags are accepted before and after the subcommand`: both `["--silent","service","up","prod",…]` and `["service","up","prod",…,"--silent"]` print only `success`. `--silent --logfile <tmp>` together behaves exactly as `--logfile <tmp>`: one file is created and the terminal shows only `success`. An unknown option under `--silent` keeps commander's usage error, with no `failure:` line.
- [ ] **Step 1b:** Register `OUT13`–`OUT19`.
- [ ] **Step 2: Run** `pnpm exec vitest run --config vitest.v3.config.ts tests/v3/outputCli.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** per the Interfaces and Behavior above.
- [ ] **Step 4: Run** the test file, then `pnpm test:v3:fast && pnpm typecheck`. Expected: PASS. The existing `CLI01`–`CLI11` tests are unchanged.
- [ ] **Step 5: Commit** `feat(cli): add --silent and --logfile with result reporting and guards`

### Task 5: Quiet attached long-running workflows

**Files:**
- Modify: `src/core/runners/runLongLived.ts`
- Test: `tests/v3/outputLongLived.test.ts`

**Interfaces:**
- Consumes: `currentOutput` (Task 1), `runCompose` adapter (existing `LongLivedAdapters.compose`).
- Produces: no new exports. When `!options.detach && currentOutput().mode !== "normal"`, the `up` step becomes this sequence inside the existing `runWithCleanup`:
  1. `compose(["up","--no-build","--detach","--wait",...runtimeServiceNames])`. Non-zero → return it.
  2. `out.result({kind:"running"})`
  3. `status = await compose(["logs","--follow","--no-color",...runtimeServiceNames])`
  4. Return `status === 130 ? 0 : status`.
  
  Cleanup (teardown, port release, run-state clear) is unchanged and always runs.

- [ ] **Step 1: Write the failing tests** with `LongLivedAdapters` stubs (`compose`, `teardown`, `checkPorts`, `inspectImage`) and `runWithOutput(createOutput({mode:"silent"},sinks),…)`, using `compileServiceComposition("prod",root,{validationMode:true})` as `compile`.
  - `[OUT20] quiet attached prod waits, reports running, follows logs and treats Ctrl-C as success`:
    - The compose stub returns 130 for `logs`.
    - Recorded `args[0..]` include `["up","--no-build","--detach","--wait",…]`, then `["logs","--follow","--no-color",…]`.
    - Stdout is `"running (press Ctrl-C to stop)\n"`.
    - The returned status is 0 and `teardown` was called once.
  - `[OUT21] quiet attached startup failure skips running line and tears down`: `up` returns 1, so the status is 1, no `running` line is written, `logs` is never called, and `teardown` is called once.
  - `[OUT21] normal and detached modes keep 3.2 up arguments`: normal mode calls `up --no-build <services>` with no `--wait`. Quiet with `detach:true` calls `up --no-build --detach <services>` with no `logs` call.
- [ ] **Step 1b:** Register `OUT20`, `OUT21`.
- [ ] **Step 2: Run** the file. Expected: FAIL.
- [ ] **Step 3: Implement** the branch in `runLongLived`.
- [ ] **Step 4: Run** the file, then `pnpm test:v3:fast`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(output): quiet attached dev/prod waits for health and follows logs`

### Task 6: Live test logs (all modes)

**Files:**
- Modify: `src/core/runners/runFiniteTester.ts`, `src/core/runners/runTestUnit.ts`
- Modify: `tests/v3/finiteTester.test.ts`. `RUN07` and `RUN14` assert the old `logs` order and the old warning, so update their expected step lists to the new sequence (keep the IDs).
- Test: `tests/v3/outputLiveLogs.test.ts`

**Interfaces:**
- Consumes: `followCompose`, `FollowHandle` (Task 2).
- Produces:
  - `FiniteTesterAdapters.follow?: typeof followCompose`
  - `UnitRuntimeAdapters.follow?: typeof followCompose`. Thread it into `runUnitWithLocalModules` as an extra parameter.
- **New sequence, finite tester:**
  1. `up --detach`. On failure, keep the existing post-hoc `logs --no-color` dump.
  2. `follow(["logs","--follow","--no-color",runner])`
  3. `wait runner`, then inspect
  4. `await Promise.race([handle.done, delay(10_000)])`, then `await handle.stop()`
  5. If other members exist: `compose(["logs","--no-color",...members.filter(m=>m!==runner)])`. A failure there warns via `out.warn("Could not collect tester logs",error)` and keeps the runner status.
- **Unit with local modules:** the same with `main`, and no "others" dump (3.2 only dumped main).

- [ ] **Step 1: Write the failing tests** with a `follow` stub that records args and returns `{done:Promise.resolve(0),stop:async()=>0}`.
  - `[OUT22] finite tester streams runner logs live, then dumps the other members once`: the recorded order is `build, pull, up, follow(logs --follow --no-color <runner>), wait, logs --no-color <members without runner>`. `stop` is called once. The status still comes from `inspectRunnerExit`.
  - `[OUT22] follow that never ends is stopped after the runner exits`: `done` never resolves. With fake timers advanced 10 000 ms, `stop` is called and the run resolves.
  - `[OUT23] unit runs with local modules stream main live`: using the ISO fixture with an `on-inframode-isolated` module (copy the setup from `tests/v3/isolatedOverlay.test.ts` `[ISO21]`), the recorded order is `up --build --detach, follow(logs --follow --no-color <main>), wait <main>`, with no post-hoc `logs` call.
- [ ] **Step 1b:** Register `OUT22`, `OUT23`.
- [ ] **Step 2: Run** `pnpm exec vitest run --config vitest.v3.config.ts tests/v3/outputLiveLogs.test.ts tests/v3/finiteTester.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** the sequences, and update the `RUN07`/`RUN14` expectations.
- [ ] **Step 4: Run** the same command, then `pnpm test:v3:fast`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(runners): stream tester and unit logs live while waiting`

### Task 7: Public API, Docker acceptance, docs and release

**Files:**
- Modify: `src/index.ts` (export `createOutput`, `runWithOutput`, and the types `Output`, `OutputMode`, `OutputOptions`, `ResultLine`)
- Modify: `tests/v3/publicApiMatrix.test.ts`
- Create: `tests/v3/docker/outputModes.test.ts`
- Modify: `tests/v3/requirementsCatalog.ts` (add `"OUT26"` to `dockerCases`)
- Modify: `docs/reference/cli.md` (new `## Output modes` section: flags table, result lines, file naming, rejected combinations, §7 limits), `docs/troubleshooting/docker-and-compose.md` (one paragraph: use `--logfile` to capture a failing run)
- Modify: `CHANGELOG.md` (`## 3.3.0 (source tree; publication not implied)` with `### Added` bullets), `package.json` version `3.3.0`

**Interfaces:**
- Consumes: everything above.

- [ ] **Step 1: Write the failing tests.**
  - `[OUT25] public API exposes scoped output`: in `publicApiMatrix.test.ts`, import `createOutput` and `runWithOutput` from `../../src/index.js`. Inside `runWithOutput(createOutput({mode:"silent"},sinks), () => compileEnvironment("prod",root,{validationMode:true}))`, nothing is written to the sinks. A `.log` file is never created anywhere without `mode:"logfile"`.
  - `[OUT26] logfile captures real build and container output from a Docker run` (in `tests/v3/docker/outputModes.test.ts`, using `dockerFixture("output")` from `tests/v3/docker/support.ts`):
    - Run `node dist/bin.js service up test -C <root> --logfile <tmp>` via `spawnSync`.
    - Terminal stdout is exactly `"success\n"`.
    - The single log file contains a BuildKit line (`/#\d+ /` or `Building`) and a line the fixture's tester prints.
    - `statusByProject(...)` shows no leftover containers.
- [ ] **Step 1b:** Register `OUT25`, `OUT26`. Add `"OUT26"` to `dockerCases`.
- [ ] **Step 2: Run** `pnpm exec vitest run --config vitest.v3.config.ts tests/v3/publicApiMatrix.test.ts`. Expected: FAIL. Then `pnpm build && pnpm exec vitest run --config vitest.v3-docker.config.ts tests/v3/docker/outputModes.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** the exports, then write the docs and changelog. The `cli.md` JSON/bash blocks must pass `tests/v3/documentation.test.ts`. No new pages are added, so `docsManifest.ts` is unchanged.
- [ ] **Step 4: Run** `pnpm test`. Expected: the full gate passes (fast, typecheck, build, legacy gate, console gate, Docker batches, all-case coverage).
- [ ] **Step 5: Commit** `feat: release output modes in 3.3.0`
