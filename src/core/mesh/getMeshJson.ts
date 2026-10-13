import { assertNoLegacyMeshTest } from "../config/meshStageContract.js";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { NotFoundError } from "../../errors/NotFoundError.js";
import { ScriptError } from "../../errors/ScriptError.js";
import { ConfigError } from "../../errors/ConfigError.js";
import { errorMessage } from "../../utils/errorMessage.js";
import { resolveProjectDir } from "../../utils/paths.js";
import { meshSchema } from "./meshSchema.js";
import type { MeshConfig } from "./types.js";
export function getMeshJson(projectDir: string = process.cwd()): MeshConfig {
 const absDir = resolveProjectDir(projectDir), meshPath = path.resolve(absDir, "mesh.json");
 if (!existsSync(meshPath)) throw new NotFoundError(`mesh.json not found in directory: ${absDir}`);
 let content: string; try { content = readFileSync(meshPath, "utf-8"); } catch (err: unknown) { throw new ScriptError(`Failed to read mesh.json at ${meshPath}: ${errorMessage(err)}`); }
 let parsed: unknown; try { parsed = JSON.parse(content); } catch (err: unknown) { throw new ScriptError(`Failed to parse mesh.json at ${meshPath}: ${errorMessage(err)}`); }
 assertNoLegacyMeshTest(parsed, meshPath);
 const result = meshSchema.safeParse(parsed);
 if (!result.success) { const reason = result.error.issues.map(issue => `${issue.path.join(".") || "<root>"}: ${issue.message}`).join("; "); throw new ConfigError({ sourceFile: meshPath, configPath: "<root>", composition: "mesh", reason: `Invalid mesh.json: ${reason}` }); }
 return result.data as MeshConfig;
}
