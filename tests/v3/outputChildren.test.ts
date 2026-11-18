import fs from "node:fs";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createOutput, runWithOutput, type Output } from "../../src/core/output/index.js";
import { followCompose, runCompose } from "../../src/core/runCompose.js";
import { teardownCompose } from "../../src/core/teardownCompose.js";
import { runStep } from "../../src/core/checkers/runStep.js";
import { handlePrune } from "../../src/commands/prune/handler.js";
import { resetSignalHandlersForTests } from "../../src/core/composeCleanup.js";
import { ScriptError } from "../../src/errors/ScriptError.js";
import { fixtureDir } from "./support/fixtures.js";

type FakeChild=EventEmitter&{stdout:PassThrough;stderr:PassThrough;stdin:{on:()=>void;write:()=>void;end:()=>void};exitCode:number|null;signalCode:string|null;kills:string[];kill:(signal:string)=>boolean};
function fakeChild():FakeChild{const child=Object.assign(new EventEmitter(),{stdout:new PassThrough(),stderr:new PassThrough(),stdin:{on:()=>{},write:()=>{},end:()=>{}},exitCode:null as number|null,signalCode:null as string|null,kills:[] as string[],kill:(signal:string)=>{child.kills.push(signal);return true;}});return child;}
function spawner(onSpawn:(child:FakeChild)=>void){const calls:{args:string[];stdio:unknown}[]=[];const spawn=((_cmd:string,args:string[],options:{stdio:unknown})=>{const child=fakeChild();calls.push({args,stdio:options.stdio});setImmediate(()=>onSpawn(child));return child;}) as any;return {spawn,calls};}
const finish=(child:FakeChild,code=0)=>{child.exitCode=code;child.emit("close",code,null);};
const quiet=()=>{const stdout=new PassThrough(),stderr=new PassThrough();return {stdout,stderr};};
const logfile=(label:string):Output=>createOutput({mode:"logfile",dir:fixtureDir(label),command:"test"},quiet());
afterEach(()=>{vi.restoreAllMocks();resetSignalHandlersForTests();});

