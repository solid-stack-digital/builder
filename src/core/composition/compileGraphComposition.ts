import fs from "node:fs";
import path from "node:path";
import { parse } from "yaml";
import { ConfigError } from "../../errors/ConfigError.js";
import type { Environment, TesterService } from "../../types/index.js";
import { deriveProjectName } from "../../utils/projectName.js";
import { getDockerComposeTemplate } from "../templates.js";
import { assertDotenvDoesNotDefineKeys, assertNoBuilderOwnedEnvKeys, EXEC_MODE_KEY, INFRA_MODE_KEY, PORT_KEY } from "../config/builderEnvironment.js";
import { executionProfile } from "../config/executionProfile.js";
import { allocateHostPorts } from "../config/hostPorts.js";
import { resolveInsideProject, resolveApplicationDockerfile } from "../config/pathSafety.js";
import { resolvePublicationIntent } from "../config/publication.js";
import { interpolateBuilderReferences } from "../config/references.js";
import { buildDeclaredGraph, selectReachableGraph } from "../config/serviceGraph.js";
import type { EffectiveBuildConfig, EffectiveGraph, EffectiveMeshConfig, GraphNode, NodeId, Origin, ResolvedEndpoint } from "../config/types.js";
import { displayNode, nodeId } from "../config/types.js";
import { assertComposeLifecycleAcyclic } from "./assertComposeLifecycleAcyclic.js";
import { addComposeCondition } from "./composeDependsOn.js";
import { normalizeComposeEnvironment } from "./composeEnvironment.js";
import { normalizeNetworks } from "./composeNetworks.js";
import { rebaseAppOverridePaths, rebaseComposePaths } from "./composePaths.js";
import { GeneratedComposeNameAllocator } from "./generatedNames.js";
import { loadComposeDocument } from "./loadCompose.js";
import { mergeMainOverride } from "./mergeMainOverride.js";
import { namespaceDependencyCompose } from "./namespaceDependencyCompose.js";
import type { CompiledComposition, ComposeDocument, ComposeService, DeferredHealthCheck, MaterializedModule } from "./types.js";
import { validateMaterializedComposeFiles } from "./validateMaterializedComposeFiles.js";
import { validateMaterializedComposeBuildInputs } from "./validateMaterializedComposeBuildInputs.js";
import { validateAndPrepareMainOverride } from "./validateOverrideCompose.js";
import { validateServiceCompose } from "./validateServiceCompose.js";
import { compileTester } from "./compileTester.js";
import { assertMainDockerfileContract } from "../checkers/checkDockerfileContract.js";

