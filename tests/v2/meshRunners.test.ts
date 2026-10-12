import { afterEach, describe, expect, it, vi } from "vitest";
const { services, e2e } = vi.hoisted(() => ({ services: vi.fn(), e2e: vi.fn() }));
vi.mock("../../src/core/mesh/runners/runMeshServiceTests.js", () => ({ runMeshServiceTests: services }));
vi.mock("../../src/core/mesh/runners/runMeshTestE2e.js", () => ({ runMeshTestE2e: e2e }));
import { runMeshTest } from "../../src/core/mesh/runners/runMeshTest.js";
afterEach(()=>vi.clearAllMocks());
describe("mesh test phases", () => {
  it("stops before global E2E when a service lifecycle fails", async () => { services.mockResolvedValueOnce(2); expect(await runMeshTest({})).toBe(2); expect(e2e).not.toHaveBeenCalled(); });
  it("runs global E2E only after all service lifecycles pass", async () => { services.mockResolvedValueOnce(0); e2e.mockResolvedValueOnce(0); expect(await runMeshTest({})).toBe(0); expect(services).toHaveBeenCalledOnce(); expect(e2e).toHaveBeenCalledOnce(); });
});
