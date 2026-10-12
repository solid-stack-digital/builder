import { afterEach, expect, it } from "vitest";
import { cleanupFixtures, compileMesh, compileService, fixture, meshFixture } from "./fixture.js";
import { mergeAppOverride } from "../../src/core/composition/mergeAppOverride.js";

afterEach(cleanupFixtures);

it("V210-002 preserves inherited healthcheck timing in E2E", () => {
  const root = fixture(
    { app: {}, prod: { "override-compose": "prod.yml" }, e2e: { "override-compose": "e2e.yml" } },
    {
      "prod.yml": { services: { app: { healthcheck: { interval: "3s", timeout: "2s", retries: 7 } } } },
      "e2e.yml": { services: { app: { healthcheck: { start_period: "20s" } } } },
    },
  );
  expect(compileService("e2e", root).compose.services.app!.healthcheck).toEqual({
    interval: "3s", timeout: "2s", retries: 7, start_period: "20s",
  });
});

it("V210-002 preserves inherited nested logging options", () => {
  const root = fixture(
    { app: {}, prod: { "override-compose": "prod.yml" }, e2e: { "override-compose": "e2e.yml" } },
    {
      "prod.yml": { services: { app: { logging: { driver: "json-file", options: { "max-size": "20m", "max-file": "5" } } } } },
      "e2e.yml": { services: { app: { logging: { options: { "max-size": "1m" } } } } },
    },
  );
  expect(compileService("e2e", root).compose.services.app!.logging).toEqual({
    driver: "json-file", options: { "max-size": "1m", "max-file": "5" },
  });
});

it("replaces scalar and array values while inheriting an omitted map", () => {
  const root = fixture(
    { app: {}, prod: { "override-compose": "prod.yml" }, e2e: { "override-compose": "e2e.yml" } },
    {
      "prod.yml": { services: { app: {
        restart: "unless-stopped", command: ["old"], healthcheck: { interval: "3s" },
      } } },
      "e2e.yml": { services: { app: { restart: "no", command: ["new"] } } },
    },
  );
  const app = compileService("e2e", root).compose.services.app!;
  expect(app.restart).toBe("no");
  expect(app.command).toEqual(["new"]);
  expect(app.healthcheck).toEqual({ interval: "3s" });
});

it("does not mutate inputs or reuse nested input containers", () => {
  const inherited = { command: ["old"], logging: { options: { "max-file": "5" } } };
  const overlay = { command: ["new"], logging: { options: { "max-size": "1m" } } };
  const inheritedBefore = structuredClone(inherited);
  const overlayBefore = structuredClone(overlay);
  const merged = mergeAppOverride(inherited, overlay);
  expect(merged).toEqual({
    command: ["new"], logging: { options: { "max-file": "5", "max-size": "1m" } },
  });
  expect(inherited).toEqual(inheritedBefore);
  expect(overlay).toEqual(overlayBefore);
  expect(merged.command).not.toBe(overlay.command);
  expect(merged.logging).not.toBe(inherited.logging);
  expect((merged.logging as { options: object }).options).not.toBe(overlay.logging.options);
});

it("uses the same inherited Compose map in a mesh E2E service", () => {
  const build = { app: {}, prod: { "override-compose": "prod.yml" }, e2e: { "override-compose": "e2e.yml" } };
  const files = {
    "api/prod.yml": { services: { app: { healthcheck: { interval: "3s", timeout: "2s" } } } },
    "api/e2e.yml": { services: { app: { healthcheck: { start_period: "20s" } } } },
    "tester.yml": { services: { runner: { image: "alpine", command: ["true"] } } },
  };
  const meshRoot = meshFixture({
    services: { api: { path: "api" } }, tester: { compose: "tester.yml", service: "runner" },
  }, { api: build }, files);
  const standaloneRoot = fixture(build, {
    "prod.yml": files["api/prod.yml"], "e2e.yml": files["api/e2e.yml"],
  });
  expect(compileMesh("e2e", meshRoot).compose.services.api!.healthcheck)
    .toEqual(compileService("e2e", standaloneRoot).compose.services.app!.healthcheck);
});

it.each([
  { build: { target: "dev" } },
  { healthcheck: { test: ["CMD", "true"] } },
  { healthcheck: { disable: true } },
  { environment: { EXEC_MODE: "test" } },
])("still rejects Builder-owned Compose fields in overrides: %j", (app) => {
  const root = fixture(
    { app: {}, prod: { "override-compose": "bad.yml" } },
    { "bad.yml": { services: { app } } },
  );
  expect(() => compileService("prod", root)).toThrow();
});
