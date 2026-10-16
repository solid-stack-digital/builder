import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { handleMeshUp } from "../../src/commands/mesh/commands/up/handler.js";
import { handleServiceUp } from "../../src/commands/service/commands/up/handler.js";
import { fixtureDir, writeBasic } from "./support/fixtures.js";
function meshFixture(){const root=fixtureDir("dry-mesh"),source=writeBasic();fs.cpSync(source,path.join(root,"api"),{recursive:true});fs.mkdirSync(path.join(root,"e2e"));fs.writeFileSync(path.join(root,"e2e/compose.yml"),'services:\n  runner:\n    image: node:22-alpine\n    command: ["node", "-e", "process.exit(0)"]\n');fs.writeFileSync(path.join(root,"mesh.json"),JSON.stringify({name:"dry-mesh",services:{tester:{compose:"e2e/compose.yml",service:"runner"},api:{source:"api"}}}));return root;}
describe("dry-run entrypoints",()=>{
 it("[RUN19] standalone complete test compiles without Docker or state writes",async()=>{const root=writeBasic(),previous=process.env.PATH;try{process.env.PATH="/nonexistent";expect(await handleServiceUp("test",{projectDir:root,dryRun:true})).toBe(0);}finally{process.env.PATH=previous;}expect(fs.existsSync(path.join(root,".builder/run.state"))).toBe(false);});
 it("[RUN19] mesh complete test compiles source and global phases without Docker",async()=>{const root=meshFixture(),previous=process.env.PATH;try{process.env.PATH="/nonexistent";expect(await handleMeshUp("test",{projectDir:root,dryRun:true})).toBe(0);}finally{process.env.PATH=previous;}expect(fs.existsSync(path.join(root,".builder/run.state"))).toBe(false);});
 it.each(["test-unit","test-e2e","e2e"]) ("[MSH14] public mesh up %s fails before runtime",async stage=>{const root=meshFixture();await expect(handleMeshUp(stage,{projectDir:root,dryRun:true})).rejects.toThrow(`mesh up ${stage} is not a public target`);expect(fs.existsSync(path.join(root,".builder/run.state"))).toBe(false);});
});
