import path from "node:path";
import { getBuildJson } from "../../utils/getBuildJson.js";
import { resolveInsideProject } from "../config/pathSafety.js";
import { resolveBuildStage } from "../config/resolveBuildStage.js";
import type { EffectiveBuildConfig, EffectiveMeshConfig } from "../config/types.js";
import type { MeshConfigStage } from "./types.js";
export function loadMeshSources(mesh: EffectiveMeshConfig, stage: MeshConfigStage): Map<string, EffectiveBuildConfig> {
  const result = new Map<string,EffectiveBuildConfig>();
  for (const [root, entry] of Object.entries(mesh.services).sort(([a],[b]) => a.localeCompare(b))) {
    const projectDir = resolveInsideProject(mesh.projectDir, entry.source, { sourceFile: mesh.sourceFile, configPath: `${entry.origin.configPath}.source`, stage });
    result.set(root, resolveBuildStage(getBuildJson(projectDir), stage, path.join(projectDir,"build.json")));
  }
  return result;
}
