import { afterEach, expect, it, vi } from 'vitest';
import { runMeshDev } from '../src/core/mesh/runners/runMeshDev.js';
import { handleMeshDown } from '../src/commands/mesh/commands/down/handler.js';
import { runDev } from '../src/core/runners/runDev.js';
import { handleServiceDown } from '../src/commands/service/commands/down/handler.js';
import { teardownCompose } from '../src/core/teardownCompose.js';
import { readRunState } from '../src/utils/runState.js';
import { cleanupFixtures, fixture, meshFixture } from './conformance/fixture.js';
vi.mock('../src/core/runCompose.js',()=>({runCompose:vi.fn().mockResolvedValue(0)}));
vi.mock('../src/core/teardownCompose.js',()=>({teardownCompose:vi.fn()}));
vi.mock('../src/utils/checkPortCollision.js',()=>({checkHostPortCollisions:vi.fn(),extractHostPorts:vi.fn(()=>[])}));
vi.mock('../src/core/mesh/compileMeshEnvironment.js', async importOriginal => {
 const original = await importOriginal<typeof import('../src/core/mesh/compileMeshEnvironment.js')>();
 return {...original, compileMeshEnvironment: (stage: 'dev'|'prod'|'e2e', root: string) => original.compileMeshEnvironment(stage,root,{validateWithDocker:false})};
});
afterEach(()=>{cleanupFixtures();vi.clearAllMocks();});
it('persists detached mesh anonymous volume owners and supplies them to explicit down',async()=>{
 const root=meshFixture({services:{frontend:{path:'frontend'},backend:{path:'backend'}}},{frontend:{app:{}},backend:{app:{}}});
 await runMeshDev({projectDir:root,detach:true});const state=readRunState(root)!;expect(state.anonymousVolumeServices).toEqual(['backend','frontend']);
 expect(teardownCompose).not.toHaveBeenCalled();await handleMeshDown('dev',{projectDir:root});
 expect(teardownCompose).toHaveBeenCalledWith('',root,{projectName:state.projectName,removeVolumes:false,anonymousVolumeServices:['backend','frontend']});expect(readRunState(root)).toBeNull();
});
it('persists detached standalone anonymous volume owners',async()=>{
 const root=fixture();await runDev({projectDir:root,detach:true,debug:false});const state=readRunState(root)!;expect(state.anonymousVolumeServices).toEqual(['app']);
 await handleServiceDown('dev',{projectDir:root});expect(teardownCompose).toHaveBeenCalledWith('',root,{projectName:state.projectName,removeVolumes:false,anonymousVolumeServices:['app']});
});
