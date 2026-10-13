import { mkdirSync } from "node:fs";
import path from "node:path";
import { afterEach, expect, it } from "vitest";
import {
  cleanupFixtures,
  compileMesh,
  compileService,
  dep,
  fixture,
  meshFixture,
  ownerBundle,
  write,
} from "./fixture.js";

afterEach(cleanupFixtures);

function expectAllDependenciesHealthy(compose: {
  services: Record<string, { depends_on?: unknown }>;
}): void {
  for (const [serviceName, service] of Object.entries(compose.services)) {
    if (service.depends_on === undefined) continue;
    expect(Array.isArray(service.depends_on), serviceName).toBe(false);
    for (const [target, options] of Object.entries(
      service.depends_on as Record<string, { condition?: string }>,
    )) {
      expect(options.condition, `${serviceName} -> ${target}`).toBe("service_healthy");
    }
  }
}

it("BF-01 tester short depends_on compiles to healthy readiness", () => {
  const root = meshFixture(
    {
      services: { api: { path: "api" } },
      tester: { compose: "tester.yml", service: "runner" },
    },
    { api: { app: {} } },
    {
      "tester.yml": {
        services: {
          helper: {
            image: "alpine:latest",
            healthcheck: { test: ["CMD", "true"] },
          },
          runner: { image: "alpine:latest", depends_on: ["helper"] },
        },
      },
    },
  );
  const compose = compileMesh("e2e", root).compose;
  expect(compose.services["mesh-tester--runner"]?.depends_on).toMatchObject({
    "mesh-tester--helper": { condition: "service_healthy" },
    api: { condition: "service_healthy" },
  });
  expectAllDependenciesHealthy(compose);
});

it("BF-01 dependency owner short depends_on compiles to healthy readiness", () => {
  const root = fixture(
    {
      app: {},
      dependencies: {
        cache: dep("cache.yml", "owner", 6379),
        store: {
          ...dep("store.yml", "owner", 6380),
          dependsOn: ["dependencies.cache"],
        },
      },
    },
    {
      "cache.yml": ownerBundle(),
      "store.yml": {
        services: {
          owner: {
            image: "alpine:latest",
            healthcheck: { test: ["CMD", "true"] },
            depends_on: ["helper"],
          },
          helper: {
            image: "alpine:latest",
            healthcheck: { test: ["CMD", "true"] },
          },
        },
      },
    },
  );
  const compose = compileService("prod", root).compose;
  expect(compose.services["dep--store--owner"]?.depends_on).toMatchObject({
    "dep--store--helper": { condition: "service_healthy" },
    "dep--cache--owner": { condition: "service_healthy" },
  });
  expectAllDependenciesHealthy(compose);
});

it("BF-01 normalizes untouched helper edges and long-form conditions", () => {
  const root = fixture({
    app: {},
    dependencies: { store: dep("d.yml", "owner", 3000) },
  }, {
    "d.yml": {
      services: {
        owner: {
          image: "alpine:latest",
          healthcheck: { test: ["CMD", "true"] },
          depends_on: { sidecar: { condition: "service_started", required: true } },
        },
        helper: {
          image: "alpine:latest",
          depends_on: ["sidecar"],
        },
        completed: {
          image: "alpine:latest",
          depends_on: { sidecar: { condition: "service_completed_successfully" } },
        },
        sidecar: {
          image: "alpine:latest",
          healthcheck: { test: ["CMD", "true"] },
        },
      },
    },
  });
  const compose = compileService("prod", root).compose;
  expect(compose.services["dep--store--owner"]?.depends_on).toMatchObject({
    "dep--store--sidecar": { condition: "service_healthy", required: true },
  });
  expect(compose.services["dep--store--helper"]?.depends_on).toMatchObject({
    "dep--store--sidecar": { condition: "service_healthy" },
  });
  expect(compose.services["dep--store--completed"]?.depends_on).toMatchObject({
    "dep--store--sidecar": { condition: "service_healthy" },
  });
  expectAllDependenciesHealthy(compose);
});

it("BF-03 rejects a missing file-backed config in a materialized dependency", () => {
  const root = fixture({
    app: {},
    dependencies: { store: dep("d.yml", "owner", 3000) },
  }, {
    "d.yml": {
      services: {
        owner: {
          image: "alpine:latest",
          healthcheck: { test: ["CMD", "true"] },
          configs: ["settings"],
        },
      },
      configs: { settings: { file: "./missing-file.txt" } },
    },
  });
  expect(() => compileService("prod", root)).toThrow(/configs\.settings\.file|missing-file/);
});

it("BF-03 rejects a missing file-backed secret and a directory-backed config", () => {
  const root = fixture({
    app: {},
    dependencies: { store: dep("d.yml", "owner", 3000) },
  }, {
    "d.yml": {
      services: {
        owner: {
          image: "alpine:latest",
          healthcheck: { test: ["CMD", "true"] },
          secrets: ["credentials"],
        },
      },
      secrets: { credentials: { file: "./missing-secret.txt" } },
    },
  });
  expect(() => compileService("prod", root)).toThrow(/secrets\.credentials\.file/);
  write(root, "d.yml", {
    services: {
      owner: {
        image: "alpine:latest",
        healthcheck: { test: ["CMD", "true"] },
        configs: ["settings"],
      },
    },
    configs: { settings: { file: "./folder" } },
  });
  mkdirSync(path.join(root, "folder"));
  expect(() => compileService("prod", root)).toThrow(/configs\.settings\.file/);
});

it("BF-03 accepts present resources and ignores a substituted local bundle", () => {
  const file = {
    services: {
      owner: {
        image: "alpine:latest",
        healthcheck: { test: ["CMD", "true"] },
        configs: ["settings"],
      },
    },
    configs: { settings: { file: "./settings.txt" } },
  };
  const root = fixture({
    app: {},
    dependencies: { store: dep("d.yml", "owner", 3000) },
  }, { "d.yml": file, "settings.txt": "present" });
  expect(() => compileService("prod", root)).not.toThrow();

  const meshRoot = meshFixture({
    services: {
      consumer: { path: "consumer", dependencies: { store: "provider" } },
      provider: { path: "provider" },
    },
  }, {
    consumer: {
      app: {},
      dependencies: { store: dep("d.yml", "owner", 3000) },
    },
    provider: {
      app: { endpoints: { api: { port: 3000, primary: true, scheme: "http" } } },
    },
  }, { "consumer/d.yml": file });
  expect(() => compileMesh("prod", meshRoot)).not.toThrow();
});
