import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { registerActiveCompose, resetSignalHandlersForTests } from '../src/core/composeCleanup.js';
import { teardownCompose } from '../src/core/teardownCompose.js';
import { fixture, cleanupFixtures } from './conformance/fixture.js';
import { readRunState, writeRunState } from '../src/utils/runState.js';
vi.mock('../src/core/teardownCompose.js', () => ({ teardownCompose: vi.fn() }));
beforeEach(() => {
  resetSignalHandlersForTests();
  vi.mocked(teardownCompose).mockReset();
  vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => { resetSignalHandlersForTests(); vi.restoreAllMocks(); cleanupFixtures(); });

it('waits for signal cleanup and ignores a repeated shutdown signal', async () => {
  let finish!: () => void;
  vi.mocked(teardownCompose).mockReturnValueOnce(new Promise<void>(resolve => { finish = resolve; }));
  registerActiveCompose('services: {}', process.cwd());
  process.emit('SIGTERM');
  process.emit('SIGTERM');
  expect(teardownCompose).toHaveBeenCalledTimes(1);
  expect(process.exit).not.toHaveBeenCalled();
  finish();
  await vi.waitFor(() => expect(process.exit).toHaveBeenCalledExactlyOnceWith(143));
});

it('reports failed signal cleanup, tries remaining projects, and retains saved state', async () => {
  const root = fixture();
  writeRunState(root, { projectName: 'active', projectDir: root, stage: 'test-unit' });
  const previous = readRunState(root);
  const error = new Error('down failed');
  vi.mocked(teardownCompose).mockRejectedValueOnce(error).mockResolvedValueOnce(undefined);
  registerActiveCompose('first', root);
  registerActiveCompose('second', root);
  process.emit('SIGINT');
  await vi.waitFor(() => expect(process.exit).toHaveBeenCalledExactlyOnceWith(130));
  expect(teardownCompose).toHaveBeenCalledTimes(2);
  expect(console.error).toHaveBeenCalledWith('Compose cleanup failed during signal shutdown:', error);
  expect(readRunState(root)).toEqual(previous);
});
