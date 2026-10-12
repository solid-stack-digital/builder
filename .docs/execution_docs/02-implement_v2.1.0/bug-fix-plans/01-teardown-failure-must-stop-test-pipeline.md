# 01 — Fail the test pipeline when teardown fails

**ID:** V210-001. **Priority:** High. **Status:** implemented and verified on 2026-10-12. The original reproduction and implementation plan are preserved below.

## Bug, trigger, and impact

`teardownCompose()` retries failed `docker compose down`, then logs or suppresses the error and resolves `Promise<void>`. A successful test runner followed by two failed cleanup attempts is therefore indistinguishable from a clean teardown to its caller.

Service unit/E2E runners call teardown in `finally`, then call `clearRunState`. The mesh pipeline trusts their successful completion and advances to the next service or global E2E. This can retain containers, dependency state, networks, and host bindings while deleting the saved state needed to clean them up. Failed initial stale-project cleanup also allows a new run to begin.

This is a failure-path bug. The normal sequential ordering is already implemented correctly.

## Why this violates the specifications

- `EXECUTION_MODEL.md` §6 requires full teardown after each service and no Phase-1 runtime state in Phase 2.
- `SPECS_V2.md` §2.5 says any failure stops the pipeline; §29 requires teardown of the active composition and complete phase isolation.
- `MESH_JSON_DOCS.md` §12 describes independent service lifecycles before a clean global E2E phase.

A best-effort cleanup attempt does not establish successful teardown. If cleanup cannot be established, Builder must fail and retain recovery information.

## Code evidence

- [teardownCompose.ts](../../../../src/core/teardownCompose.ts): lines 112–137 retry, then only print errors; `silent: true` hides the failure completely.
- [runTestUnit.ts](../../../../src/core/runners/runTestUnit.ts) and [runTestE2e.ts](../../../../src/core/runners/runTestE2e.ts): cleanup followed by `clearRunState` in `finally`.
- [runMeshTestE2e.ts](../../../../src/core/mesh/runners/runMeshTestE2e.ts) and [runMeshTestUnit.ts](../../../../src/core/mesh/runners/runMeshTestUnit.ts): equivalent cleanup/state handling.
- [runMeshServiceTests.ts](../../../../src/core/mesh/runners/runMeshServiceTests.ts) and [runMeshTest.ts](../../../../src/core/mesh/runners/runMeshTest.ts): advance after a successful promise/status.

## Exact red test

Destination: `tests/v210-audit-cleanup.test.ts`. The following is the exact executed test; both spawned cleanup commands emit exit code 1. No Docker process is started.

```ts
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { spawn } from 'node:child_process';
import { afterEach, expect, it, vi } from 'vitest';
import { teardownCompose } from '../src/core/teardownCompose.js';
vi.mock('node:child_process', () => ({ spawn: vi.fn(() => {
  const child = Object.assign(new EventEmitter(), { stdin: new PassThrough(), kill: vi.fn() });
  queueMicrotask(() => child.emit('close', 1));
  return child;
}) }));
afterEach(() => vi.clearAllMocks());
it('V210-001 rejects when both cleanup attempts fail', async () => {
  const outcome = await teardownCompose('services: {app: {image: alpine}}', process.cwd(), { removeVolumes: true, silent: true }).then(() => ({ rejected: false }), error => ({ rejected: true, error }));
  expect(spawn).toHaveBeenCalledTimes(2);
  expect(outcome.rejected).toBe(true);
});

```

Command:

```bash
pnpm exec vitest run tests/v210-audit-cleanup.test.ts -t V210-001
```

Observed: `spawn` was called twice; `outcome.rejected` was `false`, expected `true`. The approximately one-second duration is the real retry delay. The test confirms the implementation swallows both failures, rather than merely assuming a runner might do so.

**Gate:** proceed only for this false-success failure. If the promise rejects already, stop: this bug is not present under this reproduction.

## Expected behavior

Successful cleanup resolves. A failed first attempt followed by a successful retry resolves. Exhausted nonzero exits, process errors, or timeouts reject with useful context. `silent` controls output, not success semantics. Test sequencing must stop, and saved run state must remain if final teardown fails.

## Implementation steps and snippets

1. In `src/core/teardownCompose.ts`, import the existing `ScriptError` class:

```ts
import { ScriptError } from '../errors/ScriptError.js';
```

2. Keep the retry, volume flags, project selection, and outer `finally`. Replace the logging-only result branch at the end with:

```ts
if (result.error || result.status !== 0) {
  const detail = result.error?.message ?? `exit code ${result.status ?? 'unknown'}`;
  throw new ScriptError(
    `Failed to tear down Compose project in ${absProjectDir} after two attempts: ${detail}`,
    result.error ? { cause: result.error } : undefined,
  );
}
```

