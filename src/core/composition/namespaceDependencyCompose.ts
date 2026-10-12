import { rewriteBuildSecretReferences } from "./composeBuildResources.js";
import { GeneratedComposeNameAllocator } from "./generatedNames.js";
import { namespaceVolume } from "./composeVolumes.js";
import type { ComposeDocument, ComposeService } from "./types.js";
export interface NamespaceDependencyOptions {dependencyKey:string;namespacePrefix:string;document:ComposeDocument;allocator?:GeneratedComposeNameAllocator;identityPrefix?:string;}
const entries=(obj:unknown)=>obj&&typeof obj==="object"&&!Array.isArray(obj)?Object.entries(obj as Record<string,unknown>):[];
export function namespaceDependencyCompose(options:NamespaceDependencyOptions){
 const {document,namespacePrefix:prefix}=options,doc=structuredClone(document);
 const allocator=options.allocator??new GeneratedComposeNameAllocator();
 const identityPrefix=options.identityPrefix??JSON.stringify(["dependency",options.dependencyKey,prefix]);
 const make=(kind:string,keys:string[])=>new Map(keys.sort().map(k=>[k,allocator.allocate(JSON.stringify([identityPrefix,kind,k]),kind==="service"?`${prefix}--${k}`:`${prefix}--${kind}--${k}`)]));
 const serviceNameMap=make("service",Object.keys(doc.services??{}));
 const volumeNameMap=make("volume",Object.keys(doc.volumes??{})),networkNameMap=make("network",Object.keys(doc.networks??{})),configNameMap=make("config",Object.keys(doc.configs??{})),secretNameMap=make("secret",Object.keys(doc.secrets??{}));
 const rewriteKeys=(obj:unknown,map:Map<string,string>)=>Object.fromEntries(entries(obj).map(([k,v])=>[map.get(k)??k,v]));
 const rewriteResourceRefs=(svc:ComposeService)=>{
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
 };
 for(const svc of Object.values(doc.services??{}))rewriteResourceRefs(svc);
 doc.services=rewriteKeys(doc.services,serviceNameMap) as Record<string,ComposeService>;
 if(doc.volumes)doc.volumes=rewriteKeys(doc.volumes,volumeNameMap);if(doc.networks)doc.networks=rewriteKeys(doc.networks,networkNameMap);if(doc.configs)doc.configs=rewriteKeys(doc.configs,configNameMap);if(doc.secrets)doc.secrets=rewriteKeys(doc.secrets,secretNameMap);
 return {document:doc,serviceNameMap,volumeNameMap,networkNameMap,configNameMap,secretNameMap};
}
