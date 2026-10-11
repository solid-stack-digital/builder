import type { ComposeDocument } from "../../composition/types.js";
import type { EffectiveBuildConfig, EffectiveMeshConfig, ResolvedEndpoint } from "../../config/types.js";
import type { ParsedBuilderReference } from "../../config/references.js";
export interface LoadedMeshService {name:string;path:string;absolutePath:string;buildJsonPath:string;effectiveBuild:EffectiveBuildConfig;meshEnv:Record<string,string>;dependencyBindings:Record<string,string>;dependsOn:string[];publish:string[];}
export interface DependencyBinding {consumerService:string;logicalDependency:string;providerService:string;}
export interface EffectivePublication {logicalPath:string;ownerMeshService:string;target:"app"|"dependency";dependency?:string;endpoint:string;}
export interface MeshEndpointRegistry {app:Record<string,Record<string,ResolvedEndpoint>>;dependencies:Record<string,Record<string,Record<string,ResolvedEndpoint>>>;}
export interface CompiledMeshComposition {compose:ComposeDocument;effectiveMesh:EffectiveMeshConfig;loadedServices:Record<string,LoadedMeshService>;endpoints:MeshEndpointRegistry;projectName:string;testerServiceName?:string;}
export type { ParsedBuilderReference };
