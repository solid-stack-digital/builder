import { checkMesh } from "../../../../core/mesh/checkers/checkMesh.js";
import { checkDependencies } from "../../../../utils/checkDependencies.js";
import { resolveProjectDir } from "../../../../utils/paths.js";

export interface MeshCheckOptions {
  projectDir?: string | undefined;
  requireTester?: boolean | undefined;
}

export async function handleMeshCheck(
  options: MeshCheckOptions = {}
): Promise<number> {
  const meshDir = resolveProjectDir(options.projectDir);
  checkDependencies();
  checkMesh(meshDir, { requireTester: options.requireTester });
  return 0;
}
