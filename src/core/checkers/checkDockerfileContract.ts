import { resolveApplicationDockerfile } from "../config/pathSafety.js";
import pc from "picocolors";
import type { BuildJson } from "../../types/index.js";
import { resolveProjectDir } from "../../utils/paths.js";
import { getDockerfilePolicyDir } from "../templates.js";
import { CONFTEST_IMAGE } from "./constants.js";
import { runStep } from "./runStep.js";
import { readFileSync } from "node:fs";
import { ConfigError } from "../../errors/ConfigError.js";

interface DockerStage { name:string; parent:string; command?:string; entrypoint?:string; health?:string }
export function assertMainDockerfileContract(projectDir:string,activeStage:"dev"|"test"|"prod"):void {
  const file=resolveApplicationDockerfile(projectDir,"Dockerfile",activeStage);
  const lines=readFileSync(file,"utf8").replace(/\\\r?\n\s*/g," ").split(/\r?\n/);
  const stages=new Map<string,DockerStage>();let current:DockerStage|undefined;
  for(const raw of lines){const line=raw.trim();if(!line||line.startsWith("#"))continue;
    const from=/^FROM\s+(\S+)(?:\s+AS\s+(\S+))?/i.exec(line);
    if(from){current={name:(from[2]??`__${stages.size}`).toLowerCase(),parent:from[1]!.toLowerCase()};stages.set(current.name,current);continue;}
    if(!current)continue;
    const instruction=/^(CMD|ENTRYPOINT|HEALTHCHECK)\s+(.+)$/i.exec(line);
    if(instruction){const key=instruction[1]!.toLowerCase();if(key==="cmd")current.command=instruction[2]!;else if(key==="entrypoint")current.entrypoint=instruction[2]!;else current.health=instruction[2]!;}
  }
  const fail=(reason:string):never=>{throw new ConfigError({sourceFile:file,configPath:`Dockerfile.${activeStage}`,stage:activeStage,composition:"service",reason});};
  for(const name of ["dev","test","prod"])if(!stages.has(name))fail(`Missing required Dockerfile target ${name}`);
  const visited=new Set<string>();let cursor=stages.get(activeStage),runtime=false,health:string|undefined;
  let effectiveCmd:string|undefined,effectiveEntrypoint:string|undefined;
  while(cursor){if(visited.has(cursor.name))fail(`Dockerfile stage inheritance cycle at ${cursor.name}`);visited.add(cursor.name);
    runtime ||= Boolean(cursor.command||cursor.entrypoint);
    if(effectiveCmd===undefined&&cursor.command!==undefined)effectiveCmd=cursor.command;
    if(effectiveEntrypoint===undefined&&cursor.entrypoint!==undefined)effectiveEntrypoint=cursor.entrypoint;
    if(health===undefined&&cursor.health!==undefined)health=cursor.health;
    cursor=stages.get(cursor.parent);
  }
  if(!runtime)fail(`${activeStage} requires an effective CMD or ENTRYPOINT`);
  if(activeStage!=="test"&&(!health||/^NONE$/i.test(health.trim())))fail(`${activeStage} requires a valid healthcheck`);
  if(activeStage==="dev"&&[effectiveEntrypoint,effectiveCmd].some(instruction=>instruction!==undefined&&/(?:nohup|&\s*$|--daemon)/i.test(instruction)))fail("dev runtime must remain in foreground");
}

export function checkDockerfileContract(build: BuildJson, projectDir: string): void {
  const root = resolveProjectDir(projectDir);
  const relative = "Dockerfile";
  resolveApplicationDockerfile(root, relative);
  const policyDir = getDockerfilePolicyDir();
  console.log(pc.cyan(`\n🔍 Validating Builder Dockerfile contract (${relative})...`));
  runStep("docker", ["run","--rm","--network","none","--mount",`type=bind,src=${root},dst=/project,readonly`,"--mount",`type=bind,src=${policyDir},dst=/builder-policy,readonly`,"-w","/project",CONFTEST_IMAGE,"test",relative,"-p","/builder-policy"],root,{stepName:"Dockerfile Contract",targetFile:relative});
}
