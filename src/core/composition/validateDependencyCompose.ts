import { validateComposeResourceReferences } from "./validateComposeResourceReferences.js";
import { assertComposeLifecycleAcyclic } from "./assertComposeLifecycleAcyclic.js";
import { assertNoServiceBuildContexts } from "./composeBuildResources.js";
import { isEnabledValidComposeHealthcheck } from "./composeHealthcheck.js";
import { parseVolume, isHostFilesystemRoot } from "./composeVolumes.js";
import { ConfigError } from "../../errors/ConfigError.js";
import type { EffectiveBuildConfig } from "../config/types.js";
import type { Environment } from "../../types/index.js";
import type { ComposeDocument, ComposeService } from "./types.js";
export function validateDependencyCompose(dependencyKey:string,dependency:EffectiveBuildConfig["dependencies"][string],document:ComposeDocument,context:{composePath:string;stage:Environment}):void{
 const fail=(configPath:string,reason:string,value?:unknown):never=>{throw new ConfigError({sourceFile:context.composePath,configPath,stage:context.stage,composition:"service",...(value===undefined?{}:{value}),reason:`Dependency "${dependencyKey}": ${reason}`})};
 if(document.include!==undefined)fail("include","Compose include is unsupported for atomic dependency implementations");
 validateComposeResourceReferences(document,{sourceFile:context.composePath,stage:context.stage,composition:"service"});
 const services=document.services??{};
 for(const [name,svc] of Object.entries(services)){
  assertNoServiceBuildContexts(svc,`services.${name}`,context.composePath);
  if(svc.profiles!==undefined)fail(`services.${name}.profiles`,"dependency Compose profiles are unsupported because a materialized dependency is atomic");
  if(svc.extends!==undefined)fail(`services.${name}.extends`,"dependency Compose extends is unsupported until effective endpoint-owner networking and health can be validated");
  if(svc.ports!==undefined)fail(`services.${name}.ports`,"raw dependency ports are forbidden");
  if(svc.network_mode==="host")fail(`services.${name}.network_mode`,"host network mode is forbidden");
  if(svc.privileged===true)fail(`services.${name}.privileged`,`privileged services are forbidden`);
  if(svc.container_name!==undefined)fail(`services.${name}.container_name`,`fixed container_name is forbidden`);
  for (const v of Array.isArray(svc.volumes) ? svc.volumes : []) { const mount = parseVolume(v); if (mount?.type === "bind" && mount.source && isHostFilesystemRoot(mount.source)) fail(`services.${name}.volumes`, "host root bind mounts are forbidden", v); }
  const internalRefs:Array<[string,string]> = [];
  if(Array.isArray(svc.depends_on)){for(const ref of svc.depends_on)if(typeof ref==="string")internalRefs.push(["depends_on",ref]);}
  else if(svc.depends_on&&typeof svc.depends_on==="object"){for(const ref of Object.keys(svc.depends_on))internalRefs.push(["depends_on",ref]);}
  if(Array.isArray(svc.links))for(const ref of svc.links)if(typeof ref==="string")internalRefs.push(["links",ref.split(":")[0]!]);
  if(typeof svc.network_mode==="string"&&svc.network_mode.startsWith("service:"))internalRefs.push(["network_mode",svc.network_mode.slice(8)]);
  if(Array.isArray(svc.volumes_from))for(const ref of svc.volumes_from)if(typeof ref==="string")internalRefs.push(["volumes_from",ref.split(":")[0]!]);
  for (const key of ["ipc", "pid"] as const) if (typeof svc[key] === "string" && svc[key].startsWith("service:")) internalRefs.push([key, svc[key].slice(8)]);
  for(const [property,target] of internalRefs)if(!services[target])fail(`services.${name}.${property}`,`internal service reference "${target}" does not exist in this dependency Compose bundle`,target);
 }
 assertComposeLifecycleAcyclic(services, {
  sourceFile: context.composePath,
  stage: context.stage,
  composition: "service",
 });
 if(!Object.keys(dependency.endpoints).length)return;
 if(!Object.keys(services).length)fail("services","endpoint-bearing dependency Compose must define services");
 const owners=new Set<string>();
 for(const [endpoint,definition] of Object.entries(dependency.endpoints)){const owner=definition.service;if(!services[owner])fail(`endpoints.${endpoint}.service`,`declared endpoint owner "${owner}" does not exist`,owner);owners.add(owner);}
 for(const owner of owners){if(services[owner]!.network_mode!==undefined)fail(`services.${owner}.network_mode`,`endpoint owner cannot use network_mode`);if(!isEnabledValidComposeHealthcheck(services[owner]!.healthcheck))fail(`services.${owner}.healthcheck`,"endpoint owner requires a valid enabled Compose healthcheck");}
}
