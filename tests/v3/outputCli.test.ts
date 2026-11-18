import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { runCli } from "../../src/cli.js";
import { ScriptError } from "../../src/errors/ScriptError.js";
import { setProcessOutput } from "../../src/core/output/index.js";
import { fixtureDir, writeBasic } from "./support/fixtures.js";

const forced=vi.hoisted(()=>({prod:undefined as number|undefined}));
vi.mock("../../src/core/runners/runProd.js",async importOriginal=>{const actual=await importOriginal<typeof import("../../src/core/runners/runProd.js")>();return {...actual,runProd:async(...args:Parameters<typeof actual.runProd>)=>forced.prod??actual.runProd(...args)};});

vi.mock("../../src/utils/checkDependencies.js",async importOriginal=>({...await importOriginal<object>(),checkDependencies:()=>{}}));

/** Capture terminal writes, including console.* (which writes through process.stdout/stderr). */
function terminal(){
 const seen={stdout:"",stderr:""};
 vi.spyOn(process.stdout,"write").mockImplementation((chunk:any)=>{seen.stdout+=String(chunk);return true;});
 vi.spyOn(process.stderr,"write").mockImplementation((chunk:any)=>{seen.stderr+=String(chunk);return true;});
 vi.spyOn(console,"log").mockImplementation((...args)=>{seen.stdout+=args.join(" ")+"\n";});
 vi.spyOn(console,"warn").mockImplementation((...args)=>{seen.stderr+=args.join(" ")+"\n";});
 vi.spyOn(console,"error").mockImplementation((...args)=>{seen.stderr+=args.join(" ")+"\n";});
 return seen;
}
async function settle(run:Promise<void>):Promise<unknown>{try{await run;return undefined;}catch(error){return error;}}
const cwd=process.cwd();
afterEach(()=>{vi.restoreAllMocks();forced.prod=undefined;process.chdir(cwd);setProcessOutput(undefined);});

describe("V3.3 CLI output flags",()=>{
 it("[OUT13] export env rejects output flags",async()=>{
  const root=writeBasic();terminal();
  const error=await settle(runCli(["node","builder","service","export","env","dev","-C",root,"--silent"]));
  expect(error).toBeInstanceOf(ScriptError);expect((error as ScriptError).exitCode).toBe(2);
  expect((error as Error).message).toBe("--silent and --logfile cannot be used with service export env");
 });
 it("[OUT14] dry-run debug rejects output flags",async()=>{
  const root=writeBasic(),logs=fixtureDir("out14");terminal();
  const error=await settle(runCli(["node","builder","service","up","prod","-C",root,"--skip-checks","--dry-run","--debug","--logfile",logs]));
  expect((error as ScriptError).exitCode).toBe(2);
  expect((error as Error).message).toBe("--silent and --logfile cannot be used with --dry-run --debug");
  expect(fs.readdirSync(logs)).toEqual([]);
 });
 it("[OUT15] help and version win over output flags",async()=>{
  let seen=terminal();
  await runCli(["node","builder","--silent","--version"]);
  expect(seen.stdout).toMatch(/^\d+\.\d+\.\d+\n$/);
  vi.restoreAllMocks();seen=terminal();
  await runCli(["node","builder","service","--help","--silent"]);
  expect(seen.stdout).toContain("Usage: builder service");expect(seen.stdout).not.toContain("success");
 });
 it("[OUT16] silent dry-run prints only success",async()=>{
  const root=writeBasic(),seen=terminal();
  await runCli(["node","builder","service","up","prod","-C",root,"--skip-checks","--dry-run","--silent"]);
  expect(seen).toEqual({stdout:"success\n",stderr:""});
 });
 it("[OUT17] non-zero exit becomes a failure line",async()=>{
  const root=writeBasic();forced.prod=3;
  let seen=terminal();
  let error=await settle(runCli(["node","builder","service","up","prod","-C",root,"--skip-checks","--silent"]));
  expect((error as ScriptError).exitCode).toBe(3);
  expect(seen).toEqual({stdout:"",stderr:"failure: exited with code 3\n"});
  vi.restoreAllMocks();seen=terminal();
  error=await settle(runCli(["node","builder","service","up","prod","-C",root,"--skip-checks"]));
  expect((error as ScriptError).exitCode).toBe(3);
  expect(seen.stderr).toBe("");expect(seen.stdout).not.toContain("success");
 });
 it("[OUT18] logfile captures the run and resolves relative to cwd",async()=>{
  const root=writeBasic(),work=fixtureDir("out18");process.chdir(work);
  const seen=terminal();
  await runCli(["node","builder","service","up","prod","-C",root,"--skip-checks","--dry-run","--logfile","logs"]);
  expect(seen).toEqual({stdout:"success\n",stderr:""});
  const files=fs.readdirSync(path.join(work,"logs"));
  expect(files).toHaveLength(1);expect(files[0]).toMatch(/^\d{13}-\d+-service-up-prod\.log$/);
  expect(fs.existsSync(path.join(root,"logs"))).toBe(false);
  const text=fs.readFileSync(path.join(work,"logs",files[0]!),"utf8");
  expect(text).toContain(`builder v`);expect(text.endsWith("success\n")).toBe(true);
 });
 it("[OUT19] output flags are accepted before and after the subcommand",async()=>{
  const root=writeBasic();
  for(const argv of [["--silent","service","up","prod","-C",root,"--skip-checks","--dry-run"],["service","up","prod","-C",root,"--skip-checks","--dry-run","--silent"]]){
   vi.restoreAllMocks();const seen=terminal();
   await runCli(["node","builder",...argv]);
   expect(seen).toEqual({stdout:"success\n",stderr:""});
  }
  vi.restoreAllMocks();const logs=fixtureDir("out19");let seen=terminal();
  await runCli(["node","builder","service","up","prod","-C",root,"--skip-checks","--dry-run","--silent","--logfile",logs]);
  expect(seen).toEqual({stdout:"success\n",stderr:""});expect(fs.readdirSync(logs)).toHaveLength(1);
  vi.restoreAllMocks();seen=terminal();
  const error=await settle(runCli(["node","builder","service","up","prod","--silent","--no-such-flag"]));
  expect((error as {code?:string}).code).toBe("commander.unknownOption");
  expect(seen.stderr).toContain("unknown option");expect(seen.stderr).not.toContain("failure");
 });
});
