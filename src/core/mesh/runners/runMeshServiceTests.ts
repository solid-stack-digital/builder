import path from "node:path";
import pc from "picocolors";
import { resolveProjectDir } from "../../../utils/paths.js";
import { resolveInsideProject } from "../../config/pathSafety.js";
import { runTest } from "../../runners/runTest.js";
import type { TestRuntimeAdapters } from "../../runners/runTest.js";
import { getMeshJson } from "../getMeshJson.js";
import type { MeshRunOptions } from "../MeshRunOptions.js";

export async function runMeshServiceTests(options:MeshRunOptions={},runtime:TestRuntimeAdapters={}):Promise<number>{
 const meshDir=resolveProjectDir(options.projectDir),meshPath=path.join(meshDir,"mesh.json"),mesh=getMeshJson(meshDir);
 const rootServices=Object.entries(mesh.services).filter(([name])=>name!=="tester").sort(([left],[right])=>left.localeCompare(right));
 for(const [serviceName,service] of rootServices){
  const serviceDir=resolveInsideProject(meshDir,(service as {source:string}).source,{sourceFile:meshPath,configPath:`services.${serviceName}.source`,stage:"test"});
  console.log(pc.bold(pc.cyan(`\n-> Running full standalone test lifecycle for [${serviceName}]\n`)));
  const status=await runTest({projectDir:serviceDir,debug:Boolean(options.debug),detach:false,skipBanner:true,silenceWarnings:false,...(options.dryRun!==undefined?{dryRun:options.dryRun}:{})},runtime);
  if(status!==0)return status;
 }
 return 0;
}
