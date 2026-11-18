import { PassThrough } from "node:stream";
import { describe, expect, it } from "vitest";
import { compileServiceComposition } from "../../src/core/composition/compileServiceComposition.js";
import { createOutput, runWithOutput } from "../../src/core/output/index.js";
import { runLongLived } from "../../src/core/runners/runLongLived.js";
import { writeBasic } from "./support/fixtures.js";

function silent(){const stdout=new PassThrough(),stderr=new PassThrough(),seen={stdout:""};stdout.on("data",d=>seen.stdout+=String(d));return {out:createOutput({mode:"silent"},{stdout,stderr}),seen};}
function harness(statuses:Record<string,number>){
 const root=writeBasic(),calls:string[][]=[],downs:number[]=[];
 const compile=(validationMode:boolean)=>compileServiceComposition("prod",root,{validationMode});
 const adapters={checkPorts:async()=>{},compose:async(args:string[])=>{calls.push(args);return statuses[args[0]!]??0;},teardown:async()=>{downs.push(1);}};
 return {root,calls,downs,compile,adapters};
}
const step=(calls:string[][],name:string)=>calls.find(call=>call[0]===name);

describe("V3.3 quiet attached long-running workflows",()=>{
 it("[OUT20] quiet attached prod waits, reports running, follows logs and treats Ctrl-C as success",async()=>{
  const h=harness({logs:130}),{out,seen}=silent();
  const status=await runWithOutput(out,()=>runLongLived("prod",h.root,{projectDir:h.root,debug:false,detach:false},h.compile,"service",h.adapters as any));
  expect(status).toBe(0);
  expect(step(h.calls,"up")!.slice(0,4)).toEqual(["up","--no-build","--detach","--wait"]);
  expect(step(h.calls,"logs")!.slice(0,3)).toEqual(["logs","--follow","--no-color"]);
  expect(h.calls.findIndex(c=>c[0]==="logs")).toBeGreaterThan(h.calls.findIndex(c=>c[0]==="up"));
  expect(seen.stdout).toBe("running (press Ctrl-C to stop)\n");
  expect(h.downs).toHaveLength(1);
 });
 it("[OUT20] a follower that ends on its own keeps its status",async()=>{
  const h=harness({logs:2}),{out}=silent();
  expect(await runWithOutput(out,()=>runLongLived("prod",h.root,{projectDir:h.root,debug:false,detach:false},h.compile,"service",h.adapters as any))).toBe(2);
  expect(h.downs).toHaveLength(1);
 });
 it("[OUT21] quiet attached startup failure skips running line and tears down",async()=>{
  const h=harness({up:1}),{out,seen}=silent();
  expect(await runWithOutput(out,()=>runLongLived("prod",h.root,{projectDir:h.root,debug:false,detach:false},h.compile,"service",h.adapters as any))).toBe(1);
  expect(seen.stdout).toBe("");expect(step(h.calls,"logs")).toBeUndefined();expect(h.downs).toHaveLength(1);
 });
 it("[OUT21] normal and detached modes keep 3.2 up arguments",async()=>{
  const normal=harness({});
  await runLongLived("prod",normal.root,{projectDir:normal.root,debug:false,detach:false},normal.compile,"service",normal.adapters as any);
  expect(step(normal.calls,"up")!).not.toContain("--wait");expect(step(normal.calls,"up")!).not.toContain("--detach");expect(step(normal.calls,"logs")).toBeUndefined();
  const detached=harness({}),{out}=silent();
  await runWithOutput(out,()=>runLongLived("prod",detached.root,{projectDir:detached.root,debug:false,detach:true},detached.compile,"service",detached.adapters as any));
  expect(step(detached.calls,"up")!.slice(0,3)).toEqual(["up","--no-build","--detach"]);expect(step(detached.calls,"up")!).not.toContain("--wait");expect(step(detached.calls,"logs")).toBeUndefined();
 });
});
