import { ConfigError } from "../../errors/ConfigError.js";
import {
  MESH_CONFIG_STAGES,
  type MeshConfigStage,
} from "../mesh/types.js";

export const REMOVED_MESH_TEST_MESSAGE =
  "mesh.json.test is no longer supported. A mesh has no test topology. " +
  "Put service-owned isolated test settings in build.json.test; " +
  "put global E2E topology settings in mesh.json.e2e. " +
  "The mesh test command runs independent service tests, then global E2E.";

export function assertNoLegacyMeshTest(
  input: unknown,
  sourceFile: string,
): void {
  if (
    input !== null &&
    typeof input === "object" &&
    !Array.isArray(input) &&
    Object.prototype.hasOwnProperty.call(input, "test")
  ) {
    throw new ConfigError({
      sourceFile,
      configPath: "test",
      composition: "mesh",
      reason: REMOVED_MESH_TEST_MESSAGE,
    });
  }
}

export function assertMeshConfigStage(
  stage: unknown,
  sourceFile: string,
): asserts stage is MeshConfigStage {
  if (
    typeof stage !== "string" ||
    !(MESH_CONFIG_STAGES as readonly string[]).includes(stage)
  ) {
    throw new ConfigError({
      sourceFile,
      configPath: "<stage>",
      composition: "mesh",
      reason:
        "Unsupported mesh configuration stage. Supported stages: dev, prod, e2e. " +
        "test is a pipeline command, not a mesh configuration stage.",
    });
  }
}

export function meshStageOverlayChain(
  stage: MeshConfigStage,
): readonly MeshConfigStage[] {
  return stage === "e2e" ? ["prod", "e2e"] : [stage];
}
