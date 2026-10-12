import { describe, expect, it } from "vitest";
import { assertTesterReferencesArePublic, collectBuilderReferences, interpolateBuilderReferences } from "../../src/core/config/references.js";

const buildContext = { sourceFile: "/project/build.json", configPath: "app.env.URL", stage: "dev", composition: "service" as const };
const meshContext = { sourceFile: "/project/mesh.json", configPath: "services.api.env.URL", stage: "e2e", composition: "mesh" as const };

describe("V2 endpoint references", () => {
  it("parses all eight properties in build and mesh scope", () => {
    for (const property of ["network_host", "network_port", "network_address", "network_url", "public_host", "public_port", "public_address", "public_url"]) {
      expect(collectBuilderReferences(`x=${"${"}app.endpoints.http.${property}}`, "build", buildContext)).toHaveLength(1);
      expect(collectBuilderReferences(`${"${"}api.dependencies.db.endpoints.redis.${property}}`, "mesh", meshContext)).toHaveLength(1);
    }
  });

  it("supports embedded refs and escaped dollars; rejects invalid grammar and tester network refs", () => {
    expect(interpolateBuilderReferences("url=$${literal} ${app.endpoints.http.network_port}", "build", () => "3000", buildContext)).toBe("url=${literal} 3000");
    expect(() => collectBuilderReferences("${services.api.app.endpoints.http.public_url}", "mesh", meshContext)).toThrow();
    expect(() => assertTesterReferencesArePublic({ URL: "${app.endpoints.http.network_url}" }, "build", { ...buildContext, configPath: "tester.env" })).toThrow();
  });
});
