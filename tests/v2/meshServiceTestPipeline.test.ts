import { afterEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
const {runTest}=vi.hoisted(()=>({runTest:vi.fn()}));
vi.mock("../../src/core/runners/runTest.js",()=>({runTest}));
import { runMeshServiceTests } from "../../src/core/mesh/runners/runMeshServiceTests.js";

const roots:string[]=[];afterEach(()=>{vi.clearAllMocks();for(const root of roots.splice(0))fs.rmSync(root,{recursive:true,force:true});});
function mesh(config:unknown){const root=fs.mkdtempSync(path.join(os.tmpdir(),"mesh-service-pipeline-"));roots.push(root);fs.writeFileSync(path.join(root,"mesh.json"),JSON.stringify(config));return root;}
describe("canonical mesh Phase 1 service tests",()=>{
 it("PIPE-001 runs only root services in deterministic order",async()=>{const root=mesh({services:{zeta:{path:"zeta"},alpha:{path:"alpha"},middle:{path:"middle"}},e2e:{services:{"only-e2e":{path:"only-e2e"}}}});runTest.mockResolvedValue(0);expect(await runMeshServiceTests({projectDir:root})).toBe(0);expect(runTest.mock.calls.map(call=>call[0].projectDir)).toEqual([path.join(root,"alpha"),path.join(root,"middle"),path.join(root,"zeta")]);});
 it("PIPE-002 stops after the first failing service lifecycle",async()=>{const root=mesh({services:{alpha:{path:"alpha"},middle:{path:"middle"},zeta:{path:"zeta"}}});runTest.mockResolvedValueOnce(0).mockResolvedValueOnce(5);expect(await runMeshServiceTests({projectDir:root})).toBe(5);expect(runTest).toHaveBeenCalledTimes(2);});
 it("PIPE-003 uses root paths rather than test-stage path overrides",async()=>{const root=mesh({services:{api:{path:"api"}},test:{services:{api:{path:"alternate"}}}});runTest.mockResolvedValue(0);await runMeshServiceTests({projectDir:root});expect(runTest.mock.calls[0]![0].projectDir).toBe(path.join(root,"api"));});
 it("PIPE-004 forwards execution flags and does not require global tester",async()=>{const root=mesh({services:{api:{path:"api"}}});runTest.mockResolvedValue(0);await runMeshServiceTests({projectDir:root,debug:true,dryRun:true});expect(runTest).toHaveBeenCalledWith(expect.objectContaining({debug:true,detach:false,dryRun:true,skipBanner:true,projectDir:path.join(root,"api")}));});
});
