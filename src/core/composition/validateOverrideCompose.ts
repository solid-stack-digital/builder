import path from "node:path";
import { canonicalPath } from "../../utils/paths.js";
import { parseVolume, namespaceVolume } from "./composeVolumes.js";
import { ConfigError } from "../../errors/ConfigError.js";
import { normalizeComposeEnvironment } from "./composeEnvironment.js";
import type { ComposeDocument, ComposeService } from "./types.js";
export interface PreparedAppOverride {app:ComposeService;resources:Pick<ComposeDocument,"volumes"|"networks"|"configs"|"secrets">;}
export interface AppOverrideValidationContext {
  file: string;
  stage: string;
  /** Builder context in the final Compose coordinate system. */
  expectedBuildContext: string;
  /** Output directory against which both contexts are interpreted. */
  buildContextBaseDir: string;
}

function canonicalBuildContext(value: string, baseDir: string): string {
  return canonicalPath(path.resolve(baseDir, value));
}

function isSameBuildContext(actual: string, expected: string, baseDir: string): boolean {
  return canonicalBuildContext(actual, baseDir) === canonicalBuildContext(expected, baseDir);
}

export function validateAndPrepareAppOverride(document:ComposeDocument,context:AppOverrideValidationContext):PreparedAppOverride{
 const fail=(path:string,reason:string,value?:unknown):never=>{throw new ConfigError({sourceFile:context.file,configPath:path,stage:context.stage,composition:"service",...(value===undefined?{}:{value}),reason})};
 const keys=Object.keys(document.services??{});if(keys.length!==1||keys[0]!=="app")fail("services","override must define exactly one service named app");const app=structuredClone(document.services.app!);
 for(const k of ["ports","depends_on","network_mode","container_name","privileged"] as const)if(app[k]!==undefined)fail(`services.app.${k}`,"override cannot own endpoint or lifecycle behavior");
 if(app.healthcheck&&typeof app.healthcheck==="object"){const health=app.healthcheck as Record<string,unknown>;for(const key of Object.keys(health))if(!["interval","timeout","retries","start_period","start_interval"].includes(key))fail(`services.app.healthcheck.${key}`,"override may set only healthcheck timing fields");}

 if (typeof app.build === "string") {
  fail("services.app.build", "override cannot replace Builder-owned app build context; use object-form build.args for build arguments", app.build);
 }
 if (app.build && typeof app.build === "object") {
  const build = app.build as Record<string, unknown>;
  for (const key of ["target", "dockerfile"] as const) {
   if (build[key] !== undefined) {
    fail(`services.app.build.${key}`, "override cannot change Builder-owned build configuration");
   }
  }
  if (build.context !== undefined) {
   if (typeof build.context !== "string") {
    fail("services.app.build.context", "override app build context must be a string", build.context);
   }
   if (!isSameBuildContext(build.context as string, context.expectedBuildContext, context.buildContextBaseDir)) {
    fail("services.app.build.context", "override cannot change app build context", build.context);
   }
  }
 }
 const env=normalizeComposeEnvironment(app.environment,"services.app.environment");for(const k of ["EXEC_MODE","INFRA_MODE"])if(k in env)fail(`services.app.environment.${k}`,"override cannot set Builder-owned environment");app.environment=env;
 const resourceKeys=["volumes","networks","configs","secrets"] as const;const resources:PreparedAppOverride["resources"]={};
 for (const kind of resourceKeys) {
  const defs = document[kind] ?? {}, refs = new Set<string>(), value = app[kind];
  if (Array.isArray(value)) for (const ref of value) {
   if (kind === "volumes") { const volume = parseVolume(ref); if (volume?.type === "volume" && volume.source) refs.add(volume.source); }
   else if (typeof ref === "string") refs.add(ref);
   else if (ref && typeof ref === "object" && typeof (ref as any).source === "string") refs.add((ref as any).source);
  }
  else if (value && typeof value === "object") for (const name of Object.keys(value)) refs.add(name);
  const names = new Map<string, string>(), mapped: Record<string, unknown> = {};
  for (const [name, definition] of Object.entries(defs)) {
   if (!refs.has(name)) fail(`${kind}.${name}`, "override resource must be consumed by app");
   const target = `app-override--${context.stage}--${kind.slice(0, -1)}--${name}`;
   names.set(name, target); mapped[target] = definition;
  }
  if (names.size) resources[kind] = mapped;
  if (Array.isArray(value)) (app as any)[kind] = value.map(ref => kind === "volumes" ? namespaceVolume(ref, names) : typeof ref === "string" ? names.get(ref) ?? ref : ref && typeof ref === "object" && typeof (ref as any).source === "string" ? { ...ref, source: names.get((ref as any).source) ?? (ref as any).source } : ref);
  else if (value && typeof value === "object") (app as any)[kind] = Object.fromEntries(Object.entries(value).map(([name, definition]) => [names.get(name) ?? name, definition]));
 }

 return {app,resources};
}
