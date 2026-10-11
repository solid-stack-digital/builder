import { ConfigError } from "../../errors/ConfigError.js";
import type { EffectiveBuildConfig } from "../config/types.js";
import type { Environment } from "../../types/index.js";
import type { ComposeDocument, ComposeService } from "./types.js";
export function validateDependencyCompose(dependencyKey:string,dependency:EffectiveBuildConfig["dependencies"][string],document:ComposeDocument,context:{composePath:string;stage:Environment}):void{
 const fail=(configPath:string,reason:string,value?:unknown):never=>{throw new ConfigError({sourceFile:context.composePath,configPath,stage:context.stage,composition:"service",...(value===undefined?{}:{value}),reason:`Dependency "${dependencyKey}": ${reason}`})};
 if(document.include!==undefined)fail("include","Compose include is unsupported for atomic dependency implementations");
 const services=document.services??{};
 for(const [name,svc] of Object.entries(services)){
  if(svc.ports!==undefined)fail(`services.${name}.ports`,"raw dependency ports are forbidden");
  if(svc.network_mode==="host")fail(`services.${name}.network_mode`,"host network mode is forbidden");
  if(svc.privileged===true)fail(`services.${name}.privileged`,`privileged services are forbidden`);
  if(svc.container_name!==undefined)fail(`services.${name}.container_name`,`fixed container_name is forbidden`);
  for(const v of Array.isArray(svc.volumes)?svc.volumes:[]){const source=typeof v==="string"?v.split(":")[0]:v&&typeof v==="object"?(v as any).source:undefined;if(typeof source==="string"&&source.replaceAll("\\","/")==="/")fail(`services.${name}.volumes`,`host root bind mounts are forbidden`,v);}
 }
 if(!Object.keys(dependency.endpoints).length)return;
 if(!Object.keys(services).length)fail("services","endpoint-bearing dependency Compose must define services");
 const owners=new Set<string>();
 for(const [endpoint,definition] of Object.entries(dependency.endpoints)){const owner=definition.service;if(!services[owner])fail(`endpoints.${endpoint}.service`,`declared endpoint owner "${owner}" does not exist`,owner);owners.add(owner);}
 for(const owner of owners){if(services[owner]!.network_mode!==undefined)fail(`services.${owner}.network_mode`,`endpoint owner cannot use network_mode`);const health=services[owner]!.healthcheck as Record<string,unknown>|undefined;if(!health||health.disable===true||!health.test||(typeof health.test==="string"&&!health.test.trim())||(Array.isArray(health.test)&&(!health.test.length||health.test[0]==="NONE"||health.test.every(v=>typeof v==="string"&&!v.trim()))))fail(`services.${owner}.healthcheck`,`endpoint owner requires an enabled, non-empty healthcheck`);}
}
