import { afterEach, expect, it, vi } from "vitest";
import { cleanupFixtures, compileMesh, http, meshFixture } from "./fixture.js";
import { runMeshTestUnit } from "../../src/core/mesh/runners/runMeshTestUnit.js";
import { compileServiceComposition } from "../../src/core/composition/compileServiceComposition.js";
import { redactYamlSecrets } from "../../src/utils/redactSecrets.js";

afterEach(() => {
  vi.restoreAllMocks();
  cleanupFixtures();
});

it("V214-001 redacts test-unit debug YAML before writing to console", async () => {
  const secret = "SENTINEL_TOP_SECRET_214";
  const root = meshFixture(
    { services: { api: { path: "api", env: { API_TOKEN: secret } } } },
    { api: { app: {} } },
  );
  const log = vi.spyOn(console, "log").mockImplementation(() => {});
  expect(await runMeshTestUnit({ projectDir: root, debug: true, dryRun: true })).toBe(0);
  const output = log.mock.calls.flat().join("\n");
  expect(output).toContain("API_TOKEN");
  expect(output).toContain("********");
  expect(output).not.toContain(secret);
});

it("V214-001 control non-debug test-unit does not print the secret", async () => {
  const secret = "SENTINEL_TOP_SECRET_214";
  const root = meshFixture(
    { services: { api: { path: "api", env: { API_TOKEN: secret } } } },
    { api: { app: {} } },
  );
  const log = vi.spyOn(console, "log").mockImplementation(() => {});
  expect(await runMeshTestUnit({ projectDir: root, debug: false, dryRun: true })).toBe(0);
  expect(log.mock.calls.flat().join("\n")).not.toContain(secret);
});

it("V214-001 control redactYamlSecrets masks token and password in URL", () => {
  const yaml = `
environment:
  API_TOKEN: my-secret-token
  DATABASE_URL: postgres://user:secretpass@localhost:5432/db
`;
  const redacted = redactYamlSecrets(yaml);
  expect(redacted).toContain("API_TOKEN: ********");
  expect(redacted).not.toContain("my-secret-token");
  expect(redacted).toContain("postgres://user:********@localhost:5432/db");
  expect(redacted).not.toContain("secretpass");
});


it("V214-002 permits the same fixed test port in sequential isolated mesh services", async () => {
  const root = meshFixture(
    {
      services: { alpha: { path: "alpha" }, beta: { path: "beta" } },
      test: { services: {
        alpha: { publish: ["app.endpoints.http"] },
        beta: { publish: ["app.endpoints.http"] },
      } },
    },
    {
      alpha: { app: { endpoints: { http: http(3000, { publicPort: 45214 }) } } },
      beta: { app: { endpoints: { http: http(3000, { publicPort: 45214 }) } } },
    },
  );
  vi.spyOn(console, "log").mockImplementation(() => {});
  await expect(runMeshTestUnit({ projectDir: root, dryRun: true })).resolves.toBe(0);
});

it("V214-002 control each isolated service can publish the same fixed port", () => {
  const root = meshFixture(
    { services: { alpha: { path: "alpha" }, beta: { path: "beta" } } },
    {
      alpha: { app: { endpoints: { http: http(3000, { publicPort: 45214 }) } } },
      beta: { app: { endpoints: { http: http(3000, { publicPort: 45214 }) } } },
    },
  );
  for (const name of ["alpha", "beta"]) {
    const compiled = compileServiceComposition("test", `${root}/${name}`, { validationMode: true });
    expect(compiled.compose.services.app?.ports).toEqual([{ target: 3000, published: 45214, host_ip: "127.0.0.1", protocol: "tcp" }]);
  }
});

it("V214-002 control integrated mesh still rejects simultaneous fixed collisions", () => {
  const root = meshFixture(
    { services: {
      alpha: { path: "alpha", publish: ["app.endpoints.http"] },
      beta: { path: "beta", publish: ["app.endpoints.http"] },
    } },
    {
      alpha: { app: { endpoints: { http: http(3000, { publicPort: 45214 }) } } },
      beta: { app: { endpoints: { http: http(3000, { publicPort: 45214 }) } } },
    },
  );
  expect(() => compileMesh("prod", root)).toThrow(/45214/);
});

it("V214-002 control rejects duplicate fixed port within the same service", async () => {
  const root = meshFixture(
    {
      services: { alpha: { path: "alpha" } },
      test: { services: { alpha: { publish: ["app.endpoints.http", "app.endpoints.metrics"] } } },
    },
    {
      alpha: {
        app: {
          endpoints: {
            http: http(3000, { publicPort: 45214 }),
            metrics: { port: 9090, publicPort: 45214, scheme: "http" },
          },
        },
      },
    },
  );
  await expect(runMeshTestUnit({ projectDir: root, dryRun: true })).rejects.toThrow(/45214/);
});

it("V214-002 control allocates distinct AUTO ports within service and permits sequential services", async () => {
  const root = meshFixture(
    {
      services: { alpha: { path: "alpha" }, beta: { path: "beta" } },
      test: {
        services: {
          alpha: { publish: ["app.endpoints.http", "app.endpoints.metrics"] },
          beta: { publish: ["app.endpoints.http"] },
        },
      },
    },
    {
      alpha: {
        app: {
          endpoints: {
            http: http(3000, { publicPort: "AUTO" }),
            metrics: { port: 9090, publicPort: "AUTO", scheme: "http" },
          },
        },
      },
      beta: {
        app: {
          endpoints: {
            http: http(3000, { publicPort: "AUTO" }),
          },
        },
      },
    },
  );
  expect(await runMeshTestUnit({ projectDir: root, dryRun: true })).toBe(0);
});

