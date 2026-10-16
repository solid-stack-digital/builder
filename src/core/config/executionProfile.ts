import type { Environment, ExecutionMode, InfraMode } from "../../types/index.js";
export interface ExecutionProfile { configStage: Environment; envStage: Environment; mainTarget: ExecutionMode; execMode: ExecutionMode; infraMode: InfraMode; attachTester: boolean }
export function executionProfile(stage: Environment, composition: "service"|"mesh", full = false): ExecutionProfile {
  if (composition === "mesh" && stage === "test") throw new Error("Mesh test is a workflow, not a configuration stage");
  if (stage === "dev") return { configStage: stage, envStage: stage, mainTarget: "dev", execMode: "dev", infraMode: composition === "mesh" || full ? "integrated" : "isolated", attachTester: false };
  if (stage === "test") return { configStage: stage, envStage: stage, mainTarget: "test", execMode: "test", infraMode: "isolated", attachTester: false };
  return { configStage: stage, envStage: stage, mainTarget: "prod", execMode: "prod", infraMode: "integrated", attachTester: stage === "e2e" };
}
