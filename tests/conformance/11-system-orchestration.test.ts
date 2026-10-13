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
const parsedCalls=()=>vi.mocked(runCompose).mock.calls.map(call=>parse(call[1]));
beforeEach(()=>{vi.clearAllMocks();vi.mocked(runCompose).mockReset().mockResolvedValue(0);});
afterEach(cleanupFixtures);

it("SYS-010 runs each root service unit and E2E lifecycle before global E2E",async()=>{
 expect(await runMeshTest({projectDir:system()})).toBe(0);const calls=parsedCalls();expect(calls).toHaveLength(11);
 expect(calls[0].services.app.build.target).toBe('test');expect(calls[0].services.app.environment.EXEC_MODE).toBe('test');
 for(const index of [1,5]){const c=calls[index];expect(c.services.app.build.target).toBe('prod');expect(c.services.app.environment).toMatchObject({EXEC_MODE:'prod',INFRA_MODE:'integrated'});expect(c.services.tester.build.target).toBe('test-e2e');expect(c.services.tester.environment.EXEC_MODE).toBe('e2e');expect(c.services.tester.environment.INFRA_MODE).toBeUndefined();}
 expect(calls[4].services.app.build.target).toBe('test');expect(Object.keys(calls[8].services)).toContain('a');
 expect(vi.mocked(runCompose).mock.calls.map(call=>call[0])).toEqual([['up','--build','--abort-on-container-exit','--exit-code-from','app'],['up','--build','--detach'],['wait','tester'],['logs','--no-color'],['up','--build','--abort-on-container-exit','--exit-code-from','app'],['up','--build','--detach'],['wait','tester'],['logs','--no-color'],['up','--build','--detach'],expect.arrayContaining(['wait']),['logs','--no-color']]);
});
it("SYS-011 stops after the first service unit failure",async()=>{const root=system();vi.mocked(runCompose).mockResolvedValueOnce(7);expect(await runMeshTest({projectDir:root})).toBe(7);expect(runCompose).toHaveBeenCalledTimes(1);expect(teardownCompose).toHaveBeenCalledTimes(2);});
it("SYS-012 stops after first service E2E failure",async()=>{const root=system();vi.mocked(runCompose).mockResolvedValueOnce(0).mockResolvedValueOnce(0).mockResolvedValueOnce(7);expect(await runMeshTest({projectDir:root})).toBe(7);expect(runCompose).toHaveBeenCalledTimes(4);expect(teardownCompose).toHaveBeenCalledTimes(4);});
it("SYS-013 stops after second service unit failure",async()=>{const root=system();vi.mocked(runCompose).mockResolvedValueOnce(0).mockResolvedValueOnce(0).mockResolvedValueOnce(0).mockResolvedValueOnce(0).mockResolvedValueOnce(7);expect(await runMeshTest({projectDir:root})).toBe(7);expect(runCompose).toHaveBeenCalledTimes(5);expect(teardownCompose).toHaveBeenCalledTimes(6);});
it("SYS-014 stops after second service E2E failure",async()=>{const root=system();for(let i=0;i<6;i++)vi.mocked(runCompose).mockResolvedValueOnce(0);vi.mocked(runCompose).mockResolvedValueOnce(7);expect(await runMeshTest({projectDir:root})).toBe(7);expect(runCompose).toHaveBeenCalledTimes(8);expect(teardownCompose).toHaveBeenCalledTimes(8);});
it("SYS-015 global tester waits for every healthy app",async()=>{expect(await runMeshTest({projectDir:system()})).toBe(0);const [args,yaml]=vi.mocked(runCompose).mock.calls.at(-2)!;const c=parse(yaml);const name=args[1]!;expect(args).toEqual(['wait',name]);expect(c.services[name].depends_on).toMatchObject({a:{condition:'service_healthy'},b:{condition:'service_healthy'}});});
it("SYS-016 propagates global E2E failure after four service executions",async()=>{for(let i=0;i<9;i++)vi.mocked(runCompose).mockResolvedValueOnce(0);vi.mocked(runCompose).mockResolvedValueOnce(23);expect(await runMeshTest({projectDir:system()})).toBe(23);expect(runCompose).toHaveBeenCalledTimes(11);});
it("SYS-017 tears down every finite topology and clears run state",async()=>{const root=system();expect(await runMeshTest({projectDir:root})).toBe(0);expect(teardownCompose).toHaveBeenCalledTimes(10);expect(readRunState(root)).toBeNull();expect(readRunState(`${root}/a`)).toBeNull();expect(readRunState(`${root}/b`)).toBeNull();});
it("SYS-018 tears down and clears state after a thrown process error",async()=>{const root=system();for(let i=0;i<9;i++)vi.mocked(runCompose).mockResolvedValueOnce(0);vi.mocked(runCompose).mockRejectedValueOnce(new Error('process failed'));await expect(runMeshTest({projectDir:root})).rejects.toThrow('process failed');expect(teardownCompose).toHaveBeenCalledTimes(10);expect(readRunState(root)).toBeNull();});

vi.mock('../../src/core/mesh/compileMeshEnvironment.js', async importOriginal => {
 const original = await importOriginal<typeof import('../../src/core/mesh/compileMeshEnvironment.js')>();
 return {...original, compileMeshEnvironment: (stage: 'dev'|'prod'|'e2e', root: string) => original.compileMeshEnvironment(stage,root,{validateWithDocker:false})};
});
