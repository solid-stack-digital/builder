import type { AppEnvironmentLayer, ComposeEnvironmentMap } from "../../composition/types.js";
import { resolveServiceBuildEnvThroughMesh, type MeshReferenceContext } from "./meshReferences.js";

export function resolveMeshAppEnvironmentLayers(serviceName: string, layers: AppEnvironmentLayer[], context: MeshReferenceContext): ComposeEnvironmentMap {
 const result: ComposeEnvironmentMap = {};
 for (const layer of layers) {
  if (layer.kind === "build-json") Object.assign(result, resolveServiceBuildEnvThroughMesh(serviceName, layer.values, context, `services.${serviceName}.${layer.configPath}`));
  else Object.assign(result, layer.values);
 }
 return result;
}
