import { GeneratedComposeNameAllocator } from "./generatedNames.js";
import path from "node:path";
import { canonicalPath } from "../../utils/paths.js";
import { parseVolume, namespaceVolume, isHostFilesystemRoot } from "./composeVolumes.js";
import { ConfigError } from "../../errors/ConfigError.js";
import { normalizeComposeBuildArgs, normalizeComposeEnvironment } from "./composeEnvironment.js";
import { namespaceResourceDefinition } from "./namespaceResourceDefinition.js";
import { validateComposeResourceReferences } from "./validateComposeResourceReferences.js";
import type { ComposeDocument, ComposeService } from "./types.js";
export interface PreparedMainOverride {main:ComposeService;resources:Pick<ComposeDocument,"volumes"|"networks"|"configs"|"secrets">;}
export interface MainOverrideValidationContext {
  allocator?: GeneratedComposeNameAllocator;
  resourceNamespace?: string;
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

export function validateAndPrepareMainOverride(document:ComposeDocument,context:MainOverrideValidationContext):PreparedMainOverride{
 const fail=(path:string,reason:string,value?:unknown):never=>{throw new ConfigError({sourceFile:context.file,configPath:path,stage:context.stage,composition:"service",...(value===undefined?{}:{value}),reason})};
 const allowedRootKeys=new Set(["services","volumes","networks","configs","secrets"]);
 for(const key of Object.keys(document))if(!key.startsWith("x-")&&!allowedRootKeys.has(key))fail(key,"unsupported override Compose top-level field");
 const keys=Object.keys(document.services??{});if(keys.length!==1||keys[0]!=="main")fail("services","override must define exactly one service named main");
 validateComposeResourceReferences(document,{sourceFile:context.file,stage:context.stage,composition:"service"});
 const main=structuredClone(document.services.main!);
 for(const volume of Array.isArray(main.volumes)?main.volumes:[]){const mount=parseVolume(volume);if(mount?.type==="bind"&&mount.source&&isHostFilesystemRoot(mount.source))fail("services.main.volumes","host root bind mounts are forbidden");}
 for(const k of ["ports","depends_on","network_mode","container_name","privileged","profiles","extends","env_file"] as const)if(main[k]!==undefined)fail(`services.main.${k}`,"override cannot own endpoint or lifecycle behavior");
 if (Object.hasOwn(main, "healthcheck")) {
  const healthcheck = main.healthcheck;
  if (
    healthcheck === null ||
    typeof healthcheck !== "object" ||
    Array.isArray(healthcheck)
  ) {
    fail(
      "services.main.healthcheck",
      "override healthcheck must be a mapping of timing fields",
      healthcheck,
    );
  }

  const allowedTiming = new Set([
    "interval", "timeout", "retries", "start_period", "start_interval",
  ]);
  for (const key of Object.keys(healthcheck as Record<string, unknown>)) {
    if (!allowedTiming.has(key)) {
      fail(
        `services.main.healthcheck.${key}`,
        "override may set only healthcheck timing fields",
      );
    }
  }
 }

 if (typeof main.build === "string") {
  fail("services.main.build", "override cannot replace Builder-owned main build context; use object-form build.args for build arguments", main.build);
 }
 if (main.build && typeof main.build === "object") {
  const build = main.build as Record<string, unknown>;
  for (const key of Object.keys(build)) {
   if (!["args", "context"].includes(key)) {
    fail(`services.main.build.${key}`, "override cannot change Builder-owned build configuration");
   }
  }
  if (build.context !== undefined) {
   if (typeof build.context !== "string") {
    fail("services.main.build.context", "override main build context must be a string", build.context);
   }
   if (!isSameBuildContext(build.context as string, context.expectedBuildContext, context.buildContextBaseDir)) {
    fail("services.main.build.context", "override cannot change main build context", build.context);
   }
  }
  if (build.args !== undefined) build.args=normalizeComposeBuildArgs(build.args,"services.main.build.args",context.file);
 }
 const env=normalizeComposeEnvironment(main.environment,"services.main.environment");for(const k of ["EXEC_MODE","INFRA_MODE"])if(k in env)fail(`services.main.environment.${k}`,"override cannot set Builder-owned environment");main.environment=env;
 const allocator=context.allocator??new GeneratedComposeNameAllocator();
 const resourceKeys=["volumes","networks","configs","secrets"] as const;const resources:PreparedMainOverride["resources"]={};
 for (const kind of resourceKeys) {
  const defs = document[kind] ?? {}, refs = new Set<string>(), value = main[kind];
  if (Array.isArray(value)) for (const ref of value) {
   if (kind === "volumes") { const volume = parseVolume(ref); if (volume?.type === "volume" && volume.source) refs.add(volume.source); }
   else if (typeof ref === "string") refs.add(ref);
   else if (ref && typeof ref === "object" && typeof (ref as any).source === "string") refs.add((ref as any).source);
  }
  else if (value && typeof value === "object") for (const name of Object.keys(value)) refs.add(name);
  const names = new Map<string, string>(), mapped: Record<string, unknown> = {};
  for (const [name, definition] of Object.entries(defs)) {
   if (!refs.has(name)) fail(`${kind}.${name}`, "override resource must be consumed by main");
   const prefix=context.resourceNamespace && context.resourceNamespace!=="main" ? `svc--${context.resourceNamespace}--main-override` : "main-override";
   const target = allocator.allocate(JSON.stringify(["service",context.resourceNamespace??"main","override",context.stage,kind,name]),`${prefix}--${context.stage}--${kind.slice(0, -1)}--${name}`);
   names.set(name, target); mapped[target] = namespaceResourceDefinition(name, definition);
  }
  if (names.size) resources[kind] = mapped;
  if (Array.isArray(value)) (main as any)[kind] = value.map(ref => kind === "volumes" ? namespaceVolume(ref, names) : typeof ref === "string" ? names.get(ref) ?? ref : ref && typeof ref === "object" && typeof (ref as any).source === "string" ? { ...ref, source: names.get((ref as any).source) ?? (ref as any).source } : ref);
  else if (value && typeof value === "object") (main as any)[kind] = Object.fromEntries(Object.entries(value).map(([name, definition]) => [names.get(name) ?? name, definition]));
 }

 return {main,resources};
}
