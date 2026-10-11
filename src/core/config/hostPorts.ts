import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { AUTO_PORT_CACHE_RELATIVE_PATH, AUTO_PORT_CACHE_VERSION, AUTO_PORT_SCAN_START, PUBLIC_HOST } from "./constants.js";
import { ConfigError } from "../../errors/ConfigError.js";
import { PortConflictError } from "../../errors/PortConflictError.js";
export interface PortIntent { logicalPath: string; requested: number | "AUTO"; }
export interface AllocatedPort { logicalPath: string; port: number; }
function isHostPortAvailableSync(port: number): boolean {
 const script = `const net=require('node:net');const s=net.createServer();s.once('error',()=>process.exit(1));s.listen(${port},'${PUBLIC_HOST}',()=>s.close(()=>process.exit(0)));`;
 const result = spawnSync(process.execPath, ["-e", script], { stdio: "ignore", timeout: 3000 }); return result.status === 0;
}
export function allocateHostPorts(projectDir: string, stage: string, intentsInDeterministicOrder: readonly PortIntent[], validationMode = false): Map<string, number> {
 const reserved = new Map<number, string>(), allocated = new Map<string, number>();
 for (const intent of intentsInDeterministicOrder) if (typeof intent.requested === "number") { const owner = reserved.get(intent.requested); if (owner) throw new PortConflictError(intent.requested, owner, intent.logicalPath, stage); reserved.set(intent.requested, intent.logicalPath); allocated.set(intent.logicalPath, intent.requested); }
 if (validationMode) {
  let placeholder = 60000;
  for (const intent of intentsInDeterministicOrder) if (intent.requested === "AUTO") {
   while (reserved.has(placeholder)) placeholder--;
   if (placeholder < 1) throw new ConfigError({configPath:intent.logicalPath,stage,reason:"No validation placeholder port is available"});
   reserved.set(placeholder,intent.logicalPath); allocated.set(intent.logicalPath,placeholder--);
  }
  return allocated;
 }
 const cachePath = path.join(projectDir, AUTO_PORT_CACHE_RELATIVE_PATH); let cached: Record<string, number> = {};
 try { if (existsSync(cachePath)) { const parsed: unknown = JSON.parse(readFileSync(cachePath, "utf8")); if (parsed && typeof parsed === "object" && (parsed as any).version === AUTO_PORT_CACHE_VERSION && (parsed as any).allocations && typeof (parsed as any).allocations === "object") cached = (parsed as any).allocations; } } catch { cached = {}; }
 const nextCache: Record<string, number> = { ...cached };
 for (const intent of intentsInDeterministicOrder) if (intent.requested === "AUTO") {
  const prior = cached[intent.logicalPath]; let selected: number | undefined = typeof prior === "number" && Number.isInteger(prior) && prior >= 1 && prior <= 65535 && !reserved.has(prior) && isHostPortAvailableSync(prior) ? prior : undefined;
  if (selected === undefined) { const scan = [...Array(65536 - AUTO_PORT_SCAN_START).keys()].map(i => i + AUTO_PORT_SCAN_START).concat([...Array(19999 - 1024 + 1).keys()].map(i => i + 1024)); selected = scan.find(p => !reserved.has(p) && isHostPortAvailableSync(p)); }
  if (selected === undefined) throw new ConfigError({ sourceFile: "Builder effective composition", configPath: intent.logicalPath, stage, reason: "No available host port could be allocated" });
  reserved.set(selected, intent.logicalPath); allocated.set(intent.logicalPath, selected); nextCache[intent.logicalPath] = selected;
 }
 if (intentsInDeterministicOrder.some(i => i.requested === "AUTO")) { mkdirSync(path.dirname(cachePath), { recursive: true }); const temp = `${cachePath}.${process.pid}.tmp`; writeFileSync(temp, JSON.stringify({ version: AUTO_PORT_CACHE_VERSION, allocations: nextCache }, null, 2)); renameSync(temp, cachePath); }
 return allocated;
}
