import { afterEach, expect, it } from "vitest";
import { cleanupFixtures, compileMesh, compileService, dep, fixture, meshFixture } from "./fixture.js";

afterEach(cleanupFixtures);

it("V211-001 rejects a null app healthcheck override", () => {
  const root = fixture({ app: {}, prod: { "override-compose": "prod.yml" } }, {
    "prod.yml": { services: { app: { healthcheck: null } } },
  });
  expect(() => compileService("prod", root)).toThrow(/healthcheck/i);
});

it("V211-002 rejects a cycle inside a materialized standalone dependency bundle", () => {
  const root = fixture({ app: {}, dependencies: { db: dep("db.yml", "owner") } }, {
    "db.yml": { services: {
      owner: { image: "alpine", healthcheck: { test: ["CMD", "true"] }, depends_on: ["helper"] },
      helper: { image: "alpine", depends_on: ["owner"] },
    } },
  });
  expect(() => compileService("prod", root)).toThrow(/cycl/i);
});

it("V211-003 rejects a cycle inside a global tester bundle", () => {
  const root = meshFixture({ services: { appone: { path: "appone" } }, tester: { compose: "tester.yml", service: "runner" } },
    { appone: { app: {} } },
    { "tester.yml": { services: {
      runner: { image: "alpine", depends_on: ["helper"] },
      helper: { image: "alpine", depends_on: ["runner"] },
    } } });
  expect(() => compileMesh("e2e", root)).toThrow(/cycl/i);
});

it("V211-001 control accepts timing-only app healthcheck override", () => {
  const root = fixture({ app: {}, prod: { "override-compose": "prod.yml" } }, {
    "prod.yml": { services: { app: { healthcheck: { interval: "5s" } } } },
  });
  expect(compileService("prod", root).compose.services.app?.healthcheck).toEqual({ interval: "5s" });
});

it.each([
  ["empty array", []],
  ["string", "disabled"],
  ["disable boolean flag", { disable: true }],
])("V211-001 rejects non-timing healthcheck override: %s", (_label, invalidHealthcheck) => {
  const root = fixture({ app: {}, prod: { "override-compose": "prod.yml" } }, {
    "prod.yml": { services: { app: { healthcheck: invalidHealthcheck } } },
  });
  expect(() => compileService("prod", root)).toThrow(/healthcheck/i);
});

it("V211-001 control merges timing fields across prod and e2e overrides", () => {
  const root = fixture({
    app: {},
    prod: { "override-compose": "prod.yml" },
    e2e: { "override-compose": "e2e.yml" },
  }, {
    "prod.yml": { services: { app: { healthcheck: { interval: "5s", timeout: "2s" } } } },
    "e2e.yml": { services: { app: { healthcheck: { timeout: "4s", retries: 3 } } } },
  });
  expect(compileService("e2e", root).compose.services.app?.healthcheck).toEqual({
    interval: "5s",
    timeout: "4s",
    retries: 3,
  });
});

it("V211-002 control accepts acyclic dependency bundle", () => {
  const root = fixture({ app: {}, dependencies: { db: dep("db.yml", "owner") } }, {
    "db.yml": { services: {
      owner: { image: "alpine", healthcheck: { test: ["CMD", "true"] }, depends_on: ["helper"] },
      helper: { image: "alpine" },
    } },
  });
  expect(compileService("prod", root).compose.services["dep--db--owner"]).toBeDefined();
});

it("V211-002 rejects long-form map depends_on cycle inside dependency bundle", () => {
  const root = fixture({ app: {}, dependencies: { db: dep("db.yml", "owner") } }, {
    "db.yml": { services: {
      owner: {
        image: "alpine",
        healthcheck: { test: ["CMD", "true"] },
        depends_on: { helper: { condition: "service_started" } },
      },
      helper: { image: "alpine", depends_on: ["owner"] },
    } },
  });
  expect(() => compileService("prod", root)).toThrow(/cycl/i);
});

