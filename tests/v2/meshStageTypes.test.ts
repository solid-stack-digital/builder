import { expect, it } from "vitest";
import type { MeshConfig, MeshConfigStage } from "../../src/core/mesh/types.js";
import type { BuildJson, Environment } from "../../src/types/index.js";
import type { CheckMeshOptions } from "../../src/core/mesh/checkers/checkMesh.js";
import { checkMeshServices } from "../../src/core/mesh/checkers/checkMeshServices.js";

const validMeshStage: MeshConfigStage = "e2e";
// @ts-expect-error test is a command, not a mesh config stage
const removedMeshStage: MeshConfigStage = "test";
const invalidMesh: MeshConfig = {
  services: { api: { path: "api" } },
  // @ts-expect-error root mesh.test is forbidden
  test: {},
};
const invalidOptions: CheckMeshOptions = {
  // @ts-expect-error explicit mesh test preflight no longer exists
  includeTestStage: true,
};
// This function is intentionally never invoked; it is a compile-time check.
function invalidCheckerCall(): void {
  // @ts-expect-error checker no longer has a mesh test options argument
  checkMeshServices({ services: { api: { path: "api" } } }, "/tmp", { includeTestStage: true });
}
const validBuildStage: Environment = "test";
const validBuild: BuildJson = { app: {}, test: { app: { env: { LOG_LEVEL: "silent" } } } };
it("retains service test types", () => {
  expect(validMeshStage).toBe("e2e");
  expect(validBuildStage).toBe("test");
  expect(validBuild.test?.app?.env?.LOG_LEVEL).toBe("silent");
  void removedMeshStage; void invalidMesh; void invalidOptions; void invalidCheckerCall;
});
