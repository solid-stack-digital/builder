import fs from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { compileServiceComposition } from "../../src/core/composition/compileServiceComposition.js";
import { runFiniteTester } from "../../src/core/runners/runFiniteTester.js";
import { runTestUnit } from "../../src/core/runners/runTestUnit.js";
import type { FollowHandle } from "../../src/core/runCompose.js";
import { basicBuild, writeBasic } from "./support/fixtures.js";

type Step={kind:"compose"|"follow"|"stop";args:string[]};
function recorder(done:Promise<number>=Promise.resolve(0)){
 const steps:Step[]=[];
 const compose=async(args:string[])=>{steps.push({kind:"compose",args});return 0;};
 const follow=(args:string[]):FollowHandle=>{steps.push({kind:"follow",args});return {done,stop:async()=>{steps.push({kind:"stop",args});return 0;}};};
 return {steps,compose,follow};
}
const healthy=(name:string)=>`services:\n  ${name}:\n    image: node:22-alpine\n    healthcheck:\n      test: ["CMD", "true"]\n`;

describe("V3.3 live test logs",()=>{
 it("[OUT22] finite tester streams runner logs live, then dumps the other members once",async()=>{
  const root=writeBasic(),compiled=compileServiceComposition("e2e",root,{validationMode:true}),runner=compiled.testerServiceName!,r=recorder();
  const status=await runFiniteTester(compiled,root,{compose:r.compose,follow:r.follow,inspectRunnerExit:()=>7,checkPorts:async()=>{}});
  expect(status).toBe(7);
  const others=[...new Set([...compiled.runtimeServiceNames,...compiled.testerServiceNames])].filter(name=>name!==runner);
  expect(r.steps.map(s=>`${s.kind}:${s.args[0]}`)).toEqual(["compose:build","compose:pull","compose:up","follow:logs","compose:wait","stop:logs","compose:logs"]);
  expect(r.steps.find(s=>s.kind==="follow")!.args).toEqual(["logs","--follow","--no-color",runner]);
  expect(r.steps.at(-1)!.args).toEqual(["logs","--no-color",...others]);
 });
 it("[OUT22] follow that never ends is stopped after the runner exits",async()=>{
  vi.useFakeTimers({toFake:["setTimeout","clearTimeout"]});
  try{
   const root=writeBasic(),compiled=compileServiceComposition("e2e",root,{validationMode:true}),r=recorder(new Promise<number>(()=>{}));
   const pending=runFiniteTester(compiled,root,{compose:r.compose,follow:r.follow,inspectRunnerExit:()=>0,checkPorts:async()=>{}});
   let settled=false;void pending.then(()=>{settled=true;});
   await vi.advanceTimersByTimeAsync(9_999);expect(settled).toBe(false);expect(r.steps.some(s=>s.kind==="stop")).toBe(false);
   await vi.advanceTimersByTimeAsync(1);await pending;
   expect(r.steps.filter(s=>s.kind==="stop")).toHaveLength(1);
  }finally{vi.useRealTimers();}
 });
 it("[OUT23] unit runs with local modules stream main live",async()=>{
  const b:any=basicBuild();
  b.services.devstore={compose:"devstore.yml",endpoints:{http:{service:"devstore",port:3002,primary:true,scheme:"http"}}};
  b.test={"on-inframode-isolated":{services:{main:{requisites:{devstore:"dependency"}}}}};
  const root=writeBasic(b);fs.writeFileSync(path.join(root,"devstore.yml"),healthy("devstore"));
  const r=recorder();
  expect(await runTestUnit({projectDir:root,debug:false,detach:false},{compose:r.compose,follow:r.follow,checkPorts:async()=>{},teardown:async()=>{},inspectExit:()=>4})).toBe(4);
  expect(r.steps.map(s=>`${s.kind}:${s.args.slice(0,2).join(" ")}`)).toEqual(["compose:up --build","follow:logs --follow","compose:wait main","stop:logs --follow"]);
  expect(r.steps[1]!.args).toEqual(["logs","--follow","--no-color","main"]);
 },10_000);
});
