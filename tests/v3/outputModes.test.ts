import fs from "node:fs";
import path from "node:path";
import { PassThrough } from "node:stream";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createOutput, currentOutput, formatFailureMessage, logFileName, openLogFile, runWithOutput } from "../../src/core/output/index.js";
import { ScriptError } from "../../src/errors/ScriptError.js";
import { fixtureDir } from "./support/fixtures.js";

function sinks(cwd?:string){
  const stdout=new PassThrough(),stderr=new PassThrough(),seen={stdout:"",stderr:""};
  stdout.on("data",d=>seen.stdout+=String(d));stderr.on("data",d=>seen.stderr+=String(d));
  return {sinks:{stdout,stderr,now:()=>1763452800123,pid:48211,...(cwd?{cwd}:{})},seen};
}
const onlyLog=(dir:string)=>{const files=fs.readdirSync(dir).filter(f=>f.endsWith(".log"));expect(files).toHaveLength(1);return path.join(dir,files[0]!);};
afterEach(()=>vi.restoreAllMocks());

describe("V3.3 output modes core",()=>{
 it("[OUT01] log file name is <ms>-<pid>-<command>.log",()=>{
  expect(logFileName("service up test",1763452800123,48211)).toBe("1763452800123-48211-service-up-test.log");
  expect(logFileName("  Mesh  UP/dev ",1,2)).toBe("1-2-mesh-up-dev.log");
  expect(logFileName("",1,2)).toBe("1-2-builder.log");
 });
 it("[OUT02] logfile directory is created and a file path is rejected",()=>{
  const root=fixtureDir("out02"),nested=path.join(root,"a","b");
  const opened=openLogFile(nested,"check");fs.closeSync(opened.fd);
  expect(fs.statSync(nested).isDirectory()).toBe(true);
  const file=path.join(root,"existing.txt");fs.writeFileSync(file,"keep");
  let thrown:unknown;try{openLogFile(file,"check");}catch(error){thrown=error;}
  expect(thrown).toBeInstanceOf(ScriptError);expect((thrown as ScriptError).exitCode).toBe(2);expect((thrown as Error).message).toContain("is not a directory");
  expect(fs.readFileSync(file,"utf8")).toBe("keep");
 });
 it("[OUT03] log file is private and ANSI-free",()=>{
  const root=fixtureDir("out03"),{sinks:s}=sinks(root),out=createOutput({mode:"logfile",dir:"logs",command:"check"},s);
  out.log("\u001b[32mok\u001b[39m");out.write("stdout","\u001b[1mraw\u001b[22m\n");out.close();
  expect(fs.statSync(out.logPath!).mode&0o777).toBe(0o600);
  expect(fs.readFileSync(out.logPath!,"utf8")).toBe("ok\nraw\n");
 });
 it("[OUT04] silent mode prints only the result",()=>{
  const {sinks:s,seen}=sinks(),out=createOutput({mode:"silent"},s);
  out.log("a");out.warn("b");out.error("c");out.write("stdout","d");out.write("stderr","e");
  expect(seen).toEqual({stdout:"",stderr:""});
  out.result({kind:"success"});
  expect(seen).toEqual({stdout:"success\n",stderr:""});
  expect(out.childStdio()).toEqual(["ignore","ignore"]);
 });
 it("[OUT05] silent failure is one line on stderr",()=>{
  const {sinks:s,seen}=sinks(),out=createOutput({mode:"silent"},s);
  out.result({kind:"failure",message:formatFailureMessage(new ScriptError("❌ Bad\n  thing"))});
  expect(seen).toEqual({stdout:"",stderr:"failure: Bad thing\n"});
  expect(formatFailureMessage(new AggregateError([],"a\nb"))).toBe("a b");
  expect(formatFailureMessage("plain")).toBe("plain");
 });
 it("[OUT06] logfile mode streams to file and reports the path",()=>{
  const root=fixtureDir("out06"),{sinks:s,seen}=sinks(root),out=createOutput({mode:"logfile",dir:"logs",command:"service up prod"},s);
  expect(out.logPath).toBe(path.join(root,"logs","1763452800123-48211-service-up-prod.log"));
  out.log("hello");out.warn("careful");out.result({kind:"success"});
  expect(seen).toEqual({stdout:"success\n",stderr:""});
  out.result({kind:"failure",message:"boom"});
  expect(seen.stderr).toBe(`failure (see ${out.logPath})\n`);
  out.close();
  expect(fs.readFileSync(onlyLog(path.join(root,"logs")),"utf8")).toBe(`hello\ncareful\nsuccess\nfailure (see ${out.logPath})\n`);
  expect(out.childStdio()).toEqual(["pipe","pipe"]);
 });
 it("[OUT07] normal mode delegates to console and has no result line",()=>{
  const log=vi.spyOn(console,"log").mockImplementation(()=>{}),warn=vi.spyOn(console,"warn").mockImplementation(()=>{}),error=vi.spyOn(console,"error").mockImplementation(()=>{});
  const {sinks:s,seen}=sinks(),out=createOutput({mode:"normal"},s);
  out.log("a",1);out.warn("w");out.error("e");
  expect(log).toHaveBeenCalledWith("a",1);expect(warn).toHaveBeenCalledWith("w");expect(error).toHaveBeenCalledWith("e");
  out.result({kind:"success"});out.result({kind:"failure",message:"x"});
  expect(seen).toEqual({stdout:"",stderr:""});
  expect(out.childStdio()).toEqual(["inherit","inherit"]);
 });
 it("[OUT08] piped child output reaches the file in arrival order and late writes are ignored",()=>{
  const root=fixtureDir("out08"),{sinks:s}=sinks(root),out=createOutput({mode:"logfile",dir:".",command:"x"},s);
  const a=new PassThrough(),b=new PassThrough();out.pipeChild({stdout:a,stderr:b});
  a.write("1\n");b.write("2\n");a.write("3\n");
  out.close();out.close();
  expect(()=>{a.write("4\n");out.log("5");out.result({kind:"success"});}).not.toThrow();
  expect(fs.readFileSync(out.logPath!,"utf8")).toBe("1\n2\n3\n");
  const silent=createOutput({mode:"silent"});
  expect(runWithOutput(silent,()=>currentOutput())).toBe(silent);
  expect(currentOutput().mode).toBe("normal");
 });
});
