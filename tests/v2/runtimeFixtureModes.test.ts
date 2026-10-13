import { spawnSync } from "node:child_process";
import { afterEach, expect, it } from "vitest";
import { appScript, runtimeService, runtimeMesh } from "../docker-acceptance/runtimeFixture.js";
import { cleanupFixtures } from "../conformance/fixture.js";
import { getBuildJson } from "../../src/utils/getBuildJson.js";
import path from "node:path";
afterEach(cleanupFixtures);
function run(env: Record<string, string>) {
  return spawnSync(process.execPath, ["--input-type=module", "-e", `${appScript}\nsetTimeout(() => process.exit(0), 100);`], {
    env: { ...env, PORT: "0" }, encoding: "utf8", timeout: 5000,
  });
}
it("allows the Docker fixture to run ordinary integrated production", () => {
  const result = run({ EXEC_MODE: "prod", INFRA_MODE: "integrated", PROD_FILE: "yes" });
  expect(result.status, result.stderr).toBe(0);
});
it.each([
  { EXPECT_E2E_ENV: "yes" },
  { EXPECT_E2E_ENV: "yes", E2E_FILE: "yes", PROD_FILE: "yes" },
])("still rejects invalid E2E dotenv isolation %#", extra => {
  expect(run({ EXEC_MODE: "prod", INFRA_MODE: "integrated", ...extra }).status).toBe(44);
});
it("accepts valid E2E dotenv isolation", () => {
  expect(run({ EXEC_MODE: "prod", INFRA_MODE: "integrated", EXPECT_E2E_ENV: "yes", E2E_FILE: "yes" }).status).toBe(0);
});
it("still rejects isolated production execution", () => {
  expect(run({ EXEC_MODE: "prod", INFRA_MODE: "isolated", PROD_FILE: "yes" }).status).toBe(44);
});
it("adds E2E expectations without losing user overlays in both fixture builders", () => {
  const build = { app: {}, e2e: { app: { env: { KEEP: "yes" } }, "override-compose": "override.yml" } };
  const service = runtimeService(build);
  const mesh = runtimeMesh({ services: { api: { path: "api" } } }, { api: build });
  for (const dir of [service, path.join(mesh, "api")]) {
    expect(getBuildJson(dir).e2e).toMatchObject({ app: { env: { KEEP: "yes", EXPECT_E2E_ENV: "yes" } }, "override-compose": "override.yml" });
  }
});
