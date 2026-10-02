import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { NotFoundError } from "../errors/NotFoundError.js";
import { ScriptError } from "../errors/ScriptError.js";
import type { BuildJson } from "../types/index.js";
import { errorMessage } from "./errorMessage.js";
import { resolveProjectDir } from "./paths.js";
import { normalizeDependsOn } from "./ymlMods/normalizeDependsOn.js";

export const getBuildJson = (projectDir: string = process.cwd()): BuildJson => {
  const absProjectDir = resolveProjectDir(projectDir);
  const buildJsonPath = path.join(absProjectDir, "build.json");

  if (!existsSync(buildJsonPath)) {
    throw new NotFoundError(
      `Build JSON file not found at ${buildJsonPath}. Please make sure build.json exists in the project root.`
    );
  }

  let rawData: string;
  try {
    rawData = readFileSync(buildJsonPath, "utf-8");
  } catch (error: unknown) {
    throw new ScriptError(
      `Failed to read build.json at ${buildJsonPath}: ${errorMessage(error)}`
    );
  }

  let buildJson: unknown;
  try {
    buildJson = JSON.parse(rawData);
  } catch (error: unknown) {
    throw new ScriptError(
      `Failed to parse build.json at ${buildJsonPath}: ${errorMessage(error)}`
    );
  }

  if (!buildJson || typeof buildJson !== "object" || Array.isArray(buildJson)) {
    throw new ScriptError(
      `Invalid build.json at ${buildJsonPath}: root must be a JSON object.`
    );
  }

  const typedBuildJson = buildJson as Record<string, any>;

  // Normalize array-form depends_on in any declared services
  if (typedBuildJson.services && typeof typedBuildJson.services === "object") {
    for (const serviceConfig of Object.values(typedBuildJson.services)) {
      if (serviceConfig && typeof serviceConfig === "object") {
        normalizeDependsOn(serviceConfig);
      }
    }
  }

  return typedBuildJson as BuildJson;
};
