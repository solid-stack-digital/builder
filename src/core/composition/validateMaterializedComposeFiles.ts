import fs from "node:fs";
import path from "node:path";
import { ConfigError } from "../../errors/ConfigError.js";
import type { ComposeDocument } from "./types.js";

export interface MaterializedComposeFileOptions {
  baseDir?: string;
  composition?: "service" | "mesh";
}

/** File-backed Compose resources are required only when their bundle is run. */
export function validateMaterializedComposeFiles(
  document: ComposeDocument,
  sourceFile: string,
  stage: string,
  options: MaterializedComposeFileOptions = {},
): void {
  const baseDir = options.baseDir ?? path.dirname(sourceFile);
  const within=(file:string,configPath:string,required:boolean):void=>{
    const absolute=path.resolve(baseDir,file),relative=path.relative(baseDir,absolute);
    if(relative===".."||relative.startsWith(`..${path.sep}`)||path.isAbsolute(relative))throw new ConfigError({sourceFile,configPath,stage,composition:options.composition??"service",value:file,reason:"Materialized Compose file escapes its project"});
    let regular=false;
    try{const baseReal=fs.realpathSync(baseDir),fileReal=fs.realpathSync(absolute),realRelative=path.relative(baseReal,fileReal);if(realRelative===".."||realRelative.startsWith(`..${path.sep}`)||path.isAbsolute(realRelative))throw new ConfigError({sourceFile,configPath,stage,composition:options.composition??"service",value:file,reason:"Materialized Compose file symlink escapes its project"});regular=fs.statSync(fileReal).isFile();}
    catch(error){if(error instanceof ConfigError)throw error;}
    if(required&&!regular)throw new ConfigError({sourceFile,configPath,stage,composition:options.composition??"service",value:file,reason:"Materialized Compose file resource is missing or not a regular file"});
  };
  for(const [serviceName,service] of Object.entries(document.services??{})){
    const entries=Array.isArray(service.env_file)?service.env_file:service.env_file===undefined?[]:[service.env_file];
    for(const [index,entry] of entries.entries()){
      const file=typeof entry==="string"?entry:entry&&typeof entry==="object"?(entry as {path?:unknown}).path:undefined;
      if(typeof file!=="string")continue;
      const required=typeof entry==="string"||(entry as {required?:unknown}).required!==false;
      within(file,`services.${serviceName}.env_file.${index}`,required);
    }
  }
  for (const kind of ["configs", "secrets"] as const) {
    for (const [name, raw] of Object.entries(document[kind] ?? {})) {
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
      const file = (raw as Record<string, unknown>).file;
      if (typeof file !== "string") continue;
      within(file,`${kind}.${name}.file`,true);
    }
  }
}
