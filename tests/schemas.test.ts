import {describe,expect,it} from "vitest";
import {buildJsonSchema} from "../src/core/buildSchema.js";
import {meshSchema} from "../src/core/mesh/meshSchema.js";
const endpoint={port:3000,publicPort:"AUTO",primary:true,scheme:"http"};
describe("V2 configuration schemas",()=>{
 it("accepts $schema and V2 build shape",()=>expect(buildJsonSchema.safeParse({$schema:"../../schemas/build-schema.json",name:"service",app:{endpoints:{http:endpoint}},dependencies:{db:{compose:"./db.yml",endpoints:{tcp:{service:"db",port:5432,primary:true}}}},dev:{app:{endpoints:{http:{port:3001}}}},tester:{env:{API_URL:"${app.endpoints.http.public_url}"}}}).success).toBe(true));
 it("rejects removed build fields",()=>{for(const key of ["port","envOverrides","overrides","composeFiles","services","policy","policies"]){expect(buildJsonSchema.safeParse({app:{},[key]:{}}).success,key).toBe(false);}});
 it("accepts V2 mesh and stage additions",()=>expect(meshSchema.safeParse({$schema:"../../schemas/mesh-schema.json",services:{api:{path:"./api",publish:["app.endpoints.http"]}},dev:{services:{worker:{path:"./worker"}}},tester:{compose:"./e2e.yml",service:"runner",env:{API_URL:"${api.app.endpoints.http.public_url}"}}}).success).toBe(true));
 it("rejects removed mesh fields",()=>{for(const key of ["port","provideDependency","replaceMocks","preservePort","envOverrides","healthcheck"]){expect(meshSchema.safeParse({services:{api:{path:"./api",[key]:true}}}).success,key).toBe(false);}});
});
