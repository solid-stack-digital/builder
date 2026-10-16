import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync, unlinkSync } from "node:fs";
import path from "node:path";
import { AUTO_PORT_CACHE_RELATIVE_PATH, AUTO_PORT_CACHE_VERSION, AUTO_PORT_SCAN_START, PUBLIC_HOST } from "./constants.js";
import { ConfigError } from "../../errors/ConfigError.js";
import { PortConflictError } from "../../errors/PortConflictError.js";
export interface PortIntent { logicalPath: string; requested: number | "AUTO"; }
export interface AllocatedPort { logicalPath: string; port: number; }
export interface HostPortDiagnosticContext { sourceFile: string; composition: "service" | "mesh"; }
export interface HostPortAdapters { probe?: (port:number)=>boolean; candidatePorts?: readonly number[]; }
function isHostPortAvailableSync(port: number): boolean {
 const script = `const net=require('node:net');const s=net.createServer();s.once('error',()=>process.exit(1));s.listen(${port},'${PUBLIC_HOST}',()=>s.close(()=>process.exit(0)));`;
 const result = spawnSync(process.execPath, ["-e", script], { stdio: "ignore", timeout: 3000 }); return result.status === 0;
}
export function allocateHostPorts(projectDir: string, stage: string, intentsInDeterministicOrder: readonly PortIntent[], validationMode = false, context?: HostPortDiagnosticContext, adapters:HostPortAdapters={}): Map<string, number> {
 const probe=adapters.probe??isHostPortAvailableSync;
 const reserved = new Map<number, string>(), allocated = new Map<string, number>();
 for (const intent of intentsInDeterministicOrder) if (typeof intent.requested === "number") { const owner = reserved.get(intent.requested); if (owner) throw new PortConflictError(intent.requested, owner, intent.logicalPath, stage, context?.sourceFile, context?.composition); reserved.set(intent.requested, intent.logicalPath); allocated.set(intent.logicalPath, intent.requested); }
 if (validationMode) {
  let placeholder = 60000;
  for (const intent of intentsInDeterministicOrder) if (intent.requested === "AUTO") {
   while (reserved.has(placeholder)) placeholder--;
   if (placeholder < 1) throw new ConfigError({...(context??{}),configPath:intent.logicalPath,stage,value:intent.requested,reason:"No validation placeholder port is available"});
   reserved.set(placeholder,intent.logicalPath); allocated.set(intent.logicalPath,placeholder--);
  }
  return allocated;
 }
 const cachePath = path.join(projectDir, AUTO_PORT_CACHE_RELATIVE_PATH); let cached: Record<string, number> = {};
 try { if (existsSync(cachePath)) { const parsed: unknown = JSON.parse(readFileSync(cachePath, "utf8")); if (parsed && typeof parsed === "object" && (parsed as any).version === AUTO_PORT_CACHE_VERSION && (parsed as any).allocations && typeof (parsed as any).allocations === "object") cached = (parsed as any).allocations; } } catch { cached = {}; }
 for (const intent of intentsInDeterministicOrder) if (intent.requested === "AUTO") {
  const prior = cached[intent.logicalPath]; let selected: number | undefined = typeof prior === "number" && Number.isInteger(prior) && prior >= 1 && prior <= 65535 && !reserved.has(prior) && probe(prior) ? prior : undefined;
  if (selected === undefined) { const scan = adapters.candidatePorts??[...Array(65536 - AUTO_PORT_SCAN_START).keys()].map(i => i + AUTO_PORT_SCAN_START).concat([...Array(19999 - 1024 + 1).keys()].map(i => i + 1024)); selected = scan.find(p => p>=1&&p<=65535&&!reserved.has(p) && probe(p)); }
  if (selected === undefined) throw new ConfigError({ sourceFile: context?.sourceFile ?? "Builder effective composition", ...(context?.composition ? {composition:context.composition} : {}), configPath: intent.logicalPath, stage, value: intent.requested, reason: "No available host port could be allocated" });
  reserved.set(selected, intent.logicalPath); allocated.set(intent.logicalPath, selected);
 }
 return allocated;
}
export function persistHostPortAllocations(projectDir:string,allocations:ReadonlyMap<string,number>):void {
 if(!allocations.size)return;
 const cachePath=path.join(projectDir,AUTO_PORT_CACHE_RELATIVE_PATH);
 let cached:Record<string,number>={};
 try{const parsed=JSON.parse(readFileSync(cachePath,"utf8"));if(parsed?.version===AUTO_PORT_CACHE_VERSION&&parsed.allocations&&typeof parsed.allocations==="object")cached=parsed.allocations;}catch{}
 mkdirSync(path.dirname(cachePath),{recursive:true});
 const temp=`${cachePath}.${process.pid}.tmp`;
 writeFileSync(temp,JSON.stringify({version:AUTO_PORT_CACHE_VERSION,allocations:{...cached,...Object.fromEntries(allocations)}},null,2));
 renameSync(temp,cachePath);
}
export function removeHostPortAllocations(projectDir:string,keys:readonly string[]):void {
 if(!keys.length)return;
 const cachePath=path.join(projectDir,AUTO_PORT_CACHE_RELATIVE_PATH);
 if(!existsSync(cachePath))return;
 const parsed=JSON.parse(readFileSync(cachePath,"utf8"));
 if(parsed?.version!==AUTO_PORT_CACHE_VERSION||!parsed.allocations||typeof parsed.allocations!=="object")return;
 const remaining={...parsed.allocations} as Record<string,number>;
 for(const key of keys)delete remaining[key];
 if(!Object.keys(remaining).length){unlinkSync(cachePath);return;}
 const temp=`${cachePath}.${process.pid}.tmp`;
 writeFileSync(temp,JSON.stringify({version:AUTO_PORT_CACHE_VERSION,allocations:remaining},null,2));renameSync(temp,cachePath);
}
