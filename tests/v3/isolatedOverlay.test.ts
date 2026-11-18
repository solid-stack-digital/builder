import fs from "node:fs";
import path from "node:path";
import { stringify } from "yaml";
import { Ajv } from "ajv";
import { describe, expect, it, vi } from "vitest";
import { buildJsonSchema } from "../../src/core/buildSchema.js";
import { checkAllEffectiveServiceStages } from "../../src/core/checkers/checkEffectiveServiceStages.js";
import { compileServiceComposition } from "../../src/core/composition/compileServiceComposition.js";
import { resolveBuildStage } from "../../src/core/config/resolveBuildStage.js";
import { nodeId } from "../../src/core/config/types.js";
import { compileMeshComposition } from "../../src/core/mesh/compileMeshComposition.js";
import { runMeshServiceTests } from "../../src/core/mesh/runners/runMeshServiceTests.js";
import { runTestUnit, type UnitRuntimeAdapters } from "../../src/core/runners/runTestUnit.js";
import { ConfigError } from "../../src/errors/ConfigError.js";
import { basicBuild, fixtureDir, writeBasic } from "./support/fixtures.js";

const KEY="on-inframode-isolated";
const ajv=new Ajv({strict:true});
const buildValidator=ajv.compile(JSON.parse(fs.readFileSync("schemas/build-schema.json","utf8")));
const parity=(value:unknown,valid:boolean)=>{expect(buildJsonSchema.safeParse(value).success).toBe(valid);expect(buildValidator(value)).toBe(valid);};
const healthy=(name:string)=>`services:\n  ${name}:\n    image: node:22-alpine\n    healthcheck:\n      test: ["CMD", "true"]\n`;
function isolatedBuild():any{
  const b:any=basicBuild();
  b.services.main.requisites={backend:"dependency"};
  b.services.backend={compose:"backend.yml",endpoints:{http:{service:"backend",port:4000,primary:true,scheme:"http"}}};
  b.services.devstore={compose:"devstore.yml",endpoints:{http:{service:"devstore",port:3002,primary:true,scheme:"http"}}};
  b.dev={[KEY]:{services:{main:{requisites:{devstore:"dependency"},env:{DEV_STORE_URL:"${devstore.endpoints.http.network_url}"}}}}};
  return b;
}
function writeIsolated(b:any=isolatedBuild()):string{const root=writeBasic(b);fs.writeFileSync(path.join(root,"devstore.yml"),healthy("devstore"));fs.writeFileSync(path.join(root,"backend.yml"),healthy("backend"));return root;}
function isolatedMesh(b:any=isolatedBuild()):string{
  const root=fixtureDir("iso-mesh"),source=writeIsolated(b);
  fs.cpSync(source,path.join(root,"web"),{recursive:true});
  fs.writeFileSync(path.join(root,"tester.yml"),'services:\n  runner:\n    image: node:22-alpine\n');
  fs.writeFileSync(path.join(root,"mesh.json"),JSON.stringify({name:"iso-mesh",services:{tester:{compose:"tester.yml",service:"runner"},web:{source:"web"}}}));
  return root;
}
const save=(root:string,b:unknown)=>fs.writeFileSync(path.join(root,"build.json"),JSON.stringify(b));
type Stage="dev"|"prod"|"test"|"e2e";
type Compiled=ReturnType<typeof compileServiceComposition>;
const compile=(root:string,stage:Stage,full=false):Compiled=>compileServiceComposition(stage,root,{full,validationMode:true});
const has=(c:Compiled,name:string)=>c.graph.nodes.has(nodeId(undefined,name));
const rep=(c:Compiled,name:string)=>c.modules.get(nodeId(undefined,name))!.representative;
const mainEnv=(c:Compiled)=>c.compose.services.main!.environment as Record<string,string>;
const dependsOn=(c:Compiled,service:string)=>(c.compose.services[service]!.depends_on??{}) as Record<string,{condition:string}>;
const configError=(run:()=>unknown):ConfigError=>{try{run();}catch(error){expect(error).toBeInstanceOf(ConfigError);return error as ConfigError;}throw new Error("Expected ConfigError");};

