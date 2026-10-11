import {spawnSync} from "node:child_process";
import {mkdtempSync,rmSync,writeFileSync} from "node:fs";
import os from "node:os";
import path from "node:path";
import {describe,expect,it} from "vitest";
import {getDockerfilePolicyDir} from "../../src/core/templates.js";
import {CONFTEST_IMAGE} from "../../src/core/checkers/constants.js";
const good=`FROM alpine AS base
CMD ["sh", "-c", "exec sleep 30"]
HEALTHCHECK CMD true
FROM base AS dev
FROM base AS test
FROM base AS test-e2e
FROM alpine AS builder
RUN echo data > /artifact
FROM alpine AS prod
COPY --from=builder /artifact /artifact
HEALTHCHECK CMD true
CMD ["sh", "-c", "exec sleep 30"]
`;
function policy(dockerfile:string){const dir=mkdtempSync(path.join(os.tmpdir(),"builder-policy-"));try{writeFileSync(path.join(dir,"Dockerfile"),dockerfile);return spawnSync("docker",["run","--rm","--network","none","--mount",`type=bind,src=${dir},dst=/project,readonly`,"--mount",`type=bind,src=${getDockerfilePolicyDir()},dst=/policy,readonly`,"-w","/project",CONFTEST_IMAGE,"test","Dockerfile","-p","/policy"],{encoding:"utf8"});}finally{rmSync(dir,{recursive:true,force:true});}}
describe("Builder Dockerfile policy",()=>{
 it("accepts inherited dev CMD and healthcheck",()=>{const result=policy(good);expect(result.status,result.stdout+result.stderr).toBe(0);});
 it("requires all target aliases",()=>expect(policy(good.replace("FROM base AS test-e2e\n","")).status).not.toBe(0));
 it("rejects EXPOSE and HEALTHCHECK NONE",()=>{expect(policy(good+"EXPOSE 3000\n").status).not.toBe(0);expect(policy(good.replace("HEALTHCHECK CMD true\nFROM base AS dev","HEALTHCHECK NONE\nFROM base AS dev")).status).not.toBe(0);});
 it("rejects a Dockerfile stage inheritance cycle",()=>{
  const cycle=good.replace("FROM alpine AS base","FROM dev AS base");
  expect(policy(cycle).status).not.toBe(0);
 });
 it("requires production artifact isolation",()=>expect(policy(good.replace("COPY --from=builder /artifact /artifact\n","")).status).not.toBe(0));
 it("rejects detached runtime commands",()=>expect(policy(good.replace('CMD ["sh", "-c", "exec sleep 30"]\n','CMD ["sh", "-c", "sleep 30 &"]\n')).status).not.toBe(0));
});
