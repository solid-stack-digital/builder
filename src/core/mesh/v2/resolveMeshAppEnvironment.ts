import type { AppEnvironmentLayer, ComposeEnvironmentMap } from "../../composition/types.js";
import { selectAppEnvironmentEntries } from "../../composition/selectAppEnvironmentEntries.js";
import { resolveServiceBuildEnvThroughMesh, type MeshReferenceContext } from "./meshReferences.js";

export function resolveMeshAppEnvironmentLayers(
  serviceName: string,
  layers: AppEnvironmentLayer[],
  context: MeshReferenceContext,
  laterKeys: ReadonlySet<string> = new Set(),
): ComposeEnvironmentMap {
  const result: ComposeEnvironmentMap = {};
  for (const [key, layer] of selectAppEnvironmentEntries(layers, laterKeys)) {
    if (layer.kind === "build-json") {
      result[key] = resolveServiceBuildEnvThroughMesh(
        serviceName,
        { [key]: layer.values[key]! },
        context,
        `services.${serviceName}.${layer.configPath}`,
      )[key]!;
    } else {
      result[key] = layer.values[key]!;
    }
  }
  return result;
}
