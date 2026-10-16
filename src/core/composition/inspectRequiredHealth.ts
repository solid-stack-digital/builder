import { spawnSync } from "node:child_process";
import { ConfigError } from "../../errors/ConfigError.js";
import type { DeferredHealthCheck } from "./types.js";
import { isEnabledValidComposeHealthcheck } from "./composeHealthcheck.js";

export interface ImageInspectResult { Config?: { Healthcheck?: unknown } }
export type InspectImage = (image:string,projectDir:string)=>ImageInspectResult;

export function inspectImage(image:string,projectDir:string):ImageInspectResult {
  const result=spawnSync("docker",["image","inspect","--format","{{json .Config}}",image],{cwd:projectDir,encoding:"utf8"});
  if(result.error||result.status!==0)throw new Error(`Could not inspect image ${image}: ${result.error?.message??result.stderr?.trim()??"unknown Docker error"}`);
  try{return {Config:JSON.parse(result.stdout) as NonNullable<ImageInspectResult["Config"]>};}
  catch{throw new Error(`Docker returned invalid image metadata for ${image}`);}
}

/** Resolve health inherited from an image after build/pull, before any container is created. */
export function inspectRequiredHealth(checks:readonly DeferredHealthCheck[],projectDir:string,inspect:InspectImage=inspectImage,stage="prod",composition:"service"|"mesh"="service"):void {
  for(const check of checks){let metadata:ImageInspectResult;
    try{metadata=inspect(check.image,projectDir);}catch(error){throw new ConfigError({sourceFile:check.sourceFile,configPath:check.configPath,stage,composition,reason:`Required image health metadata unavailable for ${check.serviceName}: ${error instanceof Error?error.message:String(error)}`});}
    const inherited=metadata.Config?.Healthcheck;
    const command=inherited&&typeof inherited==="object"&&!Array.isArray(inherited)?(inherited as {Test?:unknown}).Test:undefined;
    if(!isEnabledValidComposeHealthcheck({test:command}))throw new ConfigError({sourceFile:check.sourceFile,configPath:check.configPath,stage,composition,reason:`Required image healthcheck is absent or disabled for ${check.serviceName}`});
  }
}
