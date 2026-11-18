import fs from "node:fs";
import path from "node:path";

const pattern=/\bconsole\.(log|info|warn|error|debug)\(|process\.(stdout|stderr)\.write\(/;
const allowed=(rel:string)=>rel.startsWith("src/core/output/")||rel==="src/bin.ts";

/** `file:line` for every direct terminal write in Builder sources outside the output layer. */
export function findConsoleWrites(root:string):string[]{
 const hits:string[]=[];
 const walk=(dir:string)=>{for(const entry of fs.readdirSync(dir,{withFileTypes:true})){const full=path.join(dir,entry.name);if(entry.isDirectory()){walk(full);continue;}if(!/\.(ts|js|mjs)$/.test(entry.name))continue;const rel=path.relative(process.cwd(),full).split(path.sep).join("/");if(allowed(rel))continue;fs.readFileSync(full,"utf8").split("\n").forEach((line,index)=>{if(pattern.test(line))hits.push(`${rel}:${index+1}`);});}};
 walk(path.resolve(root));
 return hits;
}
if(process.argv[1]?.endsWith("check-no-console.ts")){const hits=findConsoleWrites("src");if(hits.length){console.error(`Direct terminal writes outside src/core/output (use currentOutput()):\n${hits.join("\n")}`);process.exit(1);}console.log("No direct terminal writes outside the output layer.");}
