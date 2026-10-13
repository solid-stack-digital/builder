import fs from "node:fs";
import { afterEach, expect, it, vi } from "vitest";
import { handleMeshUp } from "../../src/commands/mesh/commands/up/handler.js";
import { handleMeshDown } from "../../src/commands/mesh/commands/down/handler.js";
import { checkMesh } from "../../src/core/mesh/checkers/checkMesh.js";
import { runMeshDev } from "../../src/core/mesh/runners/runMeshDev.js";
import { teardownCompose } from "../../src/core/teardownCompose.js";
import { meshSchema } from "../../src/core/mesh/meshSchema.js";
vi.mock("../../src/core/mesh/checkers/checkMesh.js", () => ({ checkMesh: vi.fn() }));
vi.mock("../../src/core/mesh/runners/runMeshDev.js", () => ({ runMeshDev: vi.fn().mockResolvedValue(0) }));
vi.mock("../../src/core/teardownCompose.js", () => ({ teardownCompose: vi.fn().mockResolvedValue(undefined) }));
afterEach(() => vi.clearAllMocks());
it("rejects the removed up command before preflight", async () => {
  await expect(handleMeshUp("test-unit", { dryRun: true })).rejects.toThrow(/service up test-unit/);
  expect(checkMesh).not.toHaveBeenCalled();
});
it("rejects the removed down command before teardown", async () => {
  await expect(handleMeshDown("test-unit")).rejects.toThrow(/service down test-unit/);
  expect(teardownCompose).not.toHaveBeenCalled();
});
it("does not pass removed preflight options", async () => {
  await handleMeshUp("dev", { dryRun: true });
  expect(checkMesh).toHaveBeenCalledExactlyOnceWith(process.cwd(), { requireTester: false });
  expect(runMeshDev).toHaveBeenCalledOnce();
});
it("publishes only three mesh overlays while retaining build.test", () => {
  const mesh = JSON.parse(fs.readFileSync("schemas/mesh-schema.json", "utf8")).definitions.MeshJsonV2;
  const build = JSON.parse(fs.readFileSync("schemas/build-schema.json", "utf8")).definitions.BuildJsonV2;
  expect(Object.keys(mesh.properties).sort()).toEqual(["$schema", "dev", "e2e", "name", "prod", "services", "tester"]);
  expect(mesh.additionalProperties).toBe(false);
  expect(build.properties.test).toBeDefined();
});
it("documents a valid current mesh example and shape", () => {
  const doc = fs.readFileSync("docs/reference/mesh-json.md", "utf8");
  const shape = doc.split("## Complete shape")[1]!.split("## Root fields")[0]!;
  expect(shape).not.toMatch(/\btest\??\s*:\s*MeshStage/);
  const example = doc.split("## Complete example")[1]!.split("## Related")[0]!;
  const config = JSON.parse(example.match(/```json\s*\n([\s\S]*?)\n```/)![1]!);
  expect(config).not.toHaveProperty("test");
  expect(meshSchema.safeParse(config).success).toBe(true);
});
it("removes the obsolete fullstack Make target", () => {
  const makefile = fs.readFileSync("examples/fullstack/makefile", "utf8");
  expect(makefile).not.toContain("mesh up test-unit");
  expect(makefile).toContain("mesh up test\n");
  expect(makefile).toContain("mesh up test-e2e");
});
