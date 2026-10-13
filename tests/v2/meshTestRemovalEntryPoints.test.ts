import fs from "node:fs";
import path from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { handleMeshUp } from "../../src/commands/mesh/commands/up/handler.js";
import { runCompose } from "../../src/core/runCompose.js";
import { teardownCompose } from "../../src/core/teardownCompose.js";
import { checkInfra } from "../../src/core/checkers/checkInfra.js";
import { checkMesh } from "../../src/core/mesh/checkers/checkMesh.js";
import { compileMeshComposition } from "../../src/core/mesh/v2/compileMeshComposition.js";
import { compileMeshEnvironment } from "../../src/core/mesh/compileMeshEnvironment.js";
import { createMesh, cleanupMeshes } from "./meshFixture.js";
vi.mock("../../src/core/runCompose.js", () => ({ runCompose: vi.fn() }));
vi.mock("../../src/core/teardownCompose.js", () => ({ teardownCompose: vi.fn() }));
vi.mock("../../src/core/checkers/checkInfra.js", () => ({ checkInfra: vi.fn() }));
afterEach(() => { vi.restoreAllMocks(); vi.clearAllMocks(); cleanupMeshes(); });
const error = { name: "ConfigError", context: { configPath: "test", composition: "mesh" } };
it.each(["dev", "prod", "test", "test-e2e"])("cannot bypass the field guard with skipChecks for %s", async stage => {
  const root = createMesh({ services: { api: { path: "api" } }, test: {} }, {});
  vi.spyOn(console, "log").mockImplementation(() => {});
  await expect(handleMeshUp(stage, { projectDir: root, skipChecks: true, dryRun: true })).rejects.toMatchObject(error);
  expect(runCompose).not.toHaveBeenCalled();
  expect(teardownCompose).not.toHaveBeenCalled();
  expect(checkInfra).not.toHaveBeenCalled();
  expect(fs.existsSync(path.join(root, ".builder"))).toBe(false);
});
it("rejects in preflight before service checks", () => {
  const root = createMesh({ services: { api: { path: "missing" } }, test: {} }, {});
  expect(() => checkMesh(root)).toThrow(/mesh.json.test is no longer supported/);
  expect(checkInfra).not.toHaveBeenCalled();
});
it.each(["dev", "prod", "e2e"] as const)("rejects in both compilers before service loading for %s", stage => {
  const root = createMesh({ services: { api: { path: "missing" } }, test: {} }, {});
  for (const compile of [() => compileMeshComposition(stage, root), () => compileMeshEnvironment(stage, root)]) {
    expect(compile).toThrow(/mesh.json.test is no longer supported/);
  }
  expect(fs.existsSync(path.join(root, ".builder"))).toBe(false);
});
