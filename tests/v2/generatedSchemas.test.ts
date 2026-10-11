import fs from "node:fs";
import path from "node:path";
import {describe,expect,it} from "vitest";
const root=path.resolve(__dirname,"../../schemas");
const read=(name:string)=>JSON.parse(fs.readFileSync(path.join(root,name),"utf8"));
describe("published V2 JSON Schemas",()=>{
 it("exposes V2 build properties and excludes old fields",()=>{const schema=read("build-schema.json").definitions.BuildJsonV2;const p=schema.properties;for(const key of ["app","dependencies","tester","dev","prod","test","e2e"])expect(p[key],key).toBeDefined();for(const key of ["port","envOverrides","overrides","composeFiles","services","policy","policies"])expect(p[key],key).toBeUndefined();const dep=p.dependencies.additionalProperties.properties;for(const key of ["compose","env","endpoints","dependsOn"])expect(dep[key],key).toBeDefined();for(const key of ["service","port","ports","path"])expect(dep[key],key).toBeUndefined();});
 it("exposes V2 mesh service and tester properties only",()=>{const p=read("mesh-schema.json").definitions.MeshJsonV2.properties;const svc=p.services.additionalProperties.properties;for(const key of ["path","env","dependencies","dependsOn","publish"])expect(svc[key],key).toBeDefined();for(const key of ["port","preservePort","provideDependency","replaceMocks","envOverrides","healthcheck"])expect(svc[key],key).toBeUndefined();expect(Object.keys(p.tester.properties).sort()).toEqual(["compose","env","service"]);});
});
