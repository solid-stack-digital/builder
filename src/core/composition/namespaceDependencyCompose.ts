import { rewriteBuildSecretReferences } from "./composeBuildResources.js";
import { GeneratedComposeNameAllocator } from "./generatedNames.js";
import { namespaceVolume } from "./composeVolumes.js";
import { namespaceResourceDefinition } from "./namespaceResourceDefinition.js";
import type { ComposeDocument, ComposeService } from "./types.js";
export interface NamespaceDependencyOptions {dependencyKey:string;namespacePrefix:string;document:ComposeDocument;allocator?:GeneratedComposeNameAllocator;identityPrefix?:string;}
const entries=(obj:unknown)=>obj&&typeof obj==="object"&&!Array.isArray(obj)?Object.entries(obj as Record<string,unknown>):[];
export function namespaceDependencyCompose(options:NamespaceDependencyOptions){
 const {document,namespacePrefix:prefix}=options,doc=structuredClone(document);
 const originalServices=doc.services??{};
 const usesImplicitDefault=Object.values(originalServices).some(service=>service.network_mode===undefined&&service.networks===undefined);
 if(usesImplicitDefault&&!Object.hasOwn(doc.networks??{},"default"))doc.networks={...(doc.networks??{}),default:{}};
 const allocator=options.allocator??new GeneratedComposeNameAllocator();
 const identityPrefix=options.identityPrefix??JSON.stringify(["dependency",options.dependencyKey,prefix]);
 const make=(kind:string,keys:string[])=>new Map(keys.sort().map(k=>[k,allocator.allocate(JSON.stringify([identityPrefix,kind,k]),kind==="service"?`${prefix}--${k}`:`${prefix}--${kind}--${k}`)]));
 const serviceNameMap=make("service",Object.keys(doc.services??{}));
 const volumeNameMap=make("volume",Object.keys(doc.volumes??{})),networkNameMap=make("network",Object.keys(doc.networks??{})),configNameMap=make("config",Object.keys(doc.configs??{})),secretNameMap=make("secret",Object.keys(doc.secrets??{}));
 const rewriteKeys=(obj:unknown,map:Map<string,string>)=>Object.fromEntries(entries(obj).map(([k,v])=>[map.get(k)??k,v]));
 const rewriteResourceDefinitions=(obj:unknown,map:Map<string,string>)=>Object.fromEntries(entries(obj).map(([key,definition])=>[map.get(key)??key,namespaceResourceDefinition(key,definition)]));
 const addOriginalNetworkAliases=(name:string,svc:ComposeService):void=>{
  if(svc.network_mode!==undefined||svc.networks===undefined)return;
  const attached=Array.isArray(svc.networks)
   ? Object.fromEntries(svc.networks.filter((network):network is string=>typeof network==="string").map(network=>[network,null]))
   : svc.networks&&typeof svc.networks==="object"?{...svc.networks as Record<string,unknown>}:{};
  for(const [network,rawOptions] of Object.entries(attached)){
   const options=rawOptions&&typeof rawOptions==="object"&&!Array.isArray(rawOptions)?rawOptions as Record<string,unknown>:{};
   const aliases=Array.isArray(options.aliases)?options.aliases.filter((alias):alias is string=>typeof alias==="string"):[];
   attached[network]={...options,aliases:[...new Set([...aliases,name])]};
  }
  svc.networks=attached;
 };
 const rewriteResourceRefs=(svc:ComposeService,originalName:string)=>{
  rewriteBuildSecretReferences(svc,secretNameMap);
  if(Array.isArray(svc.depends_on)){svc.depends_on=svc.depends_on.map(v=>typeof v==="string"?(serviceNameMap.get(v)??v):v);}else if(svc.depends_on&&typeof svc.depends_on==="object")svc.depends_on=rewriteKeys(svc.depends_on,serviceNameMap);
  if(Array.isArray(svc.links))svc.links=svc.links.map(v=>{if(typeof v!=="string")return v;const [name,...rest]=v.split(":");return [serviceNameMap.get(name!)??name,...rest].join(":")});
  if(typeof svc.network_mode==="string"&&svc.network_mode.startsWith("service:")){const key=svc.network_mode.slice(8);svc.network_mode=`service:${serviceNameMap.get(key)??key}`;}
  if(Array.isArray(svc.volumes_from))svc.volumes_from=svc.volumes_from.map(v=>typeof v==="string"?v.replace(/^([^:]+)(.*)$/,(all,n,rest)=>`${serviceNameMap.get(n)??n}${rest}`):v);
  if(Array.isArray(svc.volumes)) svc.volumes = svc.volumes.map(v => namespaceVolume(v, volumeNameMap));
  if(svc.networks === undefined && svc.network_mode === undefined && networkNameMap.has("default")) svc.networks = {default:null};
  for (const key of ["ipc", "pid"] as const) if (typeof svc[key] === "string" && svc[key].startsWith("service:")) svc[key] = `service:${serviceNameMap.get(svc[key].slice(8)) ?? svc[key].slice(8)}`;
  if(Array.isArray(svc.networks))svc.networks=svc.networks.map(v=>typeof v==="string"?(networkNameMap.get(v)??v):v);else if(svc.networks&&typeof svc.networks==="object")svc.networks=rewriteKeys(svc.networks,networkNameMap);
  for(const key of ["configs","secrets"] as const)if(Array.isArray(svc[key]))svc[key]=(svc[key] as unknown[]).map(v=>typeof v==="string"?(key==="configs"?configNameMap:secretNameMap).get(v)??v:v&&typeof v==="object"?{...(v as any),source:(key==="configs"?configNameMap:secretNameMap).get((v as any).source)??(v as any).source}:v);
  addOriginalNetworkAliases(originalName,svc);
 };
 for(const [name,svc] of Object.entries(originalServices))rewriteResourceRefs(svc,name);
 doc.services=rewriteKeys(doc.services,serviceNameMap) as Record<string,ComposeService>;
 if(doc.volumes)doc.volumes=rewriteResourceDefinitions(doc.volumes,volumeNameMap);if(doc.networks)doc.networks=rewriteResourceDefinitions(doc.networks,networkNameMap);if(doc.configs)doc.configs=rewriteResourceDefinitions(doc.configs,configNameMap);if(doc.secrets)doc.secrets=rewriteResourceDefinitions(doc.secrets,secretNameMap);
 return {document:doc,serviceNameMap,volumeNameMap,networkNameMap,configNameMap,secretNameMap};
}
