import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { stringify } from "yaml";
import type { ComposeDocument } from "../../src/core/composition/types.js";
import { compileServiceComposition } from "../../src/core/composition/compileServiceComposition.js";
import { compileMeshComposition } from "../../src/core/mesh/v2/compileMeshComposition.js";
import { fixture, meshFixture, write } from "./fixture.js";

export const appScript = `import http from 'node:http';
const port=Number(process.env.PORT||3000), delay=Number(process.env.READY_AFTER_MS||0);
let ready=false;
if(delay>=0)setTimeout(()=>{ready=true;console.log('APP_READY')},delay);
http.createServer((req,res)=>{if(req.url==='/health'){res.statusCode=ready?200:503;res.end(ready?'ready':'waiting');return}
 if(req.url==='/env'){res.setHeader('content-type','application/json');res.end(JSON.stringify(process.env));return}
 res.statusCode=ready?200:503;res.end(ready?'ok':'waiting')}).listen(port,'0.0.0.0',()=>console.log('APP_STARTED'));
if(process.env.PROBE_URL){fetch(process.env.PROBE_URL+'/health').then(r=>console.log(r.ok?'PROBE_OK':'PROBE_BAD')).catch(e=>console.log('PROBE_FAILED',e.message))}
`;
export const testerScript = `const url=process.env.APP_URL||process.env.SYSTEM_URL;
console.log(process.env.TEST_MARKER||'E2E_MARK');
if(!url){console.error('missing URL');process.exit(41)}
const urls=url.split(',');
for(const one of urls){try{const res=await fetch(one+'/health');if(!res.ok){console.error('not ready',one,res.status);process.exit(42)}}catch(e){console.error('unreachable',one,e);process.exit(43)}}
process.exit(Number(process.env.E2E_EXIT||0));
`;
export const unitScript = `console.log('UNIT_MARK');process.exit(Number(process.env.TEST_EXIT||0));`;
export const depScript = `import fs from 'node:fs';
console.log('DEP_STARTED');const delay=Number(process.env.READY_AFTER_MS||0);
if(delay>=0)setTimeout(()=>{fs.writeFileSync('/tmp/ready','yes');console.log('DEP_READY')},delay);
setInterval(()=>{},1000);
`;
const health = `HEALTHCHECK --interval=500ms --timeout=1s --retries=12 CMD node -e "require('http').get('http://127.0.0.1:'+(process.env.PORT||3000)+'/health',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"`;
export const dockerfile = `FROM node:22-alpine AS base
WORKDIR /app
COPY app.mjs unit.mjs tester.mjs ./
FROM base AS dev
${health}
CMD ["node","app.mjs"]
FROM base AS test
CMD ["node","unit.mjs"]
FROM base AS test-e2e
CMD ["node","tester.mjs"]
FROM base AS prod
${health}
CMD ["node","app.mjs"]
`;

export function runtimeService(config: Record<string, unknown> = {}): string {
  return fixture({ app: { endpoints: { http: { port: 3000, primary: true, scheme: "http", publicPort: "AUTO" } } }, tester: { env: { APP_URL: "${app.endpoints.http.public_url}" } }, ...config }, { Dockerfile: dockerfile, "app.mjs": appScript, "unit.mjs": unitScript, "tester.mjs": testerScript, "dep.mjs": depScript });
}
export function dependencyBundle(delayMs: number): object {
  return { services: { owner: { image: "node:22-alpine", working_dir: "/app", command: ["node", "dep.mjs"], environment: { READY_AFTER_MS: String(delayMs) }, volumes: ["./dep.mjs:/app/dep.mjs:ro"], healthcheck: { test: ["CMD-SHELL", "test -f /tmp/ready"], interval: "500ms", timeout: "1s", retries: 12 } } } };
}
export function runtimeMesh(mesh: Record<string, unknown>, builds: Record<string, Record<string, unknown>>, files: Record<string, string | object> = {}): string {
  const root = meshFixture(mesh, builds, files);
  for (const name of Object.keys(builds)) {
    write(root, `${name}/Dockerfile`, dockerfile);
    write(root, `${name}/app.mjs`, appScript);
    write(root, `${name}/unit.mjs`, unitScript);
    write(root, `${name}/tester.mjs`, testerScript);
    write(root, `${name}/dep.mjs`, depScript);
  }
  write(root, "e2e/Dockerfile", "FROM node:22-alpine\nWORKDIR /app\nCOPY tester.mjs ./\nCMD [\"node\",\"tester.mjs\"]\n");
  write(root, "e2e/tester.mjs", testerScript);
  return root;
}

export function emitCompose(root: string, compose: ComposeDocument): string {
  const file = path.join(root, "conformance.compose.yml");
  writeFileSync(file, stringify(compose));
  return file;
}
export function dockerCompose(root: string, file: string, args: string[], timeout = 60000) {
  return spawnSync("docker", ["compose", "--project-directory", root, "-f", file, ...args], { cwd: root, encoding: "utf8", timeout });
}
export function serviceCompose(root: string, stage: "dev" | "prod" | "e2e" = "prod") {
  return emitCompose(root, compileServiceComposition(stage, root).compose);
}
export function meshCompose(root: string, stage: "dev" | "prod" | "e2e" = "e2e") {
  return emitCompose(root, compileMeshComposition(stage, root).compose);
}
export function builder(root: string, args: string[], timeout = 120000) {
  const bin = path.resolve("node_modules/.bin/tsx");
  return spawnSync(bin, [path.resolve("src/bin.ts"), ...args, "--skip-checks", "-C", root], { cwd: path.resolve("."), encoding: "utf8", timeout, env: { ...process.env, NO_COLOR: "1" } });
}
export function dockerLog(root: string, file: string, service: string) {
  const r = dockerCompose(root, file, ["logs", "--no-color", "--timestamps", service]);
  return `${r.stdout}${r.stderr}`;
}
export function down(root: string, file: string) {
  dockerCompose(root, file, ["down", "--remove-orphans", "--volumes"], 30000);
}
