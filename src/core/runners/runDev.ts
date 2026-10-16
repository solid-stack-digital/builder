import type { RunOptions } from "../RunOptions.js";
import { compileServiceComposition } from "../composition/compileServiceComposition.js";
import { runLongLived } from "./runLongLived.js";
export const runDev=(options:RunOptions):Promise<number>=>runLongLived("dev",options.projectDir,options,validationMode=>compileServiceComposition("dev",options.projectDir,{full:options.full,validationMode}),"service");
