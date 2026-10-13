import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fixture, cleanupFixtures } from './conformance/fixture.js';
import * as state from '../src/utils/runState.js';
import { runCompose } from '../src/core/runCompose.js';
import { teardownCompose } from '../src/core/teardownCompose.js';
import { runTestUnit } from '../src/core/runners/runTestUnit.js';
import { runTestE2e } from '../src/core/runners/runTestE2e.js';
import { runMeshTestE2e } from '../src/core/mesh/runners/runMeshTestE2e.js';
import { handleServiceDown } from '../src/commands/service/commands/down/handler.js';
import { handleMeshDown } from '../src/commands/mesh/commands/down/handler.js';

vi.mock('../src/core/runCompose.js', () => ({ runCompose: vi.fn() }));
vi.mock('../src/core/teardownCompose.js', () => ({ teardownCompose: vi.fn() }));
vi.mock('../src/core/compileEnvironment.js', () => ({ compileEnvironment: () => 'name: audit\nservices: {app: {image: alpine}}' }));
vi.mock('../src/core/mesh/compileMeshEnvironment.js', () => ({ compileMeshEnvironment: () => ({ yaml: 'name: audit\nservices: {app: {image: alpine}}', testerServiceName: 'tester' }) }));
vi.mock('../src/utils/checkPortCollision.js', () => ({ checkHostPortCollisions: vi.fn(), extractHostPorts: () => [] }));
beforeEach(() => {
  vi.mocked(runCompose).mockReset().mockResolvedValue(0);
  vi.mocked(teardownCompose).mockReset().mockResolvedValue(undefined);
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => { vi.restoreAllMocks(); cleanupFixtures(); });

const runners = [
  { name: 'service unit', run: runTestUnit, childState: false },
  { name: 'service E2E', run: runTestE2e, childState: false },
  { name: 'mesh E2E', run: runMeshTestE2e, childState: false },
];
function project() {
  return fixture({ app: {} }, {
    'mesh.json': { services: { api: { path: 'api' } }, tester: { compose: 'tester.yml', service: 'tester' } },
    'api/build.json': { app: {} },
  });
}
describe.each(runners)('$name cleanup failures', ({ name, run, childState }) => {
  it('retains saved state and aborts before execution when initial cleanup fails', async () => {
    const root = project(), stateDir = childState ? path.join(root, 'api') : root;
    state.writeRunState(stateDir, { projectName: 'previous', projectDir: stateDir, stage: 'test-unit' });
    const previous = state.readRunState(stateDir);
    const write = vi.spyOn(state, 'writeRunState');
    const clear = vi.spyOn(state, 'clearRunState');
    const error = new Error('initial teardown failed');
    vi.mocked(teardownCompose).mockRejectedValueOnce(error);
    await expect(run({ projectDir: root, debug: false, detach: false })).rejects.toBe(error);
    expect(runCompose).not.toHaveBeenCalled();
    expect(write).not.toHaveBeenCalled();
    expect(clear).not.toHaveBeenCalled();
    expect(state.readRunState(stateDir)).toEqual(previous);
  });

  it('rejects successful execution when final cleanup fails and retains recovery state', async () => {
    const root = project(), stateDir = childState ? path.join(root, 'api') : root;
    const clear = vi.spyOn(state, 'clearRunState');
    const error = new Error('final teardown failed');
    vi.mocked(teardownCompose).mockResolvedValueOnce(undefined).mockRejectedValueOnce(error);
    await expect(run({ projectDir: root, debug: false, detach: false })).rejects.toBe(error);
    expect(runCompose).toHaveBeenCalledTimes(name === 'service unit' ? 1 : 3);
    expect(clear).not.toHaveBeenCalled();
    expect(state.readRunState(stateDir)).toMatchObject({ projectDir: stateDir });
  });

  it('retains execution and cleanup errors together', async () => {
    const root = project();
    const execution = new Error('execution failed'), cleanup = new Error('cleanup failed');
    vi.mocked(runCompose).mockRejectedValueOnce(execution);
    vi.mocked(teardownCompose).mockResolvedValueOnce(undefined).mockRejectedValueOnce(cleanup);
    await expect(run({ projectDir: root, debug: false, detach: false }))
      .rejects.toMatchObject({ errors: [execution, cleanup] });
  });

  it('clears recovery state after successful cleanup', async () => {
    const root = project(), stateDir = childState ? path.join(root, 'api') : root;
    await expect(run({ projectDir: root, debug: false, detach: false })).resolves.toBe(0);
    expect(state.readRunState(stateDir)).toBeNull();
    expect(teardownCompose).toHaveBeenCalledTimes(2);
  });
});

it.each([handleServiceDown, handleMeshDown])('down rejects and retains state when cleanup fails', async down => {
  const root = project();
  state.writeRunState(root, { projectName: 'previous', projectDir: root, stage: 'test-unit' });
  const previous = state.readRunState(root);
  vi.mocked(teardownCompose).mockRejectedValueOnce(new Error('down failed'));
  await expect(down('test', { projectDir: root })).rejects.toThrow('down failed');
  expect(state.readRunState(root)).toEqual(previous);
});
