import { ScriptError } from "../../../../errors/ScriptError.js";
import type { MeshRunOptions } from "../../../../core/mesh/MeshRunOptions.js";
import { runMeshDev } from "../../../../core/mesh/runners/runMeshDev.js";
import { runMeshProd } from "../../../../core/mesh/runners/runMeshProd.js";
import { runMeshTest } from "../../../../core/mesh/runners/runMeshTest.js";
import { runMeshTestE2e } from "../../../../core/mesh/runners/runMeshTestE2e.js";
import { runMeshTestUnit } from "../../../../core/mesh/runners/runMeshTestUnit.js";

export async function handleMeshUp(
  rawStage: string = "dev",
  options: MeshRunOptions = {}
): Promise<number> {
  const stage = (rawStage || "dev").toLowerCase();

  switch (stage) {
    case "dev":
      return runMeshDev(options);
    case "prod":
      return runMeshProd(options);
    case "test-unit":
      return runMeshTestUnit(options);
    case "test-e2e":
      return runMeshTestE2e(options);
    case "test":
      return runMeshTest(options);
    default:
      throw new ScriptError(
        `Unknown mesh stage: "${rawStage}". Supported stages: dev, prod, test, test-unit, test-e2e`
      );
  }
}
