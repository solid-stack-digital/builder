import path from "node:path";
import { ConfigError } from "../../errors/ConfigError.js";
import { isPathInside } from "../../utils/paths.js";
export function resolveInsideProject(projectDir: string, relativePath: string, context: { sourceFile: string; configPath: string; stage?: string }): string {
 if (!relativePath.trim()) throw new ConfigError({ ...context, value: relativePath, reason: "Path must not be empty" });
 const resolved = path.resolve(projectDir, relativePath);
 if (!isPathInside(projectDir, relativePath)) throw new ConfigError({ ...context, value: relativePath, reason: "Path escapes the project directory" });
 return resolved;
}
