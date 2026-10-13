# Exact regression tests to add before source changes

Create `tests/conformance/v220-audit2-materialized-files.test.ts` with the code below. Run each named red gate in `PLAN.md` **before** touching its implementation. These tests use temporary fixtures, `validationMode: true`, and no Docker daemon. Do not make a test pass by weakening an assertion. Existing fixture cleanup removes every temporary project after each case.

```ts
import { mkdirSync } from "node:fs";
import path from "node:path";
import { afterEach, expect, it } from "vitest";
import { ConfigError } from "../../src/errors/ConfigError.js";
import { compileMeshComposition } from "../../src/core/mesh/v2/compileMeshComposition.js";
import { compileServiceComposition } from "../../src/core/composition/compileServiceComposition.js";
import { cleanupFixtures, fixture, meshFixture, write } from "./fixture.js";

afterEach(cleanupFixtures);

function expectConfigError(
  action: () => unknown,
  sourceFile: string,
  configPath: string,
  composition: "service" | "mesh",
): void {
  let caught: unknown;
  try { action(); } catch (error) { caught = error; }
  expect(caught).toBeInstanceOf(ConfigError);
  const error = caught as ConfigError;
  expect(error.context).toMatchObject({
    sourceFile,
    configPath,
    composition,
  });
}

function globalTesterRoot(testerCompose: object): string {
  return meshFixture(
    {
      services: { api: { path: "api" } },
      tester: { compose: "e2e/tester.yml", service: "runner" },
    },
    { api: { app: {} } },
    { "e2e/tester.yml": testerCompose },
  );
}

function dependencyRoot(owner: object): string {
  return fixture(
    {
      app: {},
      dependencies: {
        store: {
          compose: "d.yml",
          endpoints: {
            api: { service: "owner", port: 3000, primary: true },
          },
        },
      },
    },
    { "d.yml": { services: { owner } } },
  );
}

// B2-01: selected global tester resources are part of the E2E composition.
it("B2-01 rejects a missing global tester secret payload", () => {
  const root = globalTesterRoot({
    services: { runner: { image: "alpine:latest", secrets: ["token"] } },
    secrets: { token: { file: "./missing-token.txt" } },
  });
  expectConfigError(
    () => compileMeshComposition("e2e", root, { validationMode: true }),
    path.join(root, "e2e/tester.yml"),
    "secrets.token.file",
    "mesh",
  );
});

it("B2-01 rejects a directory instead of a tester config file", () => {
  const root = globalTesterRoot({
    services: { runner: { image: "alpine:latest", configs: ["settings"] } },
    configs: { settings: { file: "./payload-dir" } },
  });
  mkdirSync(path.join(root, "e2e/payload-dir"));
  expectConfigError(
    () => compileMeshComposition("e2e", root, { validationMode: true }),
    path.join(root, "e2e/tester.yml"),
    "configs.settings.file",
    "mesh",
  );
});

it("B2-01 resolves tester payloads from the tester YAML directory", () => {
  const root = globalTesterRoot({
    services: { runner: { image: "alpine:latest", secrets: ["token"] } },
    secrets: { token: { file: "./token.txt" } },
  });
  write(root, "e2e/token.txt", "present");
  expect(() => compileMeshComposition("e2e", root, { validationMode: true }))
    .not.toThrow();
});

it("B2-01 ignores E2E-only tester resources in ordinary mesh prod", () => {
  const root = globalTesterRoot({
    services: { runner: { image: "alpine:latest", secrets: ["token"] } },
    secrets: { token: { file: "./missing-token.txt" } },
  });
  expect(() => compileMeshComposition("prod", root, { validationMode: true }))
    .not.toThrow();
});

// B2-02: active app overrides can define app-consumed configs and secrets.
it("B2-02 rejects a missing file-backed config in an active app override", () => {
  const root = fixture(
    { app: {}, prod: { "override-compose": "overrides/prod.yml" } },
    { "overrides/prod.yml": {
      services: { app: { configs: ["settings"] } },
      configs: { settings: { file: "./missing-settings.txt" } },
    } },
  );
  expectConfigError(
    () => compileServiceComposition("prod", root, { validationMode: true }),
    path.join(root, "overrides/prod.yml"),
    "configs.settings.file",
    "service",
  );
});

it("B2-02 rejects a missing file-backed secret in an active app override", () => {
  const root = fixture(
    { app: {}, prod: { "override-compose": "overrides/prod.yml" } },
    { "overrides/prod.yml": {
      services: { app: { secrets: ["password"] } },
      secrets: { password: { file: "./missing-password.txt" } },
    } },
  );
  expectConfigError(
    () => compileServiceComposition("prod", root, { validationMode: true }),
    path.join(root, "overrides/prod.yml"),
    "secrets.password.file",
    "service",
  );
});

it("B2-02 resolves nested override payloads from the service project root", () => {
  const root = fixture(
    { app: {}, prod: { "override-compose": "overrides/prod.yml" } },
    { "overrides/prod.yml": {
      services: { app: { configs: ["settings"] } },
      configs: { settings: { file: "./settings.txt" } },
    } },
  );
  write(root, "settings.txt", "present");
  expect(() => compileServiceComposition("prod", root, { validationMode: true }))
    .not.toThrow();
});

it("B2-02 does not materialize a prod-only override in dev", () => {
  const root = fixture(
    { app: {}, prod: { "override-compose": "overrides/prod.yml" } },
    { "overrides/prod.yml": {
      services: { app: { configs: ["settings"] } },
      configs: { settings: { file: "./missing-settings.txt" } },
    } },
  );
  expect(() => compileServiceComposition("dev", root, { validationMode: true }))
    .not.toThrow();
});

// B2-03: local Docker builds need a real context and Dockerfile.
it("B2-03 rejects a missing materialized dependency build context", () => {
  const root = dependencyRoot({
    build: { context: "./missing-context" },
    healthcheck: { test: ["CMD", "true"] },
  });
  expectConfigError(
    () => compileServiceComposition("prod", root, { validationMode: true }),
    path.join(root, "d.yml"),
    "services.owner.build.context",
    "service",
  );
});

it("B2-03 rejects a missing Dockerfile in an existing dependency context", () => {
  const root = dependencyRoot({
    build: { context: "./build-context", dockerfile: "missing.Dockerfile" },
    healthcheck: { test: ["CMD", "true"] },
  });
  write(root, "build-context/.keep", "");
  expectConfigError(
    () => compileServiceComposition("prod", root, { validationMode: true }),
    path.join(root, "d.yml"),
    "services.owner.build.dockerfile",
    "service",
  );
});

it("B2-03 rejects a missing global tester build context", () => {
  const root = globalTesterRoot({
    services: { runner: { build: { context: "./missing-context" } } },
  });
  expectConfigError(
    () => compileMeshComposition("e2e", root, { validationMode: true }),
    path.join(root, "e2e/tester.yml"),
    "services.runner.build.context",
    "mesh",
  );
});

it("B2-03 accepts present local build inputs", () => {
  const root = dependencyRoot({
    build: { context: "./build-context" },
    healthcheck: { test: ["CMD", "true"] },
  });
  write(root, "build-context/Dockerfile", "FROM alpine:latest\n");
  expect(() => compileServiceComposition("prod", root, { validationMode: true }))
    .not.toThrow();
});

it("B2-03 does not require local files for a remote build context", () => {
  const root = dependencyRoot({
    build: { context: "https://example.invalid/source.git" },
    healthcheck: { test: ["CMD", "true"] },
  });
  expect(() => compileServiceComposition("prod", root, { validationMode: true }))
    .not.toThrow();
});

it("B2-03 ignores a suppressed local dependency build context", () => {
  const root = meshFixture(
    { services: {
      consumer: { path: "consumer", dependencies: { store: "provider" } },
      provider: { path: "provider" },
    } },
    {
      consumer: {
        app: {},
        dependencies: {
          store: {
            compose: "d.yml",
            endpoints: {
              api: { service: "owner", port: 3000, primary: true },
            },
          },
        },
      },
      provider: {
        app: { endpoints: {
          api: { port: 3000, primary: true },
        } },
      },
    },
    { "consumer/d.yml": { services: { owner: {
      build: { context: "./missing-context" },
      healthcheck: { test: ["CMD", "true"] },
    } } } },
  );
  expect(() => compileMeshComposition("prod", root, { validationMode: true }))
    .not.toThrow();
});

it("B2-03 ignores an inert dependency build context", () => {
  const root = fixture(
    { app: {}, dependencies: { unused: { compose: "d.yml" } } },
    { "d.yml": { services: { worker: {
      build: { context: "./missing-context" },
    } } } },
  );
  expect(() => compileServiceComposition("prod", root, { validationMode: true }))
    .not.toThrow();
});
```

After the three red gates have been recorded and their matching fixes are green, add narrowly scoped controls for file-backed `external: true` and inline `content` resources, and for `build.dockerfile_inline`, if the Compose grammar in this repository permits those forms. They should not be mistaken for missing local file paths. A failed control caused by fixture syntax is not evidence of a product bug; repair the fixture first.
