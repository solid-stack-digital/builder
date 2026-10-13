import path from "node:path";
import { ConfigError } from "../../../errors/ConfigError.js";
import { assertDotenvDoesNotDefineKeys, assertNoBuilderOwnedEnvKeys, EXEC_MODE_KEY, INFRA_MODE_KEY } from "../../config/builderEnvironment.js";
import { resolveInsideProject } from "../../config/pathSafety.js";
import { GeneratedComposeNameAllocator } from "../../composition/generatedNames.js";
import { loadComposeDocument } from "../../composition/loadCompose.js";
import { namespaceDependencyCompose } from "../../composition/namespaceDependencyCompose.js";
import { normalizeComposeDependsOn } from "../../composition/composeDependsOn.js";
import { normalizeComposeEnvironment } from "../../composition/composeEnvironment.js";
import { validateComposeResourceReferences } from "../../composition/validateComposeResourceReferences.js";
import { assertComposeLifecycleAcyclic } from "../../composition/assertComposeLifecycleAcyclic.js";
import { assertNoServiceBuildContexts } from "../../composition/composeBuildResources.js";
import { rebaseComposePaths } from "../../composition/composePaths.js";
import { validateMaterializedComposeFiles } from "../../composition/validateMaterializedComposeFiles.js";
import { validateMaterializedComposeBuildInputs } from "../../composition/validateMaterializedComposeBuildInputs.js";
import type { ComposeDocument, ComposeService } from "../../composition/types.js";
import type { MeshTesterConfig } from "../types.js";
import type { MeshEndpointRegistry } from "./types.js";
import { assertMeshTesterEnvPublic, resolveMeshEnvMap, type MeshReferenceContext } from "./meshReferences.js";

export interface CompiledMeshTester { services:Record<string,ComposeService>;volumes?:Record<string,unknown>;networks?:Record<string,unknown>;configs?:Record<string,unknown>;secrets?:Record<string,unknown>;runnerServiceName:string; }

function appendEnvFile(existing:ComposeService["env_file"],next:{path:string;required:boolean}):unknown[]{
 if(existing===undefined)return[next];return Array.isArray(existing)?[...existing,next]:[existing,next];
}
function envFilePaths(value:unknown):string[]{
 const entries=Array.isArray(value)?value:[value];return entries.flatMap(entry=>typeof entry==="string"?[entry]:entry&&typeof entry==="object"&&typeof (entry as any).path==="string"?[(entry as any).path]:[]);
}
function validateServiceReferences(document:ComposeDocument,sourceFile:string,stage:string):void{
 for(const [name,service] of Object.entries(document.services)){
  const refs:string[]=[];const add=(value:unknown)=>{if(typeof value==="string"&&value)refs.push(value);};
  if(Array.isArray(service.depends_on))service.depends_on.forEach(add);else if(service.depends_on&&typeof service.depends_on==="object")Object.keys(service.depends_on).forEach(add);
  if(Array.isArray(service.links))service.links.forEach(value=>add(typeof value==="string"?value.split(":")[0]:undefined));
  if(Array.isArray(service.volumes_from))service.volumes_from.forEach(value=>add(typeof value==="string"?value.split(":")[0]:undefined));
  for(const key of ["network_mode","ipc","pid"] as const){const value=service[key];if(typeof value==="string"&&value.startsWith("service:"))add(value.slice("service:".length));}
  for(const ref of refs)if(!document.services[ref])throw new ConfigError({sourceFile,configPath:`services.${name}`,stage,composition:"mesh",referencedObject:ref,reason:"Tester Compose service reference does not exist"});
 }
}
function applyTesterBuildTarget(service:ComposeService):void{
 if(service.build===undefined)return;
 if(typeof service.build==="string"){service.build={context:service.build,target:"test-e2e"};return;}
 if(service.build&&typeof service.build==="object"&&!Array.isArray(service.build))service.build={...(service.build as Record<string,unknown>),target:"test-e2e"};
}

