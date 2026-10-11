import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { cleanupFixtures } from "./fixture.js";
import { builder, runtimeService } from "./runtimeFixture.js";

type Outcome = { status: number | null; output: string; error?: Error | undefined };
const outcome = (result: ReturnType<typeof builder>): Outcome => ({ status: result.status, output: `${result.stdout}${result.stderr}`, error: result.error });
const runs: Record<string, Outcome> = {};

describe("catalog 06: real standalone CLI orchestration", () => {
  beforeAll(() => {
    runs.success = outcome(builder(runtimeService({ e2e: { app: { env: { READY_AFTER_MS: "800" } } } }), ["service", "up", "test"]));
    runs.unitFail = outcome(builder(runtimeService({ test: { app: { env: { TEST_EXIT: "7" } } } }), ["service", "up", "test"]));
    runs.e2eFail = outcome(builder(runtimeService({ tester: { env: { APP_URL: "${app.endpoints.http.public_url}", E2E_EXIT: "23" } } }), ["service", "up", "test"]));
    runs.delayed = outcome(builder(runtimeService({ e2e: { app: { env: { READY_AFTER_MS: "1400" } } } }), ["service", "up", "test-e2e"]));
  }, 240000);
  afterAll(cleanupFixtures);
  it("SVC-006 runs isolated unit before integrated E2E", () => {
    const r = runs.success!; expect(r.error).toBeUndefined(); expect(r.status, r.output).toBe(0);
    expect(r.output.indexOf("UNIT_MARK")).toBeGreaterThanOrEqual(0);
    expect(r.output.indexOf("E2E_MARK")).toBeGreaterThan(r.output.indexOf("UNIT_MARK"));
  });
  it("SVC-007 stops before E2E after unit failure", () => {
    const r = runs.unitFail!; expect(r.status).not.toBe(0); expect(r.output).toContain("UNIT_MARK"); expect(r.output).not.toContain("E2E_MARK");
  });
  it("SVC-008 propagates E2E failure after passing unit phase", () => {
    const r = runs.e2eFail!; expect(r.status).not.toBe(0); expect(r.output).toContain("UNIT_MARK"); expect(r.output).toContain("E2E_MARK");
  });
  it("SVC-026 reports success only after healthy app and finite tester exit zero", () => {
    const r = runs.success!; expect(r.status, r.output).toBe(0); expect(r.output).toContain("APP_READY"); expect(r.output).toContain("E2E_MARK");
  });
  it("SVC-027 propagates tester exit 23", () => {
    const r = runs.e2eFail!; expect(r.status).toBe(23); expect(r.output).toMatch(/23|E2E tests failed/);
  });
  it("SVC-028 waits for readiness across distinct delays", () => {
    for (const r of [runs.success!, runs.delayed!]) { expect(r.status, r.output).toBe(0); expect(r.output).toContain("APP_READY"); expect(r.output).toContain("E2E_MARK"); }
  });
});