it("V211-002 rejects self-edge cycle inside dependency bundle and includes filename in error", () => {
  const root = fixture({ app: {}, dependencies: { db: dep("db.yml", "owner") } }, {
    "db.yml": { services: {
      owner: {
        image: "alpine",
        healthcheck: { test: ["CMD", "true"] },
        depends_on: ["owner"],
      },
    } },
  });
  let thrownError: unknown;
  try {
    compileService("prod", root);
  } catch (err) {
    thrownError = err;
  }
  expect(thrownError).toBeDefined();
  expect(String(thrownError)).toMatch(/cycl/i);
  expect((thrownError as any).context?.sourceFile).toMatch(/db\.yml$/);
});

it("V211-002 control accepts multi-service acyclic dependency bundle", () => {
  const root = fixture({ app: {}, dependencies: { db: dep("db.yml", "owner") } }, {
    "db.yml": { services: {
      owner: {
        image: "alpine",
        healthcheck: { test: ["CMD", "true"] },
        depends_on: ["helper1", "helper2"],
      },
      helper1: { image: "alpine", depends_on: ["helper2"] },
      helper2: { image: "alpine" },
    } },
  });
  const result = compileService("prod", root);
  expect(result.compose.services["dep--db--owner"]).toBeDefined();
  expect(result.compose.services["dep--db--helper1"]).toBeDefined();
  expect(result.compose.services["dep--db--helper2"]).toBeDefined();
});

it("V211-003 control accepts acyclic global tester bundle", () => {
  const root = meshFixture({ services: { appone: { path: "appone" } }, tester: { compose: "tester.yml", service: "runner" } },
    { appone: { app: {} } },
    { "tester.yml": { services: {
      runner: { image: "alpine", depends_on: ["helper"] },
      helper: { image: "alpine" },
    } } });
  expect(compileMesh("e2e", root).testerServiceName).toBeDefined();
});

it("V211-003 rejects long-form map depends_on cycle inside global tester bundle", () => {
  const root = meshFixture(
    { services: { appone: { path: "appone" } }, tester: { compose: "tester.yml", service: "runner" } },
    { appone: { app: {} } },
    { "tester.yml": { services: {
      runner: { image: "alpine", depends_on: { helper: { condition: "service_started" } } },
      helper: { image: "alpine", depends_on: ["runner"] },
    } } },
  );
  expect(() => compileMesh("e2e", root)).toThrow(/cycl/i);
});

it("V211-003 rejects self-edge cycle inside global tester bundle and includes filename in error", () => {
  const root = meshFixture(
    { services: { appone: { path: "appone" } }, tester: { compose: "tester.yml", service: "runner" } },
    { appone: { app: {} } },
    { "tester.yml": { services: {
      runner: { image: "alpine", depends_on: ["runner"] },
    } } },
  );
  let thrownError: unknown;
  try {
    compileMesh("e2e", root);
  } catch (err) {
    thrownError = err;
  }
  expect(thrownError).toBeDefined();
  expect(String(thrownError)).toMatch(/cycl/i);
  expect((thrownError as any).context?.sourceFile).toMatch(/tester\.yml$/);
});

it("V211-003 preserves helper in runner depends_on and injects app service_healthy condition", () => {
  const root = meshFixture(
    { services: { appone: { path: "appone" } }, tester: { compose: "tester.yml", service: "runner" } },
    { appone: { app: {} } },
    { "tester.yml": { services: {
      runner: { image: "alpine", depends_on: ["helper"] },
      helper: { image: "alpine" },
    } } },
  );
  const result = compileMesh("e2e", root);
  const runner = result.compose.services[result.testerServiceName!]!;
  const dependsOn = runner.depends_on as Record<string, { condition?: string }>;
  expect(dependsOn).toHaveProperty("appone");
  expect(dependsOn.appone).toEqual({ condition: "service_healthy" });
  const helperKey = Object.keys(result.compose.services).find(k => k.includes("helper"))!;
  expect(helperKey).toBeDefined();
  expect(dependsOn).toHaveProperty(helperKey);
});
