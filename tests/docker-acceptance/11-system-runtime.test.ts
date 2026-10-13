import { spawnSync } from "node:child_process";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { cleanupFixtures } from "../conformance/fixture.js";
import { builder, runtimeMesh } from "./runtimeFixture.js";

type Run = { status: number | null; output: string; name: string; error?: Error | undefined };
const runs: Record<string, Run> = {};
function runSystem(mode: "success" | "unit-fail" | "e2e-fail"): Run {
  const name = `builder-system-${process.pid}-${mode}`;
  const mesh = {
    name,
    services: { a: { path: "a", publish: ["app.endpoints.http"] }, b: { path: "b", dependsOn: ["a"] } },
    tester: { compose: "e2e/t.yml", service: "runner", env: { TEST_MARKER: "GLOBAL_E2E_MARK", SYSTEM_URL: "${a.app.endpoints.http.public_url}", ...(mode === "e2e-fail" ? { E2E_EXIT: "23" } : {}) } },
  };
  const service = (key: string, ready: number, testExit = 0) => ({ name: `${name}-${key}`, app: { endpoints: { http: { port: 3000, primary: true, scheme: "http", publicPort: "AUTO" } } }, e2e: { app: { env: { READY_AFTER_MS: String(ready) } } }, test: { app: { env: { TEST_EXIT: String(testExit) } } } });
  const root = runtimeMesh(mesh, { a: service("a", 300), b: service("b", 700, mode === "unit-fail" ? 7 : 0) }, { "e2e/t.yml": { services: { setup: { image: "busybox", command: ["sh", "-c", "echo GLOBAL_SETUP_STARTED; while true; do sleep 1; done"] }, runner: { build: { context: ".", dockerfile: "Dockerfile" }, depends_on: { setup: { condition: "service_started" } } }, unrelated: { image: "busybox", command: ["sh", "-c", "echo GLOBAL_UNRELATED_STARTED; while true; do sleep 1; done"] } } } });
  const result = builder(root, ["mesh", "up", "test"], 150000);
  return { status: result.status, output: `${result.stdout}${result.stderr}`, name, error: result.error };
}
function matchingContainers(name: string): string[] {
  const result = spawnSync("docker", ["ps", "-a", "--format", "{{.Names}}"], { encoding: "utf8" });
  return result.stdout.split(/\r?\n/).filter(x => x.includes(name));
}

describe("catalog 11: real aggregate mesh CLI orchestration", () => {
  beforeAll(() => {
    runs.success = runSystem("success");
    runs.unitFail = runSystem("unit-fail");
    runs.e2eFail = runSystem("e2e-fail");
  }, 360000);
  afterAll(cleanupFixtures);
  it("SYS-010 runs all isolated service tests before global E2E", () => {
    const r = runs.success!; expect(r.error).toBeUndefined(); expect(r.status, r.output).toBe(0);
    const first = r.output.indexOf("UNIT_MARK"), firstE2e=r.output.indexOf("E2E_MARK"), second = r.output.indexOf("UNIT_MARK", firstE2e + 1), secondE2e=r.output.indexOf("E2E_MARK",second+1), globalE2e = r.output.indexOf("GLOBAL_E2E_MARK",secondE2e+1);
    expect(first).toBeGreaterThanOrEqual(0); expect(firstE2e).toBeGreaterThan(first);expect(second).toBeGreaterThan(firstE2e);expect(secondE2e).toBeGreaterThan(second);expect(globalE2e).toBeGreaterThan(secondE2e);expect(r.output).toContain("GLOBAL_SETUP_STARTED");expect(r.output).toContain("GLOBAL_UNRELATED_STARTED");
  });
  it("SYS-011 aborts global E2E after required unit failure", () => {
    const r = runs.unitFail!;
    expect(r.status, r.output).toBe(7);
    const firstUnit = r.output.indexOf("UNIT_MARK");
    const serviceE2e = r.output.indexOf("E2E_MARK", firstUnit + 1);
    const failedUnit = r.output.indexOf("UNIT_MARK", serviceE2e + 1);
    expect(firstUnit).toBeGreaterThanOrEqual(0);
    expect(serviceE2e).toBeGreaterThan(firstUnit);
    expect(failedUnit).toBeGreaterThan(serviceE2e);
    expect(r.output.indexOf("E2E_MARK", failedUnit + 1)).toBe(-1);
    expect(r.output).not.toContain("GLOBAL_E2E_MARK");
    expect(r.output).not.toContain("GLOBAL_SETUP_STARTED");
  });
  it("SYS-012 runs global tester after passing standalone service lifecycles", () => {
    const r = runs.success!; expect(r.status, r.output).toBe(0); expect(r.output).toContain("GLOBAL_E2E_MARK"); expect(r.output).toContain("APP_READY");
  });
  it("SYS-013 propagates failing global E2E tester", () => {
    const r = runs.e2eFail!; expect(r.status).toBe(23); expect(r.output).toContain("UNIT_MARK"); expect(r.output).toContain("E2E_MARK");
  });
  it("SYS-014 cleans up successful finite test topology", () => {
    const r = runs.success!; expect(r.status, r.output).toBe(0); expect(matchingContainers(r.name)).toEqual([]);
  });
  it("SYS-015 cleans up failed finite test topology", () => {
    const r = runs.e2eFail!; expect(r.status).toBe(23); expect(matchingContainers(r.name)).toEqual([]);
  });
});
