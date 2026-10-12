import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {describe,expect,it} from "vitest";
import {allocateHostPorts} from "../src/core/config/hostPorts.js";
describe("V2 host port validation",()=>{
 it("reserves fixed ports before deterministic AUTO placeholders",()=>{const dir=fs.mkdtempSync(path.join(os.tmpdir(),"builder-ports-"));try{const result=allocateHostPorts(dir,"dev",[{logicalPath:"auto",requested:"AUTO"},{logicalPath:"fixed",requested:60000}],true);expect(result.get("fixed")).toBe(60000);expect(result.get("auto")).toBe(59999);expect(fs.existsSync(path.join(dir,".builder","ports-v2.json"))).toBe(false);}finally{fs.rmSync(dir,{recursive:true,force:true});}});
 it("reports fixed collisions",()=>{expect(()=>allocateHostPorts("/tmp","dev",[{logicalPath:"a",requested:5000},{logicalPath:"b",requested:5000}],true)).toThrow(/5000/);});
});
