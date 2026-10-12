import { describe, expect, it } from "vitest";
import { namespaceDependencyCompose } from "../../src/core/composition/namespaceDependencyCompose.js";
import { validateDependencyCompose } from "../../src/core/composition/validateDependencyCompose.js";
import type { ComposeDocument } from "../../src/core/composition/types.js";
describe("dependency Compose handling",()=>{
 it("rewrites services, resources, and references atomically",()=>{const doc:any={services:{api:{depends_on:{helper:{condition:"service_started"}},volumes:["data:/data"],networks:{private:null}},helper:{image:"x"}},volumes:{data:{}},networks:{private:{}}};const out=namespaceDependencyCompose({dependencyKey:"db",namespacePrefix:"dep--db",document:doc});expect(out.document.services).toHaveProperty("dep--db--api");expect((out.document.services["dep--db--api"]?.depends_on as any)).toHaveProperty("dep--db--helper");expect(out.document.volumes).toHaveProperty("dep--db--volume--data");expect((out.document.services["dep--db--api"]?.volumes as any)[0]).toBe("dep--db--volume--data:/data");});
 it.each([{ports:["1:1"]},{network_mode:"host"},{privileged:true},{container_name:"fixed"},{volumes:["/:/host"]}])("rejects forbidden service configuration %#",(bad)=>{const doc:any={services:{owner:{...bad,healthcheck:{test:["CMD","true"]}}}};const dep:any={endpoints:{ep:{service:"owner",port:1,primary:true}}};expect(()=>validateDependencyCompose("x",dep,doc,{composePath:"dep.yml",stage:"prod"})).toThrow();});
 it("requires an exact owner healthcheck",()=>{const dep:any={endpoints:{ep:{service:"missing",port:1,primary:true}}};expect(()=>validateDependencyCompose("x",dep,{services:{one:{}}} as ComposeDocument,{composePath:"dep.yml",stage:"dev"})).toThrow(/does not exist/);});
});
