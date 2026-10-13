import { afterEach, expect, it, vi } from "vitest";
import { checkMesh } from "../../src/core/mesh/checkers/checkMesh.js";
import { meshFixture, cleanupFixtures } from "../conformance/fixture.js";
vi.mock("../../src/core/checkers/checkDockerfile.js", () => ({ checkDockerfile: vi.fn() }));
vi.mock("../../src/core/checkers/checkYamlFiles.js", () => ({ checkYamlFiles: vi.fn() }));
afterEach(() => { vi.restoreAllMocks(); cleanupFixtures(); });
it("still validates standalone build.test during mesh preflight", () => {
  vi.spyOn(console, "log").mockImplementation(() => {});
  const root = meshFixture({ services: { api: { path: "api" } } }, { api: { app: {}, test: { app: { env: { EXEC_MODE: "dev" } } } } });
  expect(() => checkMesh(root)).toThrow(/EXEC_MODE/);
});
it("requires the global tester only when requested", () => {
  vi.spyOn(console, "log").mockImplementation(() => {});
  const root = meshFixture({ services: { api: { path: "api" } } }, { api: { app: {}, test: { app: { env: { LOG_LEVEL: "silent" } } } } });
  expect(() => checkMesh(root)).not.toThrow();
  expect(() => checkMesh(root, { requireTester: true })).toThrow(/requires root tester/);
});
