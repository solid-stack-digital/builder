import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { NotFoundError } from "../../errors/NotFoundError.js";
import { ScriptError } from "../../errors/ScriptError.js";
import { errorMessage } from "../../utils/errorMessage.js";
import { resolveProjectDir } from "../../utils/paths.js";
import { checkMeshJson } from "./checkers/checkMeshJson.js";
import type { MeshConfig } from "./types.js";

export function getMeshJson(projectDir: string = process.cwd()): MeshConfig {
  const absDir = resolveProjectDir(projectDir);
  const meshPath = path.resolve(absDir, "mesh.json");

  if (!existsSync(meshPath)) {
    throw new NotFoundError(`mesh.json not found in directory: ${absDir}`);
  }

  let content: string;
  try {
    content = readFileSync(meshPath, "utf-8");
  } catch (err: unknown) {
    throw new ScriptError(
      `Failed to read mesh.json at ${meshPath}: ${errorMessage(err)}`
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch (err: unknown) {
    throw new ScriptError(
      `Failed to parse mesh.json at ${meshPath}: ${errorMessage(err)}`
    );
  }

  if (!parsed || typeof parsed !== "object") {
    throw new ScriptError(`Invalid mesh.json: root must be an object.`);
  }

  const meshConfig = parsed as MeshConfig;
  checkMeshJson(meshConfig);

  return meshConfig;
}
