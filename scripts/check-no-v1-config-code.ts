import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
const patterns = [
  /\bprovideDependency\b/, /\breplaceMocks\b/, /\bpreservePort\b/,
  /\benvOverrides\b/, /\bcomposeFiles\b/, /\bbuildJson\.port\b/,
  /\bpolicies\b/, /\bpolicy\.compose\b/, /\bpolicy\.dockerfile\b/,
  /\binherit-published\b/, /\bmeshHealthcheck\b/, /\bincludeTester\b/,
  /\bPUBLIC_PORT\b/, /\bservice_started\b/,
];
const roots = ["src", "templates/docker"];
const violations: string[] = [];
function visit(file: string): void {
  for (const item of readdirSync(file,{withFileTypes:true})) {
    const next = path.join(file,item.name);
    if (item.isDirectory()) visit(next);
    else if (/\.(?:ts|tsx|yml|yaml)$/.test(item.name)) {
      readFileSync(next,"utf8").split("\n").forEach((line,index)=>{
        if (patterns.some(pattern=>pattern.test(line)) && !/^\s*(?:\/\/|\*|#)/.test(line)) violations.push(`${next}:${index+1}: ${line.trim()}`);
      });
    }
  }
}
roots.forEach(visit);
if (violations.length) { console.error(violations.join("\n")); process.exitCode=1; }
else console.log("V2 runtime contains no removed configuration tokens.");
