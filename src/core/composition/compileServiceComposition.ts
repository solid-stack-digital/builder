import path from "node:path";
import type { Environment } from "../../types/index.js";
import { getBuildJson } from "../../utils/getBuildJson.js";
import { resolveProjectDir } from "../../utils/paths.js";
import { resolveBuildStage } from "../config/resolveBuildStage.js";
import { compileGraphComposition } from "./compileGraphComposition.js";
import type { CompiledComposition } from "./types.js";
export interface CompileServiceCompositionOptions { full?:boolean|undefined; silenceWarnings?:boolean|undefined; validationMode?:boolean|undefined }
export function compileServiceComposition(stage:Environment,projectDir:string,options:CompileServiceCompositionOptions={}):CompiledComposition {
  const root=resolveProjectDir(projectDir),build=resolveBuildStage(getBuildJson(root),stage,path.join(root,"build.json"));
  return compileGraphComposition({stage,composition:"service",projectDir:root,name:build.name,instances:new Map([["",build]]),full:Boolean(options.full),validationMode:Boolean(options.validationMode)});
}
