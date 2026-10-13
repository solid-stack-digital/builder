import { checkMesh } from "../../../../core/mesh/checkers/checkMesh.js";
import { runMeshDev } from "../../../../core/mesh/runners/runMeshDev.js";
import { runMeshProd } from "../../../../core/mesh/runners/runMeshProd.js";
import { runMeshTest } from "../../../../core/mesh/runners/runMeshTest.js";
import { runMeshTestE2e } from "../../../../core/mesh/runners/runMeshTestE2e.js";
import { MESH_COMMAND_STAGES } from "../../../../core/mesh/types.js";
import type { MeshRunOptions } from "../../../../core/mesh/MeshRunOptions.js";
import { ScriptError } from "../../../../errors/ScriptError.js";
import { resolveProjectDir } from "../../../../utils/paths.js";

export async function handleMeshUp(
  rawStage: string = "dev",
  options: MeshRunOptions = {}
): Promise<number> {
  const stage = (rawStage || "dev").toLowerCase();
  if (stage === "test-unit") {
    throw new ScriptError(
      "mesh up test-unit is no longer supported because meshes have no test topology. " +
      "Use builder service up test-unit -C <service> for isolated tests, " +
      "or builder mesh up test for the complete test pipeline.",
    );
  }
  if (!(MESH_COMMAND_STAGES as readonly string[]).includes(stage)) {
    throw new ScriptError(
      `Unknown mesh stage: "${rawStage}". Supported stages: ${MESH_COMMAND_STAGES.join(", ")}`,
    );
  }
  const projectDir = resolveProjectDir(options.projectDir);
  const runOptions = { ...options, projectDir };
  if (!options.skipChecks) {
    checkMesh(projectDir, {
      requireTester: stage === "test" || stage === "test-e2e",
    });
  }
  switch (stage) {
    case "dev": return runMeshDev(runOptions);
    case "prod": return runMeshProd(runOptions);
    case "test": return runMeshTest(runOptions);
    case "test-e2e": return runMeshTestE2e(runOptions);
    default: throw new ScriptError(`Unsupported mesh command: ${stage}`);
  }
}
