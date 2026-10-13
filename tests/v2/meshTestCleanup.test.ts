import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { meshFixture, cleanupFixtures, write } from "../conformance/fixture.js";
import { handleMeshDown } from "../../src/commands/mesh/commands/down/handler.js";
import { teardownCompose } from "../../src/core/teardownCompose.js";
import { compileMeshEnvironment } from "../../src/core/mesh/compileMeshEnvironment.js";
import { projectNamesForMeshStage, readRunState, writeRunState } from "../../src/utils/runState.js";
import * as resolver from "../../src/core/config/resolveMeshStage.js";
vi.mock("../../src/core/teardownCompose.js", () => ({ teardownCompose: vi.fn() }));
vi.mock("../../src/core/mesh/compileMeshEnvironment.js", () => ({ compileMeshEnvironment: vi.fn(() => ({ yaml: "services: {}" })) }));
vi.mock("../../src/core/compileEnvironment.js", () => ({ compileEnvironment: () => "services: {}" }));
beforeEach(() => { vi.mocked(teardownCompose).mockReset().mockResolvedValue(undefined); vi.spyOn(console, "log").mockImplementation(() => {}); });
afterEach(() => { vi.restoreAllMocks(); vi.clearAllMocks(); cleanupFixtures(); });
function project() {
  return meshFixture({ name: "system", services: { api: { path: "api" }, duplicate: { path: "api" } },
    prod: { services: { api: { path: "alternate" } } }, e2e: { services: { extra: { path: "extra" } } } },
    { api: { name: "orders", app: {} }, alternate: { app: {} }, extra: { app: {} } });
}
function calls() { return vi.mocked(teardownCompose).mock.calls.map(([, dir, options]) => [dir, options?.projectName]); }
it("recovers root-path standalone projects once, then global E2E", async () => {
  const root = project();
  await expect(handleMeshDown("test", { projectDir: root, volumes: true })).resolves.toBe(0);
  expect(calls()).toEqual([[path.join(root, "api"), "orders-test"], [path.join(root, "api"), "orders-e2e"], [root, "system-e2e"]]);
  for (const [, , options] of vi.mocked(teardownCompose).mock.calls) expect(options?.removeVolumes).toBe(true);
});
it("preserves child saved identities and anonymous volume metadata", async () => {
  const root = project(), child = path.join(root, "api");
  writeRunState(child, { projectName: "legacy-child", projectDir: child, stage: "test-unit", anonymousVolumeServices: ["app"] });
  writeRunState(root, { projectName: "saved-root", projectDir: root, stage: "test-e2e" });
  await handleMeshDown("test", { projectDir: root });
  expect(calls()[0]).toEqual([child, "legacy-child"]);
  expect(teardownCompose).toHaveBeenCalledWith("", child, expect.objectContaining({ projectName: "legacy-child", anonymousVolumeServices: ["app"] }));
  expect(calls()).toContainEqual([root, "saved-root"]);
  expect(readRunState(child)).toBeNull(); expect(readRunState(root)).toBeNull();
});
it.each(["dev", "prod", "test-e2e"])("does not touch children for %s", async stage => {
  const root = project(); await handleMeshDown(stage, { projectDir: root });
  expect(calls()).toHaveLength(1); expect(calls()[0]?.[0]).toBe(root);
});
it("does not resolve a topology to derive cleanup names", () => {
  const root = project(), spy = vi.spyOn(resolver, "resolveMeshStage");
  expect(projectNamesForMeshStage(root, "dev")).toEqual(["system"]);
  expect(spy).not.toHaveBeenCalled();
});
it("uses global E2E for full-test debug compilation", async () => {
  const root = project(); await handleMeshDown("test", { projectDir: root, debug: true });
  expect(compileMeshEnvironment).toHaveBeenCalledWith("e2e", root, { validateWithDocker: false });
});
it.each(["child", "root"])("keeps recovery state after %s teardown fails", async failure => {
  const root = project(), child = path.join(root, "api");
  for (const dir of [root, child]) writeRunState(dir, { projectName: dir === root ? "saved-root" : "saved-child", projectDir: dir, stage: "test" });
  vi.mocked(teardownCompose).mockImplementation(async (_yaml, dir) => { if (dir === (failure === "child" ? child : root)) throw new Error("cleanup failure"); });
  await expect(handleMeshDown("test", { projectDir: root })).rejects.toThrow("cleanup failure");
  expect(readRunState(root)).not.toBeNull();
  if (failure === "child") { expect(readRunState(child)).not.toBeNull(); expect(calls().every(([dir]) => dir === child)).toBe(true); }
});
it.each(["broken", "legacy"])("can recover root saved state with %s config", async kind => {
  const root = project();
  if (kind === "broken") fs.writeFileSync(path.join(root, "mesh.json"), "{");
  else write(root, "mesh.json", { services: { api: { path: "api" } }, test: {} });
  writeRunState(root, { projectName: "saved-root", projectDir: root, stage: "test-e2e" });
  await handleMeshDown("test", { projectDir: root });
  expect(calls()[0]).toEqual([root, "saved-root"]);
  expect(calls().every(([dir]) => dir === root)).toBe(true);
  expect(readRunState(root)).toBeNull();
});
it("rejects removed down stage without touching saved state", async () => {
  const root = project(); writeRunState(root, { projectName: "saved", projectDir: root, stage: "test" });
  await expect(handleMeshDown("test-unit", { projectDir: root })).rejects.toThrow(/service down test-unit/);
  expect(teardownCompose).not.toHaveBeenCalled(); expect(readRunState(root)).not.toBeNull();
});
