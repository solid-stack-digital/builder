import fs from "node:fs";
import path from "node:path";
import { describe,expect,it } from "vitest";
import { compileMeshComposition } from "../../src/core/mesh/compileMeshComposition.js";
import { nodeId } from "../../src/core/config/types.js";
import { basicBuild,fixtureDir,writeBasic } from "./support/fixtures.js";
import { ConfigError } from "../../src/errors/ConfigError.js";
function meshFixture(){
 const root=fixtureDir("mesh");
 const backend=writeBasic(),frontend=writeBasic();
 fs.cpSync(backend,path.join(root,"backend"),{recursive:true});fs.cpSync(frontend,path.join(root,"frontend"),{recursive:true});
 const frontBuild=basicBuild();frontBuild.name="frontend";frontBuild.services.backend={compose:"backend.yml",endpoints:{http:{service:"mock",port:3100,primary:true,scheme:"http"}}};frontBuild.services.main.requisites={backend:"dependency"};frontBuild.prod={services:{main:{env:{BACKEND_URL:"${backend.endpoints.http.network_url}"}}}};
 fs.writeFileSync(path.join(root,"frontend/build.json"),JSON.stringify(frontBuild));
 fs.writeFileSync(path.join(root,"frontend/backend.yml"),'services:\n  mock:\n    image: node:22-alpine\n    healthcheck:\n      test: ["CMD", "true"]\n');
 fs.writeFileSync(path.join(root,"tester.yml"),'services:\n  runner:\n    image: node:22-alpine\n');
 return root;
}
describe("V3 mesh lexical scopes",()=>{
 it("[MSH18] mesh override error path does not duplicate service name",()=>{const root=meshFixture(),meshFile=path.join(root,"mesh.json");fs.writeFileSync(meshFile,JSON.stringify({name:"override-origin",services:{tester:{compose:"tester.yml",service:"runner"},backend:{source:"backend",extends:{main:{"override-compose":"missing.yml"}}}}}));try{compileMeshComposition("prod",root,{validationMode:true});throw new Error("Expected missing override");}catch(error){expect(error).toBeInstanceOf(ConfigError);expect((error as ConfigError).context).toMatchObject({sourceFile:meshFile,configPath:"services.backend.extends.main.override-compose"});}});
 it("[MER15] prunes a local mock and reaches a fellow source main",()=>{
  const root=meshFixture();const mesh={name:"scope-test",services:{tester:{compose:"tester.yml",service:"runner"},backend:{source:"backend"},frontend:{source:"frontend",extends:{main:{requisites:{"source.backend":false,backend:"dependency"},env:{BACKEND_URL:"${backend.source.main.endpoints.http.network_url}"}}}}}};
  fs.writeFileSync(path.join(root,"mesh.json"),JSON.stringify(mesh));
  const compiled=compileMeshComposition("prod",root,{validationMode:true});
  expect(compiled.graph.nodes.has(nodeId("frontend","backend"))).toBe(false);
  expect(compiled.graph.nodes.has(nodeId("backend","main"))).toBe(true);
  expect(compiled.graph.edges).toEqual(expect.arrayContaining([expect.objectContaining({consumer:nodeId("frontend","main"),target:nodeId("backend","main"),kind:"dependency"})]));
  expect((compiled.compose.services.frontend!.environment as Record<string,string>).BACKEND_URL).toBe("http://backend:3100");
 });
 it("[MER18] imports identical source twice with distinct identities",()=>{
  const root=meshFixture();fs.writeFileSync(path.join(root,"mesh.json"),JSON.stringify({name:"aliases",services:{tester:{compose:"tester.yml",service:"runner"},a:{source:"backend"},b:{source:"backend"}}}));
  const compiled=compileMeshComposition("dev",root,{validationMode:true});
  expect([...compiled.mainServiceNames.values()].sort()).toEqual(["a","b"]);
  expect(compiled.graph.nodes.has(nodeId("a","main"))).toBe(true);expect(compiled.graph.nodes.has(nodeId("b","main"))).toBe(true);
 });
 it("[MER17] rejects extends target unavailable in current source stage",()=>{
  const root=meshFixture();fs.writeFileSync(path.join(root,"mesh.json"),JSON.stringify({name:"unknown",services:{tester:{compose:"tester.yml",service:"runner"},frontend:{source:"frontend",extends:{missing:{env:{A:"x"}}}}}}));
  expect(()=>compileMeshComposition("dev",root,{validationMode:true})).toThrow(/extends target does not exist/);
 });
 it("[MER19] source and mesh authored references keep separate lexical scopes",()=>{
  const root=meshFixture();
  const frontendFile=path.join(root,"frontend/build.json"),frontend=JSON.parse(fs.readFileSync(frontendFile,"utf8"));
  frontend.services.main.env={LOCAL:"${backend.endpoints.http.network_port}"};fs.writeFileSync(frontendFile,JSON.stringify(frontend));
  const backendFile=path.join(root,"backend/build.json"),backend=JSON.parse(fs.readFileSync(backendFile,"utf8"));
  backend.services.main.endpoints.http.port=3200;fs.writeFileSync(backendFile,JSON.stringify(backend));
  const mesh={name:"scope-test",services:{
   tester:{compose:"tester.yml",service:"runner"},
   frontend:{source:"frontend",extends:{main:{env:{REMOTE:"${backend.source.main.endpoints.http.network_port}"},requisites:{backend:"dependency"}}}},
   backend:{source:"backend"}
  }};
  fs.writeFileSync(path.join(root,"mesh.json"),JSON.stringify(mesh));
  const x=compileMeshComposition("prod",root,{validationMode:true});const env=x.compose.services.frontend!.environment as Record<string,string>;expect(env.LOCAL).toBe("3100");expect(env.REMOTE).toBe("3200");
  expect(x.graph.edges).toEqual(expect.arrayContaining([expect.objectContaining({target:nodeId("frontend","backend")}),expect.objectContaining({target:nodeId("backend","main")})]));
 });
 it("[GRF12] same local service name has independent lifecycle class in each source",()=>{
  const root=meshFixture();for(const alias of ["backend","frontend"]){const file=path.join(root,alias,"build.json"),b=JSON.parse(fs.readFileSync(file,"utf8"));b.services.db={compose:"db.yml",service:"db"};b.services.main.requisites={db:alias==="backend"?"dependency":"prerequisite"};delete b.prod;fs.writeFileSync(file,JSON.stringify(b));fs.writeFileSync(path.join(root,alias,"db.yml"),'services:\n  db:\n    image: node:22-alpine\n    healthcheck:\n      test: ["CMD", "true"]\n');}
  fs.writeFileSync(path.join(root,"mesh.json"),JSON.stringify({name:"scope-test",services:{tester:{compose:"tester.yml",service:"runner"},backend:{source:"backend"},frontend:{source:"frontend"}}}));const x=compileMeshComposition("prod",root,{validationMode:true});expect(x.graph.lifecycle.get(nodeId("backend","db"))).toBe("long-running");expect(x.graph.lifecycle.get(nodeId("frontend","db"))).toBe("prerequisite");
 });
 it("[GRF17] a fellow-root requisite includes that root's full reachable subtree",()=>{
  const root=meshFixture(),backFile=path.join(root,"backend/build.json"),b=JSON.parse(fs.readFileSync(backFile,"utf8"));b.services.db={compose:"db.yml",service:"db"};b.services.main.requisites={db:"dependency"};fs.writeFileSync(backFile,JSON.stringify(b));fs.writeFileSync(path.join(root,"backend/db.yml"),'services:\n  db:\n    image: node:22-alpine\n    healthcheck:\n      test: ["CMD", "true"]\n');const frontFile=path.join(root,"frontend/build.json"),f=JSON.parse(fs.readFileSync(frontFile,"utf8"));delete f.prod;fs.writeFileSync(frontFile,JSON.stringify(f));fs.writeFileSync(path.join(root,"mesh.json"),JSON.stringify({name:"scope-test",services:{tester:{compose:"tester.yml",service:"runner"},backend:{source:"backend"},frontend:{source:"frontend",extends:{main:{requisites:{"source.backend":false,backend:"dependency"}}}}}}));const x=compileMeshComposition("prod",root,{validationMode:true});expect(x.graph.closures.get(nodeId("frontend","main"))?.has(nodeId("backend","db"))).toBe(true);expect(x.graph.nodes.has(nodeId("frontend","backend"))).toBe(false);
 });
 it("[REF11] mesh source-relative and source-authored refs both select the local node",()=>{
  const root=meshFixture(),frontFile=path.join(root,"frontend/build.json"),front=JSON.parse(fs.readFileSync(frontFile,"utf8"));
  front.services.main.env={SOURCE_REF:"${backend.endpoints.http.network_port}"};delete front.prod;fs.writeFileSync(frontFile,JSON.stringify(front));
  const backFile=path.join(root,"backend/build.json"),back=JSON.parse(fs.readFileSync(backFile,"utf8"));back.services.main.endpoints.http.port=3200;fs.writeFileSync(backFile,JSON.stringify(back));
  fs.writeFileSync(path.join(root,"mesh.json"),JSON.stringify({name:"local-ref",services:{tester:{compose:"tester.yml",service:"runner"},backend:{source:"backend"},frontend:{source:"frontend",extends:{main:{env:{MESH_REF:"${source.backend.endpoints.http.network_port}"}}}}}}));
  const x=compileMeshComposition("prod",root,{validationMode:true}),env=x.compose.services.frontend!.environment as Record<string,string>;
  expect(env.SOURCE_REF).toBe("3100");expect(env.MESH_REF).toBe("3100");expect(x.endpoints.get(nodeId("backend","main"))!.http!.networkPort).toBe(3200);
 });
});
