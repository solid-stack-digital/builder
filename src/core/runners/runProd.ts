import type { RunOptions } from "../RunOptions.js";
import { compileServiceComposition } from "../composition/compileServiceComposition.js";
import { runLongLived } from "./runLongLived.js";
export const runProd=(options:RunOptions):Promise<number>=>runLongLived("prod",options.projectDir,options,validationMode=>compileServiceComposition("prod",options.projectDir,{validationMode}),"service");