describe("V3.3 child process output routing",()=>{
 it("[OUT09] runCompose takes stdio from the active output",async()=>{
  const root=fixtureDir("out09");
  const normal=spawner(child=>finish(child));
  expect(await runCompose(["ps"],"services: {}\n",root,{spawnProcess:normal.spawn})).toBe(0);
  expect(normal.calls[0]!.stdio).toEqual(["pipe","inherit","inherit"]);
  const silent=spawner(child=>finish(child));
  await runWithOutput(createOutput({mode:"silent"},quiet()),()=>runCompose(["ps"],"services: {}\n",root,{spawnProcess:silent.spawn}));
  expect(silent.calls[0]!.stdio).toEqual(["pipe","ignore","ignore"]);
  const out=logfile("out09-log"),piped=spawner(child=>{child.stdout.write("built\n");child.stderr.write("warn\n");setImmediate(()=>finish(child));});
  expect(await runWithOutput(out,()=>runCompose(["build"],"services: {}\n",root,{spawnProcess:piped.spawn}))).toBe(0);
  expect(piped.calls[0]!.stdio).toEqual(["pipe","pipe","pipe"]);
  out.close();expect(fs.readFileSync(out.logPath!,"utf8")).toBe("built\nwarn\n");
 });
 it("[OUT10] teardownCompose honors output mode but keeps its own silent flag",async()=>{
  const root=fixtureDir("out10");
  const silent=spawner(child=>finish(child));
  await runWithOutput(createOutput({mode:"silent"},quiet()),()=>teardownCompose("services: {}\n",root,{spawnProcess:silent.spawn}));
  expect(silent.calls[0]!.stdio).toEqual(["pipe","ignore","ignore"]);
  const out=logfile("out10-log"),piped=spawner(child=>{child.stderr.write("Removed\n");setImmediate(()=>finish(child));});
  await runWithOutput(out,()=>teardownCompose("services: {}\n",root,{spawnProcess:piped.spawn}));
  expect(piped.calls[0]!.stdio).toEqual(["pipe","pipe","pipe"]);
  out.close();expect(fs.readFileSync(out.logPath!,"utf8")).toBe("Removed\n");
  const forced=spawner(child=>finish(child)),out2=logfile("out10-forced");
  await runWithOutput(out2,()=>teardownCompose("services: {}\n",root,{silent:true,spawnProcess:forced.spawn}));
  expect(forced.calls[0]!.stdio).toEqual(["pipe","ignore","ignore"]);
 });
 it("[OUT11] runStep sends captured output through Output",()=>{
  const root=fixtureDir("out11"),write=vi.spyOn(process.stdout,"write");
  runWithOutput(createOutput({mode:"silent"},quiet()),()=>runStep("node",["-e","process.stdout.write('lint ok\\n')"],root,{stepName:"Lint"}));
  expect(write.mock.calls.some(([chunk])=>String(chunk).includes("lint ok"))).toBe(false);
  const out=logfile("out11-log");
  runWithOutput(out,()=>runStep("node",["-e","process.stdout.write('lint ok\\n')"],root,{stepName:"Lint"}));
  expect(()=>runWithOutput(out,()=>runStep("node",["-e","process.stderr.write('bad\\n');process.exit(3)"],root,{stepName:"Lint",targetFile:"Dockerfile"}))).toThrow(ScriptError);
  out.close();const text=fs.readFileSync(out.logPath!,"utf8");
  expect(text).toContain("lint ok\n");expect(text).toContain("bad\n");expect(text).toContain("INFRASTRUCTURE CHECK FAILED");expect(text).toContain("Failed Step : Lint");
 });
 it("[OUT12] prune output follows the mode",async()=>{
  const calls:{stdio:unknown}[]=[],spawn=((_cmd:string,_args:string[],options:{stdio:unknown})=>{calls.push({stdio:options.stdio});return {status:0,stdout:"Deleted: abc\n",stderr:""};}) as any;
  const log=vi.spyOn(console,"log").mockImplementation(()=>{});
  await handlePrune({},spawn);
  expect(calls[0]!.stdio).toBe("inherit");
  calls.length=0;log.mockClear();
  await runWithOutput(createOutput({mode:"silent"},quiet()),()=>handlePrune({},spawn));
  expect(calls.every(call=>call.stdio==="pipe")).toBe(true);expect(log).not.toHaveBeenCalled();
  const out=logfile("out12-log");
  await runWithOutput(out,()=>handlePrune({},spawn));
  out.close();const text=fs.readFileSync(out.logPath!,"utf8");
  expect(text).toContain("Deleted: abc\n");expect(text).toContain("Builder-owned Docker resources pruned.");
 });
 it("[OUT12] followCompose does not take over the active child and stops on demand",async()=>{
  const root=fixtureDir("out12-follow"),before=process.listenerCount("SIGINT");
  let spawned!:FakeChild;const {spawn,calls}=spawner(child=>{spawned=child;});
  const handle=followCompose(["logs","--follow","runner"],"services: {}\n",root,{spawnProcess:spawn});
  expect(process.listenerCount("SIGINT")).toBe(before);
  await new Promise(resolve=>setImmediate(resolve));
  spawned.kill=(signal:string)=>{spawned.kills.push(signal);setImmediate(()=>{spawned.signalCode=signal;spawned.emit("close",null,signal);});return true;};
  expect(calls[0]!.args.slice(-3)).toEqual(["logs","--follow","runner"]);
  expect(await handle.stop()).toBe(143);expect(spawned.kills).toEqual(["SIGTERM"]);
  expect(await handle.stop()).toBe(143);expect(spawned.kills).toEqual(["SIGTERM"]);
  expect(await handle.done).toBe(143);
 });
});
