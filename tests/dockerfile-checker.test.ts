import { spawnSync } from 'node:child_process';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { checkDockerfileContract } from '../src/core/checkers/checkDockerfileContract.js';
import { CONFTEST_IMAGE } from '../src/core/checkers/constants.js';
import { getDockerfilePolicyDir } from '../src/core/templates.js';
import { cleanupFixtures, fixture } from './conformance/fixture.js';
vi.mock('node:child_process',()=>({spawnSync:vi.fn()}));
beforeEach(()=>{vi.mocked(spawnSync).mockReset().mockReturnValue({status:0,stdout:'',stderr:'',pid:1,output:[],signal:null});});
afterEach(cleanupFixtures);
it('selects packaged V2 policy, selected Dockerfile and read-only project mount',()=>{
 const root=fixture({app:{},dockerfile:'docker/App.Dockerfile'},{'docker/App.Dockerfile':'FROM alpine'});
 checkDockerfileContract({app:{},dockerfile:'docker/App.Dockerfile'},root);
 expect(spawnSync).toHaveBeenCalledExactlyOnceWith('docker', ['run','--rm','--network','none','--mount',`type=bind,src=${root},dst=/project,readonly`,'--mount',`type=bind,src=${getDockerfilePolicyDir()},dst=/builder-policy,readonly`,'-w','/project',CONFTEST_IMAGE,'test','docker/App.Dockerfile','-p','/builder-policy'],expect.objectContaining({cwd:root}));
});
it('propagates nonzero Conftest status through the real process wrapper',()=>{
 vi.mocked(spawnSync).mockReturnValue({status:7,stdout:'',stderr:'',pid:1,output:[],signal:null});
 expect(()=>checkDockerfileContract({app:{}},fixture())).toThrow(/Dockerfile Contract/);
});
it('propagates process startup errors',()=>{
 vi.mocked(spawnSync).mockReturnValue({status:null,error:new Error('unavailable'),stdout:'',stderr:'',pid:1,output:[],signal:null});
 expect(()=>checkDockerfileContract({app:{}},fixture())).toThrow(/unavailable/);
});