`ScriptError` accepts the optional constructor options used elsewhere in `runCompose.ts`; check its signature if it changes. Do not include the YAML or environment values in the error. Preserve `setTearingDown(false)` in the outer `finally`, even when rejecting.

3. Keep `clearRunState` strictly **after successful** teardown in every runner. The current sequential statements already achieve this once teardown rejects:

```ts
finally {
  await teardownCompose(finalYamlConfig, options.projectDir, { removeVolumes: true });
  clearRunState(options.projectDir);
}
```

Do not move `clearRunState` into an unconditional nested `finally`. Do not catch cleanup failure and return a prior successful test exit status.

4. Inspect all callers with `rg -n 'teardownCompose|clearRunState' src`. Down commands and process-signal cleanup need deliberate error propagation/logging. Awaited command handlers should fail. Signal handlers that cannot rethrow safely should log a concise error and exit nonzero while retaining run state. Do not introduce an unhandled rejected promise in a fire-and-forget cleanup callback.

5. Preserve recovery state on failed pre-run cleanup. Existing stale cleanup executes before writing new run state; rejection must prevent the subsequent `writeRunState`/`runCompose` calls. A previously saved state file must not be erased by a caller's catch branch.

6. When an execution error and cleanup error both occur, ensure diagnostics retain the execution error in addition to reporting cleanup failure. This is a secondary diagnostic concern; do not let it weaken the required nonzero outcome. An `AggregateError` or a `ScriptError` with the execution error as cause is acceptable if a runner already has error handling that would otherwise hide it.

## Additional permanent tests

Add these to the cleanup test and runner suites after the red gate confirms the defect. Use a mock spawn with a queue of results and reset it per test.

| Case | Stimulus | Required assertion |
|---|---|---|
| Immediate success | close 0 | resolves; exactly one down invocation |
| Retry recovery | close 1, close 0 | resolves; exactly two downs |
| Exhaustion, noisy/silent | close 1, close 1 with either `silent` value | rejects in both cases |
| Spawn failure | emit `error` on both attempts | rejects with cause/message |
| Timeout | child never closes; advance fake timers through both timeouts and retry | rejects; kill called; no success |
| Successful run / failed final teardown | mock `runCompose` -> 0, pre-clean -> resolved, final cleanup -> rejected | runner rejects; `clearRunState` not called |
| Failed pre-cleanup | initial cleanup rejects | `runCompose` and new `writeRunState` not called |
| Mesh propagation | root service lifecycle rejects on cleanup | next service and global E2E not invoked |

For runner tests, reuse existing mocks in `tests/v2/serviceRunners.test.ts` and `tests/v2/meshRunners.test.ts`; do not mock the behavior being checked in the direct teardown regression. Add at least one pipeline case to `tests/v2/meshServiceTestPipeline.test.ts` where `runTest.mockRejectedValue(new Error('teardown failed'))`; assert rejection and exactly one service call.

## Completion checks and risks

Run the exact gate, cleanup regressions, service/mesh runner tests, then the final checks in plan 00. Existing callers that relied on swallowed errors may now fail; that is required for command/test correctness, but audit signal-handler rejection handling carefully. This change cannot guarantee Docker cleanup succeeds; it guarantees Builder never reports a failed cleanup as a clean test boundary.

## Implementation record — 2026-10-12

The unmodified implementation failed the exact V210-001 gate: two failed cleanup attempts returned success. The implementation therefore proceeded under the required red-test gate.

Changes applied:

- `teardownCompose` now throws `ScriptError` after both down attempts fail, including silent mode, process errors, and timeouts. The final process error remains available as `cause`, and the teardown signal guard is reset in `finally`.
- Service and mesh runners use `runWithCleanup` to preserve both execution and cleanup failures, including nonzero execution exit codes. The combined message contains both diagnostics for ordinary CLI output. Saved run state is cleared only after successful cleanup.
- Failed initial cleanup prevents execution and prevents overwriting previous run state. Existing down handlers propagate failure and retain state.
- Signal shutdown awaits sequential cleanup, reports failures, attempts remaining active projects, and exits with the signal's nonzero status. It does not erase saved recovery state.
- Permanent tests cover initial/final cleanup failure in all four test runners, successful cleanup, recovery-state persistence, down commands, signal shutdown, retry recovery/exhaustion, process errors/timeouts, and propagation through service and mesh pipelines.

Validation:

- Original red gate: failed as documented before source edits.
- Cleanup-focused tests: 21 passed.
- Runner, signal, combined-error, and pipeline tests: 36 passed.
- Full suite: 60 files / 731 tests passed.
- Conformance: 16 files / 495 tests passed.
- TypeScript check and removed-V1-token check passed.
- Final diagnostic-message change: 23 focused tests passed; TypeScript check passed again.

No live Docker acceptance tests were run; process outcomes were simulated and recovery-state persistence was checked with real temporary state files. Plans 02–07 remain separate work.
