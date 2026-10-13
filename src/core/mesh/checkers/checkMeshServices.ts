import path from "node:path";
import pc from "picocolors";
import { resolveProjectDir } from "../../../utils/paths.js";
import { resolveMeshStage } from "../../config/resolveMeshStage.js";
import { checkInfra } from "../../checkers/checkInfra.js";
import { compileMeshComposition } from "../v2/compileMeshComposition.js";
import { loadEffectiveMeshServices } from "../v2/loadMeshServices.js";
import { MESH_CONFIG_STAGES, type MeshConfig } from "../types.js";

export function checkMeshServices(mesh: MeshConfig, meshDir: string): void {
  const root = resolveProjectDir(meshDir);
  const meshPath = path.join(root, "mesh.json");
  const checked = new Set<string>();
  for (const stage of MESH_CONFIG_STAGES) {
    const effective = resolveMeshStage(mesh, stage, meshPath);
    const services = loadEffectiveMeshServices(root, effective, stage);
    for (const [name, svc] of Object.entries(services)) {
      if (!checked.has(svc.absolutePath)) {
        console.log(pc.cyan(`\n🔍 Checking mesh service ${name}...`));
        checkInfra(svc.absolutePath);
        checked.add(svc.absolutePath);
      }
    }
    compileMeshComposition(stage, root, {
      validationMode: true,
      allowMissingTester: true,
    });
  }
}
