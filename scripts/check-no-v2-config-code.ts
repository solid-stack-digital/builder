import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const roots=["src","templates/docker"];
const patterns:[RegExp,string][]=[
  [/core\/mesh\/v2/,"removed mesh/v2 compiler import"],
  [/\b(?:interface|type|export)\s+(?:AppConfig|DependencyConfig|DependencyEndpoint|AppEndpoint|MeshServiceConfig)\b/,"removed V2 public model"],
  [/\btesterTarget\b/,"removed tester Dockerfile target"],
  [/target:\s*["']test-e2e["']/,"forced tester target"],
  [/EXEC_MODE:\s*["']e2e["']/,"tester execution variable"],
  [/BuildJsonV2|MeshJsonV2/,"V2 generated schema name"],
];
export function scanLegacySource(source:string,file:string):string[]{const violations:string[]=[];source.split("\n").forEach((line,index)=>{if(line.trim().startsWith("//")||line.trim().startsWith("#"))return;for(const [pattern,reason] of patterns)if(pattern.test(line))violations.push(`${file}:${index+1}: ${reason}`);});return violations;}
export function scanRuntimeTree(dirs:readonly string[]=roots):string[]{const violations:string[]=[];
function visit(dir:string):void{for(const entry of readdirSync(dir,{withFileTypes:true})){
 const file=path.join(dir,entry.name);if(entry.isDirectory())visit(file);
 else if(/\.(?:ts|tsx|yml|yaml)$/.test(entry.name))violations.push(...scanLegacySource(readFileSync(file,"utf8"),file));
}}
for(const root of dirs)visit(root);return violations;}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){const violations=scanRuntimeTree();if(violations.length){console.error(violations.join("\n"));process.exitCode=1;}else console.log("No removed V2 runtime model surfaces found.");}
