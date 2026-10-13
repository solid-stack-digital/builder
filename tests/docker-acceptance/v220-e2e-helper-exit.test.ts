import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { afterEach, expect, it } from "vitest";
import { stringify } from "yaml";
import { cleanupFixtures, compileMesh, dep, fixture, meshFixture, write } from "../conformance/fixture.js";
import { runMeshTestE2e } from "../../src/core/mesh/runners/runMeshTestE2e.js";
import { runTestE2e } from "../../src/core/runners/runTestE2e.js";
import { getRunStatePath } from "../../src/utils/runState.js";

afterEach(cleanupFixtures);

it("BF-01 Docker Compose accepts a compiled short-form tester dependency", () => {
  const root = meshFixture(
    {
      services: { api: { path: "api" } },
      tester: { compose: "tester.yml", service: "runner" },
    },
    { api: { app: {} } },
    { "tester.yml": { services: {
      helper: { image: "alpine:latest", healthcheck: { test: ["CMD", "true"] } },
      runner: { image: "alpine:latest", depends_on: ["helper"] },
    } } },
  );
  const compose = compileMesh("e2e", root).compose;
  const result = spawnSync("docker", [
    "compose", "--project-directory", root, "-f", "-", "config", "--quiet",
  ], { cwd: root, encoding: "utf8", input: stringify(compose) });
  expect(result.status, result.stderr).toBe(0);
});

function globalFixture(command: string[]): string {
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
            command: ["sh", "-c", "sleep 1; echo helper-done"],
          },
          runner: {
            image: "alpine:latest",
            command,
            volumes: ["./runner-output:/output"],
          },
        },
      },
    },
  );
  write(root, "runner-output/.keep", "");
  write(root, "api/Dockerfile", [
    "FROM alpine:latest AS base",
    "FROM base AS dev",
    "HEALTHCHECK --interval=1s --timeout=1s --retries=10 CMD true",
    'CMD ["sh", "-c", "sleep 100"]',
    "FROM base AS test",
    'CMD ["true"]',
    "FROM base AS test-e2e",
    'CMD ["true"]',
    "FROM base AS prod",
    "HEALTHCHECK --interval=1s --timeout=1s --retries=10 CMD true",
    'CMD ["sh", "-c", "sleep 100"]',
    "",
  ].join("\n"));
  return root;
}

it("BF-02 successful helper exit does not stop the global tester", async () => {
  const root = globalFixture(["sh", "-c", "sleep 25; touch /output/finished"]);
  expect(await runMeshTestE2e({ projectDir: root })).toBe(0);
  expect(existsSync(path.join(root, "runner-output/finished"))).toBe(true);
  expect(existsSync(getRunStatePath(root))).toBe(false);
}, 90_000);

it("BF-02 global E2E returns the selected runner's failure status", async () => {
  const root = globalFixture(["sh", "-c", "sleep 3; exit 7"]);
  expect(await runMeshTestE2e({ projectDir: root })).toBe(7);
  expect(existsSync(getRunStatePath(root))).toBe(false);
}, 90_000);

it("BF-02 service E2E waits for its tester after a dependency helper exits", async () => {
  const root = fixture({
    app: {},
    dependencies: { cache: dep("cache.yml", "owner", 3000) },
  }, {
    "cache.yml": {
      services: {
        owner: {
          image: "alpine:latest",
          command: ["sh", "-c", "sleep 100"],
          healthcheck: {
            test: ["CMD", "true"], interval: "1s", timeout: "1s", retries: 10,
          },
        },
        helper: {
          image: "alpine:latest",
          command: ["sh", "-c", "sleep 1; echo helper-done"],
        },
      },
    },
  });
  write(root, "Dockerfile", [
    "FROM alpine:latest AS base",
    "FROM base AS dev",
    "HEALTHCHECK --interval=1s --timeout=1s --retries=10 CMD true",
    'CMD ["sh", "-c", "sleep 100"]',
    "FROM base AS test",
    'CMD ["true"]',
    "FROM base AS test-e2e",
    'CMD ["sh", "-c", "sleep 15; exit 0"]',
    "FROM base AS prod",
    "HEALTHCHECK --interval=1s --timeout=1s --retries=10 CMD true",
    'CMD ["sh", "-c", "sleep 100"]',
    "",
  ].join("\n"));
  expect(await runTestE2e({ projectDir: root, debug: false, detach: false })).toBe(0);
  expect(existsSync(getRunStatePath(root))).toBe(false);
}, 90_000);
