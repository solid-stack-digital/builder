import fs from "node:fs";
import path from "node:path";
import { zodToJsonSchema } from "zod-to-json-schema";
import { buildJsonSchema } from "../src/core/buildSchema.js";
import { meshSchema } from "../src/core/mesh/meshSchema.js";

const outputDir = path.resolve(process.cwd(), "schemas");
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

// 1. Generate mesh.json schema
const meshJsonSchema = zodToJsonSchema(meshSchema, {
  name: "MeshConfig",
  $refStrategy: "none",
});

fs.writeFileSync(
  path.join(outputDir, "mesh-schema.json"),
  JSON.stringify(meshJsonSchema, null, 2)
);

// 2. Generate build.json schema
const buildSchemaOutput = zodToJsonSchema(buildJsonSchema, {
  name: "BuildJson",
  $refStrategy: "none",
});

fs.writeFileSync(
  path.join(outputDir, "build-schema.json"),
  JSON.stringify(buildSchemaOutput, null, 2)
);

console.log("✅ JSON Schemas generated successfully in /schemas");
