import { existsSync } from "node:fs";
import path from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { cleanupFixtures, compileMesh, compileService, dep, env, http, meshFixture, ownerBundle } from "./fixture.js";
import { getMeshJson } from "../../src/core/mesh/getMeshJson.js";
import { checkMeshServices } from "../../src/core/mesh/checkers/checkMeshServices.js";
vi.mock("../../src/core/checkers/checkInfra.js", () => ({ checkInfra: vi.fn() }));
afterEach(() => { cleanupFixtures(); vi.restoreAllMocks(); });
function published(publicPort: number | "AUTO" = 54321) {
  return meshFixture({ services: { api: { path: "api", publish: ["app.endpoints.http"], env: { SELF_URL: "${api.app.endpoints.http.public_url}" } } } },
    { api: { app: { endpoints: { http: http(3000, { publicPort }) }, env: { APP_SELF: "${app.endpoints.http.public_url}" } } } });
}
it("V210-007 resolves mesh self public references after publication", () => {
  const root = published(), result = compileMesh("prod", root);
  expect(env(result.compose.services.api)).toMatchObject({ SELF_URL: "http://127.0.0.1:54321", APP_SELF: "http://127.0.0.1:54321" });
  expect(result.compose.services.api?.ports).toEqual([{ target: 3000, published: 54321, host_ip: "127.0.0.1", protocol: "tcp" }]);
  expect(() => checkMeshServices(getMeshJson(root), root)).not.toThrow();
});
it("retains build-owned isolated publication and runtime semantics", () => {
  const root = published(), result = compileService("test", path.join(root, "api"));
  expect(Object.keys(result.compose.services)).toEqual(["app"]);
  expect(result.compose.services.app?.build).toMatchObject({ target: "test" });
  expect(env(result.compose.services.app)).toMatchObject({ APP_SELF: "http://127.0.0.1:54321", EXEC_MODE: "test", INFRA_MODE: "isolated" });
  expect(env(result.compose.services.app)).not.toHaveProperty("SELF_URL");
});
it("resolves AUTO references without creating a validation port cache", () => {
  const root = published("AUTO"), result = compileMesh("prod", root);
  const port = result.endpoints.app.api?.http?.publicPort;
  expect(port).toBeGreaterThan(0);
  expect(env(result.compose.services.api).SELF_URL).toBe(`http://127.0.0.1:${port}`);
  expect(existsSync(path.join(root, ".builder"))).toBe(false);
});
it("requires mesh publication even when build publicPort exists", () => {
  const root = meshFixture({ services: { api: { path: "api", env: { SELF_URL: "${api.app.endpoints.http.public_url}" } } } },
    { api: { app: { endpoints: { http: http(3000, { publicPort: 54321 }) } } } });
  expect(() => compileMesh("prod", root)).toThrow(/public_url requires effective publication/);
});
it("requires build publication capability", () => {
  const root = meshFixture({ services: { api: { path: "api", publish: ["app.endpoints.http"] } } },
    { api: { app: { endpoints: { http: http() } } } });
  expect(() => compileMesh("prod", root)).toThrow(/publicPort/i);
});
it("publishes retained dependencies in integrated mesh but does not materialize them in isolated service tests", () => {
  const root = meshFixture({ services: { api: { path: "api", publish: ["dependencies.db.endpoints.api"] } } },
    { api: { app: {}, dependencies: { db: dep("db.yml", "owner", 6379, { publicPort: 54321 }) } } },
    { "api/db.yml": ownerBundle() });
  expect(compileMesh("prod", root).endpoints.dependencies.api?.db?.api?.publicPort).toBe(54321);
  expect(Object.keys(compileService("test", path.join(root, "api")).compose.services)).toEqual(["app"]);
});
