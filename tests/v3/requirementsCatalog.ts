import fs from "node:fs";
import path from "node:path";

export interface V3Case {
  id:string; title:string; specSections:string[]; invariantIds:number[]; decisionIds?:string[];
  layer:"U"|"I"|"W"|"D"; fixture:string; setup:string; action:string; expected:string; testFile:string;
}
export interface CaseResult { id:string; status:"passed"|"failed"|"skipped" }
const planRoot=path.resolve(".docs/execution_docs/04-implement_v3");
const files=["06_TEST_CONFIGURATION_AND_GRAPH.md","07_TEST_COMPOSE_AND_ENVIRONMENT.md","08_TEST_EXECUTION_AND_ACCEPTANCE.md"];
const casePattern=/^\| ([A-Z]{2,5}\d{2}) \| ([^|]+) \| ([^|]+) \| ([^|]+) \|/gm;
const testRoots=[path.resolve("tests/v3"),path.resolve("tests/conformance")];
function allFiles(dir:string):string[]{return fs.readdirSync(dir,{withFileTypes:true}).flatMap(item=>item.isDirectory()?allFiles(path.join(dir,item.name)):item.name.endsWith(".test.ts")?[path.join(dir,item.name)]:[]);}
function expandIds(value:string):string[]{const output:string[]=[];for(const part of value.split(/[,\s]+/)){const range=/^([A-Z]{2,5})(\d{2})[–-]([A-Z]{2,5})?(\d{2})$/.exec(part);if(range){const prefix=range[1]!;if(range[3]&&range[3]!==prefix)continue;for(let n=Number(range[2]);n<=Number(range[4]);n++)output.push(`${prefix}${String(n).padStart(2,"0")}`);}else if(/^[A-Z]{2,5}\d{2}$/.test(part))output.push(part);}return output;}
function sourceIndex():Map<string,string>{const map=new Map<string,string>();for(const root of testRoots)for(const file of fs.existsSync(root)?allFiles(root):[]){const source=fs.readFileSync(file,"utf8");for(const match of source.matchAll(/\[([A-Z]{2,5}\d{2})\]/g))if(!map.has(match[1]!))map.set(match[1]!,path.relative(process.cwd(),file));}return map;}
export function buildV3Catalog():V3Case[]{
  const descriptions=new Map<string,{setup:string;expected:string;action:string}>();
  for(const file of files){const source=fs.readFileSync(path.join(planRoot,file),"utf8");for(const match of source.matchAll(casePattern)){if(descriptions.has(match[1]!))throw new Error(`Duplicate V3 catalog ID ${match[1]}`);descriptions.set(match[1]!,{setup:match[2]!.trim(),expected:match[3]!.trim(),action:match[4]!.trim()});}}
  for(const id of ["DOC01","DOC02","DOC03"])descriptions.set(id,{setup:`Real Docker acceptance batch ${id}`,action:"Run Builder against the prepared local fixture image and inspect owned resources",expected:"Batch passes and all owned resources are removed"});
  for(const [id,setup,expected] of [
    ["FIX01","Healthcheck command contains None","Dockerfile contract accepts an enabled healthcheck"],
    ["FIX02","Unrelated Dockerfile stage runs a background command","Dev foreground check inspects only dev stage lineage"],
    ["FIX03","Mesh publish selector is invalid","Diagnostic identifies mesh.json and the publish path"],
    ["FIX04","Mesh requisite target is invalid","Diagnostic displays the authored target without compiler prefix"],
    ["FIX05","Dormant ordinary service owner differs from primary endpoint","Isolated dev rejects the mismatch at build.json service path"],
  ])descriptions.set(id!,{setup:setup!,action:"Compile the focused V3 regression fixture",expected:expected!});
  const sections=new Map<string,Set<string>>(),invariants=new Map<string,Set<number>>();
  const mapping=fs.readFileSync(path.join(planRoot,files[2]!),"utf8");
  for(const line of mapping.split("\n")){
    const cols=line.split("|").map(x=>x.trim());
    if(cols.length>=4&&cols[1]?.includes("§")){const section=cols[1]!;for(const id of expandIds(cols[2]??"")){const current=sections.get(id)??new Set<string>();current.add(section);sections.set(id,current);}}
    if(cols.length>=6&&/^\d+$/.test(cols[1]??"")){for(const [index,cases] of [[1,2],[3,4]] as const){const number=Number(cols[index]);if(!Number.isInteger(number)||number<1||number>61)continue;for(const id of expandIds(cols[cases]??"")){const current=invariants.get(id)??new Set<number>();current.add(number);invariants.set(id,current);}}}
  }
  const tests=sourceIndex();
  return [...descriptions].sort(([a],[b])=>a.localeCompare(b)).map(([id,value])=>({id,title:value.setup,specSections:[...sections.get(id)??["verification"]],invariantIds:[...invariants.get(id)??[]].sort((a,b)=>a-b),layer:id.startsWith("DOC")?"D":/^(RUN|MSH|OPS|CLI)/.test(id)?"W":/^(CFG|MER|GRF|REF|ENV|PUB)/.test(id)?"U":"I",fixture:id.startsWith("DOC")?"tests/v3/docker":"tests/v3/support/fixtures.ts",setup:value.setup,action:value.action,expected:value.expected,testFile:tests.get(id)??""}));
}

/** Validate actual Vitest outcomes, not only test names or registry size. */
export function validateV3Report(catalog:readonly V3Case[],results:readonly CaseResult[]):string[]{
  const errors:string[]=[],ids=new Set<string>(),byId=new Map<string,CaseResult[]>();
  for(const record of catalog){if(ids.has(record.id))errors.push(`duplicate catalog ID ${record.id}`);ids.add(record.id);if(!record.testFile)errors.push(`missing executable test for ${record.id}`);for(const invariant of record.invariantIds)if(!Number.isInteger(invariant)||invariant<1||invariant>61)errors.push(`unknown invariant ${invariant} on ${record.id}`);}
  for(const result of results){const entries=byId.get(result.id)??[];entries.push(result);byId.set(result.id,entries);if(!ids.has(result.id)&&!/^DOCS\d{2}$/.test(result.id))errors.push(`unregistered executed case ${result.id}`);}
  for(const record of catalog){const entries=byId.get(record.id)??[];if(!entries.length)errors.push(`unexecuted catalog ID ${record.id}`);else if(entries.some(item=>item.status!=="passed"))errors.push(`non-passing catalog ID ${record.id}`);}
  for(let invariant=1;invariant<=61;invariant++)if(!catalog.some(record=>record.invariantIds.includes(invariant)&&(byId.get(record.id)??[]).some(item=>item.status==="passed")))errors.push(`unproven final invariant ${invariant}`);
  return errors;
}
