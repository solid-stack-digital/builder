import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildJsonSchema } from "../src/core/buildSchema.js";
import { meshSchema } from "../src/core/mesh/meshSchema.js";

describe("JSON Schema generation and validation", () => {
  const schemasDir = path.resolve(__dirname, "../schemas");

  it("generated schema files exist and are valid JSON", () => {
    const meshSchemaPath = path.join(schemasDir, "mesh-schema.json");
    const buildSchemaPath = path.join(schemasDir, "build-schema.json");

    expect(fs.existsSync(meshSchemaPath)).toBe(true);
    expect(fs.existsSync(buildSchemaPath)).toBe(true);

    const meshJson = JSON.parse(fs.readFileSync(meshSchemaPath, "utf-8"));
    const buildJson = JSON.parse(fs.readFileSync(buildSchemaPath, "utf-8"));

    expect(meshJson.definitions.MeshConfig).toBeDefined();
    expect(meshJson.definitions.MeshConfig.properties.$schema).toBeDefined();
    expect(meshJson.definitions.MeshConfig.properties.services).toBeDefined();

    expect(buildJson.definitions.BuildJson).toBeDefined();
    expect(buildJson.definitions.BuildJson.properties.$schema).toBeDefined();
    expect(buildJson.definitions.BuildJson.properties.tester).toBeDefined();
    expect(buildJson.definitions.BuildJson.properties.port).toBeDefined();
  });

  it("validates mesh.json with $schema keyword", () => {
    const validMesh = {
      $schema: "../../schemas/mesh-schema.json",
      name: "test-mesh",
      services: {
        auth: {
          path: "./auth",
          port: 3000,
          preservePort: true,
        },
      },
      tester: {
        path: "./e2e",
        envOverrides: {
          AUTH_URL: "${auth.network_url}",
        },
      },
    };

    const result = meshSchema.safeParse(validMesh);
    expect(result.success).toBe(true);
  });

  it("rejects invalid fields in mesh.json due to strict validation", () => {
    const invalidMesh = {
      $schema: "../../schemas/mesh-schema.json",
      services: {
        auth: {
          path: "./auth",
        },
      },
      unknownField: "should-fail",
    };

    const result = meshSchema.safeParse(invalidMesh);
    expect(result.success).toBe(false);
  });

  it("validates build.json with $schema keyword and new fields", () => {
    const validBuild = {
      $schema: "../../schemas/build-schema.json",
      name: "my-service",
      port: 8080,
      dependencies: {
        db: {
          path: "./mocks/db.yml",
        },
      },
      overrides: {
        dev: {
          path: "./overrides/dev.yml",
        },
      },
      tester: {
        envOverrides: {
          DB_URL: "${db.network_url}",
        },
      },
    };

    const result = buildJsonSchema.safeParse(validBuild);
    expect(result.success).toBe(true);
  });

  it("rejects invalid fields in build.json due to strict validation", () => {
    const invalidBuild = {
      $schema: "../../schemas/build-schema.json",
      name: "my-service",
      unknownProperty: true,
    };

    const result = buildJsonSchema.safeParse(invalidBuild);
    expect(result.success).toBe(false);
  });
});
