import { GeneratedComposeNameAllocator } from "./generatedNames.js";
import { normalizeNetworks } from "./composeNetworks.js";
import { resolveApplicationDockerfile } from "../config/pathSafety.js";
import fs from "node:fs";
import path from "node:path";
import { parse } from "yaml";
import type { Environment } from "../../types/index.js";
import { ConfigError } from "../../errors/ConfigError.js";
import { resolveBuildStage } from "../config/resolveBuildStage.js";
import { resolveEndpointProperty, getPrimaryEndpoint } from "../config/endpointProperties.js";
import { collectBuilderReferences, interpolateBuilderReferences, assertTesterReferencesArePublic } from "../config/references.js";
import { allocateHostPorts, type PortIntent } from "../config/hostPorts.js";
import type { EndpointProperty, EffectiveBuildConfig, ResolvedEndpoint } from "../config/types.js";
import { PUBLIC_HOST } from "../config/constants.js";
import { resolveInsideProject } from "../config/pathSafety.js";
import { getBuildJson } from "../../utils/getBuildJson.js";
import { resolveProjectDir } from "../../utils/paths.js";
import { deriveProjectName } from "../../utils/projectName.js";
import { getDockerComposeTemplate } from "../templates.js";
import { loadComposeDocument } from "./loadCompose.js";
import { rebaseComposePaths, rebaseAppOverridePaths } from "./composePaths.js";
import { normalizeComposeEnvironment, mergeComposeEnvironment } from "./composeEnvironment.js";
import { namespaceDependencyCompose } from "./namespaceDependencyCompose.js";
import { validateDependencyCompose } from "./validateDependencyCompose.js";
import { validateAndPrepareAppOverride } from "./validateOverrideCompose.js";
import { applyDependencyLifecycle } from "./dependencyLifecycle.js";
import { buildStandaloneAppEndpoints, buildStandaloneDependencyEndpoints } from "./serviceEndpoints.js";
import type { ComposeEnvironmentMap, ComposeDocument, ComposeService, CompiledServiceComposition, MaterializedDependency, ServiceExecutionProfile } from "./types.js";

