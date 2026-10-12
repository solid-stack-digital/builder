import type { AppEndpoint, BuildJson, DependencyConfig, DependencyEndpoint, Environment } from "../../types/index.js";
import type { MeshConfig, MeshServiceConfig } from "../mesh/types.js";
export interface EffectiveBuildLayer { stage: "base" | Environment; appEnv: Record<string, string>; overrideCompose?: string; }
export interface EffectiveBuildConfig extends Omit<BuildJson, "dev" | "prod" | "test" | "e2e" | "dependencies" | "app"> {
  app: { env: Record<string, string>; endpoints: Record<string, AppEndpoint> };
  dependencies: Record<string, Omit<DependencyConfig, "env" | "endpoints" | "dependsOn"> & { env: Record<string, string>; endpoints: Record<string, DependencyEndpoint>; dependsOn: string[] }>;
  tester?: { env: Record<string, string> }; layers: EffectiveBuildLayer[];
}
export interface EffectiveMeshConfig extends Omit<MeshConfig, "dev" | "prod" | "test" | "e2e" | "services"> {
  services: Record<string, Omit<MeshServiceConfig, "env" | "dependencies" | "dependsOn" | "publish"> & { env: Record<string, string>; dependencies: Record<string, string>; dependsOn: string[]; publish: string[] }>;
}
export interface ResolvedEndpoint { logicalPath: string; networkHost: string; networkPort: number; scheme?: string; publicHost?: string; publicPort?: number; effectivelyPublished: boolean; }
export interface EndpointUsage { expression: string; ownerService?: string; dependency?: string; endpoint: string; property: EndpointProperty; sourcePath: string; }
export type EndpointProperty = "network_host" | "network_port" | "network_address" | "network_url" | "public_host" | "public_port" | "public_address" | "public_url";
