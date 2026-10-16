import { describe,expect,it } from "vitest";
import { executionProfile } from "../../src/core/config/executionProfile.js";
import { handleServiceUp } from "../../src/commands/service/commands/up/handler.js";
import { handleMeshUp } from "../../src/commands/mesh/commands/up/handler.js";
const rows=[
 {operation:"service dev",stage:"dev",composition:"service",full:false,target:"dev",mode:"dev",infra:"isolated",tester:false},
 {operation:"service dev full",stage:"dev",composition:"service",full:true,target:"dev",mode:"dev",infra:"integrated",tester:false},
 {operation:"service prod",stage:"prod",composition:"service",full:false,target:"prod",mode:"prod",infra:"integrated",tester:false},
 {operation:"service unit",stage:"test",composition:"service",full:false,target:"test",mode:"test",infra:"isolated",tester:false},
 {operation:"service e2e",stage:"e2e",composition:"service",full:false,target:"prod",mode:"prod",infra:"integrated",tester:true},
 {operation:"mesh dev",stage:"dev",composition:"mesh",full:false,target:"dev",mode:"dev",infra:"integrated",tester:false},
 {operation:"mesh prod",stage:"prod",composition:"mesh",full:false,target:"prod",mode:"prod",infra:"integrated",tester:false},
 {operation:"mesh e2e",stage:"e2e",composition:"mesh",full:false,target:"prod",mode:"prod",infra:"integrated",tester:true},
] as const;
describe("V3 execution profiles and public flags",()=>{
 it.each(rows)("[RUN01] $operation",row=>{const x=executionProfile(row.stage,row.composition,row.full);expect(x).toMatchObject({configStage:row.stage,envStage:row.stage,mainTarget:row.target,execMode:row.mode,infraMode:row.infra,attachTester:row.tester});});
 it("[RUN17] e2e is a config stage, never an execution mode",()=>{for(const row of rows)expect(executionProfile(row.stage,row.composition,row.full).execMode).not.toBe("e2e");});
 it("[CLI02] rejects --full for non-dev and detach for test before compile",async()=>{await expect(handleServiceUp("prod",{full:true,projectDir:"missing"})).rejects.toThrow(/--full/);await expect(handleServiceUp("test",{detach:true,projectDir:"missing"})).rejects.toThrow(/--detach/);});
 it.each(["test-unit","test-e2e","e2e"])("[MSH14] public mesh %s phase is rejected",async stage=>{await expect(handleMeshUp(stage,{projectDir:"missing",skipChecks:true})).rejects.toThrow(/mesh up test/);});
});
