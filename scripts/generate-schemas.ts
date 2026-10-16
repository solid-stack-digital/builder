import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const id="^[a-z][a-z0-9-]*$",meshReq="^(?:source\\.)?[a-z][a-z0-9-]*$",scheme="^[A-Za-z][A-Za-z0-9+.-]*$";
const string={type:"string",minLength:1,pattern:"\\S"};
const env={type:"object",additionalProperties:{type:"string"}};
const buildArgs={type:"object",additionalProperties:{type:"string"}};
const port={type:"integer",minimum:1,maximum:65535};
const publicPort={anyOf:[port,{const:"AUTO"}]};
const kind={enum:["requirement","dependency","prerequisite"]};
const endpoint=(ordinary:boolean,partial=false)=>({type:"object",properties:{...(ordinary?{service:string}:{}),port,publicPort,primary:{type:"boolean"},scheme:{type:"string",pattern:scheme}},required:partial?[]:ordinary?["service","port"]:["port"],additionalProperties:false});
const endpointMap=(ordinary:boolean,partial=false)=>({type:"object",propertyNames:{pattern:id},additionalProperties:endpoint(ordinary,partial)});
const requisites=(mesh=false,overlay=false)=>({type:"object",propertyNames:{pattern:mesh?meshReq:id},additionalProperties:overlay?{anyOf:[kind,{const:false}]}:kind});
const main=(overlay=false,mesh=false)=>({type:"object",properties:{env,buildArgs,endpoints:endpointMap(false,overlay),requisites:requisites(mesh,overlay),"override-compose":string},additionalProperties:false});
const ordinary=(overlay=false,mesh=false)=>({type:"object",properties:{compose:string,service:string,env,endpoints:endpointMap(true,overlay),requisites:requisites(mesh,overlay)},...(overlay?{}:{required:["compose"],anyOf:[{properties:{service:string},required:["service"]},{properties:{endpoints:{type:"object",minProperties:1}},required:["endpoints"]}]}),additionalProperties:false});
const tester=(overlay=false)=>({type:"object",properties:{compose:string,service:string,env},required:overlay?[]:["compose","service"],additionalProperties:false});
const servicePattern="^(?!(?:main|tester)$)[a-z][a-z0-9-]*$";
const buildServices=(overlay=false)=>({type:"object",properties:{main:main(overlay),tester:tester(overlay)},patternProperties:{[servicePattern]:ordinary(overlay)},propertyNames:{pattern:id},required:overlay?[]:["main","tester"],additionalProperties:false});
const buildStage={type:"object",properties:{services:buildServices(true)},additionalProperties:false};
const buildRoot={type:"object",properties:{$schema:{type:"string"},name:string,services:buildServices(),dev:buildStage,prod:buildStage,test:buildStage,e2e:buildStage},required:["name","services"],additionalProperties:false};
const meshExtends={type:"object",properties:{main:main(true,true),tester:tester(true)},patternProperties:{[servicePattern]:ordinary(true,true)},propertyNames:{pattern:id},additionalProperties:false};
const source=(overlay=false)=>({type:"object",properties:{source:string,extends:meshExtends,publish:{type:"array",items:{type:"string"}}},required:overlay?[]:["source"],additionalProperties:false});
const meshServices=(overlay=false)=>({type:"object",properties:{tester:tester(overlay)},patternProperties:{"^(?!(?:main|tester)$)[a-z][a-z0-9-]*$":source(overlay)},propertyNames:{pattern:id},required:overlay?[]:["tester"],...(overlay?{}:{minProperties:2}),additionalProperties:false});
const meshStage={type:"object",properties:{services:meshServices(true)},additionalProperties:false};
const meshRoot={type:"object",properties:{$schema:{type:"string"},name:string,services:meshServices(),dev:meshStage,prod:meshStage,e2e:meshStage},required:["name","services"],additionalProperties:false};
const wrap=(name:string,root:unknown)=>({$schema:"http://json-schema.org/draft-07/schema#",$ref:`#/definitions/${name}`,definitions:{[name]:root}});
export function generateV3Schemas() {
 return { build:wrap("BuildJsonV3",buildRoot), mesh:wrap("MeshJsonV3",meshRoot) };
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===path.resolve(process.argv[1])) {
 const outputDir=path.resolve(process.cwd(),"schemas"),schemas=generateV3Schemas();fs.mkdirSync(outputDir,{recursive:true});
 fs.writeFileSync(path.join(outputDir,"build-schema.json"),JSON.stringify(schemas.build,null,2)+"\n");
 fs.writeFileSync(path.join(outputDir,"mesh-schema.json"),JSON.stringify(schemas.mesh,null,2)+"\n");
 console.log("V3 JSON Schemas generated in schemas/");
}
