import { describe, expect, it, vi } from "vitest";
const { unit, e2e } = vi.hoisted(() => ({ unit: vi.fn(), e2e: vi.fn() }));
vi.mock("../../src/core/mesh/runners/runMeshTestUnit.js", () => ({ runMeshTestUnit: unit }));
vi.mock("../../src/core/mesh/runners/runMeshTestE2e.js", () => ({ runMeshTestE2e: e2e }));
import { runMeshTest } from "../../src/core/mesh/runners/runMeshTest.js";
describe("mesh test phases", () => {
  it("stops before global E2E when unit tests fail", async () => { unit.mockResolvedValueOnce(2); expect(await runMeshTest({})).toBe(2); expect(e2e).not.toHaveBeenCalled(); });
  it("runs global E2E after successful unit tests", async () => { unit.mockResolvedValueOnce(0); e2e.mockResolvedValueOnce(0); expect(await runMeshTest({})).toBe(0); expect(e2e).toHaveBeenCalledOnce(); });
});
