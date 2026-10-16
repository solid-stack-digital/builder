import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildJsonSchema } from "../../src/core/buildSchema.js";
import { meshSchema } from "../../src/core/mesh/meshSchema.js";
import { compileServiceComposition } from "../../src/core/composition/compileServiceComposition.js";
import { compileMeshComposition } from "../../src/core/mesh/compileMeshComposition.js";
import { currentPages, historicalPages } from "./support/docsManifest.js";

const read=(name:string)=>fs.readFileSync(name,"utf8");
const all=["README.md",...currentPages,...historicalPages];
const blocks=(source:string)=>[...source.matchAll(/```json\n([\s\S]*?)\n```/g)].map(x=>JSON.parse(x[1]!));
const slug=(s:string)=>s.toLowerCase().replace(/[^\p{L}\p{N} -]/gu,"").trim().replace(/ +/g,"-");
function headings(source:string){const seen=new Map<string,number>();return new Set([...source.matchAll(/^#{1,6}\s+(.+)$/gm)].map(x=>{const base=slug(x[1]!);const n=seen.get(base)??0;seen.set(base,n+1);return n?`${base}-${n}`:base;}));}
describe("V3 public documentation",()=>{
 it("[DOCS01] local links and heading anchors resolve",()=>{
  for(const file of all){const body=read(file);for(const match of body.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)){const link=match[1]!;if(/^(https?:|mailto:|data:)/.test(link))continue;const [relative,anchor]=link.split("#");const target=relative?path.resolve(path.dirname(file),decodeURIComponent(relative)):path.resolve(file);expect(fs.existsSync(target),`${file}: ${link}`).toBe(true);if(anchor&&target.endsWith(".md"))expect(headings(read(target)),`${file}: ${link}`).toContain(decodeURIComponent(anchor));}}
  expect(read("README.md")).toContain("docs/migration/v2.2-to-v3.0.md");expect(read("docs/README.md")).toContain("migration/v2.2-to-v3.0.md");
 });
 it("[DOCS02] active complete configuration examples use strict V3 schemas",()=>{
  const build=blocks(read("docs/reference/build-json.md"))[0];expect(buildJsonSchema.safeParse(build).success).toBe(true);
  const after=blocks(read("docs/migration/v2.2-to-v3.0.md"));expect(buildJsonSchema.safeParse(after[1]).success).toBe(true);expect(meshSchema.safeParse(after[3]).success).toBe(true);
  for(const stage of ["dev","prod","test","e2e"] as const)expect(compileServiceComposition(stage,"docs/examples/docs-service",{validationMode:true}).compose.services).toHaveProperty("main");
  for(const stage of ["dev","prod","e2e"] as const)expect(compileMeshComposition(stage,"docs/examples/docs-mesh",{validationMode:true}).graph.roots).toHaveLength(2);
 });
 it("[DOCS03] historical before blocks remain labelled and rejected by V3",()=>{
  const migration=read("docs/migration/v2.2-to-v3.0.md"),examples=blocks(migration);expect(migration).toContain("Historical V2.2");expect(buildJsonSchema.safeParse(examples[0]).success).toBe(false);expect(meshSchema.safeParse(examples[2]).success).toBe(false);
  for(const file of historicalPages)expect(read(file)).toMatch(/Historical/);
 });
 it("[DOCS04] migration after pair uses explicit mock prune, real edge and tester",()=>{
  const [,_afterBuild,_beforeMesh,afterMesh]=blocks(read("docs/migration/v2.2-to-v3.0.md"));expect(JSON.parse(read("docs/examples/docs-migration-pair/before/build.json"))).toEqual(blocks(read("docs/migration/v2.2-to-v3.0.md"))[0]);expect(JSON.parse(read("docs/examples/docs-migration-pair/before/mesh.json"))).toEqual(_beforeMesh);expect(JSON.parse(read("docs/examples/docs-service/build.json"))).toEqual(_afterBuild);expect(JSON.parse(read("docs/examples/docs-mesh/mesh.json"))).toEqual(afterMesh);expect(afterMesh.services.frontend.extends.main.requisites).toEqual({"source.backend":false,backend:"dependency"});expect(afterMesh.services.frontend.extends.main.env.BACKEND_URL).toContain("backend.source.main.endpoints.http.network_url");expect(_afterBuild.services.tester).toMatchObject({compose:"./e2e/docker-compose.yml",service:"e2e-runner"});
 });
 it("[DOCS05] documented E2E uses prod main and separate dotenv domains",()=>{const matrix=read("docs/reference/stage-matrix.md");expect(matrix).toContain("`service up test-e2e` | prod → e2e | prod");expect(matrix).toContain("`.env.e2e-tester`");expect(read("docs/reference/environment-precedence.md")).toContain("`.env.e2e` instead of `.env.prod`");});
 it("[DOCS06] active command examples avoid unsupported mesh phases",()=>{for(const file of currentPages){const body=read(file);for(const block of body.matchAll(/```(?:bash|text)\n([\s\S]*?)\n```/g))expect(block[1],file).not.toMatch(/builder mesh up (?:test-e2e|test-unit|e2e)(?:\s|$)/m);}});
 it("[DOCS07] active prose has no V2 provider-substitution promise",()=>{for(const file of currentPages){const body=read(file);if(file.includes("migration/"))continue;expect(body,file).not.toMatch(/automatically (?:substitutes?|rewires?|includes?) (?:providers?|dependencies)/i);expect(body,file).not.toMatch(/tester (?:receives|gets) EXEC_MODE=e2e/i);}});
 it("[DOCS08] stage and environment tables state implemented modes",()=>{const stage=read("docs/reference/stage-matrix.md");expect(stage).toContain("`mesh up test` Phase 2 | source prod → e2e, mesh prod → e2e | prod | prod | integrated");expect(stage).not.toContain("test-e2e | test-e2e");});
 it("[DOCS09] source selectors and runner identity are explicit",()=>{const mesh=read("docs/reference/mesh-json.md");expect(mesh).toContain("`main.endpoints.http`");expect(mesh).toContain("`${alias.source.main.endpoints.http.network_url}`");expect(read("docs/guides/configure-service-e2e.md")).toContain("selected runner");});
 it("[DOCS10] public page inventory is classified",()=>{const actual=[...fs.readdirSync("docs",{recursive:true})].filter(x=>String(x).endsWith(".md")).map(x=>`docs/${x}`).sort();expect(actual).toEqual([...currentPages,...historicalPages].sort());});
 it("[DOCS11] package version and binary aliases match introduction",()=>{const pkg=JSON.parse(read("package.json"));expect(pkg.version).toBe("3.0.0");expect(Object.keys(pkg.bin).sort()).toEqual(["builder","solid-builder"]);expect(read("README.md")).toContain("source package declares version 3.0.0");});
 it("[DOCS12] documentation checks are filesystem-only",()=>{expect(all.length).toBeGreaterThan(35);expect(currentPages.length).toBeGreaterThan(35);});
});