describe("V3.2 isolated infra-mode overlay",()=>{
  it("[ISO01] dev and test accept on-inframode-isolated with main and ordinary overlays",()=>{
    for(const stage of ["dev","test"] as const){const b:any=isolatedBuild();delete b.dev;b[stage]={services:{main:{env:{A:"a"}}},[KEY]:{services:{main:{requisites:{devstore:"dependency"},env:{X:"x"}},devstore:{env:{Y:"y"}},helper:{compose:"helper.yml",service:"helper"}}}};parity(b,true);}
  });
  it("[ISO02] prod, e2e, root and service entries reject on-inframode-isolated",()=>{
    for(const stage of ["prod","e2e"] as const){const b:any=basicBuild();b[stage]={[KEY]:{services:{main:{env:{X:"x"}}}}};parity(b,false);}
    const root:any=basicBuild();root[KEY]={services:{}};parity(root,false);
    const service:any=basicBuild();service.services.main[KEY]={services:{}};parity(service,false);
  });
  it("[ISO03] the block rejects tester",()=>{
    const b:any=basicBuild();b.dev={[KEY]:{services:{tester:{env:{X:"x"}}}}};parity(b,false);
    expect(JSON.stringify(buildJsonSchema.safeParse(b).error?.issues)).toContain("tester cannot be configured in on-inframode-isolated");
  });
  it("[ISO04] the block rejects nesting, unknown keys and invalid overlay fields",()=>{
    for(const block of [{[KEY]:{services:{}}},{services:{},extra:true},{services:{main:{compose:"x.yml"}}}]){const b:any=basicBuild();b.test={[KEY]:block};parity(b,false);}
  });
  it("[ISO05] resolution without isolated ignores the block",()=>{
    const r=resolveBuildStage(isolatedBuild(),"dev",path.resolve("example/build.json"));const main=r.services.main as any;
    expect(main.env.DEV_STORE_URL).toBeUndefined();expect(main.requisites).toEqual({backend:"dependency"});
    expect(r.layers.map(layer=>layer.origin.configPath)).toEqual(["services","dev.services"]);
  });
  it("[ISO06] isolated resolution merges the block after the stage and flags its origins",()=>{
    const b=isolatedBuild();b.dev.services={main:{env:{SHARED:"dev"}}};b.dev[KEY].services.main.env.SHARED="isolated";
    const r=resolveBuildStage(b,"dev",path.resolve("example/build.json"),{isolated:true});const main=r.services.main as any;
    expect(main.env).toMatchObject({SHARED:"isolated",DEV_STORE_URL:"${devstore.endpoints.http.network_url}"});
    expect(main.requisites).toEqual({backend:"dependency",devstore:"dependency"});
    const edges=r.requisiteOrigins.get("main")!;
    expect(edges.get("devstore")).toMatchObject({configPath:"dev.on-inframode-isolated.services.main.requisites.devstore",layer:"dev",isolatedOverlay:true});
    expect(edges.get("backend")!.isolatedOverlay).toBeUndefined();
    expect(r.envOrigins.get("main")!.get("SHARED")!.configPath).toBe("dev.on-inframode-isolated.services.main.env.SHARED");
    expect(r.layers.map(layer=>layer.origin.configPath)).toEqual(["services","dev.services","dev.on-inframode-isolated.services"]);
  });
  it("[ISO07] isolated dev starts main and the block module but not base-only targets",()=>{
    const c=compile(writeIsolated(),"dev");
    expect(has(c,"devstore")).toBe(true);expect(has(c,"backend")).toBe(false);
    expect(c.graph.edges.map(edge=>edge.target)).toEqual([nodeId(undefined,"devstore")]);
    expect(dependsOn(c,"main")[rep(c,"devstore")]).toEqual({condition:"service_healthy"});
    expect(mainEnv(c)).toMatchObject({INFRA_MODE:"isolated",EXEC_MODE:"dev"});
  });
  it("[ISO08] a block reference to the block module resolves",()=>{
    const c=compile(writeIsolated(),"dev");expect(mainEnv(c).DEV_STORE_URL).toBe(`http://${rep(c,"devstore")}:3002`);
  });
  it("[ISO09] dev --full ignores the block",()=>{
    const c=compile(writeIsolated(),"dev",true);
    expect(has(c,"devstore")).toBe(false);expect(has(c,"backend")).toBe(true);
    expect(mainEnv(c).DEV_STORE_URL).toBeUndefined();expect(mainEnv(c).INFRA_MODE).toBe("integrated");
  });
  it("[ISO10] prod and e2e ignore the block",()=>{
    const root=writeIsolated();
    for(const stage of ["prod","e2e"] as const){const c=compile(root,stage);expect(has(c,"devstore")).toBe(false);expect(has(c,"backend")).toBe(true);expect(mainEnv(c).DEV_STORE_URL).toBeUndefined();}
  });
  it("[ISO11] base main edges stay dropped in isolated runs unless redeclared in the block",()=>{
    const root=writeIsolated();expect(has(compile(root,"dev"),"backend")).toBe(false);
    const b=isolatedBuild();b.dev[KEY].services.main.requisites.backend="dependency";save(root,b);
    const c=compile(root,"dev");expect(has(c,"backend")).toBe(true);expect(has(c,"devstore")).toBe(true);expect(mainEnv(c).INFRA_MODE).toBe("isolated");
  });
  it("[ISO12] a module declared only in the block runs only in isolated dev",()=>{
    const b=isolatedBuild();delete b.services.devstore;b.dev[KEY].services.devstore={compose:"devstore.yml",endpoints:{http:{service:"devstore",port:3002,primary:true,scheme:"http"}}};
    const root=writeIsolated(b);expect(has(compile(root,"dev"),"devstore")).toBe(true);
    for(const [stage,full] of [["dev",true],["prod",false],["test",false],["e2e",false]] as const)expect(has(compile(root,stage,full),"devstore")).toBe(false);
    delete b.dev[KEY].services.devstore.compose;save(root,b);
    const error=configError(()=>compile(root,"dev"));
    expect(error.context.configPath).toBe("dev.on-inframode-isolated.services.devstore.compose");expect(error.message).toMatch(/Stage-introduced service requires a complete compose declaration/);
  });
  it("[ISO13] an activated module keeps its own requisites",()=>{
    const b=isolatedBuild();b.services.devstore.requisites={seed:"prerequisite"};b.services.seed={compose:"seed.yml",service:"seed"};
    const root=writeIsolated(b);fs.writeFileSync(path.join(root,"seed.yml"),'services:\n  seed:\n    image: node:22-alpine\n    command: ["node", "-e", "process.exit(0)"]\n');
    const c=compile(root,"dev");
    expect(has(c,"seed")).toBe(true);expect(c.graph.lifecycle.get(nodeId(undefined,"seed"))).toBe("prerequisite");
    expect(dependsOn(c,rep(c,"devstore"))[rep(c,"seed")]).toEqual({condition:"service_completed_successfully"});
    expect(has(compile(root,"prod"),"seed")).toBe(false);
  });
  it("[ISO14] each stage applies only its own block",()=>{
    const b=isolatedBuild();b.test={[KEY]:b.dev[KEY]};delete b.dev;const root=writeIsolated(b);
    const unit=compile(root,"test");expect(has(unit,"devstore")).toBe(true);expect(mainEnv(unit)).toMatchObject({INFRA_MODE:"isolated",DEV_STORE_URL:`http://${rep(unit,"devstore")}:3002`});
    expect(has(compile(root,"dev"),"devstore")).toBe(false);
    save(root,isolatedBuild());expect(has(compile(root,"test"),"devstore")).toBe(false);expect(has(compile(root,"dev"),"devstore")).toBe(true);
  });
  it("[ISO15] configurations without a block or with an empty block compile identically",()=>{
    const b=isolatedBuild();delete b.dev;const root=writeIsolated(b);
    const runs:Array<[Stage,boolean]>=[["dev",false],["dev",true],["prod",false],["test",false],["e2e",false]];
    const before=runs.map(([stage,full])=>stringify(compile(root,stage,full).compose));
    b.dev={[KEY]:{}};b.test={[KEY]:{services:{}}};save(root,b);
    expect(runs.map(([stage,full])=>stringify(compile(root,stage,full).compose))).toEqual(before);
    const isolated=compile(root,"dev");expect([...isolated.graph.nodes.keys()]).toEqual([nodeId(undefined,"main")]);expect(isolated.graph.edges).toEqual([]);
  },10_000);
  it("[ISO16] override-compose set in the block is selected only in isolated runs",()=>{
    const b=isolatedBuild();b.dev[KEY].services.main["override-compose"]="override.isolated.yml";const root=writeIsolated(b);
    fs.writeFileSync(path.join(root,"override.isolated.yml"),"services:\n  main:\n    environment:\n      FROM_OVERRIDE: isolated\n");
    expect(mainEnv(compile(root,"dev")).FROM_OVERRIDE).toBe("isolated");expect(mainEnv(compile(root,"dev",true)).FROM_OVERRIDE).toBeUndefined();
  });
  it("[ISO17] an invalid block reference reports the block path",()=>{
    const b=isolatedBuild();b.dev[KEY].services.main.env.BAD="${backend.endpoints.http.network_url}";const root=writeIsolated(b);
    const error=configError(()=>compile(root,"dev"));
    expect(error.context.configPath).toBe("dev.on-inframode-isolated.services.main.env.BAD");expect(error.message).toMatch(/outside effective requisite closure/);
    expect(()=>compile(root,"dev",true)).not.toThrow();
  });
  it("[ISO18] removing an unknown requisite in the block reports the block path",()=>{
    const b=isolatedBuild();b.dev[KEY].services.main.requisites.ghost=false;const root=writeIsolated(b);
    const error=configError(()=>compile(root,"dev"));
    expect(error.context.configPath).toBe("dev.on-inframode-isolated.services.main.requisites.ghost");expect(error.message).toMatch(/Unknown requisite target/);
    expect(()=>compile(root,"dev",true)).not.toThrow();
  });
  it("[ISO19] global mesh dev and prod ignore a source block",()=>{
    const root=isolatedMesh();
    for(const stage of ["dev","prod"] as const){
      const c=compileMeshComposition(stage,root,{validationMode:true});
      expect(c.graph.nodes.has(nodeId("web","devstore"))).toBe(false);expect(c.graph.nodes.has(nodeId("web","backend"))).toBe(true);
      expect((c.compose.services[c.mainServiceNames.get(nodeId("web","main"))!]!.environment as Record<string,string>).DEV_STORE_URL).toBeUndefined();
    }
  });
  it("[ISO20] mesh up test Phase 1 starts the source test block module",async()=>{
    vi.spyOn(console,"log").mockImplementation(()=>{});
    const b=isolatedBuild();b.test={[KEY]:{services:{main:{requisites:{devstore:"dependency"}}}}};const root=isolatedMesh(b);
    const devstore=rep(compile(path.join(root,"web"),"test"),"devstore"),unitCalls:string[][]=[];
    const runtime={unit:{checkPorts:async()=>{},teardown:async()=>{},compose:async(args:string[])=>{unitCalls.push(args);return 0;},inspectExit:()=>0},e2e:{checkPorts:async()=>{},teardown:async()=>{},finite:{checkPorts:async()=>{},compose:async()=>0,inspectRunnerExit:()=>0}}};
    expect(await runMeshServiceTests({projectDir:root},runtime)).toBe(0);
    expect(unitCalls[0]!.slice(0,3)).toEqual(["up","--build","--detach"]);expect(unitCalls[0]).toContain(devstore);expect(unitCalls[1]).toEqual(["wait","main"]);
  },10_000);
  it("[ISO21] test-unit keeps the 3.1 command for main-only graphs and waits on main otherwise",async()=>{
    const fake=(calls:string[][],status:(args:string[])=>number,exit:number|undefined):UnitRuntimeAdapters=>({checkPorts:async()=>{},teardown:async()=>{},compose:async(args)=>{calls.push(args);return status(args);},inspectExit:()=>exit});
    const options=(projectDir:string)=>({projectDir,debug:false,detach:false});
    const single:string[][]=[];expect(await runTestUnit(options(writeBasic()),fake(single,()=>0,undefined))).toBe(0);
    expect(single).toEqual([["up","--build","--abort-on-container-exit","--exit-code-from","main","main"]]);
    const b=isolatedBuild();b.test={[KEY]:{services:{main:{requisites:{devstore:"dependency"}}}}};const root=writeIsolated(b);const devstore=rep(compile(root,"test"),"devstore");
    const multi:string[][]=[];expect(await runTestUnit(options(root),fake(multi,()=>0,7))).toBe(7);
    expect(multi[0]!.slice(0,3)).toEqual(["up","--build","--detach"]);expect(multi[0]!.slice(3).sort()).toEqual(["main",devstore].sort());
    expect(multi.slice(1)).toEqual([["wait","main"],["logs","--no-color","main"]]);
    expect(await runTestUnit(options(root),fake([],()=>0,undefined))).toBe(1);
    expect(await runTestUnit(options(root),fake([],args=>args[0]==="wait"?5:0,undefined))).toBe(5);
    const failed:string[][]=[];expect(await runTestUnit(options(root),fake(failed,args=>args[0]==="up"?3:0,undefined))).toBe(3);
    expect(failed.map(args=>args[0])).toEqual(["up","logs"]);
  },10_000);
  it("[ISO22] builder check compiles the dev and test blocks",()=>{
    expect(()=>checkAllEffectiveServiceStages(writeIsolated())).not.toThrow();
    for(const stage of ["dev","test"] as const){const b=isolatedBuild();delete b.dev;b[stage]={[KEY]:{services:{main:{env:{BAD:"${backend.endpoints.http.network_url}"}}}}};expect(()=>checkAllEffectiveServiceStages(writeIsolated(b))).toThrow(/outside effective requisite closure/);}
  },10_000);
});
