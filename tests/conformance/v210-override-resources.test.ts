import { afterEach, expect, it } from "vitest";
import { cleanupFixtures, compileMesh, compileService, fixture, meshFixture } from "./fixture.js";
import { ConfigError } from "../../src/errors/ConfigError.js";

afterEach(cleanupFixtures);

it.each([
  ["volumes", ["missing:/data"]],
  ["networks", ["missing"]],
  ["configs", ["missing"]],
  ["secrets", ["missing"]],
] as const)("V210-004 rejects undefined app override %s", (kind, value) => {
  const root = fixture(
    { app: {}, prod: { "override-compose": "override.yml" } },
    { "override.yml": { services: { app: { [kind]: value } } } },
  );
  expect(() => compileService("prod", root)).toThrow(/reference.*missing|missing.*definition/i);
  try {
    compileService("prod", root);
    throw new Error("Expected an undefined resource error");
  } catch (error) {
    expect(error).toBeInstanceOf(ConfigError);
    expect((error as ConfigError).context).toMatchObject({
      sourceFile: expect.stringContaining("override.yml"),
      configPath: `services.app.${kind}`,
      referencedObject: "missing",
      stage: "prod",
      composition: "service",
    });
  }
});

it.each([
  ["long volume", { volumes: [{ type: "volume", source: "missing", target: "/data" }] }],
  ["long config", { configs: [{ source: "missing", target: "/run/config" }] }],
  ["long secret", { secrets: [{ source: "missing", target: "/run/secret" }] }],
  ["network map", { networks: { missing: null } }],
] as const)("rejects undefined %s resource reference", (_name, app) => {
  const root = fixture(
    { app: {}, prod: { "override-compose": "o.yml" } },
    { "o.yml": { services: { app } } },
  );
  expect(() => compileService("prod", root)).toThrow(/reference "missing" has no top-level definition/);
});

it("accepts a declared volume and rewrites the app reference", () => {
  const root = fixture(
    { app: {}, prod: { "override-compose": "o.yml" } },
    { "o.yml": { services: { app: { volumes: ["data:/data"] } }, volumes: { data: {} } } },
  );
  const compose = compileService("prod", root).compose;
  const [key] = Object.keys(compose.volumes!);
  expect(compose.services.app!.volumes).toEqual([`${key}:/data`]);
});

it("accepts bind mounts, anonymous volumes, and the implicit default network", () => {
  const root = fixture(
    { app: {}, prod: { "override-compose": "o.yml" } },
    { "o.yml": { services: { app: { volumes: ["./data:/data", "/cache"], networks: ["default"] } } } },
  );
  expect(() => compileService("prod", root)).not.toThrow();
});

it("accepts declared configs, secrets, and external resources", () => {
  const root = fixture(
    { app: {}, prod: { "override-compose": "o.yml" } },
    { "o.yml": {
      services: { app: { configs: ["settings"], secrets: [{ source: "token", target: "/run/token" }], volumes: ["shared:/data"] } },
      configs: { settings: { file: "./settings.txt" } },
      secrets: { token: { file: "./token.txt" } },
      volumes: { shared: { external: true } },
    }, "settings.txt": "setting", "token.txt": "token" },
  );
  const compose = compileService("prod", root).compose;
  const [configKey] = Object.keys(compose.configs!);
  const [secretKey] = Object.keys(compose.secrets!);
  const [volumeKey] = Object.keys(compose.volumes!);
  expect(compose.services.app!.configs).toContain(configKey);
  expect(compose.services.app!.secrets).toContainEqual({ source: secretKey, target: "/run/token" });
  expect(compose.services.app!.volumes).toContain(`${volumeKey}:/data`);
  expect(compose.volumes![volumeKey!]).toEqual({ external: true, name: "shared" });
});

it("keeps rejecting unused resource definitions", () => {
  const root = fixture(
    { app: {}, prod: { "override-compose": "o.yml" } },
    { "o.yml": { services: { app: {} }, volumes: { unused: {} } } },
  );
  expect(() => compileService("prod", root)).toThrow(/resource must be consumed/);
});

it("rejects undefined resources in a mesh service override", () => {
  const root = meshFixture(
    { services: { api: { path: "api" } } },
    { api: { app: {}, prod: { "override-compose": "o.yml" } } },
    { "api/o.yml": { services: { app: { volumes: ["missing:/data"] } } } },
  );
  expect(() => compileMesh("prod", root)).toThrow(/reference "missing" has no top-level definition/);
});

it("accepts resources declared separately in inherited prod and E2E overrides", () => {
  const root = fixture(
    { app: {}, prod: { "override-compose": "prod.yml" }, e2e: { "override-compose": "e2e.yml" } },
    {
      "prod.yml": { services: { app: { configs: ["base"] } }, configs: { base: { file: "./base.txt" } } },
      "e2e.yml": { services: { app: { configs: ["e2e"] } }, configs: { e2e: { file: "./e2e.txt" } } },
      "base.txt": "base", "e2e.txt": "e2e",
    },
  );
  const compose = compileService("e2e", root).compose;
  expect(Object.keys(compose.configs!)).toHaveLength(2);
  expect(compose.services.app!.configs).toEqual([Object.keys(compose.configs!).find((key) => key.includes("--e2e--"))]);
});
