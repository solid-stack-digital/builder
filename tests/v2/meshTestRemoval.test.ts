import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { meshSchema } from "../../src/core/mesh/meshSchema.js";
import { getMeshJson } from "../../src/core/mesh/getMeshJson.js";
import { resolveMeshStage } from "../../src/core/config/resolveMeshStage.js";
import { resolveBuildStage } from "../../src/core/config/resolveBuildStage.js";
import { ConfigError } from "../../src/errors/ConfigError.js";
import { cleanupMeshes, createMesh } from "./meshFixture.js";

afterEach(cleanupMeshes);
const services = { api: { path: "api" } };

function expectRemovedField(action: () => unknown, file: string): void {
  let caught: unknown;
  try { action(); } catch (error) { caught = error; }
  expect(caught).toBeInstanceOf(ConfigError);
  const error = caught as ConfigError;
  expect(error.context).toMatchObject({
    sourceFile: file, configPath: "test", composition: "mesh",
  });
  expect(error.message).toContain("mesh.json.test is no longer supported");
  expect(error.message).toContain("build.json.test");
  expect(error.message).toContain("mesh.json.e2e");
  expect(error.message).not.toContain("SECRET_SENTINEL_220");
}

describe("removed mesh test topology", () => {
  it.each([
    {},
    { services: {} },
    { services: { api: { env: { API_TOKEN: "SECRET_SENTINEL_220" } } } },
    null, false, 0, "", [],
  ])("T01 rejects presence of root test regardless of value %#", test => {
    // No child projects: the config error must happen before service loading.
    const root = createMesh({ services, test }, {});
    expectRemovedField(() => getMeshJson(root), path.join(root, "mesh.json"));
    expect(fs.existsSync(path.join(root, ".builder"))).toBe(false);
  });

  it.each(["dev", "prod", "e2e"] as const)(
    "T02 guards direct resolution even when %s would ignore test",
    stage => {
      expectRemovedField(
        () => resolveMeshStage({ services, test: {} } as any, stage, "mesh.json"),
        "mesh.json",
      );
    },
  );

  it("T02 detects own undefined properties for in-memory callers", () => {
    expectRemovedField(
      () => resolveMeshStage({ services, test: undefined } as any, "prod", "mesh.json"),
      "mesh.json",
    );
  });

  it("T03 removes root test from the schema", () => {
    expect(meshSchema.safeParse({ services, test: {} }).success).toBe(false);
    expect(() => meshSchema.parse({ services, test: {} })).toThrow();
    expect(meshSchema.safeParse({ services, prod: {}, e2e: {} }).success).toBe(true);
  });

  it.each(["test", "test-unit", "test-e2e", "unknown"])(
    "T04 rejects unsupported configuration stage %s",
    stage => {
      let caught: unknown;
      try { resolveMeshStage({ services }, stage as any, "mesh.json"); }
      catch (error) { caught = error; }
      expect(caught).toBeInstanceOf(ConfigError);
      expect((caught as Error).message).toContain("Supported stages: dev, prod, e2e");
    },
  );

  it("limits the removed-field guard to the root configuration field", () => {
    expect(meshSchema.safeParse({ services: { api: { path: "api", env: { test: "value" } } } }).success).toBe(true);
    expect(meshSchema.safeParse({ services: { test: { path: "api" } } }).success).toBe(false);
    expect(meshSchema.safeParse({ services, prod: { test: {} } }).success).toBe(false);
  });

  it("control: build.test remains a meaningful service overlay", () => {
    const build = resolveBuildStage({
      app: { env: { LOG_LEVEL: "info", BASE: "yes" } },
      test: { app: { env: { LOG_LEVEL: "silent" } } },
      prod: { app: { env: { PROD_ONLY: "yes" } } },
    }, "test", "build.json");
    expect(build.app.env).toEqual({ LOG_LEVEL: "silent", BASE: "yes" });
  });
});
