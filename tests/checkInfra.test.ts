import path from "node:path";
import {describe,expect,it} from "vitest";
import {getDeclaredYamlFiles} from "../src/core/checkers/getDeclaredYamlFiles.js";
import {checkYamlFiles} from "../src/core/checkers/checkYamlFiles.js";
import {checkInfra} from "../src/core/checkers/checkInfra.js";
import {getBuildJson} from "../src/utils/getBuildJson.js";
const root=path.resolve(__dirname,"../examples/backend");
describe("V2 infrastructure checkers",()=>{
 it("discovers V2 dependency and override files",()=>{const files=getDeclaredYamlFiles(getBuildJson(root),root);expect(files.map(f=>f.source)).toContain("dependencies.filesystem.compose");expect(files.map(f=>f.source)).toContain("dev.override-compose");expect(files.every(f=>["dependency-compose","override-compose"].includes(f.kind))).toBe(true);});
 it("validates declared YAML",()=>expect(()=>checkYamlFiles(getBuildJson(root),root)).not.toThrow());
 it("rejects missing declared YAML",()=>expect(()=>checkYamlFiles({app:{},dependencies:{missing:{compose:"absent.yml"}}} as any,root)).toThrow(/does not exist/));
 it("runs lint, contract and effective stage validation",()=>expect(()=>checkInfra(root)).not.toThrow());
});
