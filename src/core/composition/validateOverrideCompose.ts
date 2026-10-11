import { ConfigError } from "../../errors/ConfigError.js";
import { normalizeComposeEnvironment } from "./composeEnvironment.js";
import type { ComposeDocument, ComposeService } from "./types.js";
export interface PreparedAppOverride {app:ComposeService;resources:Pick<ComposeDocument,"volumes"|"networks"|"configs"|"secrets">;}
export function validateAndPrepareAppOverride(document:ComposeDocument,context:{file:string;stage:string;expectedBuildContext?:string}):PreparedAppOverride{
 const fail=(path:string,reason:string,value?:unknown):never=>{throw new ConfigError({sourceFile:context.file,configPath:path,stage:context.stage,composition:"service",...(value===undefined?{}:{value}),reason})};
 const keys=Object.keys(document.services??{});if(keys.length!==1||keys[0]!=="app")fail("services","override must define exactly one service named app");const app=structuredClone(document.services.app!);
 for(const k of ["ports","depends_on","network_mode","container_name","privileged"] as const)if(app[k]!==undefined)fail(`services.app.${k}`,"override cannot own endpoint or lifecycle behavior");
 if(app.healthcheck&&typeof app.healthcheck==="object"){const health=app.healthcheck as Record<string,unknown>;for(const key of Object.keys(health))if(!["interval","timeout","retries","start_period","start_interval"].includes(key))fail(`services.app.healthcheck.${key}`,"override may set only healthcheck timing fields");}
 if(app.build&&typeof app.build==="object"){const b=app.build as any;for(const k of ["target","dockerfile"] as const)if(b[k]!==undefined)fail(`services.app.build.${k}`,"override cannot change Builder-owned build configuration");if(b.context!==undefined&&b.context!=="."&&b.context!==context.expectedBuildContext)fail("services.app.build.context","override cannot change app build context");}
 const env=normalizeComposeEnvironment(app.environment,"services.app.environment");for(const k of ["EXEC_MODE","INFRA_MODE"])if(k in env)fail(`services.app.environment.${k}`,"override cannot set Builder-owned environment");app.environment=env;
 const resourceKeys=["volumes","networks","configs","secrets"] as const;const resources:PreparedAppOverride["resources"]={};
 for(const kind of resourceKeys){const defs=document[kind]??{};const refs=new Set<string>();const refsVal=app[kind];if(Array.isArray(refsVal))for(const v of refsVal){if(typeof v==="string")refs.add(v);else if(v&&typeof v==="object"&&typeof (v as any).source==="string")refs.add((v as any).source);}else if(refsVal&&typeof refsVal==="object")for(const [k,v] of Object.entries(refsVal as object)){refs.add(k);if(v&&typeof v==="object"&&typeof (v as any).source==="string")refs.add((v as any).source);}
  const mapped:Record<string,unknown>={};for(const [name,def] of Object.entries(defs)){if(!refs.has(name))fail(`${kind}.${name}`,"override resource must be consumed by app");const target=`app-override--${context.stage}--${kind.slice(0,-1)}--${name}`;mapped[target]=def;for(const ref of refs)if(ref===name){} }
  if(Object.keys(mapped).length)(resources as any)[kind]=mapped;
  if(app[kind]&&typeof app[kind]==="object"&&!Array.isArray(app[kind]))(app as any)[kind]=Object.fromEntries(Object.entries(app[kind] as object).map(([k,v])=>[`app-override--${context.stage}--${kind.slice(0,-1)}--${k}`,v]));
  else if(Array.isArray(app[kind]))(app as any)[kind]=(app[kind] as any[]).map(v=>typeof v==="string"?`app-override--${context.stage}--${kind.slice(0,-1)}--${v}`:v&&typeof v==="object"?{...v,source:`app-override--${context.stage}--${kind.slice(0,-1)}--${(v as any).source}`}:v);
 }
 return {app,resources};
}
