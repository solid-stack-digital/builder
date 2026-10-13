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
 it("PIPE-003 uses root paths rather than prod/e2e path overrides",async()=>{const root=mesh({services:{api:{path:"api"}},prod:{services:{api:{path:"alternate"}}},e2e:{services:{api:{path:"e2e-alternate"}}}});runTest.mockResolvedValue(0);await runMeshServiceTests({projectDir:root});expect(runTest.mock.calls[0]![0].projectDir).toBe(path.join(root,"api"));});
 it("PIPE-004 forwards execution flags and does not require global tester",async()=>{const root=mesh({services:{api:{path:"api"}}});runTest.mockResolvedValue(0);await runMeshServiceTests({projectDir:root,debug:true,dryRun:true});expect(runTest).toHaveBeenCalledWith(expect.objectContaining({debug:true,detach:false,dryRun:true,skipBanner:true,projectDir:path.join(root,"api")}));});
});

it("does not start the next root service after cleanup rejects", async () => {
 const root = mesh({services:{alpha:{path:"alpha"},zeta:{path:"zeta"}}});
 const error = new Error("teardown failed");
 runTest.mockRejectedValueOnce(error);
 await expect(runMeshServiceTests({projectDir:root})).rejects.toBe(error);
 expect(runTest).toHaveBeenCalledTimes(1);
});

it("waits for each standalone lifecycle before starting another", async () => {
 const root = mesh({services:{beta:{path:"beta"},alpha:{path:"alpha",env:{OWNER:"mesh"},publish:[],dependsOn:["beta"]}},prod:{services:{extra:{path:"extra"}}}});
 let release!: (value: number) => void;
 let started!: () => void;
 const entered = new Promise<void>(resolve => { started = resolve; });
 runTest.mockImplementationOnce(() => { started(); return new Promise<number>(resolve => { release = resolve; }); }).mockResolvedValueOnce(0);
 const pending = runMeshServiceTests({projectDir:root});
 await entered;
 expect(runTest).toHaveBeenCalledTimes(1);
 expect(runTest.mock.calls[0]![0]).toEqual({projectDir:path.join(root,"alpha"),debug:false,detach:false,skipBanner:true,silenceWarnings:false});
 release(0);
 expect(await pending).toBe(0);
 expect(runTest).toHaveBeenCalledTimes(2);
});
