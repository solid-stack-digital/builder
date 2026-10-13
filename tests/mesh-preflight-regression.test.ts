import { runMeshDev } from "../src/core/mesh/runners/runMeshDev.js";
import { beforeEach, expect, it, vi } from 'vitest';
import { handleMeshUp } from '../src/commands/mesh/commands/up/handler.js';
import { checkMesh } from '../src/core/mesh/checkers/checkMesh.js';
vi.mock('../src/core/mesh/checkers/checkMesh.js',()=>({checkMesh:vi.fn()}));
vi.mock('../src/core/mesh/runners/runMeshDev.js',()=>({runMeshDev:vi.fn().mockResolvedValue(0)}));
vi.mock('../src/core/mesh/runners/runMeshProd.js',()=>({runMeshProd:vi.fn().mockResolvedValue(0)}));
vi.mock('../src/core/mesh/runners/runMeshTestE2e.js',()=>({runMeshTestE2e:vi.fn().mockResolvedValue(0)}));
vi.mock('../src/core/mesh/runners/runMeshTest.js',()=>({runMeshTest:vi.fn().mockResolvedValue(0)}));
beforeEach(()=>{vi.clearAllMocks();vi.mocked(checkMesh).mockReset();});
it.each(['dev','prod','test-e2e','test'])('checks contracts once for mesh %s',async stage=>{
 await handleMeshUp(stage,{dryRun:true});expect(checkMesh).toHaveBeenCalledExactlyOnceWith(process.cwd(),{requireTester:stage==='test'||stage==='test-e2e'});
});
it('rejects contract failure even for dry run',async()=>{
 vi.mocked(checkMesh).mockImplementation(()=>{throw new Error('Dockerfile dev healthcheck required');});
 await expect(handleMeshUp('dev',{dryRun:true,skipChecks:false})).rejects.toThrow(/healthcheck/);expect(runMeshDev).not.toHaveBeenCalled();
});
it('honors explicit skip-checks',async()=>{await handleMeshUp('dev',{skipChecks:true});expect(checkMesh).not.toHaveBeenCalled();});
