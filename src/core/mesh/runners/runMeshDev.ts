import type { MeshRunOptions } from "../MeshRunOptions.js";
import { resolveProjectDir } from "../../../utils/paths.js";
import { compileMeshComposition } from "../compileMeshComposition.js";
import { runLongLived } from "../../runners/runLongLived.js";
export const runMeshDev=(options:MeshRunOptions={}):Promise<number>=>{const root=resolveProjectDir(options.projectDir);return runLongLived("dev",root,options,validationMode=>compileMeshComposition("dev",root,{validationMode}),"mesh");};
