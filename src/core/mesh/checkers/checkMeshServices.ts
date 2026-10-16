import path from "node:path";
import { resolveProjectDir } from "../../../utils/paths.js";
import { resolveInsideProject } from "../../config/pathSafety.js";
import { checkDockerfileContract } from "../../checkers/checkDockerfileContract.js";
import { getBuildJson } from "../../../utils/getBuildJson.js";
import { compileMeshComposition } from "../compileMeshComposition.js";
import { MESH_CONFIG_STAGES, type MeshConfig } from "../types.js";
export function checkMeshServices(mesh:MeshConfig,meshDir:string,policy:typeof checkDockerfileContract=checkDockerfileContract):void {
  const root=resolveProjectDir(meshDir),checked=new Set<string>();
  for(const [layer,services] of [["",mesh.services],["dev.",mesh.dev?.services],["prod.",mesh.prod?.services],["e2e.",mesh.e2e?.services]] as const){
    if(!services)continue;
    for(const [name,entry] of Object.entries(services)){
      if(name==="tester")continue;
      const source=(entry as {source?:string}).source;
      if(!source)continue;
      const dir=resolveInsideProject(root,source,{sourceFile:path.join(root,"mesh.json"),configPath:`${layer}services.${name}.source`});
      if(!checked.has(dir)){policy(getBuildJson(dir),dir);checked.add(dir);}
    }
  }
  for(const stage of MESH_CONFIG_STAGES)compileMeshComposition(stage,root,{validationMode:true});
}
