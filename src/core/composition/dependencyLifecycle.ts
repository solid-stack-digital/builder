import { DEPENDENCY_REFERENCE_PATTERN } from "../config/constants.js";
import type { EffectiveBuildConfig } from "../config/types.js";
import type { ComposeService, MaterializedDependency } from "./types.js";
function asMap(value:unknown):Record<string,unknown>{if(Array.isArray(value))return Object.fromEntries(value.filter(v=>typeof v==="string").map(v=>[v,{}]));if(value&&typeof value==="object")return value as Record<string,unknown>;return {};}
function healthyMerge(target:ComposeService,owners:Iterable<string>){const current=asMap(target.depends_on);for(const owner of owners){const old=current[owner];const cond=old&&typeof old==="object"?(old as any).condition:undefined;current[owner]={...(old&&typeof old==="object"?old as object:{}),condition:cond==="service_healthy"?cond:"service_healthy"};}target.depends_on=current;}
export function applyDependencyLifecycle(app:ComposeService,materialized:Record<string,MaterializedDependency>,effectiveBuild:EffectiveBuildConfig):void{
 const appOwners=new Set<string>();for(const dep of Object.values(materialized))for(const owner of dep.endpointOwners)appOwners.add(owner);healthyMerge(app,appOwners);
 for(const [key,dep] of Object.entries(materialized)){const config=effectiveBuild.dependencies[key];if(!config)continue;for(const raw of config.dependsOn){const match=DEPENDENCY_REFERENCE_PATTERN.exec(raw);if(!match)continue;const target=materialized[match[1]!];if(!target)continue;for(const sourceOwner of dep.endpointOwners){const source=dep.compose.services[sourceOwner];if(source)healthyMerge(source,target.endpointOwners);}}}
}
