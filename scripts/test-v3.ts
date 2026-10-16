import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";

function prerequisite():void {
  const file=path.resolve(".builder/test-images.json");
  if(!fs.existsSync(file))throw new Error("V3 Docker fixture is unprepared; run pnpm test:v3:prepare first");
  const prepared=JSON.parse(fs.readFileSync(file,"utf8")) as {tag?:string;imageId?:string;files?:string[]};
  if(!prepared.tag||!prepared.imageId||!prepared.files?.length)throw new Error("V3 Docker fixture manifest is malformed; rerun pnpm test:v3:prepare");
  const digest=createHash("sha256");for(const name of prepared.files)digest.update(fs.readFileSync(path.join("tests/docker-acceptance/v3-runtime",name)));
  if(prepared.tag!==`builder-v3-test-runtime:${digest.digest("hex").slice(0,16)}`)throw new Error("V3 Docker fixture source changed; rerun pnpm test:v3:prepare");
  for(const args of [["info","--format","{{.ServerVersion}}"],["compose","version","--short"]]){
    const result=spawnSync("docker",args,{encoding:"utf8"});
    if(result.status!==0)throw new Error(`Docker preflight failed (${args.join(" ")}): ${result.error?.message??result.stderr}`);
    console.log(`${args[0]==="info"?"Docker server":"Docker Compose"}: ${result.stdout.trim()}`);
  }
  const image=spawnSync("docker",["image","inspect",prepared.tag,"--format","{{.Id}}"],{encoding:"utf8"});
  if(image.status!==0||image.stdout.trim()!==prepared.imageId)throw new Error("V3 Docker fixture image is missing or stale; rerun pnpm test:v3:prepare");
  console.log(`V3 fixture image: ${prepared.imageId}`);
}
function slowestFiles():void {const file=path.resolve(".builder/v3-fast-report.json");if(!fs.existsSync(file))return;const report=JSON.parse(fs.readFileSync(file,"utf8")) as {testResults:Array<{name:string;startTime:number;endTime:number}>};console.error("Ten slowest V3 test files:");for(const item of report.testResults.sort((a,b)=>(b.endTime-b.startTime)-(a.endTime-a.startTime)).slice(0,10))console.error(`${item.endTime-item.startTime}ms ${path.relative(process.cwd(),item.name)}`);}
function command(label:string,executable:string,args:string[],durations:Array<[string,number]>):void {
  const begin=Date.now();const result=spawnSync(executable,args,{stdio:"inherit"});const elapsed=Date.now()-begin;
  durations.push([label,elapsed]);console.log(`${label}: ${elapsed}ms`);
  if(result.error||result.status!==0)throw new Error(`${label} failed with status ${result.status??"spawn error"}: ${result.error?.message??""}`);
}
const started=Date.now(),durations:Array<[string,number]>=[];
try {
  command("fast tests","pnpm",["test:v3:fast"],durations);
  command("typecheck","pnpm",["typecheck"],durations);
  command("Builder build","pnpm",["build"],durations);
  command("built CLI version","node",["dist/bin.js","--version"],durations);
  command("built API import","node",["--input-type=module","-e","await import('./dist/index.js')"],durations);
  command("legacy gate","pnpm",["check:v3-no-legacy"],durations);
  prerequisite();
  command("Docker batches","pnpm",["test:v3:docker"],durations);
  command("all-case coverage","pnpm",["exec","tsx","scripts/check-v3-coverage.ts","all",".builder/v3-fast-report.json",".builder/v3-docker-report.json"],durations);
  const elapsed=Date.now()-started;console.log(`V3 verification total: ${elapsed}ms`);
  if(elapsed>180_000){console.error("V3 warmed verification exceeded the 180-second engineering budget. Phase durations:",durations.sort((a,b)=>b[1]-a[1]));slowestFiles();process.exitCode=1;}
} catch(error) {
  console.error(error instanceof Error?error.message:error);
  process.exitCode=1;
}
