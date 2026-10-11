import { afterEach, describe, expect, it } from "vitest";
import { compileMeshComposition } from "../../src/core/mesh/v2/compileMeshComposition.js";
import { cleanupMeshes, createMesh } from "./meshFixture.js";
afterEach(cleanupMeshes);
describe("global mesh tester", () => {
  it("uses the explicit runner and includes only its helper closure", () => {
    const root = createMesh(
      { tester: { compose: "e2e/compose.yml", service: "playwright", env: { URL: "${gateway.app.endpoints.http.public_url}" } }, services: { gateway: { path: "gateway", publish: ["app.endpoints.http"] } } },
      { gateway: { app: { endpoints: { http: { port: 3000, publicPort: 8123, primary: true, scheme: "http" } } } } },
      { "e2e/compose.yml": `services:
  setup:
    image: alpine
  playwright:
    image: playwright
    depends_on:
      setup:
        condition: service_completed_successfully
  unrelated:
    image: busybox
` },
    );
    const c = compileMeshComposition("e2e", root);
    expect(c.testerServiceName).toBe("mesh-tester--playwright");
    expect(c.compose.services).toHaveProperty("mesh-tester--setup");
    expect(c.compose.services).not.toHaveProperty("mesh-tester--unrelated");
    expect(c.compose.services["mesh-tester--playwright"]?.network_mode).toBe("host");
    expect(c.compose.services["mesh-tester--setup"]?.network_mode).toBeUndefined();
    expect(c.compose.services["mesh-tester--playwright"]?.environment).toMatchObject({ URL: "http://127.0.0.1:8123" });
    expect((c.compose.services["mesh-tester--playwright"]?.depends_on as any).gateway.condition).toBe("service_healthy");
  });
  it("rejects network endpoint references in global tester env", () => {
    const root = createMesh(
      { tester: { compose: "e2e.yml", service: "runner", env: { URL: "${api.app.endpoints.http.network_url}" } }, services: { api: { path: "api" } } },
      { api: { app: { endpoints: { http: { port: 8, primary: true } } } } },
      { "e2e.yml": `services:
  runner:
    image: x
` },
    );
    expect(() => compileMeshComposition("e2e", root)).toThrow(/public/i);
  });
});
