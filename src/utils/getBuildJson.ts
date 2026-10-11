import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { NotFoundError } from "../errors/NotFoundError.js";
import { ScriptError } from "../errors/ScriptError.js";
import { ConfigError } from "../errors/ConfigError.js";
import { buildJsonSchema } from "../core/buildSchema.js";
import type { BuildJson } from "../types/index.js";
import { errorMessage } from "./errorMessage.js";
import { resolveProjectDir } from "./paths.js";
export const getBuildJson = (projectDir: string = process.cwd()): BuildJson => {
 const absProjectDir = resolveProjectDir(projectDir), buildJsonPath = path.join(absProjectDir, "build.json");
 if (!existsSync(buildJsonPath)) throw new NotFoundError(`Build JSON file not found at ${buildJsonPath}. Please make sure build.json exists in the project root.`);
 let rawData: string; try { rawData = readFileSync(buildJsonPath, "utf-8"); } catch (error: unknown) { throw new ScriptError(`Failed to read build.json at ${buildJsonPath}: ${errorMessage(error)}`); }
 let parsed: unknown; try { parsed = JSON.parse(rawData); } catch (error: unknown) { throw new ScriptError(`Failed to parse build.json at ${buildJsonPath}: ${errorMessage(error)}`); }
 const result = buildJsonSchema.safeParse(parsed);
 if (!result.success) { const reason = result.error.issues.map(issue => `${issue.path.join(".") || "<root>"}: ${issue.message}`).join("; "); throw new ConfigError({ sourceFile: buildJsonPath, configPath: "<root>", composition: "service", reason: `Invalid build.json: ${reason}` }); }
 return result.data as BuildJson;
};
