import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { Ajv } from "ajv";
import { buildJsonSchema } from "../../src/core/buildSchema.js";
import { meshSchema } from "../../src/core/mesh/meshSchema.js";
import { basicBuild } from "./support/fixtures.js";
const ajv=new Ajv({strict:true});
const buildValidator=ajv.compile(JSON.parse(fs.readFileSync("schemas/build-schema.json","utf8")));
const meshValidator=ajv.compile(JSON.parse(fs.readFileSync("schemas/mesh-schema.json","utf8")));
const mesh=()=>({name:"v3-mesh",services:{tester:{compose:"e2e.yml",service:"runner"},api:{source:"api"}}});
function parity(value:unknown,kind:"build"|"mesh",valid:boolean){expect((kind==="build"?buildJsonSchema:meshSchema).safeParse(value).success).toBe(valid);expect((kind==="build"?buildValidator:meshValidator)(value)).toBe(valid);}
describe("V3 schema and generated JSON Schema",()=>{
 it("[CFG01] accepts complete build and mesh with optional schema URI",()=>{for(const uri of [undefined,"https://example.invalid/schema.json"]){const b=basicBuild(),m=mesh();if(uri){b.$schema=uri;(m as typeof m&{$schema?:string}).$schema=uri;}parity(b,"build",true);parity(m,"mesh",true);}});
 it.each([undefined,"","   "])("[CFG02] rejects missing or blank name %s",name=>{const b={...basicBuild(),name};parity(b,"build",false);});
 it.each(["main","tester"])("[CFG04] requires base %s",name=>{const b=basicBuild() as unknown as Record<string,any>;delete b.services[name];parity(b,"build",false);});
 it("[CFG04] requires a mesh source",()=>parity({name:"only-tester",services:{tester:{compose:"t.yml",service:"run"}}},"mesh",false));
 it.each(["app","dependencies","dev"])("[CFG07] permits ordinary identifier %s",name=>{const b=basicBuild() as unknown as Record<string,any>;b.services[name]={compose:"x.yml",service:"svc"};parity(b,"build",true);});
 it.each(["A","1a","a_b","a.b"," "])("[CFG07] rejects identifier %s",name=>{const b=basicBuild() as unknown as Record<string,any>;b.services[name]={compose:"x.yml",service:"svc"};parity(b,"build",false);});
 it.each(["app","dependencies","dockerfile","tester"])("[CFG09] rejects legacy root %s",key=>{const b={...basicBuild(),[key]:{}};parity(b,"build",false);});
 it("[CFG13] accepts three requisite kinds and overlay false",()=>{const b=basicBuild();b.services.main.requisites={db:"dependency",job:"prerequisite",mail:"requirement"};b.dev={services:{main:{requisites:{db:false}}}};parity(b,"build",true);});
 it("[CFG13] rejects false in base",()=>{const b=basicBuild() as any;b.services.main.requisites={db:false};parity(b,"build",false);});
 it.each([0,65536,1.5,"3000"])("[CFG15] rejects invalid port %s",port=>{const b=basicBuild() as any;b.services.main.endpoints.http.port=port;parity(b,"build",false);});
 it.each(["auto",null,true])("[CFG15] rejects invalid publicPort %s",publicPort=>{const b=basicBuild() as any;b.services.main.endpoints.http.publicPort=publicPort;parity(b,"build",false);});
 it("[CFG17] allows endpoint-less ordinary service only with representative",()=>{const b=basicBuild() as any;b.services.job={compose:"j.yml",service:"run"};parity(b,"build",true);delete b.services.job.service;parity(b,"build",false);});
 it("[CFG14] permits mesh source-relative requisite in extends",()=>{const m=mesh() as any;m.services.api.extends={main:{requisites:{"source.db":false,backend:"dependency"}}};parity(m,"mesh",true);m.services.api.extends.main.requisites={"source.db.extra":false};parity(m,"mesh",false);});
 it("[CFG23] exposes only V3 definition names",()=>{const b=JSON.parse(fs.readFileSync("schemas/build-schema.json","utf8"));const m=JSON.parse(fs.readFileSync("schemas/mesh-schema.json","utf8"));expect(Object.keys(b.definitions)).toEqual(["BuildJsonV3"]);expect(Object.keys(m.definitions)).toEqual(["MeshJsonV3"]);});
});
