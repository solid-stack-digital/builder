import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { BuildJson } from "../../../src/types/index.js";
export const basicBuild=():BuildJson=>({name:"v3-basic",services:{main:{endpoints:{http:{port:3100,publicPort:"AUTO",primary:true,scheme:"http"}}},tester:{compose:"e2e/compose.yml",service:"runner",env:{BASE_URL:"${main.endpoints.http.public_url}"}}}});
export function fixtureDir(label:string):string {
 const root=path.resolve(".builder/test-tmp",String(process.pid));fs.mkdirSync(root,{recursive:true});return fs.mkdtempSync(path.join(root,`${label}-`));
}
export function writeBasic(build:BuildJson=basicBuild()):string {
 const root=fixtureDir("build");fs.mkdirSync(path.join(root,"e2e"),{recursive:true});
 fs.writeFileSync(path.join(root,"build.json"),JSON.stringify(build,null,2));
 fs.writeFileSync(path.join(root,"Dockerfile"),'FROM node:22-alpine AS dev\nCMD ["node","-e","setInterval(()=>{},1000)"]\nHEALTHCHECK CMD true\nFROM dev AS test\nCMD ["node","-e","process.exit(0)"]\nFROM dev AS prod\n');
 fs.writeFileSync(path.join(root,"e2e/compose.yml"),'services:\n  runner:\n    image: node:22-alpine\n    command: ["node", "-e", "process.exit(0)"]\n');
 return root;
}
export function addServiceCompose(root:string,name:string,body='services:\n  svc:\n    image: node:22-alpine\n    healthcheck:\n      test: ["CMD", "true"]\n'):void {fs.writeFileSync(path.join(root,`${name}.yml`),body);}
