import fs from "node:fs";
import path from "node:path";
import { zodToJsonSchema } from "zod-to-json-schema";
import { buildJsonSchema } from "../src/core/buildSchema.js";
import { BUILDER_IDENTIFIER_PATTERN, RESERVED_MESH_SERVICE_NAMES } from "../src/core/config/constants.js";
import { meshSchema } from "../src/core/mesh/meshSchema.js";

const outputDir = path.resolve(process.cwd(), "schemas");
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

// 1. Generate mesh.json schema
const meshJsonSchema = zodToJsonSchema(meshSchema, {
  name: "MeshJsonV2",
  $refStrategy: "none",
});

// Zod refinements are not serializable; retain runtime name constraints explicitly.
const serviceNameJsonSchema = {
  allOf: [
    { type: "string", pattern: BUILDER_IDENTIFIER_PATTERN.source },
    { not: { enum: [...RESERVED_MESH_SERVICE_NAMES] } },
  ],
};
const root = (meshJsonSchema as any).definitions.MeshJsonV2;
for (const object of [root, ...["dev", "prod", "test", "e2e"].map(stage => root.properties[stage])]) {
  const services = object.properties.services;
  services.propertyNames = serviceNameJsonSchema;
  const service = services.additionalProperties;
  if (service?.properties?.dependencies) {
    service.properties.dependencies.additionalProperties = serviceNameJsonSchema;
  }
  if (service?.properties?.dependsOn) {
    service.properties.dependsOn.items = serviceNameJsonSchema;
  }
}

fs.writeFileSync(
  path.join(outputDir, "mesh-schema.json"),
  JSON.stringify(meshJsonSchema, null, 2)
);

// 2. Generate build.json schema
const buildSchemaOutput = zodToJsonSchema(buildJsonSchema, {
  name: "BuildJsonV2",
  $refStrategy: "none",
});

fs.writeFileSync(
  path.join(outputDir, "build-schema.json"),
  JSON.stringify(buildSchemaOutput, null, 2)
);

console.log("✅ JSON Schemas generated successfully in /schemas");
