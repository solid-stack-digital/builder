import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { NotFoundError } from "../errors/NotFoundError.js";
import { ScriptError } from "../errors/ScriptError.js";
import type { BuildJson } from "../types/index.js";

export const getBuildJson = (projectDir: string = process.cwd()): BuildJson => {
  const buildJsonPath = path.join(projectDir, "build.json");

  if (!existsSync(buildJsonPath)) {
    throw new NotFoundError(
      `Build JSON file not found at ${buildJsonPath}. Please make sure build.json exists in the project root.`
    );
  }

  let buildJson: Record<string, any>;

  try {
    const rawData = readFileSync(buildJsonPath, "utf-8");
    buildJson = JSON.parse(rawData);
  } catch (error) {
    throw new ScriptError(
      `Failed to parse build.json: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  // Detect services, check if depends_on is an array, and convert it to the long-form object syntax
  if (buildJson && typeof buildJson === "object" && "services" in buildJson) {
    const services = buildJson.services;

    if (services && typeof services === "object") {
      for (const serviceConfig of Object.values(services)) {
        if (
          serviceConfig &&
          typeof serviceConfig === "object" &&
          "depends_on" in serviceConfig
        ) {
          const dependsOn = (serviceConfig as any).depends_on;

          if (Array.isArray(dependsOn)) {
            (serviceConfig as any).depends_on = dependsOn.reduce(
              (acc: Record<string, { condition: string }>, dep: string) => {
                acc[dep] = { condition: "service_started" };
                return acc;
              },
              {}
            );
          }
        }
      }
    }
  }

  return buildJson;
};
