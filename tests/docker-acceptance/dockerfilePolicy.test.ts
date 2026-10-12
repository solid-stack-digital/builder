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

 it("AUDIT-B05 allows HEALTHCHECK NONE on finite test targets",()=>{
  const finite=`FROM alpine AS base
CMD ["sh", "-c", "exec sleep 30"]
HEALTHCHECK CMD true

FROM base AS dev

FROM base AS test
HEALTHCHECK NONE
CMD ["sh", "-c", "exit 0"]

FROM base AS test-e2e
HEALTHCHECK NONE
CMD ["sh", "-c", "exit 0"]

FROM alpine AS builder
RUN echo data > /artifact

FROM alpine AS prod
COPY --from=builder /artifact /artifact
HEALTHCHECK CMD true
CMD ["sh", "-c", "exec sleep 30"]
`;
  const result=policy(finite);
  expect(result.status,result.stdout+result.stderr).toBe(0);
 });

 it("accepts inherited dev CMD and healthcheck",()=>{const result=policy(good);expect(result.status,result.stdout+result.stderr).toBe(0);});
 it("requires all target aliases",()=>expect(policy(good.replace("FROM base AS test-e2e\n","")).status).not.toBe(0));
 it("rejects EXPOSE and HEALTHCHECK NONE effective for dev/prod",()=>{
  expect(policy(good+"EXPOSE 3000\n").status).not.toBe(0);
  expect(policy(good.replace("FROM base AS dev","FROM base AS dev\nHEALTHCHECK NONE")).status).not.toBe(0);
  expect(policy(good.replace("FROM alpine AS prod\nCOPY --from=builder /artifact /artifact\nHEALTHCHECK CMD true","FROM alpine AS prod\nCOPY --from=builder /artifact /artifact\nHEALTHCHECK NONE")).status).not.toBe(0);
 });
 it("rejects a Dockerfile stage inheritance cycle",()=>{
  const cycle=good.replace("FROM alpine AS base","FROM dev AS base");
  expect(policy(cycle).status).not.toBe(0);
 });
 it("requires production artifact isolation",()=>expect(policy(good.replace("COPY --from=builder /artifact /artifact\n","")).status).not.toBe(0));
 it("rejects detached runtime commands",()=>expect(policy(good.replace('CMD ["sh", "-c", "exec sleep 30"]\n','CMD ["sh", "-c", "sleep 30 &"]\n')).status).not.toBe(0));
 it("requires an effective production CMD or ENTRYPOINT",()=>{
  const prodBlock='FROM alpine AS prod\nCOPY --from=builder /artifact /artifact\nHEALTHCHECK CMD true\nCMD ["sh", "-c", "exec sleep 30"]\n';
  const noProdRuntime=good.replace(prodBlock,'FROM alpine AS prod\nCOPY --from=builder /artifact /artifact\nHEALTHCHECK CMD true\n');
  expect(policy(noProdRuntime).status).not.toBe(0);
 });
 it("accepts a foreground prod ENTRYPOINT as the effective runtime",()=>{
  const prodBlock='FROM alpine AS prod\nCOPY --from=builder /artifact /artifact\nHEALTHCHECK CMD true\nCMD ["sh", "-c", "exec sleep 30"]\n';
  const entrypoint=good.replace(prodBlock,'FROM alpine AS prod\nCOPY --from=builder /artifact /artifact\nHEALTHCHECK CMD true\nENTRYPOINT ["sh", "-c", "exec sleep 30"]\n');
  expect(policy(entrypoint).status).toBe(0);
 });
 it("does not require test targets to declare their own runtime instruction",()=>expect(policy(good).status).toBe(0));
 it("rejects detached ENTRYPOINT instructions",()=>{
  const prodBlock='FROM alpine AS prod\nCOPY --from=builder /artifact /artifact\nHEALTHCHECK CMD true\nCMD ["sh", "-c", "exec sleep 30"]\n';
  const detached=good.replace(prodBlock,'FROM alpine AS prod\nCOPY --from=builder /artifact /artifact\nHEALTHCHECK CMD true\nENTRYPOINT ["sh", "-c", "sleep 30 &"]\n');
  expect(policy(detached).status).not.toBe(0);
 });
 it("accepts prod inheriting a foreground runtime instruction",()=>{
  const inherited=good.replace('FROM alpine AS prod\nCOPY --from=builder /artifact /artifact\nHEALTHCHECK CMD true\nCMD ["sh", "-c", "exec sleep 30"]\n','FROM base AS prod\nCOPY --from=builder /artifact /artifact\n');
  expect(policy(inherited).status).toBe(0);
 });
});
