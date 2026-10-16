import { ConfigError } from "../../errors/ConfigError.js";
import type { EffectiveOrdinary } from "../config/types.js";
import { assertComposeLifecycleAcyclic } from "./assertComposeLifecycleAcyclic.js";
import { validateComposeResourceReferences } from "./validateComposeResourceReferences.js";
import { parseVolume, isHostFilesystemRoot } from "./composeVolumes.js";
import { isEnabledValidComposeHealthcheck } from "./composeHealthcheck.js";
import type { ComposeDocument } from "./types.js";
export function validateServiceCompose(name:string, declaration:EffectiveOrdinary, document:ComposeDocument, context:{composePath:string;stage:string;composition:"service"|"mesh";healthRequired:boolean;prerequisite:boolean;deferHealth?:(representative:string)=>void}):string {
  const fail=(configPath:string,reason:string,value?:unknown):never=>{throw new ConfigError({sourceFile:context.composePath,configPath,stage:context.stage,composition:context.composition,referencedObject:name,reason,value});};
  if(document.include!==undefined)fail("include","Compose include is unsupported for atomic service implementations");
  validateComposeResourceReferences(document,{sourceFile:context.composePath,stage:context.stage,composition:context.composition});
  const services=document.services??{};
  if(!Object.keys(services).length)fail("services","Ordinary service Compose must define services");
  for(const [key,svc] of Object.entries(services)){
    if(svc.profiles!==undefined||svc.extends!==undefined)fail(`services.${key}`,"Compose profiles and extends are unsupported for atomic service implementations");
    if(svc.ports!==undefined||svc.network_mode==="host"||svc.container_name!==undefined||svc.privileged===true)fail(`services.${key}`,"Service cannot own host ports, host networking, container_name or privileged mode");
    for(const volume of Array.isArray(svc.volumes)?svc.volumes:[]){const mount=parseVolume(volume);if(mount?.type==="bind"&&mount.source&&isHostFilesystemRoot(mount.source))fail(`services.${key}.volumes`,"host root bind mounts are forbidden");}
    const references:string[]=[];
    if(Array.isArray(svc.depends_on))references.push(...svc.depends_on.filter((value):value is string=>typeof value==="string"));
    else if(svc.depends_on&&typeof svc.depends_on==="object")references.push(...Object.keys(svc.depends_on));
    if(Array.isArray(svc.links))references.push(...svc.links.filter((value):value is string=>typeof value==="string").map(value=>value.split(":")[0]!));
    if(Array.isArray(svc.volumes_from))references.push(...svc.volumes_from.filter((value):value is string=>typeof value==="string").map(value=>value.split(":")[0]!));
    for(const prop of ["network_mode","ipc","pid"] as const){const raw=svc[prop];if(typeof raw==="string"&&raw.startsWith("service:"))references.push(raw.slice(8));}
    for(const target of references)if(!services[target])fail(`services.${key}`,`internal service reference ${target} does not exist`);
  }
  const endpoints=declaration.endpoints;
  let representative:string;
  if(Object.keys(endpoints).length){const primary=Object.values(endpoints).find(endpoint=>endpoint.primary);representative=primary!.service;if(declaration.service&&declaration.service!==representative)fail("service","top-level service must equal primary endpoint owner");}
  else {if(!declaration.service)fail("service","endpoint-less service requires service");representative=declaration.service!;}
  if(!services[representative])fail("service","lifecycle representative does not exist",representative);
  for(const [endpoint,definition] of Object.entries(endpoints)){
    if(!services[definition.service])fail(`endpoints.${endpoint}.service`,"endpoint owner does not exist",definition.service);
    if(services[definition.service]!.network_mode!==undefined)fail(`services.${definition.service}.network_mode`,"endpoint owner cannot use network_mode");
  }
  if(context.healthRequired){const health=services[representative]!.healthcheck;if(health===undefined||(health&&typeof health==="object"&&!Array.isArray(health)&&(health as {test?:unknown;disable?:unknown}).test===undefined&&(health as {disable?:unknown}).disable!==true))context.deferHealth?.(representative);else if(!isEnabledValidComposeHealthcheck(health))fail(`services.${representative}.healthcheck`,"requires a valid healthcheck");}
  if(context.prerequisite&&services[representative]!.restart!==undefined&&services[representative]!.restart!=="no")fail(`services.${representative}.restart`,"prerequisite cannot have a restart policy");
  assertComposeLifecycleAcyclic(services,{sourceFile:context.composePath,stage:context.stage,composition:context.composition});
  return representative;
}
