import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { NotFoundError } from "../../errors/NotFoundError.js";
import { ScriptError } from "../../errors/ScriptError.js";
import type { MeshConfig } from "./types.js";

export function getMeshJson(projectDir: string = process.cwd()): MeshConfig {
  const meshPath = path.resolve(projectDir, "mesh.json");

  if (!existsSync(meshPath)) {
    throw new NotFoundError(`mesh.json not found in directory: ${projectDir}`);
  }

  let content: string;
  try {
    content = readFileSync(meshPath, "utf-8");
  } catch (err: any) {
    throw new ScriptError(`Failed to read mesh.json: ${err?.message || String(err)}`);
  }

  let parsed: any;
  try {
    parsed = JSON.parse(content);
  } catch (err: any) {
    throw new ScriptError(`Failed to parse mesh.json: ${err?.message || String(err)}`);
  }

  if (!parsed || typeof parsed !== "object") {
    throw new ScriptError(`Invalid mesh.json: root must be an object.`);
  }

  if (!parsed.services || typeof parsed.services !== "object") {
    throw new ScriptError(`Invalid mesh.json: "services" must be a non-empty object.`);
  }

  const serviceKeys = Object.keys(parsed.services);
  if (serviceKeys.length === 0) {
    throw new ScriptError(`Invalid mesh.json: "services" must define at least one service.`);
  }

  return parsed as MeshConfig;
}
