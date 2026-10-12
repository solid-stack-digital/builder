import { expect, it, vi } from 'vitest';
import { runWithCleanup } from '../src/core/runWithCleanup.js';
it.each([0, 5])('returns execution status %i after successful cleanup', async code => {
  const cleanup = vi.fn().mockResolvedValue(undefined);
  await expect(runWithCleanup(async () => code, cleanup)).resolves.toBe(code);
  expect(cleanup).toHaveBeenCalledOnce();
});
it('preserves execution rejection after successful cleanup', async () => {
  const error = new Error('execution failed');
  await expect(runWithCleanup(async () => { throw error; }, async () => {})).rejects.toBe(error);
});
it('retains nonzero execution status when cleanup also fails', async () => {
  const error = new Error('cleanup failed');
  await expect(runWithCleanup(async () => 7, async () => { throw error; })).rejects.toMatchObject({
    message: expect.stringMatching(/exited with code 7.*cleanup failed/),
    errors: [expect.objectContaining({ exitCode: 7 }), error],
  });
});
it('retains even an undefined execution rejection when cleanup also fails', async () => {
  const error = new Error('cleanup failed');
  await expect(runWithCleanup(async () => { throw undefined; }, async () => { throw error; }))
    .rejects.toMatchObject({ errors: [undefined, error] });
});
