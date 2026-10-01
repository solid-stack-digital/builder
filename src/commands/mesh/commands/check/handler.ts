import path from "node:path";
import { checkMesh } from "../../../../core/mesh/checkers/checkMesh.js";

export interface MeshCheckOptions {
  projectDir?: string;
  requireTester?: boolean;
}

export async function handleMeshCheck(
  options: MeshCheckOptions = {}
): Promise<number> {
  const meshDir = path.resolve(options.projectDir || process.cwd());
  checkMesh(
    meshDir,
    options.requireTester !== undefined
      ? { requireTester: options.requireTester }
      : {}
  );
  return 0;
}
