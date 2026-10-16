import path from "node:path";
import fs from "node:fs";
import { describe,expect,it } from "vitest";
import type { BuildJson, OrdinaryService, RequisiteKind } from "../../src/types/index.js";
import { resolveBuildStage } from "../../src/core/config/resolveBuildStage.js";
import { buildDeclaredGraph,selectReachableGraph } from "../../src/core/config/serviceGraph.js";
import type { EffectiveComposition,GraphNode,NodeId } from "../../src/core/config/types.js";
import { nodeId } from "../../src/core/config/types.js";
import { basicBuild } from "./support/fixtures.js";
import { writeBasic } from "./support/fixtures.js";
import { compileServiceComposition } from "../../src/core/composition/compileServiceComposition.js";
const sourceFile=path.resolve(".builder/test-tmp/graph/build.json");
function graph(configure:(build:BuildJson)=>void,infraMode:"integrated"|"isolated"="integrated"){
 const build=basicBuild();configure(build);const effective=resolveBuildStage(build,"prod",sourceFile);
 const nodes=new Map<NodeId,GraphNode>();for(const [name,service] of Object.entries(effective.services)){
  if(name==="tester")continue;const id=nodeId(undefined,name);nodes.set(id,{id,kind:name==="main"?"main":"ordinary",projectDir:effective.projectDir,sourceService:name,declaration:service as GraphNode["declaration"],envLayers:[],origin:effective.origins.get(name)!,envOrigins:effective.envOrigins.get(name)!,requisiteOrigins:effective.requisiteOrigins.get(name)!});
 }
 const declared=buildDeclaredGraph({nodes,roots:[nodeId(undefined,"main")],tester:build.services.tester,testerOrigin:effective.origins.get("tester")!,stage:"prod",composition:"service"} as EffectiveComposition);
 return selectReachableGraph(declared,{infraMode,stage:"prod"});
}
function add(build:BuildJson,name:string,requisites:Record<string,RequisiteKind>={}){build.services[name]={compose:`${name}.yml`,service:"svc",requisites} as OrdinaryService;}
describe("V3 logical graph",()=>{
 it("[GRF01] includes only transitive requisite targets",()=>{const x=graph(b=>{add(b,"db");add(b,"mail");add(b,"unused");b.services.main.requisites={db:"dependency",mail:"requirement"};});expect([...x.nodes.keys()].sort()).toEqual(["db","mail","main"].map(name=>nodeId(undefined,name)).sort());expect(x.edges).toHaveLength(2);});
 it("[GRF02] isolated profile keeps only main",()=>{const x=graph(b=>{add(b,"db");b.services.main.requisites={db:"dependency"};},"isolated");expect([...x.nodes.keys()]).toEqual([nodeId(undefined,"main")]);expect(x.edges).toEqual([]);});
 it("[GRF03] transitive closure follows every edge kind",()=>{const x=graph(b=>{add(b,"a",{b:"dependency"});add(b,"b",{c:"prerequisite"});add(b,"c");b.services.main.requisites={a:"requirement"};});expect(x.closures.get(nodeId(undefined,"main"))?.size).toBe(4);expect(x.lifecycle.get(nodeId(undefined,"c"))).toBe("prerequisite");});
 it("[GRF04] diamond materializes shared target once",()=>{const x=graph(b=>{add(b,"a",{db:"dependency"});add(b,"b",{db:"requirement"});add(b,"db");b.services.main.requisites={a:"requirement",b:"requirement"};});expect(x.nodes.size).toBe(4);expect(x.edges.filter(e=>e.target===nodeId(undefined,"db"))).toHaveLength(2);});
 it("[GRF05] requirement cycles and self edges are legal",()=>{const x=graph(b=>{add(b,"a",{main:"requirement",a:"requirement"});b.services.main.requisites={a:"requirement"};});expect(x.nodes.size).toBe(2);expect(x.edges).toHaveLength(3);});
 it.each(["dependency","prerequisite"] as const)("[GRF06] %s self edge is an ordering cycle",kind=>expect(()=>graph(b=>{add(b,"a",{a:kind});b.services.main.requisites={a:"requirement"};})).toThrow(/ordering cycle/));
 it("[GRF07] mixed ordering cycle fails",()=>expect(()=>graph(b=>{add(b,"a",{b:"dependency"});add(b,"b",{a:"prerequisite"});b.services.main.requisites={a:"requirement"};})).toThrow(/ordering cycle/));
 it("[GRF08] requirement back edge does not create ordering cycle",()=>{const x=graph(b=>{add(b,"a",{b:"dependency"});add(b,"b",{a:"requirement"});b.services.main.requisites={a:"requirement"};});expect(x.edges.filter(e=>e.kind!=="requirement")).toHaveLength(1);});
 it("[GRF11] conflicting incoming classifications fail",()=>expect(()=>graph(b=>{add(b,"a",{db:"dependency"});add(b,"b",{db:"prerequisite"});add(b,"db");b.services.main.requisites={a:"requirement",b:"requirement"};})).toThrow(/both dependency and prerequisite/));
 it("[GRF13] tester is never a requisite target",()=>expect(()=>graph(b=>{b.services.main.requisites={tester:"requirement"};})).toThrow(/tester cannot be a requisite target/));
 it("[GRF13] main may not be prerequisite classified",()=>expect(()=>graph(b=>{add(b,"job",{main:"prerequisite"});b.services.main.requisites={job:"requirement"};})).toThrow(/main cannot be a prerequisite/));
 it("[GRF09] requirement plus dependency keeps long-running classification",()=>{const x=graph(b=>{add(b,"a",{db:"requirement"});add(b,"b",{db:"dependency"});add(b,"db");b.services.main.requisites={a:"requirement",b:"requirement"};});expect(x.lifecycle.get(nodeId(undefined,"db"))).toBe("long-running");expect(x.edges.filter(e=>e.target===nodeId(undefined,"db")).map(e=>e.kind).sort()).toEqual(["dependency","requirement"]);});
 it("[GRF10] requirement plus prerequisite classifies the job for completion",()=>{const x=graph(b=>{add(b,"a",{job:"requirement"});add(b,"b",{job:"prerequisite"});add(b,"job");b.services.main.requisites={a:"requirement",b:"requirement"};});expect(x.lifecycle.get(nodeId(undefined,"job"))).toBe("prerequisite");});
 it("[GRF14] main and reached job may both be endpoint-less",()=>{const x=graph(b=>{b.services.main.endpoints={};add(b,"job");b.services.main.requisites={job:"prerequisite"};});expect([...x.nodes.keys()].sort()).toEqual([nodeId(undefined,"job"),nodeId(undefined,"main")].sort());expect(x.lifecycle.get(nodeId(undefined,"job"))).toBe("prerequisite");});
 it("[GRF16] a declared but unreachable ordinary service remains outside root closure",()=>{const x=graph(b=>{add(b,"unused");});expect(x.closures.get(nodeId(undefined,"main"))).toEqual(new Set([nodeId(undefined,"main")]));expect(x.nodes.has(nodeId(undefined,"unused"))).toBe(false);});
 it("[GRF19] insertion order does not change graph identity or classification",()=>{const configure=(reverse:boolean)=>(b:BuildJson)=>{const names=reverse?["c","b","a"]:["a","b","c"];for(const name of names)add(b,name);b.services.main.requisites=Object.fromEntries(names.map(name=>[name,name==="c"?"prerequisite":"requirement"]));};const left=graph(configure(false)),right=graph(configure(true));expect([...left.nodes.keys()].sort()).toEqual([...right.nodes.keys()].sort());expect(left.edges).toEqual(right.edges);expect([...left.lifecycle].sort(([a],[b])=>a.localeCompare(b))).toEqual([...right.lifecycle].sort(([a],[b])=>a.localeCompare(b)));});
 it("[GRF20] a 300-node requirement chain and back edge terminates",()=>{const x=graph(b=>{for(let i=0;i<300;i++){const name=`n${i}`;add(b,name,i<299?{[`n${i+1}`]:"requirement"}:{n0:"requirement"});}b.services.main.requisites={n0:"requirement"};});expect(x.nodes.size).toBe(301);expect(x.edges).toHaveLength(301);expect(x.closures.get(nodeId(undefined,"main"))?.size).toBe(301);});
 it("[GRF15] inactive stage service may name an absent Compose file",()=>{const b=basicBuild();b.prod={services:{unused:{compose:"missing.yml",service:"svc"}}};const root=writeBasic(b);expect(()=>compileServiceComposition("prod",root,{validationMode:true})).not.toThrow();(b.prod.services!.main as any)={requisites:{unused:"requirement"}};fs.writeFileSync(path.join(root,"build.json"),JSON.stringify(b));expect(()=>compileServiceComposition("prod",root,{validationMode:true})).toThrow(/missing.yml|ENOENT/);});
 it("[GRF18] a reference to dormant service does not activate its Compose path",()=>{const b=basicBuild();b.services.unused={compose:"missing.yml",service:"svc"};b.services.main.env={URL:"${unused.endpoints.http.network_host}"};const root=writeBasic(b);expect(()=>compileServiceComposition("prod",root,{validationMode:true})).toThrow(/outside effective requisite closure/);});
 it("[GRF22] seeded small graphs agree with independent reachability and ordering oracle",()=>{
  let seed=18421;const random=()=>((seed=Math.imul(seed,1664525)+1013904223|0)>>>0)/4294967296;
  for(let sample=0;sample<40;sample++){
   const size=2+Math.floor(random()*7),names=Array.from({length:size},(_,i)=>`n${i}`),edges:{from:string;to:string;kind:RequisiteKind}[]=[];
   for(const from of names)for(const to of names)if(random()<0.16)edges.push({from,to,kind:(random()<0.42?"requirement":random()<0.5?"dependency":"prerequisite")});
   const reachable=new Set(["main"]),queue=["main"];
   const first=names[0]!;edges.push({from:"main",to:first,kind:"requirement"});
   while(queue.length){const from=queue.shift()!;for(const e of edges.filter(e=>e.from===from))if(!reachable.has(e.to)){reachable.add(e.to);queue.push(e.to);}}
   const active=edges.filter(e=>reachable.has(e.from)&&reachable.has(e.to));
   const conflicts=names.some(to=>active.some(e=>e.to===to&&e.kind==="dependency")&&active.some(e=>e.to===to&&e.kind==="prerequisite"));
   const ordering=active.filter(e=>e.kind!=="requirement"),dfs=(start:string,current:string,seen:Set<string>):boolean=>ordering.some(e=>e.from===current&&(e.to===start||!seen.has(e.to)&&dfs(start,e.to,new Set([...seen,e.to]))));
   const cycle=[...reachable].some(id=>dfs(id,id,new Set([id])));
   if(conflicts||cycle){expect(()=>graph(b=>{for(const name of names)add(b,name);for(const e of edges)(b.services[e.from] as any).requisites??={},(b.services[e.from] as any).requisites[e.to]=e.kind;})).toThrow();continue;}
   const x=graph(b=>{for(const name of names)add(b,name);for(const e of edges)(b.services[e.from] as any).requisites??={},(b.services[e.from] as any).requisites[e.to]=e.kind;});expect(new Set(x.nodes.keys())).toEqual(new Set([...reachable].map(name=>nodeId(undefined,name))));
  }
 });
});