export function compileMeshTester(meshDir:string,tester:MeshTesterConfig,endpointRegistry:MeshEndpointRegistry,effectiveTopLevelApps:string[],stage:"e2e",referenceContext?:MeshReferenceContext,nameAllocator=new GeneratedComposeNameAllocator(effectiveTopLevelApps)):CompiledMeshTester{
 const meshPath=path.join(meshDir,"mesh.json"),file=resolveInsideProject(meshDir,tester.compose,{sourceFile:meshPath,configPath:"tester.compose",stage});
 const sourceDocument=loadComposeDocument(file,{sourceFile:meshPath,configPath:"tester.compose",stage,composition:"mesh"});
 const raw=rebaseComposePaths(sourceDocument,file,meshDir);
 if(!raw.services||!raw.services[tester.service])throw new ConfigError({sourceFile:meshPath,configPath:"tester.service",stage,composition:"mesh",value:tester.service,reason:"Selected tester service does not exist in tester Compose"});
 validateComposeResourceReferences(raw,{sourceFile:file,stage,composition:"mesh"});
 validateServiceReferences(raw,file,stage);
 assertComposeLifecycleAcyclic(raw.services, {
  sourceFile: file,
  stage,
  composition: "mesh",
 });
 for(const [serviceName,service] of Object.entries(raw.services)){
  if(service.extends!==undefined)throw new ConfigError({sourceFile:file,configPath:`services.${serviceName}.extends`,stage,composition:"mesh",reason:"Tester Compose extends is unsupported until effective Compose inheritance can be validated safely"});
  assertNoServiceBuildContexts(service,`services.${serviceName}`,file);
 }
 const selectedRaw=raw.services[tester.service]!;
 if(selectedRaw.network_mode!==undefined&&selectedRaw.network_mode!=="host")throw new ConfigError({sourceFile:file,configPath:`services.${tester.service}.network_mode`,stage,composition:"mesh",reason:"Selected tester runner must be compatible with host networking"});
 if(selectedRaw.networks!==undefined)throw new ConfigError({sourceFile:file,configPath:`services.${tester.service}.networks`,stage,composition:"mesh",reason:"Selected host-network tester runner cannot declare Compose networks"});
 if(selectedRaw.ports!==undefined)throw new ConfigError({sourceFile:file,configPath:`services.${tester.service}.ports`,stage,composition:"mesh",reason:"Selected host-network tester runner cannot define ports"});
 validateMaterializedComposeFiles(sourceDocument,file,stage,{composition:"mesh"});
 validateMaterializedComposeBuildInputs(sourceDocument,file,stage,"mesh");

 const meshCtx:MeshReferenceContext=referenceContext??{services:{},bindings:new Map(),endpoints:endpointRegistry,stage,meshJsonPath:meshPath};
 const testerBuilderKeys=[EXEC_MODE_KEY,INFRA_MODE_KEY] as const,rawRunnerEnvironment=normalizeComposeEnvironment(selectedRaw.environment,"tester runner environment");
 assertNoBuilderOwnedEnvKeys(rawRunnerEnvironment,testerBuilderKeys,{sourceFile:file,configPath:`services.${tester.service}.environment`,stage,composition:"mesh"});
 for(const envFile of envFilePaths(selectedRaw.env_file))assertDotenvDoesNotDefineKeys(path.resolve(meshDir,envFile),testerBuilderKeys,{configPath:`services.${tester.service}.env_file`,stage,composition:"mesh"});
 const meshTesterDotenv=path.join(meshDir,".env.e2e-tester");assertDotenvDoesNotDefineKeys(meshTesterDotenv,testerBuilderKeys,{configPath:".env.e2e-tester",stage,composition:"mesh"});
 const testerEnv=tester.env??{};assertNoBuilderOwnedEnvKeys(testerEnv,testerBuilderKeys,{sourceFile:meshPath,configPath:"tester.env",stage,composition:"mesh"});assertMeshTesterEnvPublic(testerEnv,meshCtx);

 const ns=namespaceDependencyCompose({dependencyKey:"mesh-tester",namespacePrefix:"mesh-tester",document:raw,allocator:nameAllocator,identityPrefix:JSON.stringify(["mesh-tester"])});
 const runner=ns.serviceNameMap.get(tester.service)!;const runnerSvc=ns.document.services[runner]!;applyTesterBuildTarget(runnerSvc);runnerSvc.network_mode="host";delete runnerSvc.networks;runnerSvc.env_file=appendEnvFile(runnerSvc.env_file,{path:".env.e2e-tester",required:false});
 runnerSvc.environment={...normalizeComposeEnvironment(runnerSvc.environment,"tester runner environment"),...resolveMeshEnvMap(testerEnv,meshCtx,"tester.env"),EXEC_MODE:"e2e"};
 const depends=normalizeComposeDependsOn(runnerSvc.depends_on);for(const app of effectiveTopLevelApps)depends[app]={condition:"service_healthy"};runnerSvc.depends_on=depends;
 return {services:ns.document.services as Record<string,ComposeService>,...(ns.document.volumes?{volumes:ns.document.volumes}:{}),...(ns.document.networks?{networks:ns.document.networks}:{}),...(ns.document.configs?{configs:ns.document.configs}:{}),...(ns.document.secrets?{secrets:ns.document.secrets}:{}),runnerServiceName:runner};
}
