import { resolveProjectDir } from "../../../utils/paths.js";
import { compileMeshComposition } from "../compileMeshComposition.js";
import type { MeshConfig } from "../types.js";
export function checkMeshTester(_mesh:MeshConfig,meshDir:string):void { compileMeshComposition("e2e",resolveProjectDir(meshDir),{validationMode:true}); }
