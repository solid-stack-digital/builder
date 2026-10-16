import type { MeshRunOptions } from "../MeshRunOptions.js";
import { resolveProjectDir } from "../../../utils/paths.js";
import { compileMeshComposition } from "../compileMeshComposition.js";
import { runLongLived } from "../../runners/runLongLived.js";
export const runMeshProd=(options:MeshRunOptions={}):Promise<number>=>{const root=resolveProjectDir(options.projectDir);return runLongLived("prod",root,options,validationMode=>compileMeshComposition("prod",root,{validationMode}),"mesh");};
