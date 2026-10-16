import fs from "node:fs";
import path from "node:path";
import { describe,expect,it } from "vitest";
import { compileServiceComposition } from "../../src/core/composition/compileServiceComposition.js";
import { compileMeshComposition } from "../../src/core/mesh/compileMeshComposition.js";
import { nodeId } from "../../src/core/config/types.js";
import { basicBuild,fixtureDir,writeBasic } from "./support/fixtures.js";
function meshFixture(publish?:string[]){const root=fixtureDir("publication"),source=writeBasic();fs.cpSync(source,path.join(root,"source"),{recursive:true});fs.writeFileSync(path.join(root,"tester.yml"),'services:\n  run:\n    image: node:22-alpine\n');fs.writeFileSync(path.join(root,"mesh.json"),JSON.stringify({name:"pub",services:{tester:{compose:"tester.yml",service:"run"},api:{source:"source",...(publish?{publish}:{})}}}));return root;}
describe("V3 publication intent",()=>{
 it("[PUB01] standalone active publicPort publishes",()=>{const root=writeBasic(),x=compileServiceComposition("prod",root,{validationMode:true});expect(x.endpoints.get(nodeId(undefined,"main"))!.http!.publicPort).toBeDefined();expect(x.compose.services.main!.ports).toHaveLength(1);});
 it("[PUB02] mesh is private without selector",()=>{const root=meshFixture(),x=compileMeshComposition("prod",root,{validationMode:true});expect(x.endpoints.get(nodeId("api","main"))!.http!.publicPort).toBeUndefined();expect(x.compose.services.api!.ports).toBeUndefined();});
 it("[PUB03] mesh selector publishes capable endpoint",()=>{const root=meshFixture(["main.endpoints.http"]),x=compileMeshComposition("prod",root,{validationMode:true});expect(x.compose.services.api!.ports).toHaveLength(1);expect(x.endpoints.get(nodeId("api","main"))!.http!.publicPort).toBeDefined();});
 it.each(["source.main.endpoints.http","api.source.main.endpoints.http","main.http"])("[PUB04] rejects noncanonical selector %s",selector=>{const root=meshFixture([selector]);expect(()=>compileMeshComposition("prod",root,{validationMode:true})).toThrow(/Invalid publish selector/);});
 it("[PUB05] duplicate fixed published port fails before allocation",()=>{const b=basicBuild();b.services.main.requisites={db:"requirement"};b.services.main.endpoints!.http!.publicPort=15000;b.services.db={compose:"db.yml",endpoints:{http:{service:"db",port:5432,publicPort:15000,primary:true}}};const root=writeBasic(b);fs.writeFileSync(path.join(root,"db.yml"),'services:\n  db:\n    image: node:22-alpine\n');expect(()=>compileServiceComposition("prod",root,{validationMode:true})).toThrow(/15000/);});
 it("[PUB06] validation AUTO allocation writes no cache",()=>{const root=writeBasic(),x=compileServiceComposition("prod",root,{validationMode:true});expect(x.allocations.size).toBe(1);expect(fs.existsSync(path.join(root,".builder/ports-v3.json"))).toBe(false);});
});
