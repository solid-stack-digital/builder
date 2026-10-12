import path from "node:path";
import fs from "node:fs";
import { parse } from "yaml";
import { describe,expect,it } from "vitest";
import { compileEnvironment } from "../src/core/compileEnvironment.js";
import { compileServiceComposition } from "../src/core/composition/compileServiceComposition.js";

const fixture=(name:string)=>path.resolve(__dirname,"fixtures/v2",name);
const compile=(stage:"dev"|"prod"|"test"|"e2e",name="service-basic",full=false)=>compileServiceComposition(stage,fixture(name),{full,validationMode:true});
describe("V2 standalone composition",()=>{
 it("runs dev isolated and owns endpoint publication and PORT",()=>{const c=compile("dev");expect(c.compose.services.app?.environment).toMatchObject({EXEC_MODE:"dev",INFRA_MODE:"isolated",PORT:"3000"});expect(c.compose.services.app?.ports).toHaveLength(1);expect(c.compose.services.app?.build).toMatchObject({target:"dev"});});
 it("materializes all endpoint dependencies for full dev",()=>{const c=compile("dev","service-multidependency",true);expect(c.compose.services["dep--alpha--alpha"]).toBeDefined();expect(c.compose.services["dep--beta--beta"]).toBeDefined();expect(c.compose.services.app?.depends_on).toMatchObject({"dep--alpha--alpha":{condition:"service_healthy"},"dep--beta--beta":{condition:"service_healthy"}});});
 it("keeps endpoint dependencies inert in isolated dev and unit test",()=>{for(const stage of ["dev","test"] as const){const c=compile(stage,"service-multidependency");expect(Object.keys(c.compose.services).some(k=>k.startsWith("dep--"))).toBe(false);}});
 it("runs prod integrated and test isolated",()=>{expect(compile("prod").compose.services.app?.environment).toMatchObject({INFRA_MODE:"integrated",EXEC_MODE:"prod"});expect(compile("test").compose.services.app?.build).toMatchObject({target:"test"});});
 it("runs E2E with prod app, e2e dotenv and host tester",()=>{const c=compile("e2e","service-e2e");expect(c.compose.services.app?.build).toMatchObject({target:"prod"});expect(c.compose.services.app?.environment).toMatchObject({EXEC_MODE:"prod",INFRA_MODE:"integrated"});expect(c.compose.services.app?.env_file).toEqual([{path:".env.e2e",required:false}]);expect(c.compose.services.tester?.network_mode).toBe("host");expect(c.compose.services.tester?.environment).toMatchObject({API_URL:"http://127.0.0.1:60000"});});
 it("applies app override env and build args",()=>{const c=compile("dev","service-override");expect(c.compose.services.app?.environment).toMatchObject({FEATURE:"enabled"});expect(c.compose.services.app?.build).toMatchObject({args:{FEATURE:"enabled"}});});
 it("rejects invalid V2 examples before composition",()=>{expect(()=>compile("dev","invalid/legacy-build-port")).toThrow(/Unrecognized key/);expect(()=>compile("dev","invalid/invalid-primary")).toThrow(/primary/);expect(()=>compile("e2e","invalid/unpublished-public-reference")).toThrow(/public/);});
 it("public compileEnvironment emits valid V2 YAML",()=>{const root=fixture("service-basic");try{const y=parse(compileEnvironment("dev",root));expect(y.services.app.environment.PORT).toBe("3000");}finally{fs.rmSync(path.join(root,".builder"),{recursive:true,force:true});}});
});
