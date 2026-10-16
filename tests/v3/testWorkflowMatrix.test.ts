import fs from "node:fs";
import path from "node:path";
import { afterEach,describe,expect,it,vi } from "vitest";
import { runTest } from "../../src/core/runners/runTest.js";
import type { TestRuntimeAdapters } from "../../src/core/runners/runTest.js";
import { basicBuild,writeBasic } from "./support/fixtures.js";

const options=(root:string)=>({projectDir:root,debug:false,detach:false});
function fakeRuntime(trace:string[],unitStatus=0,e2eStatus=0):TestRuntimeAdapters {
 const teardown=async(_yaml:string,_root:string,options?:{silent?:boolean})=>{trace.push(options?.silent?"preclean":"cleanup");};
 return {unit:{checkPorts:async()=>{},teardown,compose:async(args)=>{trace.push(`unit:${args[0]}`);return unitStatus;}},e2e:{checkPorts:async()=>{},teardown,finite:{compose:async(args)=>{trace.push(`e2e:${args[0]}`);return args[0]==="wait"?0:0;},inspectRunnerExit:()=>e2eStatus}}};
}
afterEach(()=>vi.restoreAllMocks());
describe("V3 standalone test workflow",()=>{
 it("[RUN02] unit cleanup completes before E2E runtime begins",async()=>{vi.spyOn(console,"log").mockImplementation(()=>{});const root=writeBasic(),trace:string[]=[],adapters=fakeRuntime(trace);let release!:()=>void,started!:()=>void;const gate=new Promise<void>(resolve=>release=resolve),cleanupStarted=new Promise<void>(resolve=>started=resolve);let count=0;adapters.unit!.teardown=async(_yaml,_root,opts)=>{if(opts?.silent){trace.push("unit-preclean");return;}trace.push("unit-cleanup-start");count++;started();await gate;trace.push("unit-cleanup-end");};const pending=runTest(options(root),adapters);await cleanupStarted;expect(count).toBe(1);expect(trace.some(x=>x.startsWith("e2e:"))).toBe(false);release();expect(await pending).toBe(0);expect(trace.indexOf("unit-cleanup-end")).toBeLessThan(trace.indexOf("e2e:up"));expect(fs.existsSync(path.join(root,".builder/run.state"))).toBe(false);});
 it("[RUN03] nonzero unit exit propagates and forbids E2E runtime",async()=>{vi.spyOn(console,"log").mockImplementation(()=>{});vi.spyOn(console,"error").mockImplementation(()=>{});const root=writeBasic(),trace:string[]=[],result=await runTest(options(root),fakeRuntime(trace,4));expect(result).toBe(4);expect(trace).toContain("unit:up");expect(trace).toContain("cleanup");expect(trace.some(x=>x.startsWith("e2e:"))).toBe(false);});
 it("[RUN04] unit startup failure cleans and does not advance",async()=>{vi.spyOn(console,"log").mockImplementation(()=>{});const root=writeBasic(),trace:string[]=[],adapters=fakeRuntime(trace);adapters.unit!.compose=async()=>{trace.push("unit:spawn-failure");throw new Error("spawn failed");};await expect(runTest(options(root),adapters)).rejects.toThrow(/spawn failed/);expect(trace).toContain("cleanup");expect(trace.some(x=>x.startsWith("e2e:"))).toBe(false);});
 it("[RUN05] failed unit teardown retains recovery state and stops pipeline",async()=>{vi.spyOn(console,"log").mockImplementation(()=>{});const root=writeBasic(),trace:string[]=[],adapters=fakeRuntime(trace);adapters.unit!.teardown=async(_yaml,_root,opts)=>{if(opts?.silent)return;trace.push("cleanup-failed");throw new Error("down failed");};await expect(runTest(options(root),adapters)).rejects.toThrow(/down failed/);expect(trace.some(x=>x.startsWith("e2e:"))).toBe(false);expect(fs.existsSync(path.join(root,".builder/run.state"))).toBe(true);});
 it("[RUN06] invalid E2E reference fails before unit runtime",async()=>{const b=basicBuild();b.services.tester!.env={BAD:"${missing.endpoints.http.network_host}"};const root=writeBasic(b),trace:string[]=[];await expect(runTest(options(root),fakeRuntime(trace))).rejects.toThrow(/outside effective requisite closure/);expect(trace).toEqual([]);});
});
