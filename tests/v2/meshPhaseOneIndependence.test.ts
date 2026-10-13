import path from "node:path";
import { parse, stringify } from "yaml";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanupFixtures, meshFixture, ownerBundle, write, env } from "../conformance/fixture.js";
import { runMeshTest } from "../../src/core/mesh/runners/runMeshTest.js";
import { runCompose } from "../../src/core/runCompose.js";
import { teardownCompose } from "../../src/core/teardownCompose.js";
import { compileServiceComposition } from "../../src/core/composition/compileServiceComposition.js";
import { compileMeshComposition } from "../../src/core/mesh/v2/compileMeshComposition.js";
import type { ComposeDocument } from "../../src/core/composition/types.js";
import { readRunState } from "../../src/utils/runState.js";
vi.mock("../../src/core/runCompose.js", () => ({ runCompose: vi.fn() }));
vi.mock("../../src/core/teardownCompose.js", () => ({ teardownCompose: vi.fn() }));
vi.mock("../../src/utils/checkPortCollision.js", () => ({ checkHostPortCollisions: vi.fn(), extractHostPorts: () => [] }));
// Keep real compilation; replace only the external Docker validation boundary.
vi.mock("../../src/core/mesh/compileMeshEnvironment.js", () => ({
  compileMeshEnvironment: (stage: "dev" | "prod" | "e2e", root: string) => {
    const result = compileMeshComposition(stage, root, { validationMode: true });
    return { yaml: stringify(result.compose), testerServiceName: result.testerServiceName };
  },
}));
const events: string[] = [];
beforeEach(() => {
  events.length = 0;
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.mocked(runCompose).mockReset().mockImplementation(async (_args, yaml) => {
    events.push(`up:${parse(yaml).name}`); return 0;
  });
  vi.mocked(teardownCompose).mockReset().mockImplementation(async (yaml, _dir, options) => {
    events.push(`${options?.silent ? "stale" : "cleanup"}:${parse(yaml).name}`);
  });
});
afterEach(() => { vi.restoreAllMocks(); cleanupFixtures(); });
function project() {
  const root = meshFixture({ name: "system", services: {
    beta: { path: "beta" },
    alpha: { path: "alpha", env: { OWNER: "mesh-base" }, dependencies: { db: "beta" }, dependsOn: ["beta"], publish: ["app.endpoints.http"] },
  }, prod: { services: { alpha: { env: { OWNER: "mesh-prod", MESH_PROD: "yes" } }, "prod-only": { path: "prod-only" } } },
  e2e: { services: { alpha: { env: { OWNER: "mesh-e2e" } }, "e2e-only": { path: "e2e-only" } } },
  tester: { compose: "tester.yml", service: "runner", env: { URL: "${alpha.app.endpoints.http.public_url}", TESTER_OWNER: "global" } } }, {
    alpha: { name: "independent-alpha", app: { endpoints: { http: { port: 3000, primary: true, publicPort: 41001, scheme: "http" } }, env: { OWNER: "build-base", DB_URL: "${dependencies.db.endpoints.api.network_url}" } },
      dependencies: { db: { compose: "db.yml", endpoints: { api: { service: "owner", port: 6379, primary: true, scheme: "http" } } } },
      test: { app: { env: { OWNER: "build-test", DB_URL: "in-process" } } },
      prod: { app: { env: { OWNER: "build-prod", PROD_ONLY: "yes" } } },
      e2e: { app: { env: { OWNER: "build-e2e" } } }, tester: { env: { TESTER_OWNER: "service", URL: "${app.endpoints.http.public_url}" } } },
    beta: { name: "independent-beta", app: { endpoints: { api: { port: 8888, primary: true, scheme: "http" } } } },
    "prod-only": { app: {} }, "e2e-only": { app: {} },
  }, { "alpha/db.yml": ownerBundle(), "tester.yml": { services: { runner: { image: "alpine" } } } });
  write(root, "alpha/.env.test", "DOTENV_OWNER=isolated\n");
  write(root, "alpha/.env.prod", "PROD_FILE_ONLY=yes\n");
  write(root, "alpha/.env.e2e", "DOTENV_OWNER=e2e-app\n");
  write(root, "alpha/.env.e2e-tester", "DOTENV_TESTER=service\n");
  write(root, ".env.e2e-tester", "DOTENV_TESTER=global\n");
  return root;
}
const names = ["independent-alpha-test", "independent-alpha-e2e", "independent-beta-test", "independent-beta-e2e", "system-e2e"];
it("runs real standalone configurations with teardown before a production-shaped global mesh", async () => {
  const root = project();
  expect(await runMeshTest({ projectDir: root })).toBe(0);
  expect(events).toEqual(names.flatMap(name => [`stale:${name}`, `up:${name}`, `cleanup:${name}`]));
  const calls = vi.mocked(runCompose).mock.calls;
  expect(calls.map(([, , dir]) => dir)).toEqual([path.join(root, "alpha"), path.join(root, "alpha"), path.join(root, "beta"), path.join(root, "beta"), root]);
  const documents = calls.map(([, yaml]) => parse(yaml) as ComposeDocument);
  for (const [index, service, stage] of [[0, "alpha", "test"], [1, "alpha", "e2e"], [2, "beta", "test"], [3, "beta", "e2e"]] as const) {
    expect(documents[index]).toEqual(compileServiceComposition(stage, path.join(root, service), { validationMode: true }).compose);
  }
  const unit = documents[0]!, service = documents[1]!, global = documents[4]!;
  expect(Object.keys(unit.services)).toEqual(["app"]);
  expect(unit.services.app?.build).toMatchObject({ target: "test" });
  expect(env(unit.services.app)).toMatchObject({ OWNER: "build-test", DB_URL: "in-process", EXEC_MODE: "test", INFRA_MODE: "isolated" });
  expect(unit.services.app?.env_file).toContainEqual({ path: ".env.test", required: false });
  expect(env(service.services.app)).toMatchObject({ OWNER: "build-e2e", PROD_ONLY: "yes", EXEC_MODE: "prod", INFRA_MODE: "integrated" });
  expect(env(service.services.app).DB_URL).toMatch(/owner:6379$/);
  expect(service.services.app?.env_file).toContainEqual({ path: ".env.e2e", required: false });
  expect(env(service.services.tester)).toMatchObject({ TESTER_OWNER: "service", EXEC_MODE: "e2e" });
  expect(env(service.services.tester)).not.toHaveProperty("INFRA_MODE");
  expect(service.services.tester?.env_file).toContainEqual({ path: ".env.e2e-tester", required: false });
  expect(env(global.services.alpha)).toMatchObject({ OWNER: "mesh-e2e", MESH_PROD: "yes", PROD_ONLY: "yes", DB_URL: "http://beta:8888" });
  expect(global.services).toHaveProperty("prod-only"); expect(global.services).toHaveProperty("e2e-only");
  expect(Object.keys(global.services).some(key => key.includes("dep--db"))).toBe(false);
  for (const name of ["alpha", "beta", "prod-only", "e2e-only"]) {
    expect(global.services[name]?.build).toMatchObject({ target: "prod" });
    expect(env(global.services[name])).toMatchObject({ EXEC_MODE: "prod", INFRA_MODE: "integrated" });
  }
  const tester = Object.values(global.services).find(s => env(s).TESTER_OWNER === "global")!;
  expect(env(tester)).toMatchObject({ EXEC_MODE: "e2e", URL: "http://127.0.0.1:41001" });
  expect(env(tester)).not.toHaveProperty("INFRA_MODE");
  for (const dir of [root, path.join(root, "alpha"), path.join(root, "beta")]) expect(readRunState(dir)).toBeNull();
});
it.each(names)("does not proceed after runner failure at %s", async failed => {
  const root = project();
  vi.mocked(runCompose).mockImplementation(async (_args, yaml) => { const name = parse(yaml).name; events.push(`up:${name}`); return name === failed ? 7 : 0; });
  expect(await runMeshTest({ projectDir: root })).toBe(7);
  expect(events.filter(e => e.startsWith("up:"))).toEqual(names.slice(0, names.indexOf(failed) + 1).map(n => `up:${n}`));
  expect(events.at(-1)).toBe(`cleanup:${failed}`);
});
it.each(names)("does not proceed after cleanup failure at %s", async failed => {
  const root = project();
  vi.mocked(teardownCompose).mockImplementation(async (yaml, _dir, options) => {
    const name = parse(yaml).name;
    if (!options?.silent && name === failed) throw new Error("cleanup failed");
  });
  await expect(runMeshTest({ projectDir: root })).rejects.toThrow("cleanup failed");
  expect(events).toEqual(names.slice(0, names.indexOf(failed) + 1).map(n => `up:${n}`));
  const dir = failed.startsWith("independent-alpha") ? path.join(root, "alpha") : failed.startsWith("independent-beta") ? path.join(root, "beta") : root;
  expect(readRunState(dir)?.projectName).toBe(failed);
});
