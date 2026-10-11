import path from "node:path";
import { isPathInside } from "../../utils/paths.js";
import type { ComposeDocument } from "./types.js";
const posix=(p:string)=>p.replace(/\\/g,"/");
function rebase(p:string,base:string,out:string):string{if(path.isAbsolute(p)||/^[A-Za-z]:[\\/]/.test(p))return posix(path.normalize(p));const abs=path.resolve(base,p);const rel=path.relative(out,abs);return posix(isPathInside(out,rel)?(rel||"."):abs);}
function volumeShort(v:string,base:string,out:string):string{const parts=v.split(":");if(parts.length<2)return v;const source=parts[0]!;if(source===""||source.startsWith("/")||source.startsWith("~")||/^[A-Za-z]:[\\/]/.test(source))return v; // relative bind sources contain slash/dot; named volumes do not
 if(source.startsWith(".")||source.includes("/")||source.includes("\\"))parts[0]=rebase(source,base,out);return parts.join(":");}
export function rebaseComposePaths(document:ComposeDocument,composeFilePath:string,outputProjectDir:string):ComposeDocument{
 const doc=structuredClone(document),base=path.dirname(composeFilePath),out=path.resolve(outputProjectDir);
 for(const svc of Object.values(doc.services??{})){
  if(typeof svc.build==="string")svc.build=rebase(svc.build,base,out);else if(svc.build&&typeof svc.build==="object"){const b=svc.build as Record<string,unknown>;const context=typeof b.context==="string"?b.context:".";b.context=rebase(context,base,out);/* dockerfile remains relative to its build context, which is rebased as a unit. */}
  if(typeof svc.env_file==="string")svc.env_file=rebase(svc.env_file,base,out);else if(Array.isArray(svc.env_file))svc.env_file=svc.env_file.map(v=>typeof v==="string"?rebase(v,base,out):v&&typeof v==="object"&&typeof (v as any).path==="string"?{...(v as any),path:rebase((v as any).path,base,out)}:v);
  if(Array.isArray(svc.volumes))svc.volumes=svc.volumes.map(v=>typeof v==="string"?volumeShort(v,base,out):v&&typeof v==="object"&&(v as any).type==="bind"&&typeof (v as any).source==="string"?{...(v as any),source:rebase((v as any).source,base,out)}:v);
 }
 for(const kind of ["configs","secrets"] as const)for(const def of Object.values(doc[kind]??{}))if(def&&typeof def==="object"&&typeof (def as any).file==="string")(def as any).file=rebase((def as any).file,base,out);
 return doc;
}
