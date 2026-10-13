import { DEPENDENCY_REFERENCE_PATTERN } from "../config/constants.js";
import { normalizeComposeDependsOn } from "./composeDependsOn.js";
import type { EffectiveBuildConfig } from "../config/types.js";
import type { ComposeService, MaterializedDependency } from "./types.js";
function healthyMerge(target:ComposeService,owners:Iterable<string>){const current=normalizeComposeDependsOn(target.depends_on);for(const owner of owners){const old=current[owner];current[owner]={...(old&&typeof old==="object"?old as object:{}),condition:"service_healthy"};}target.depends_on=current;}
export function applyDependencyLifecycle(app:ComposeService,materialized:Record<string,MaterializedDependency>,effectiveBuild:EffectiveBuildConfig):void{
 const appOwners=new Set<string>();for(const dep of Object.values(materialized))for(const owner of dep.endpointOwners)appOwners.add(owner);healthyMerge(app,appOwners);
 for(const [key,dep] of Object.entries(materialized)){const config=effectiveBuild.dependencies[key];if(!config)continue;for(const raw of config.dependsOn){const match=DEPENDENCY_REFERENCE_PATTERN.exec(raw);if(!match)continue;const target=materialized[match[1]!];if(!target)continue;for(const sourceOwner of dep.endpointOwners){const source=dep.compose.services[sourceOwner];if(source)healthyMerge(source,target.endpointOwners);}}}
}