export interface GraphCompileInput { stage: Environment; composition: "service"|"mesh"; projectDir: string; name: string; instances: Map<string,EffectiveBuildConfig>; mesh?: EffectiveMeshConfig; full?: boolean; validationMode?: boolean }
export const BUILDER_OWNER_LABEL="dev.solidstack.builder.owned";
const unique = (array: string[]): string[] => [...new Set(array)];
const copyOrigin = (origin: Origin, root: string|undefined): Origin => root ? {...origin,meshRoot:root} : origin;
function makeGraph(input: GraphCompileInput): EffectiveGraph {
  const nodes=new Map<NodeId,GraphNode>();const roots:NodeId[]=[];
  for(const [rootKey,build] of input.instances){const root=rootKey||undefined;roots.push(nodeId(root,"main"));
    for(const [name,declaration] of Object.entries(build.services)){
      if(name==="tester")continue;
      const id=nodeId(root,name),origin=copyOrigin(build.origins.get(name)!,root);
      nodes.set(id,{id,kind:name==="main"?"main":"ordinary",projectDir:build.projectDir,sourceService:name,...(root?{meshRoot:root}:{}),declaration:declaration as GraphNode["declaration"],envLayers:[],origin,envOrigins:new Map([...build.envOrigins.get(name)??[]].map(([key,value])=>[key,copyOrigin(value,root)])),requisiteOrigins:new Map([...build.requisiteOrigins.get(name)??[]].map(([key,value])=>[key,copyOrigin(value,root)]))});
    }
  }
  const tester=input.mesh?.tester??input.instances.get("")?.services.tester as TesterService;
  const testerOrigin:Origin=input.mesh?{sourceFile:input.mesh.sourceFile,configPath:"services.tester",projectDir:input.projectDir,scope:"mesh",layer:"base"}:{sourceFile:input.instances.get("")!.sourceFile,configPath:"services.tester",projectDir:input.projectDir,scope:"build",layer:"base"};
  const declared=buildDeclaredGraph({nodes,roots,tester,testerOrigin,stage:input.stage,composition:input.composition});
  return selectReachableGraph(declared,{infraMode:executionProfile(input.stage,input.composition,input.full).infraMode,stage:input.stage});
}
function mergeDocument(target:ComposeDocument, fragment:ComposeDocument, origin:Origin, stage:string):void {
  for(const section of ["services","volumes","networks","configs","secrets"] as const){const values=fragment[section];if(!values)continue;const output=(target[section]??={}) as Record<string,unknown>;for(const [key,value] of Object.entries(values)){if(key in output)throw new ConfigError({sourceFile:origin.sourceFile,configPath:`${origin.configPath}.${section}.${key}`,stage,composition:origin.scope==="mesh"?"mesh":"service",reason:"Generated Compose identity collision"});output[key]=value;}}
}
function withBuilderNetwork(service:ComposeService):void{if(service.network_mode!==undefined)return;service.networks={...normalizeNetworks(service.networks),builder:null};}
function markOwned(value:Record<string,unknown>):void {const current=value.labels;const labels=Array.isArray(current)?Object.fromEntries(current.filter((item):item is string=>typeof item==="string").map(item=>{const index=item.indexOf("=");return index<0?[item,""]:[item.slice(0,index),item.slice(index+1)];})):current&&typeof current==="object"?{...current as Record<string,unknown>}:{ };labels[BUILDER_OWNER_LABEL]="true";value.labels=labels;}
function selectedOverride(build:EffectiveBuildConfig,name:string):{path:string;origin:Origin}|undefined {
  let result:{path:string;origin:Origin}|undefined;
  for(const layer of build.layers){const patch=layer.services[name];const value=patch?.["override-compose"];if(typeof value==="string")result={path:value,origin:{...layer.origin,configPath:`${layer.origin.configPath}.${name}.override-compose`}};}
  return result;
}
function mainSeed(stage:Environment):ComposeService {
  const base=parse(fs.readFileSync(getDockerComposeTemplate("docker-compose.base.yml"),"utf8")) as ComposeDocument;
  const overlay=parse(fs.readFileSync(getDockerComposeTemplate(`docker-compose.${stage}.yml`),"utf8")) as ComposeDocument;
  return {...base.services.main,...overlay.services.main,build:{...base.services.main?.build as object,...overlay.services.main?.build as object}};
}
function portKey(id:NodeId,endpoint:string):string{return `${displayNode(id)}.endpoints.${endpoint}`;}
function addPort(service:ComposeService,endpoint:ResolvedEndpoint):void {service.ports=[...(service.ports??[]),{target:endpoint.networkPort,published:endpoint.publicPort,host_ip:"127.0.0.1",protocol:"tcp"}];}
function resolveJsonEnv(node:GraphNode, graph:EffectiveGraph, endpoints:Map<NodeId,Record<string,ResolvedEndpoint>>, stage:Environment, composition:"service"|"mesh", shadowed:Set<string>):Record<string,string> {
  const output:Record<string,string>={};for(const [key,value] of Object.entries(node.declaration.env)){
    if(shadowed.has(key))continue;
    const origin=node.envOrigins.get(key)??node.origin;
    output[key]=interpolateBuilderReferences(value,{graph,endpoints,consumer:node.id,origin,stage,composition}).replace(/\$/g,"$$$$");
  }return output;
}
function validateJsonEnv(node:GraphNode,graph:EffectiveGraph,endpoints:Map<NodeId,Record<string,ResolvedEndpoint>>,stage:Environment,composition:"service"|"mesh",shadowed:Set<string>):void{resolveJsonEnv(node,graph,endpoints,stage,composition,shadowed);}
function validateReserved(node:GraphNode,keys:string[],stage:Environment,composition:"service"|"mesh"):void{
  for(const key of keys)if(key in node.declaration.env){const origin=node.envOrigins.get(key)??node.origin;assertNoBuilderOwnedEnvKeys({[key]:node.declaration.env[key]},[key],{sourceFile:origin.sourceFile,configPath:origin.configPath.replace(/\.env\.[^.]+$/,'.env'),stage,composition});}
}
export function compileGraphComposition(input:GraphCompileInput):CompiledComposition {
  const profile=executionProfile(input.stage,input.composition,input.full),graph=makeGraph(input),allocator=new GeneratedComposeNameAllocator(["builder"]);
  const projectName=deriveProjectName(input.name,input.stage,input.projectDir),compose:ComposeDocument={name:projectName,services:{},networks:{builder:{driver:"bridge"}}};
  const mainServiceNames=new Map<NodeId,string>(),modules=new Map<NodeId,MaterializedModule>(),runtimeServiceNames:string[]=[],deferredHealthChecks:DeferredHealthCheck[]=[];
  const mainOverrideEnv=new Map<NodeId,Record<string,string|null>>();
  for(const [id,node] of [...graph.nodes].sort(([a],[b])=>a.localeCompare(b))){
    if(node.kind==="main"){
      resolveApplicationDockerfile(node.projectDir,"Dockerfile",input.stage);
      assertMainDockerfileContract(node.projectDir,profile.mainTarget);
      const serviceName=allocator.allocate(JSON.stringify([id,"main"]),node.meshRoot??"main");mainServiceNames.set(id,serviceName);
      const service=mainSeed(input.stage);
      const build=service.build as Record<string,unknown>;build.context=path.relative(input.projectDir,node.projectDir).replace(/\\/g,"/")||".";build.dockerfile="Dockerfile";build.target=profile.mainTarget;service.build=build;
      service.env_file=[{path:path.relative(input.projectDir,path.join(node.projectDir,`.env.${profile.envStage}`)).replace(/\\/g,"/"),required:false}];
      const selected=selectedOverride(input.instances.get(node.meshRoot??"")!,"main");
      if(selected){const file=resolveInsideProject(selected.origin.projectDir,selected.path,{sourceFile:selected.origin.sourceFile,configPath:selected.origin.configPath,stage:input.stage});const raw=loadComposeDocument(file,{sourceFile:selected.origin.sourceFile,configPath:selected.origin.configPath,stage:input.stage,composition:input.composition});const rebased=rebaseAppOverridePaths(raw,selected.origin.projectDir,input.projectDir);const prepared=validateAndPrepareMainOverride(rebased,{file,stage:input.stage,expectedBuildContext:String(build.context),buildContextBaseDir:input.projectDir,allocator,resourceNamespace:node.meshRoot??"main"});validateMaterializedComposeFiles(raw,file,input.stage,{baseDir:selected.origin.projectDir,composition:input.composition});for(const section of ["volumes","networks","configs","secrets"] as const)if(prepared.resources[section])mergeDocument(compose,{services:{},[section]:prepared.resources[section]} as ComposeDocument,selected.origin,input.stage);
        mainOverrideEnv.set(id,normalizeComposeEnvironment(prepared.main.environment,`${selected.origin.configPath}.services.main.environment`));
        const overlay={...prepared.main};delete overlay.environment;delete overlay.build;
        Object.assign(service,mergeMainOverride(service,overlay));
        if(prepared.main.build&&typeof prepared.main.build==="object")Object.assign(service.build as Record<string,unknown>,{args:(prepared.main.build as Record<string,unknown>).args});
      }
      withBuilderNetwork(service);compose.services[serviceName]=service;runtimeServiceNames.push(serviceName);
    }else{
      const def=node.declaration;if(def.kind!=="ordinary")continue;
      const file=resolveInsideProject(node.projectDir,def.compose,{sourceFile:node.origin.sourceFile,configPath:`${node.origin.configPath}.compose`,stage:input.stage});
      const raw=loadComposeDocument(file,{sourceFile:node.origin.sourceFile,configPath:`${node.origin.configPath}.compose`,stage:input.stage,composition:input.composition});
      for(const [local,service] of Object.entries(raw.services??{})){
        const envFiles=Array.isArray(service.env_file)?service.env_file:service.env_file?[service.env_file]:[];
        for(const item of envFiles){const candidate=typeof item==="string"?item:item&&typeof item==="object"?(item as {path?:unknown}).path:undefined;if(typeof candidate==="string")assertDotenvDoesNotDefineKeys(path.resolve(path.dirname(file),candidate),[EXEC_MODE_KEY,INFRA_MODE_KEY],{configPath:`services.${local}.env_file`,stage:input.stage,composition:input.composition});}
      }
      let deferredHealthRepresentative:string|undefined;
      const representative=validateServiceCompose(displayNode(id),def,raw,{composePath:file,stage:input.stage,composition:input.composition,declarationOrigin:node.origin,healthRequired:input.stage==="e2e"&&graph.lifecycle.get(id)!=="prerequisite"||graph.edges.some(edge=>edge.target===id&&edge.kind==="dependency"),prerequisite:graph.lifecycle.get(id)==="prerequisite",deferHealth:name=>{deferredHealthRepresentative=name;}});
      validateMaterializedComposeFiles(raw,file,input.stage,{composition:input.composition});validateMaterializedComposeBuildInputs(raw,file,input.stage,input.composition);
      const rebased=rebaseComposePaths(raw,file,input.projectDir),prefix=node.meshRoot?`svc--${node.meshRoot}--${node.sourceService}`:`svc--${node.sourceService}`;
      const named=namespaceDependencyCompose({dependencyKey:displayNode(id),namespacePrefix:prefix,document:rebased,allocator,identityPrefix:id});
      if(deferredHealthRepresentative){const serviceName=named.serviceNameMap.get(deferredHealthRepresentative)!,service=named.document.services[serviceName]!;const image=typeof service.image==="string"?service.image:`${projectName}-${serviceName}`;if(service.build===undefined&&service.image===undefined)throw new ConfigError({sourceFile:file,configPath:`services.${deferredHealthRepresentative}.healthcheck`,stage:input.stage,composition:input.composition,reason:"Required healthcheck has no Compose declaration or inspectable image"});deferredHealthChecks.push({serviceName,image,sourceFile:file,configPath:`services.${deferredHealthRepresentative}.healthcheck`});}
      for(const service of Object.values(named.document.services))withBuilderNetwork(service);
      const endpointOwnerMap=new Map<string,string>();for(const [endpoint,value] of Object.entries(def.endpoints))endpointOwnerMap.set(endpoint,named.serviceNameMap.get(value.service)!);
      const module:MaterializedModule={nodeId:id,sourceFile:file,document:named.document,serviceNameMap:named.serviceNameMap,representative:named.serviceNameMap.get(representative)!,serviceNames:Object.keys(named.document.services),endpointOwnerMap};
      modules.set(id,module);mergeDocument(compose,named.document,node.origin,input.stage);runtimeServiceNames.push(...module.serviceNames);
    }
  }
  const endpoints=new Map<NodeId,Record<string,ResolvedEndpoint>>();
  for(const [id,node] of graph.nodes){const records:Record<string,ResolvedEndpoint>={};for(const [name,definition] of Object.entries(node.declaration.endpoints)){const owner=node.kind==="main"?mainServiceNames.get(id)!:modules.get(id)!.endpointOwnerMap.get(name)!;records[name]={logicalPath:portKey(id,name),networkHost:owner,networkPort:definition.port,...(definition.scheme?{scheme:definition.scheme}:{}),effectivelyPublished:false};}endpoints.set(id,records);}
  const publish=input.mesh?new Map(Object.entries(input.mesh.services).map(([root,entry])=>[root,entry.publish])):undefined;
  const publishOrigins=input.mesh?new Map(Object.entries(input.mesh.services).flatMap(([root,entry])=>entry.publishOrigin?[[root,entry.publishOrigin] as const]:[])):undefined;
  const intents=resolvePublicationIntent(graph,input.stage,input.composition,publish,input.mesh?.sourceFile,publishOrigins);
  for(const item of intents){const record=endpoints.get(item.nodeId)![item.endpoint]!;record.effectivelyPublished=true;record.publicHost="127.0.0.1";record.publicPort=1;}
  // Validate only winning Builder JSON references before any AUTO allocation.
  for(const [id,node] of graph.nodes){const override=mainOverrideEnv.get(id)??{};const shadowed=new Set(node.kind==="main"?Object.keys(override).filter(key=>node.envOrigins.get(key)?.scope!=="mesh"):[]);validateJsonEnv(node,graph,endpoints,input.stage,input.composition,shadowed);}
  const tester=input.mesh?.tester??input.instances.get("")?.services.tester as TesterService;
  const testerOrigin:Origin=input.mesh?{sourceFile:input.mesh.sourceFile,configPath:"services.tester",projectDir:input.projectDir,scope:"mesh",layer:"base"}:{sourceFile:input.instances.get("")!.sourceFile,configPath:"services.tester",projectDir:input.projectDir,scope:"build",layer:"base"};
  const testerLayers=input.mesh?input.mesh.testerLayers.map(layer=>({entry:layer.services.tester,origin:layer.origin})):input.instances.get("")!.layers.map(layer=>({entry:layer.services.tester,origin:{...layer.origin,configPath:`${layer.origin.configPath}.tester`}}));
  let serviceOrigin:Origin={...testerOrigin,configPath:`${testerOrigin.configPath}.service`};
  const testerEnvOrigins=new Map<string,Origin>();
  for(const layer of testerLayers){const entry=layer.entry as Record<string,unknown>|undefined;if(!entry)continue;if(entry.service!==undefined)serviceOrigin={...layer.origin,configPath:`${layer.origin.configPath}.service`};for(const key of Object.keys((entry.env as Record<string,unknown>)??{}))testerEnvOrigins.set(key,{...layer.origin,configPath:`${layer.origin.configPath}.env.${key}`});}
  const testerMetadata=profile.attachTester?compileTester({tester,origin:testerOrigin,serviceOrigin,envOrigins:testerEnvOrigins,graph,endpoints,stage:input.stage,composition:input.composition,projectDir:input.projectDir,allocator,validationOnly:true}):undefined;
  const allocations=allocateHostPorts(input.projectDir,input.stage,intents.map(item=>({logicalPath:item.logicalPath,requested:item.requestedPort})),Boolean(input.validationMode),{sourceFile:input.mesh?.sourceFile??input.instances.get("")!.sourceFile,composition:input.composition});
  for(const item of intents){const record=endpoints.get(item.nodeId)![item.endpoint]!;record.publicPort=allocations.get(item.logicalPath)!;const owner=graph.nodes.get(item.nodeId)!.kind==="main"?mainServiceNames.get(item.nodeId)!:modules.get(item.nodeId)!.endpointOwnerMap.get(item.endpoint)!;addPort(compose.services[owner]!,record);}
  for(const [id,node] of graph.nodes){const primary=Object.values(node.declaration.endpoints).find(endpoint=>endpoint.primary);const reserved=node.kind==="main"?[EXEC_MODE_KEY,INFRA_MODE_KEY,...(primary?[PORT_KEY]:[])]:[EXEC_MODE_KEY,INFRA_MODE_KEY];validateReserved(node,reserved,input.stage,input.composition);
    if(node.kind==="main"){
      const service=compose.services[mainServiceNames.get(id)!]!,override=mainOverrideEnv.get(id)??{};
      assertNoBuilderOwnedEnvKeys(override,reserved,{sourceFile:node.origin.sourceFile,configPath:"services.main.override-compose.environment",stage:input.stage,composition:input.composition});
      assertDotenvDoesNotDefineKeys(path.join(node.projectDir,`.env.${profile.envStage}`),reserved,{configPath:`.env.${profile.envStage}`,stage:input.stage,composition:input.composition});
      const buildEnv=resolveJsonEnv(node,graph,endpoints,input.stage,input.composition,new Set(Object.keys(override).filter(key=>node.envOrigins.get(key)?.scope!=="mesh")));
      const sourceEnv=Object.fromEntries(Object.entries(buildEnv).filter(([key])=>node.envOrigins.get(key)?.scope!=="mesh"));
      const meshEnv=Object.fromEntries(Object.entries(buildEnv).filter(([key])=>node.envOrigins.get(key)?.scope==="mesh"));
      service.environment={...sourceEnv,...override,...meshEnv,EXEC_MODE:profile.execMode,INFRA_MODE:profile.infraMode,...(primary?{PORT:String(primary.port)}:{})};
    }else{
      const module=modules.get(id)!;for(const name of module.serviceNames){const service=compose.services[name]!;const defaults=normalizeComposeEnvironment(service.environment,`services.${name}.environment`);assertNoBuilderOwnedEnvKeys(defaults,[EXEC_MODE_KEY,INFRA_MODE_KEY],{sourceFile:module.sourceFile,configPath:`services.${name}.environment`,stage:input.stage,composition:input.composition});service.environment={...defaults,...resolveJsonEnv(node,graph,endpoints,input.stage,input.composition,new Set())};}
    }
  }
  for(const edge of graph.edges){if(edge.kind==="requirement")continue;const consumer=graph.nodes.get(edge.consumer)!,target=graph.nodes.get(edge.target)!;const targetName=target.kind==="main"?mainServiceNames.get(edge.target)!:modules.get(edge.target)!.representative;const memberNames=consumer.kind==="main"?[mainServiceNames.get(edge.consumer)!]:modules.get(edge.consumer)!.serviceNames;for(const name of memberNames)addComposeCondition(compose.services[name]!,targetName,edge.kind==="dependency"?"service_healthy":"service_completed_successfully");}
  let testerServiceName:string|undefined,testerServiceNames:string[]=[];
  if(profile.attachTester){const built=compileTester({tester,origin:testerOrigin,serviceOrigin,envOrigins:testerEnvOrigins,graph,endpoints,stage:input.stage,composition:input.composition,projectDir:input.projectDir,allocator,validationOnly:false});mergeDocument(compose,built.document,testerOrigin,input.stage);testerServiceName=built.runner;testerServiceNames=built.serviceNames;const runner=compose.services[built.runner]!;for(const [id,node] of graph.nodes){const target=node.kind==="main"?mainServiceNames.get(id)!:modules.get(id)!.representative;addComposeCondition(runner,target,graph.lifecycle.get(id)==="prerequisite"?"service_completed_successfully":"service_healthy");}}
  assertComposeLifecycleAcyclic(compose.services,{sourceFile:input.mesh?.sourceFile??input.instances.get("")!.sourceFile,stage:input.stage,composition:input.composition});allocator.assertUnique();
  for(const service of Object.values(compose.services))markOwned(service);
  for(const section of ["networks","volumes"] as const)for(const resource of Object.values(compose[section]??{}))if(resource&&typeof resource==="object"&&!Array.isArray(resource)&&!(resource as {external?:unknown}).external)markOwned(resource as Record<string,unknown>);
  return {compose,projectName,graph,mainServiceNames,modules,endpoints,runtimeServiceNames:unique(runtimeServiceNames),testerServiceNames,...(testerServiceName?{testerServiceName}:{}),allocations,deferredHealthChecks};
}
