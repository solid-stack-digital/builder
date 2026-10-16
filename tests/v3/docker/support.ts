import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fixtureDir } from "../support/fixtures.js";
export interface DockerFixture { root:string; markers:string; name:string; image:string; nonce:string }
export function preparedImage():string {
 const file=path.resolve(".builder/test-images.json");
 if(!fs.existsSync(file))throw new Error("V3 runtime image is unprepared; run pnpm test:v3:prepare");
 const data=JSON.parse(fs.readFileSync(file,"utf8")) as {tag:string;imageId:string};
 const inspect=spawnSync("docker",["image","inspect",data.tag,"--format","{{.Id}}"],{encoding:"utf8"});
 if(inspect.status!==0||inspect.stdout.trim()!==data.imageId)throw new Error("V3 runtime image is stale; run pnpm test:v3:prepare");
 return data.tag;
}
export function dockerFixture(label:string):DockerFixture {
 const image=preparedImage(),root=fixtureDir(label),nonce=Math.random().toString(36).slice(2,10),name=`v3-${label}-${nonce}`.replace(/[^a-z0-9-]/g,"-");
 const markers=path.join(root,"markers");fs.mkdirSync(markers,{recursive:true});fs.mkdirSync(path.join(root,"e2e"),{recursive:true});
 fs.writeFileSync(path.join(root,"Dockerfile"),`FROM ${image} AS dev\nCMD ["python", "/runtime/serve.py"]\nHEALTHCHECK --interval=1s --timeout=1s --retries=3 CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:3100/health',timeout=1)"\nFROM dev AS test\nCMD ["python", "/runtime/unit.py"]\nFROM dev AS prod\n`);
 return {root,markers,name,image,nonce};
}
export function write(f:DockerFixture,file:string,content:string):void {const target=path.join(f.root,file);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,content);}
export function statusByProject(projectName:string):{containers:string[];networks:string[];volumes:string[]} {
 const query=(type:"ps"|"network"|"volume",args:string[])=>{const r=spawnSync("docker",args,{encoding:"utf8"});if(r.status!==0)throw new Error(`Docker resource query failed: ${r.stderr}`);return r.stdout.trim().split(/\s+/).filter(Boolean);};
 return {containers:query("ps",["ps","-aq","--filter",`label=com.docker.compose.project=${projectName}`]),networks:query("network",["network","ls","-q","--filter",`label=com.docker.compose.project=${projectName}`]),volumes:query("volume",["volume","ls","-q","--filter",`label=com.docker.compose.project=${projectName}`])};
}
