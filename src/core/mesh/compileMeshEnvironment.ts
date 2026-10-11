import { spawnSync } from "node:child_process";
import { stringify } from "yaml";
import { ScriptError } from "../../errors/ScriptError.js";
import { resolveProjectDir } from "../../utils/paths.js";
import { compileMeshComposition } from "./v2/compileMeshComposition.js";
export interface CompileMeshOptions { validateWithDocker?:boolean|undefined; }
export interface CompileMeshResult { yaml:string;testerServiceName?:string|undefined; }
export function compileMeshEnvironment(stage:"dev"|"prod"|"e2e",rawMeshDir:string=process.cwd(),options:CompileMeshOptions={}):CompileMeshResult{const meshDir=resolveProjectDir(rawMeshDir),compiled=compileMeshComposition(stage,meshDir),yaml=stringify(compiled.compose);if(options.validateWithDocker!==false){const result=spawnSync("docker",["compose","--project-directory",meshDir,"-f","-","config","--quiet"],{cwd:meshDir,encoding:"utf-8",input:yaml});if(result.error||result.status!==0)throw new ScriptError(`Generated mesh Compose configuration is invalid: ${result.error?.message??result.stderr??result.stdout}`,{cause:result.error});}return{yaml,...(compiled.testerServiceName?{testerServiceName:compiled.testerServiceName}:{})};}
