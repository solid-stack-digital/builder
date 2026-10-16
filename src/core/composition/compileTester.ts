import path from "node:path";
import { ConfigError } from "../../errors/ConfigError.js";
import type { TesterService } from "../../types/index.js";
import { assertDotenvDoesNotDefineKeys, assertNoBuilderOwnedEnvKeys } from "../config/builderEnvironment.js";
import { resolveInsideProject } from "../config/pathSafety.js";
import { interpolateBuilderReferences } from "../config/references.js";
import type { EffectiveGraph, NodeId, Origin, ResolvedEndpoint } from "../config/types.js";
import { assertComposeLifecycleAcyclic } from "./assertComposeLifecycleAcyclic.js";
import { normalizeComposeEnvironment } from "./composeEnvironment.js";
import { normalizeNetworks } from "./composeNetworks.js";
import { rebaseComposePaths } from "./composePaths.js";
import { GeneratedComposeNameAllocator } from "./generatedNames.js";
import { loadComposeDocument } from "./loadCompose.js";
import { namespaceDependencyCompose } from "./namespaceDependencyCompose.js";
import type { ComposeDocument } from "./types.js";
import { validateMaterializedComposeBuildInputs } from "./validateMaterializedComposeBuildInputs.js";
import { validateMaterializedComposeFiles } from "./validateMaterializedComposeFiles.js";
import { validateComposeResourceReferences } from "./validateComposeResourceReferences.js";
import { readDotenvValues } from "./dotenv.js";
import { parseVolume, isHostFilesystemRoot } from "./composeVolumes.js";
export interface TesterCompileInput { tester:TesterService; origin:Origin; serviceOrigin?:Origin; envOrigins?:Map<string,Origin>; graph:EffectiveGraph; endpoints:Map<NodeId,Record<string,ResolvedEndpoint>>; stage:string; composition:"service"|"mesh"; projectDir:string; allocator:GeneratedComposeNameAllocator; validationOnly:boolean }
export interface TesterCompileResult { document:ComposeDocument; runner:string; serviceNames:string[] }
export function compileTester(input:TesterCompileInput):TesterCompileResult {
  const {tester,origin,stage,composition}=input;
  const file=resolveInsideProject(origin.projectDir,tester.compose,{sourceFile:origin.sourceFile,configPath:`${origin.configPath}.compose`,stage});
  const raw=loadComposeDocument(file,{sourceFile:origin.sourceFile,configPath:`${origin.configPath}.compose`,stage,composition});
  if(!raw.services?.[tester.service])throw new ConfigError({sourceFile:input.serviceOrigin?.sourceFile??origin.sourceFile,configPath:input.serviceOrigin?.configPath??`${origin.configPath}.service`,stage,composition,referencedObject:tester.service,reason:"Selected tester service does not exist"});
  if(raw.include!==undefined)throw new ConfigError({sourceFile:file,configPath:"include",stage,composition,reason:"Tester Compose include is unsupported"});
  validateComposeResourceReferences(raw,{sourceFile:file,stage,composition});
  assertComposeLifecycleAcyclic(raw.services,{sourceFile:file,stage,composition});
  for(const [name,service] of Object.entries(raw.services)){
    if(service.ports!==undefined||service.container_name!==undefined||service.privileged===true)throw new ConfigError({sourceFile:file,configPath:`services.${name}`,stage,composition,reason:"Tester Compose cannot own ports, fixed container names or privileged mode"});
    for(const volume of Array.isArray(service.volumes)?service.volumes:[]){const mount=parseVolume(volume);if(mount?.type==="bind"&&mount.source&&isHostFilesystemRoot(mount.source))throw new ConfigError({sourceFile:file,configPath:`services.${name}.volumes`,stage,composition,reason:"host root bind mounts are forbidden"});}
    assertNoBuilderOwnedEnvKeys(normalizeComposeEnvironment(service.environment,`services.${name}.environment`),["EXEC_MODE","INFRA_MODE"],{sourceFile:file,configPath:`services.${name}.environment`,stage,composition});
    const files=Array.isArray(service.env_file)?service.env_file:service.env_file?[service.env_file]:[];
    for(const item of files){const candidate=typeof item==="string"?item:item&&typeof item==="object"?(item as {path?:unknown}).path:undefined;if(typeof candidate==="string")assertDotenvDoesNotDefineKeys(path.resolve(path.dirname(file),candidate),["EXEC_MODE","INFRA_MODE"],{configPath:`services.${name}.env_file`,stage,composition});}
  }
  validateMaterializedComposeFiles(raw,file,stage,{composition});validateMaterializedComposeBuildInputs(raw,file,stage,composition);
  for(const [key,value] of Object.entries(tester.env??{})){const leaf=input.envOrigins?.get(key)??{...origin,configPath:`${origin.configPath}.env.${key}`};assertNoBuilderOwnedEnvKeys({[key]:value},["EXEC_MODE","INFRA_MODE"],{sourceFile:leaf.sourceFile,configPath:leaf.configPath.slice(0,leaf.configPath.lastIndexOf(".")),stage,composition});}
  const dotenv=path.join(origin.projectDir,".env.e2e-tester");assertDotenvDoesNotDefineKeys(dotenv,["EXEC_MODE","INFRA_MODE"],{configPath:".env.e2e-tester",stage,composition});
  const rebased=rebaseComposePaths(raw,file,input.projectDir);
  const named=namespaceDependencyCompose({dependencyKey:"tester",namespacePrefix:"tester",document:rebased,allocator:input.allocator,identityPrefix:JSON.stringify([composition,"tester"])});
  const runner=named.serviceNameMap.get(tester.service)!,selected=named.document.services[runner]!;
  for(const [name,service] of Object.entries(named.document.services)){
    if(name===runner)continue;
    if(service.network_mode===undefined)service.networks={...normalizeNetworks(service.networks),builder:null};
  }
  if(raw.services[tester.service]!.network_mode===undefined&&raw.services[tester.service]!.networks===undefined){selected.network_mode="host";delete selected.networks;}
  else if(selected.network_mode===undefined)selected.networks={...normalizeNetworks(selected.networks),builder:null};
  const defaults=normalizeComposeEnvironment(selected.environment,`services.${tester.service}.environment`);
  const resolved:Record<string,string>={};for(const [key,value] of Object.entries(tester.env??{})){
    const leaf=input.envOrigins?.get(key)??{...origin,configPath:`${origin.configPath}.env.${key}`};
    resolved[key]=interpolateBuilderReferences(value,{graph:input.graph,endpoints:input.endpoints,origin:leaf,stage,composition}).replace(/\$/g,"$$$$");
  }
  selected.env_file=[...(Array.isArray(selected.env_file)?selected.env_file:selected.env_file?[selected.env_file]:[]),{path:path.relative(input.projectDir,dotenv).replace(/\\/g,"/"),required:false}];
  const testerDotenv=Object.fromEntries(Object.entries(readDotenvValues(dotenv)).map(([key,value])=>[key,value.replace(/\$/g,"$$$$")]));
  selected.environment={...defaults,...testerDotenv,...resolved};
  return {document:named.document,runner,serviceNames:Object.keys(named.document.services)};
}
