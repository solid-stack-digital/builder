import path from "node:path";
import { resolveProjectDir } from "../../utils/paths.js";
import { compileGraphComposition } from "../composition/compileGraphComposition.js";
import type { CompiledComposition } from "../composition/types.js";
import { resolveMeshStage } from "../config/resolveMeshStage.js";
import { applyMeshExtends } from "./applyMeshExtends.js";
import { getMeshJson } from "./getMeshJson.js";
import { loadMeshSources } from "./loadMeshSources.js";
import type { MeshConfigStage } from "./types.js";
export function compileMeshComposition(stage:MeshConfigStage,projectDir:string,options:{validationMode?:boolean}={}):CompiledComposition {
  const root=resolveProjectDir(projectDir);
  const mesh=resolveMeshStage(getMeshJson(root),stage,path.join(root,"mesh.json"));
  const builds=loadMeshSources(mesh,stage);
  applyMeshExtends(mesh,builds,stage);
  return compileGraphComposition({stage,composition:"mesh",projectDir:root,name:mesh.name,instances:builds,mesh,validationMode:Boolean(options.validationMode)});
}
