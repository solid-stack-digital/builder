import path from "node:path";
import type { BuildJson, OrdinaryService, OrdinaryOverlay, MainService, MainOverlay, TesterService, TesterOverlay } from "../../types/index.js";
export interface DeclaredYamlFile { relativePath:string; absolutePath:string; source:string; stage?:"dev"|"prod"|"test"|"e2e"; kind:"service-compose"|"override-compose"|"tester-compose" }
export function getDeclaredYamlFiles(build:BuildJson,projectDir:string):DeclaredYamlFile[] {
  const files:DeclaredYamlFile[]=[],seen=new Set<string>();
  const add=(relativePath:string,source:string,kind:DeclaredYamlFile["kind"],stage?:DeclaredYamlFile["stage"])=>{const absolutePath=path.resolve(projectDir,relativePath);if(seen.has(absolutePath))return;seen.add(absolutePath);files.push({relativePath,absolutePath,source,kind,...(stage?{stage}:{})});};
  for(const [name,entry] of Object.entries(build.services)){
    if(name==="main"){const value=(entry as MainService)["override-compose"];if(value)add(value,`services.main.override-compose`,"override-compose");}
    else if(name==="tester")add((entry as TesterService).compose,"services.tester.compose","tester-compose");
    else add((entry as OrdinaryService).compose,`services.${name}.compose`,"service-compose");
  }
  for(const stage of ["dev","prod","test","e2e"] as const)for(const [name,entry] of Object.entries(build[stage]?.services??{})){
    if(name==="main"){const value=(entry as MainOverlay)["override-compose"];if(value)add(value,`${stage}.services.main.override-compose`,"override-compose",stage);}
    else if(name==="tester"){const value=(entry as TesterOverlay).compose;if(value)add(value,`${stage}.services.tester.compose`,"tester-compose",stage);}
    else {const value=(entry as OrdinaryOverlay).compose;if(value)add(value,`${stage}.services.${name}.compose`,"service-compose",stage);}
  }
  return files;
}