export interface CompileServiceCompositionOptions {nameAllocator?:GeneratedComposeNameAllocator|undefined; full?:boolean|undefined;silenceWarnings?:boolean|undefined;externalAppEnv?:Record<string,string>|undefined;namespacePrefix?:string|undefined;meshMode?:boolean|undefined;publishFilter?:Set<string>|undefined;suppressDependencies?:Set<string>|undefined;deferReferenceResolution?:boolean|undefined;projectNameOverride?:string|undefined;appServiceName?:string|undefined;composeOutputDir?:string|undefined;validationMode?:boolean|undefined; }
function getExecutionProfile(stage:Environment,full:boolean):ServiceExecutionProfile{switch(stage){case"dev":return{configStage:"dev",appTarget:"dev",runtimeStage:"dev",integrated:full,attachTester:false};case"prod":return{configStage:"prod",appTarget:"prod",runtimeStage:"prod",integrated:true,attachTester:false};case"test":return{configStage:"test",appTarget:"test",runtimeStage:"test",integrated:false,attachTester:false};case"e2e":return{configStage:"e2e",appTarget:"prod",runtimeStage:"e2e",integrated:true,attachTester:true,testerTarget:"test-e2e"};}}
function mergeObj<T extends Record<string,any>>(a:T,b:Record<string,any>):T{return Object.assign(a,b);}
function mergeDocument(target:ComposeDocument,source:ComposeDocument,context:string):void{for(const section of ["services","volumes","networks","configs","secrets"] as const){const src=(source as any)[section];if(!src)continue;const dst=((target as any)[section]??={}) as Record<string,unknown>;for(const [key,value] of Object.entries(src)){if(key in dst)throw new ConfigError({configPath:`${section}.${key}`,referencedObject:context,reason:"Internal Compose namespace collision"});dst[key]=value;}}}
function getTemplateSeed(stage:Environment,meshMode:boolean):ComposeDocument{const base=parse(fs.readFileSync(getDockerComposeTemplate("docker-compose.base.yml"),"utf8")) as ComposeDocument;const stageName=stage==="e2e"?"e2e":stage;const overlay=parse(fs.readFileSync(getDockerComposeTemplate(`docker-compose.${stageName}.yml`),"utf8")) as ComposeDocument;const merged:ComposeDocument={...base,services:{...(base.services??{})}};for(const [name,svc] of Object.entries(overlay.services??{}))merged.services[name]={...(merged.services[name]??{}),...svc,build:{...((merged.services[name]?.build as object)??{}),...((svc.build as object)??{})}};if(meshMode)delete merged.services.tester;return merged;}
function ownEnv(build:EffectiveBuildConfig,stage:Environment):Record<string,string>{const env={...build.app.env};const reserved=["EXEC_MODE","INFRA_MODE",...(getPrimaryEndpoint(build.app.endpoints)?["PORT"]:[])];for(const key of reserved)if(key in env)throw new ConfigError({sourceFile:"build.json",configPath:"app.env",stage,composition:"service",value:key,reason:"Application env cannot set a Builder-owned key"});return env;}
function resolveEnv(input:Record<string,string>,registry:(ref:any)=>string,source:string):Record<string,string>{const out:Record<string,string>={};for(const [key,value] of Object.entries(input)){collectBuilderReferences(value,"build",`${source}.${key}`);out[key]=interpolateBuilderReferences(value,"build",registry).replace(/\$/g,"$$$$");}return out;}
function addPorts(service:ComposeService,endpointPairs:Array<[ResolvedEndpoint,number]>):void{for(const [ep,hostPort] of endpointPairs){const ports=Array.isArray(service.ports)?service.ports:[];if(ports.some(p=>p&&typeof p==="object"&&(p as any).published===hostPort))throw new ConfigError({configPath:ep.logicalPath,stage:"service",value:hostPort,reason:"Duplicate host port publication"});ports.push({target:ep.networkPort,published:hostPort,host_ip:PUBLIC_HOST,protocol:"tcp"});service.ports=ports;}}
function healthDepends(service:ComposeService,target:string):void{const current=service.depends_on&&typeof service.depends_on==="object"&&!Array.isArray(service.depends_on)?service.depends_on as Record<string,unknown>:{};current[target]={condition:"service_healthy"};service.depends_on=current;}
export function compileServiceComposition(stage:Environment,projectDir:string,options:CompileServiceCompositionOptions={}):CompiledServiceComposition{
 const root=resolveProjectDir(projectDir),buildPath=path.join(root,"build.json"),raw=getBuildJson(root),effective=resolveBuildStage(raw,stage,buildPath),profile=getExecutionProfile(stage,Boolean(options.full));
 resolveApplicationDockerfile(root,raw.dockerfile??"Dockerfile",stage);
 const seed=getTemplateSeed(stage,Boolean(options.meshMode));const rawName=options.projectNameOverride??raw.name??path.basename(root);const projectName=deriveProjectName(rawName,stage);
 const nameAllocator=options.nameAllocator??new GeneratedComposeNameAllocator(["app","tester","default",options.appServiceName??"app"]);
 const namespaced:Record<string,{doc:ComposeDocument;map:Map<string,string>;source:string}>={};
 for(const [key,dep] of Object.entries(effective.dependencies).sort(([a],[b])=>a.localeCompare(b))){const sourcePath=resolveInsideProject(root,dep.compose,{sourceFile:buildPath,configPath:`dependencies.${key}.compose`,stage});const document=rebaseComposePaths(loadComposeDocument(sourcePath,{sourceFile:buildPath,configPath:`dependencies.${key}.compose`,stage,composition:"service"}),sourcePath,options.composeOutputDir??root);validateDependencyCompose(key,dep,document,{composePath:sourcePath,stage});if(Object.keys(dep.endpoints).length){const ns=namespaceDependencyCompose({dependencyKey:key,namespacePrefix:options.namespacePrefix?`${options.namespacePrefix}${key}`:`dep--${key}`,document,allocator:nameAllocator,identityPrefix:JSON.stringify(["service",options.appServiceName??"app","dependency",key])});namespaced[key]={doc:ns.document,map:ns.serviceNameMap,source:sourcePath};}}
 const materialized:Record<string,MaterializedDependency>={};const compose:ComposeDocument={...seed,...(options.meshMode?{}:{name:projectName}),services:{...seed.services}};
 let app=compose.services.app??(compose.services.app={build:{context:"."}});if(profile.integrated)for(const [key,entry] of Object.entries(namespaced)){if(options.suppressDependencies?.has(key))continue;const dep=effective.dependencies[key]!;const item=structuredClone(entry.doc);mergeDocument(compose,item,`dependency ${key}`);const endpointOwnerMap=new Map<string,string>();for(const [epName,ep] of Object.entries(dep.endpoints))endpointOwnerMap.set(epName,entry.map.get(ep.service)!);const endpointOwners=new Set(endpointOwnerMap.values());materialized[key]={key,composePath:entry.source,compose:item,serviceNameMap:entry.map,endpointOwnerMap,endpoints:{},endpointOwners,serviceNames:new Set(Object.keys(item.services))};}
 const appEndpoints=buildStandaloneAppEndpoints(effective,stage,options.appServiceName??"app");const depEndpoints:Record<string,Record<string,ResolvedEndpoint>>={};for(const [key,dep] of Object.entries(effective.dependencies)){depEndpoints[key]=buildStandaloneDependencyEndpoints(key,effective,namespaced[key]?.map??new Map(),Boolean(materialized[key]));if(options.meshMode)for(const ep of Object.values(depEndpoints[key]!)){ep.effectivelyPublished=false;delete ep.publicHost;delete ep.publicPort;}}if(options.meshMode)for(const ep of Object.values(appEndpoints)){ep.effectivelyPublished=false;delete ep.publicHost;delete ep.publicPort;}
 const intents:PortIntent[]=[];if(!options.meshMode){for(const [name,e] of Object.entries(effective.app.endpoints).sort(([a],[b])=>a.localeCompare(b)))if(e.publicPort!==undefined)intents.push({logicalPath:`app.endpoints.${name}`,requested:e.publicPort});for(const [key,dep] of Object.entries(effective.dependencies).sort(([a],[b])=>a.localeCompare(b)))if(materialized[key])for(const [name,e] of Object.entries(dep.endpoints).sort(([a],[b])=>a.localeCompare(b)))if(e.publicPort!==undefined)intents.push({logicalPath:`dependencies.${key}.endpoints.${name}`,requested:e.publicPort});}
 const allocation=allocateHostPorts(root,stage,intents,Boolean(options.validationMode));for(const [name,ep] of Object.entries(appEndpoints))if(allocation.has(ep.logicalPath)){ep.publicHost=PUBLIC_HOST;ep.publicPort=allocation.get(ep.logicalPath)!;ep.effectivelyPublished=true;}for(const [key,eps] of Object.entries(depEndpoints))for(const [name,ep] of Object.entries(eps))if(allocation.has(ep.logicalPath)){ep.publicHost=PUBLIC_HOST;ep.publicPort=allocation.get(ep.logicalPath)!;ep.effectivelyPublished=true;}
 const registry=(ref:any):string=>{if(ref.target==="app"){const ep=appEndpoints[ref.endpoint];if(!ep)throw new ConfigError({sourceFile:buildPath,configPath:ref.raw,stage,composition:"service",referencedObject:ref.raw,reason:"Unknown app endpoint reference"});return resolveEndpointProperty(ep,ref.property as EndpointProperty,{sourceFile:buildPath,configPath:ref.raw,stage});}const ep=depEndpoints[ref.dependency!]?.[ref.endpoint];if(!ep)throw new ConfigError({sourceFile:buildPath,configPath:ref.raw,stage,composition:"service",referencedObject:ref.raw,reason:"Unknown dependency endpoint reference"});return resolveEndpointProperty(ep,ref.property as EndpointProperty,{sourceFile:buildPath,configPath:ref.raw,stage});};
 for(const [key,dep] of Object.entries(effective.dependencies)){const depEnv=options.deferReferenceResolution?dep.env:resolveEnv(dep.env,registry,`dependencies.${key}.env`);for(const svc of Object.values(materialized[key]?.compose.services??{}))mergeComposeEnvironment(svc,depEnv);}
 const buildJsonAppEnvironment=ownEnv(effective,stage);const appEnv=options.deferReferenceResolution?buildJsonAppEnvironment:resolveEnv(buildJsonAppEnvironment,registry,"app.env");let overrideComposeAppEnvironment:ComposeEnvironmentMap={};
 const runtimeDotenv=path.join(root,`.env.${profile.runtimeStage}`);if(fs.existsSync(runtimeDotenv)){const text=fs.readFileSync(runtimeDotenv,"utf8");for(const line of text.split(/\r?\n/)){const match=line.match(/^\s*(?:export\s+)?(EXEC_MODE|INFRA_MODE|PORT)\s*=/);if(match&&((match[1]!=="PORT")||getPrimaryEndpoint(effective.app.endpoints)))throw new ConfigError({sourceFile:runtimeDotenv,configPath:match[1]!,stage,composition:"service",reason:"Dotenv file cannot define Builder-owned environment"});}}const internal={EXEC_MODE:profile.runtimeStage,INFRA_MODE:profile.integrated?"integrated":"isolated",...(getPrimaryEndpoint(effective.app.endpoints)?{PORT:String(getPrimaryEndpoint(effective.app.endpoints)![1].port)}:{})};
 const appBuild=app.build&&typeof app.build==="object"?app.build as Record<string,unknown>:{context:"."};const outputDir=options.composeOutputDir?path.resolve(options.composeOutputDir):root;const serviceContext=path.relative(outputDir,root).replace(/\\/g,"/")||".";appBuild.context=options.meshMode?serviceContext:".";if(raw.dockerfile)appBuild.dockerfile=raw.dockerfile;else delete appBuild.dockerfile;appBuild.target=profile.appTarget;app.build=appBuild;app.env_file=[{path:options.meshMode?path.posix.join(serviceContext,`.env.${profile.runtimeStage}`):`.env.${profile.runtimeStage}`,required:false}];app.environment={...appEnv,...(options.externalAppEnv?Object.fromEntries(Object.entries(options.externalAppEnv).map(([k,v])=>[k,v.replace(/\$/g,"$$$$")])):{}),...internal};if(stage==="dev")app.volumes=[`${options.meshMode&&serviceContext!=="."?`./${serviceContext}`:"."}:/app`,"/app/node_modules"];
 for(const [name,ep] of Object.entries(appEndpoints))if(!options.meshMode&&ep.effectivelyPublished)addPorts(app,[[ep,ep.publicPort!]]);
 for(const [key,dependency] of Object.entries(materialized)){for(const [epName,owner] of dependency.endpointOwnerMap.entries()){const endpoint=depEndpoints[key]![epName]!;if(!options.meshMode&&endpoint.effectivelyPublished)addPorts(compose.services[owner]!,[[endpoint,endpoint.publicPort!]]);}
  // Make endpoint owners reachable on the default network when dependency declares custom networks.
  for(const owner of dependency.endpointOwners){const svc=compose.services[owner]!;if(!options.meshMode&&svc.networks!==undefined){const nets=svc.networks;if(Array.isArray(nets)){if(!nets.includes("default"))nets.push("default");}else if(nets&&typeof nets==="object")(nets as any).default=null;}}
  for(const [epName,ep] of Object.entries(depEndpoints[key]!))dependency.endpoints[epName]=ep;
 }
 if (effective.overrideCompose) {
  const overridePath = resolveInsideProject(root, effective.overrideCompose, {
   sourceFile: buildPath, configPath: "override-compose", stage,
  });
  const loadedOverride = loadComposeDocument(overridePath, {
   sourceFile: buildPath, configPath: "override-compose", stage, composition: "service",
  });
  const overrideDocument = rebaseAppOverridePaths(loadedOverride, root, outputDir);
  const prepared = validateAndPrepareAppOverride(overrideDocument, {
   file: overridePath,
   stage,
   expectedBuildContext: String(appBuild.context),
   buildContextBaseDir: outputDir,
   allocator: nameAllocator,
   resourceNamespace: options.meshMode ? options.appServiceName ?? "app" : "app",
  });
  for(const section of ["volumes","networks","configs","secrets"] as const)if(prepared.resources[section])mergeDocument(compose,{services:{},[section]:prepared.resources[section]} as ComposeDocument,"app override");
  const rawOverrideEnv=normalizeComposeEnvironment(prepared.app.environment,"override-compose.services.app.environment");
  const overrideEnv=rawOverrideEnv;
  if(getPrimaryEndpoint(effective.app.endpoints)&&"PORT" in overrideEnv)throw new ConfigError({sourceFile:overridePath,configPath:"services.app.environment.PORT",stage,composition:"service",reason:"Override cannot set Builder-owned PORT"});
  overrideComposeAppEnvironment={...overrideEnv};
  const merged={...app,...prepared.app};
  merged.environment={...appEnv,...overrideEnv,...(options.externalAppEnv?Object.fromEntries(Object.entries(options.externalAppEnv).map(([k,v])=>[k,v.replace(/\$/g,"$$$$")])):{}),...internal};
  const overrideBuild=prepared.app.build&&typeof prepared.app.build==="object"?prepared.app.build as Record<string,unknown>:{};
  if(overrideBuild.args!==undefined)appBuild.args=overrideBuild.args;
  merged.build=appBuild;
  merged.env_file=app.env_file;
  merged.depends_on=app.depends_on;
  merged.networks={...(!options.meshMode?{default:null}:{}),...normalizeNetworks(app.networks),...normalizeNetworks(prepared.app.networks)};
  compose.services.app=merged;
  app=merged;
 }
 if(options.meshMode&&options.appServiceName&&options.appServiceName!=="app"){delete compose.services.app;compose.services[options.appServiceName]=app;}
 if(profile.integrated)applyDependencyLifecycle(app,materialized,effective);
 if(profile.attachTester&&!options.meshMode){const testerEnvRaw=effective.tester?.env??{};assertTesterReferencesArePublic(testerEnvRaw,"build","tester.env");const testerEnv=options.deferReferenceResolution?testerEnvRaw:resolveEnv(testerEnvRaw,registry,"tester.env");compose.services.tester={build:{context:".",...(raw.dockerfile?{dockerfile:raw.dockerfile}:{}),target:"test-e2e"},network_mode:"host",environment:testerEnv,depends_on:{app:{condition:"service_healthy"}}};}
 nameAllocator.assertUnique();return {compose,effectiveBuild:effective,endpoints:{app:appEndpoints,dependencies:depEndpoints},projectName,...(profile.attachTester&&!options.meshMode?{testerServiceName:"tester"}:{}),buildJsonAppEnvironment,overrideComposeAppEnvironment,builderInternalEnvironment:{...internal},externalAppEnvironment:{...(options.externalAppEnv??{})},dependencyServiceNames:Object.fromEntries(Object.entries(materialized).map(([key,dep])=>[key,[...dep.serviceNames]])),dependencyEnvironments:Object.fromEntries(Object.entries(effective.dependencies).map(([key,dep])=>[key,dep.env]))};
}
