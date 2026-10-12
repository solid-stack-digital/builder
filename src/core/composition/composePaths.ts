import { parseVolume, rewriteVolumeSource } from "./composeVolumes.js";
import path from "node:path";
import { isPathInside } from "../../utils/paths.js";
import type { ComposeDocument } from "./types.js";
const posix=(p:string)=>p.replace(/\\/g,"/");
function rebase(p:string,base:string,out:string):string{if(path.isAbsolute(p)||/^[A-Za-z]:[\\/]/.test(p))return posix(path.normalize(p));const abs=path.resolve(base,p);const rel=path.relative(out,abs);const result=posix(isPathInside(out,rel)?(rel||"."):abs);return result!=="."&&!result.startsWith(".")&&!path.isAbsolute(result)?`./${result}`:result;}
function volumeShort(v:string,base:string,out:string):string {
 const mount=parseVolume(v);
 if(mount?.type !== "bind" || !mount.source || /^(?:[\\/]|~|[a-z]:)/i.test(mount.source)) return v;
 return rewriteVolumeSource(v,rebase(mount.source,base,out)) as string;
}
function isRemoteBuildContext(value:string):boolean {
 return /^[A-Za-z][A-Za-z0-9+.-]*:\/\//.test(value) || /^[^/@\s]+@[^:\s]+:.+/.test(value);
}
export function rebaseComposePaths(document:ComposeDocument,composeFilePath:string,outputProjectDir:string):ComposeDocument{
 const doc=structuredClone(document),base=path.dirname(composeFilePath),out=path.resolve(outputProjectDir);
 for(const svc of Object.values(doc.services??{})){
  if(typeof svc.build==="string"){if(!isRemoteBuildContext(svc.build))svc.build=rebase(svc.build,base,out);}else if(svc.build&&typeof svc.build==="object"){const b=svc.build as Record<string,unknown>;const context=typeof b.context==="string"?b.context:".";if(!isRemoteBuildContext(context))b.context=rebase(context,base,out);/* dockerfile remains relative to its build context, which is rebased as a unit. */}
  if(typeof svc.env_file==="string")svc.env_file=rebase(svc.env_file,base,out);else if(Array.isArray(svc.env_file))svc.env_file=svc.env_file.map(v=>typeof v==="string"?rebase(v,base,out):v&&typeof v==="object"&&typeof (v as any).path==="string"?{...(v as any),path:rebase((v as any).path,base,out)}:v);
  if(Array.isArray(svc.volumes))svc.volumes=svc.volumes.map(v=>typeof v==="string"?volumeShort(v,base,out):v&&typeof v==="object"&&(v as any).type==="bind"&&typeof (v as any).source==="string"?{...(v as any),source:rebase((v as any).source,base,out)}:v);
 }
 for(const kind of ["configs","secrets"] as const)for(const def of Object.values(doc[kind]??{}))if(def&&typeof def==="object"&&typeof (def as any).file==="string")(def as any).file=rebase((def as any).file,base,out);
 return doc;
}

/** App overlays resolve paths from the service project and never invent a build context. */
export function rebaseAppOverridePaths(
  document: ComposeDocument,
  serviceProjectDir: string,
  outputProjectDir: string,
): ComposeDocument {
  const doc = structuredClone(document);
  const base = path.resolve(serviceProjectDir);
  const out = path.resolve(outputProjectDir);

  for (const svc of Object.values(doc.services ?? {})) {
    if (svc.build && typeof svc.build === "object" && !Array.isArray(svc.build)) {
      const build = svc.build as Record<string, unknown>;
      if (typeof build.context === "string") {
        build.context = rebase(build.context, base, out);
      }
    }
    if (typeof svc.env_file === "string") {
      svc.env_file = rebase(svc.env_file, base, out);
    } else if (Array.isArray(svc.env_file)) {
      svc.env_file = svc.env_file.map(entry => {
        if (typeof entry === "string") return rebase(entry, base, out);
        if (entry && typeof entry === "object") {
          const value = entry as Record<string, unknown>;
          if (typeof value.path === "string") return { ...value, path: rebase(value.path, base, out) };
        }
        return entry;
      });
    }
    if (Array.isArray(svc.volumes)) {
      svc.volumes = svc.volumes.map(volume => {
        if (typeof volume === "string") return volumeShort(volume, base, out);
        if (volume && typeof volume === "object") {
          const value = volume as Record<string, unknown>;
          if (value.type === "bind" && typeof value.source === "string") {
            return { ...value, source: rebase(value.source, base, out) };
          }
        }
        return volume;
      });
    }
  }
  for (const kind of ["configs", "secrets"] as const) {
    for (const definition of Object.values(doc[kind] ?? {})) {
      if (definition && typeof definition === "object") {
        const value = definition as Record<string, unknown>;
        if (typeof value.file === "string") value.file = rebase(value.file, base, out);
      }
    }
  }
  return doc;
}
