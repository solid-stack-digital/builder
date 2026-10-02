import { runMeshDev } from "../../../../core/mesh/runners/runMeshDev.js";
import { runMeshProd } from "../../../../core/mesh/runners/runMeshProd.js";
import { runMeshTest } from "../../../../core/mesh/runners/runMeshTest.js";
import { runMeshTestE2e } from "../../../../core/mesh/runners/runMeshTestE2e.js";
import { runMeshTestUnit } from "../../../../core/mesh/runners/runMeshTestUnit.js";
import type { MeshRunOptions } from "../../../../core/mesh/MeshRunOptions.js";
import { ScriptError } from "../../../../errors/ScriptError.js";
import { resolveProjectDir } from "../../../../utils/paths.js";

export async function handleMeshUp(
  rawStage: string = "dev",
  options: MeshRunOptions = {}
): Promise<number> {
  const stage = (rawStage || "dev").toLowerCase();
  const projectDir = resolveProjectDir(options.projectDir);

  const runOptions: MeshRunOptions = {
    ...options,
    projectDir,
  };

  switch (stage) {
    case "dev":
      return runMeshDev(runOptions);
    case "prod":
      return runMeshProd(runOptions);
    case "test-unit":
      return runMeshTestUnit(runOptions);
    case "test-e2e":
      return runMeshTestE2e(runOptions);
    case "test":
      return runMeshTest(runOptions);
    default:
      throw new ScriptError(
        `Unknown mesh stage: "${rawStage}". Supported stages: dev, prod, test, test-unit, test-e2e`
      );
  }
}
