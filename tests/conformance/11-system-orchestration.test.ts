import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { parse } from 'yaml';
import { runMeshTest } from '../../src/core/mesh/runners/runMeshTest.js';
import { runCompose } from '../../src/core/runCompose.js';
import { teardownCompose } from '../../src/core/teardownCompose.js';
import { readRunState } from '../../src/utils/runState.js';
import { cleanupFixtures, meshFixture } from './fixture.js';
vi.mock('../../src/core/runCompose.js',()=>({runCompose:vi.fn()}));
vi.mock('../../src/core/teardownCompose.js',()=>({teardownCompose:vi.fn()}));
vi.mock('../../src/utils/checkPortCollision.js',()=>({checkHostPortCollisions:vi.fn(),extractHostPorts:vi.fn(()=>[])}));
const system=()=>meshFixture({services:{a:{path:'a'},b:{path:'b'}},tester:{compose:'t.yml',service:'runner'}},{a:{app:{}},b:{app:{}}},{'t.yml':{services:{runner:{image:'alpine'}}}});
beforeEach(()=>{vi.clearAllMocks();vi.mocked(runCompose).mockReset().mockResolvedValue(0);});
afterEach(cleanupFixtures);
it("SYS-010 runs every isolated service test before global E2E",async()=>{
 expect(await runMeshTest({projectDir:system()})).toBe(0);
 const calls=vi.mocked(runCompose).mock.calls;expect(calls).toHaveLength(3);
 for(const call of calls.slice(0,2)){const c=parse(call[1]);expect(Object.keys(c.services)).toEqual(['app']);expect(c.services.app.environment.INFRA_MODE).toBe('isolated');expect(c.services.app.build.target).toBe('test');}
 expect(Object.keys(parse(calls[2]![1]).services)).toContain('a');
});
it("SYS-011 aborts global E2E after required unit failure",async()=>{
 vi.mocked(runCompose).mockResolvedValueOnce(0).mockResolvedValueOnce(7);expect(await runMeshTest({projectDir:system()})).toBe(7);expect(runCompose).toHaveBeenCalledTimes(2);
});
it("SYS-012 global tester waits for all healthy apps after passing units",async()=>{
 expect(await runMeshTest({projectDir:system()})).toBe(0);const [args,yaml]=vi.mocked(runCompose).mock.lastCall!;const c=parse(yaml);const name=args[args.indexOf('--exit-code-from')+1]!;
 expect(c.services[name].depends_on).toEqual({a:{condition:'service_healthy'},b:{condition:'service_healthy'}});
});
it("SYS-013 propagates global tester failure",async()=>{
 vi.mocked(runCompose).mockResolvedValueOnce(0).mockResolvedValueOnce(0).mockResolvedValueOnce(23);expect(await runMeshTest({projectDir:system()})).toBe(23);
});
it("SYS-014 cleans successful finite topology and clears run state",async()=>{
 const root=system();expect(await runMeshTest({projectDir:root})).toBe(0);expect(teardownCompose).toHaveBeenCalledTimes(6);expect(readRunState(root)).toBeNull();expect(readRunState(`${root}/a`)).toBeNull();expect(readRunState(`${root}/b`)).toBeNull();
 expect(teardownCompose).toHaveBeenLastCalledWith(expect.any(String),root,{removeVolumes:true});
});
it("SYS-015 cleans failed finite topology including thrown process errors",async()=>{
 const root=system();vi.mocked(runCompose).mockResolvedValueOnce(0).mockResolvedValueOnce(0).mockRejectedValueOnce(new Error('process failed'));
 await expect(runMeshTest({projectDir:root})).rejects.toThrow('process failed');expect(teardownCompose).toHaveBeenCalledTimes(6);expect(readRunState(root)).toBeNull();
});

vi.mock('../../src/core/mesh/compileMeshEnvironment.js', async importOriginal => {
 const original = await importOriginal<typeof import('../../src/core/mesh/compileMeshEnvironment.js')>();
 return {...original, compileMeshEnvironment: (stage: 'dev'|'prod'|'e2e', root: string) => original.compileMeshEnvironment(stage,root,{validateWithDocker:false})};
});
