import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { parse } from 'yaml';
import { runTest } from '../../src/core/runners/runTest.js';
import { runTestUnit } from '../../src/core/runners/runTestUnit.js';
import { runTestE2e } from '../../src/core/runners/runTestE2e.js';
import { runCompose } from '../../src/core/runCompose.js';
import { teardownCompose } from '../../src/core/teardownCompose.js';
import { cleanupFixtures, fixture } from './fixture.js';
vi.mock('../../src/core/runners/runTestUnit.js',()=>({runTestUnit:vi.fn()}));
vi.mock('../../src/core/runCompose.js',()=>({runCompose:vi.fn()}));
vi.mock('../../src/core/teardownCompose.js',()=>({teardownCompose:vi.fn()}));
vi.mock('../../src/utils/checkPortCollision.js',()=>({checkHostPortCollisions:vi.fn(),extractHostPorts:vi.fn(()=>[])}));
beforeEach(()=>{vi.clearAllMocks();vi.mocked(runTestUnit).mockResolvedValue(0);vi.mocked(runCompose).mockResolvedValue(0);});
afterEach(cleanupFixtures);
it("SVC-006 runs isolated unit before integrated E2E",async()=>{
 const order:string[]=[];vi.mocked(runTestUnit).mockImplementation(async()=>{order.push('unit');return 0;});vi.mocked(runCompose).mockImplementation(async()=>{order.push('e2e');return 0;});
 expect(await runTest({debug:false,detach:false,projectDir:fixture()})).toBe(0);expect(order).toEqual(['unit','e2e','e2e','e2e']);
});
it("SVC-007 stops before E2E after unit failure",async()=>{
 vi.mocked(runTestUnit).mockResolvedValue(7);expect(await runTest({debug:false,detach:false,projectDir:fixture()})).toBe(7);expect(runCompose).not.toHaveBeenCalled();
});
it("SVC-008 propagates E2E failure after passing unit phase",async()=>{
 vi.mocked(runCompose).mockResolvedValueOnce(0).mockResolvedValueOnce(23);expect(await runTest({debug:false,detach:false,projectDir:fixture()})).toBe(23);expect(runTestUnit).toHaveBeenCalledOnce();
});
it("SVC-026 returns finite tester success by waiting for the tester",async()=>{
 expect(await runTestE2e({debug:false,detach:false,projectDir:fixture()})).toBe(0);
 expect(vi.mocked(runCompose).mock.calls.map(call=>call[0])).toEqual([['up','--build','--detach'],['wait','tester'],['logs','--no-color']]);
 expect(teardownCompose).toHaveBeenCalledTimes(2);
});
it("SVC-027 propagates tester exit 23 and cleans up",async()=>{
 vi.mocked(runCompose).mockResolvedValueOnce(0).mockResolvedValueOnce(23);expect(await runTestE2e({debug:false,detach:false,projectDir:fixture()})).toBe(23);expect(teardownCompose).toHaveBeenCalledTimes(2);
});
it("SVC-028 preserves health gating regardless of configured readiness delay",async()=>{
 for(const delay of ['800','1400']) {
  await runTestE2e({debug:false,detach:false,projectDir:fixture({app:{env:{READY_AFTER_MS:delay}}})});
  const c=parse(vi.mocked(runCompose).mock.lastCall![1]);expect(c.services.tester.depends_on.app).toEqual({condition:'service_healthy'});expect(c.services.app.environment.READY_AFTER_MS).toBe(delay);
 }
});
