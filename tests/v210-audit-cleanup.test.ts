import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { spawn } from 'node:child_process';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { teardownCompose } from '../src/core/teardownCompose.js';
import { setTearingDown } from '../src/core/composeCleanup.js';

vi.mock('node:child_process', () => ({ spawn: vi.fn() }));
vi.mock('../src/core/composeCleanup.js', () => ({ setTearingDown: vi.fn() }));
const yaml = 'services: {app: {image: alpine}}';
const kills: ReturnType<typeof vi.fn>[] = [];
type Outcome = number | Error | 'timeout';
function results(...outcomes: Outcome[]) {
  for (const outcome of outcomes) {
    vi.mocked(spawn).mockImplementationOnce(() => {
      const child = Object.assign(new EventEmitter(), { stdin: new PassThrough(), kill: vi.fn() });
      kills.push(child.kill);
      queueMicrotask(() => {
        if (outcome instanceof Error) child.emit('error', outcome);
        else if (outcome !== 'timeout') child.emit('close', outcome);
      });
      return child as unknown as ReturnType<typeof spawn>;
    });
  }
}
beforeEach(() => { vi.useFakeTimers(); vi.resetAllMocks(); kills.length = 0; });
afterEach(() => vi.useRealTimers());

it('V210-001 rejects when both cleanup attempts fail', async () => {
  results(1, 1);
  const outcome = teardownCompose(yaml, process.cwd(), { removeVolumes: true, silent: true })
    .then(() => ({ rejected: false }), () => ({ rejected: true }));
  await vi.runAllTimersAsync();
  expect(spawn).toHaveBeenCalledTimes(2);
  expect((await outcome).rejected).toBe(true);
  expect(setTearingDown).toHaveBeenLastCalledWith(false);
});

it.each([[0], [1, 0]])('resolves after successful cleanup: %j', async (...codes) => {
  results(...codes);
  const check = expect(teardownCompose(yaml, process.cwd())).resolves.toBeUndefined();
  await vi.runAllTimersAsync();
  await check;
  expect(spawn).toHaveBeenCalledTimes(codes.length);
  expect(setTearingDown).toHaveBeenLastCalledWith(false);
});

it.each([false, true])('rejects failed cleanup even when silent=%s', async silent => {
  results(1, 2);
  const check = expect(teardownCompose(yaml, process.cwd(), { silent }))
    .rejects.toThrow(/after two attempts: exit code 2/);
  await vi.runAllTimersAsync();
  await check;
});

it('retains the final process error as cause', async () => {
  const error = new Error('spawn failed');
  results(error, error);
  const check = expect(teardownCompose(yaml, process.cwd())).rejects.toMatchObject({ cause: error });
  await vi.runAllTimersAsync();
  await check;
  expect(setTearingDown).toHaveBeenLastCalledWith(false);
});

it('rejects after two process timeouts and kills both children', async () => {
  results('timeout', 'timeout');
  const check = expect(teardownCompose(yaml, process.cwd())).rejects.toThrow(/timed out after 60000ms/);
  await vi.runAllTimersAsync();
  await check;
  expect(spawn).toHaveBeenCalledTimes(2);
  for (const kill of kills) expect(kill).toHaveBeenCalledExactlyOnceWith('SIGKILL');
  expect(setTearingDown).toHaveBeenLastCalledWith(false);
});
