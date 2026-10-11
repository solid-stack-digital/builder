import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
export const meshDirs:string[]=[];
export function createMesh(config:{services:Record<string,unknown>;[key:string]:unknown},builds:Record<string,unknown>,composes:Record<string,string>={}){
 const root=mkdtempSync(path.join(os.tmpdir(),"mesh-v2-"));meshDirs.push(root);writeFileSync(path.join(root,"mesh.json"),JSON.stringify(config));
 const serviceDirs:string[]=[];for(const [name,build] of Object.entries(builds)){const dir=path.join(root,name);mkdirSync(dir,{recursive:true});serviceDirs.push(dir);writeFileSync(path.join(dir,"Dockerfile"),readFileSync(path.resolve("tests/fixtures/v2/service-basic/Dockerfile")));writeFileSync(path.join(dir,"build.json"),JSON.stringify(build));}
 for(const [name,content] of Object.entries(composes)){const file=path.join(root,name);mkdirSync(path.dirname(file),{recursive:true});writeFileSync(file,content);for(const dir of serviceDirs){const target=path.join(dir,path.basename(name));writeFileSync(target,content);}}
 return root;
}
export function cleanupMeshes(){for(const d of meshDirs.splice(0))rmSync(d,{recursive:true,force:true});}
