import { stringify } from "yaml";
import type { Environment } from "../types/index.js";
import { compileServiceComposition } from "./composition/compileServiceComposition.js";
export interface CompileEnvironmentOptions { silenceWarnings?:boolean|undefined;full?:boolean|undefined; }
export const compileEnvironment=(stage:Environment,projectDir:string=process.cwd(),options:CompileEnvironmentOptions={}):string=>stringify(compileServiceComposition(stage,projectDir,{full:Boolean(options.full),silenceWarnings:options.silenceWarnings}).compose);
