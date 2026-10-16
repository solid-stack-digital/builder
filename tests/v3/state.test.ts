import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { clearRunState, getRunStatePath, readRunState, writeRunState } from "../../src/utils/runState.js";
import { fixtureDir } from "./support/fixtures.js";
const sample=(root:string)=>({projectName:"v3-test-project",stage:"test-e2e",projectDir:root,composition:"service" as const,configStage:"e2e" as const,workflow:"test" as const,runtimeServiceNames:["main"],testerServiceNames:["tester--runner"]});
describe("saved V3 runtime state",()=>{
 it("[OPS04] preserves exact runtime identity even if configuration changes",()=>{const root=fixtureDir("state");writeRunState(root,sample(root));fs.writeFileSync(path.join(root,"build.json"),"{ broken");expect(readRunState(root)).toMatchObject({projectName:"v3-test-project",stage:"test-e2e",runtimeServiceNames:["main"]});});
 it("[OPS05] writes atomically before runtime can start",()=>{const root=fixtureDir("atomic");writeRunState(root,sample(root));const file=getRunStatePath(root);expect(JSON.parse(fs.readFileSync(file,"utf8")).version).toBe(3);expect(fs.readdirSync(path.dirname(file)).filter(name=>name.endsWith(".tmp"))).toEqual([]);});
 it("[OPS07] rejects malformed, foreign and future saved state",()=>{const root=fixtureDir("invalid-state"),file=getRunStatePath(root);fs.mkdirSync(path.dirname(file),{recursive:true});for(const content of ["{bad",JSON.stringify({projectName:"!",stage:"dev",projectDir:root}),JSON.stringify({...sample(root),projectDir:fixtureDir("foreign")}),JSON.stringify({...sample(root),version:99})]){fs.writeFileSync(file,content);expect(()=>readRunState(root)).toThrow(/Cannot read saved Builder run state/);}});
 it("[OPS08] accepts V2 saved identity for cleanup without V2 compilation",()=>{const root=fixtureDir("v2state"),file=getRunStatePath(root);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,JSON.stringify({...sample(root),version:2}));expect(readRunState(root)?.projectName).toBe("v3-test-project");});
 it("[OPS11] clears only its own state file",()=>{const root=fixtureDir("clear-state"),sentinel=path.join(root,"sentinel");fs.writeFileSync(sentinel,"safe");writeRunState(root,sample(root));clearRunState(root);expect(readRunState(root)).toBeNull();expect(fs.readFileSync(sentinel,"utf8")).toBe("safe");});
});
