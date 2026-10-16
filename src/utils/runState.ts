import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { getMeshJson } from "../core/mesh/getMeshJson.js";
import { getBuildJson } from "./getBuildJson.js";
import { resolveProjectDir } from "./paths.js";
import { deriveProjectName } from "./projectName.js";

export interface RunState {
  version: 3;
  projectName: string;
  stage: string;
  projectDir: string;
  timestamp: string;
  composition?: "service" | "mesh";
  configStage?: "dev" | "prod" | "test" | "e2e";
  workflow?: "dev" | "prod" | "test";
  runtimeServiceNames?: string[];
  testerServiceNames?: string[];
  ownedArtifactPaths?: string[];
  allocatedEndpointKeys?: string[];
  anonymousVolumeServices?: string[];
}

export function getRunStatePath(projectDir: string): string {
  return path.resolve(resolveProjectDir(projectDir), ".builder", "run.state");
}

export function writeRunState(
  projectDir: string,
  state: Omit<RunState, "timestamp" | "version">
): void {
  try {
    const absDir = resolveProjectDir(projectDir);
    const builderDir = path.resolve(absDir, ".builder");
    if (!existsSync(builderDir)) {
      mkdirSync(builderDir, { recursive: true });
    }
    const fullState: RunState = {
      ...state,
      version: 3,
      timestamp: new Date().toISOString(),
    };
    const target = path.resolve(builderDir, "run.state");
    const temporary = path.resolve(builderDir, `run.state.${process.pid}.tmp`);
    try {
      writeFileSync(temporary, JSON.stringify(fullState, null, 2), "utf-8");
      renameSync(temporary, target);
    } finally {
      if (existsSync(temporary)) unlinkSync(temporary);
    }
  } catch (error) {
    throw new Error(`Failed to persist Builder run state in ${projectDir}`, {cause:error});
  }
}

export function readRunState(projectDir: string): RunState | null {
  try {
    const statePath = getRunStatePath(projectDir);
    if (!existsSync(statePath)) return null;
    const content = readFileSync(statePath, "utf-8");
    const value: unknown = JSON.parse(content);
    if (!value || typeof value !== "object" || !("projectName" in value) || typeof value.projectName !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(value.projectName) || !("stage" in value) || typeof value.stage !== "string" || !("projectDir" in value) || typeof value.projectDir !== "string") {
      throw new Error("Saved run state is malformed");
    }
    if ("version" in value && value.version !== 2 && value.version !== 3) throw new Error("Saved run state version is unsupported");
    if (path.resolve(value.projectDir) !== resolveProjectDir(projectDir)) throw new Error("Saved run state belongs to another project directory");
    return value as RunState;
  } catch (error) {
    throw new Error(`Cannot read saved Builder run state in ${projectDir}; inspect .builder/run.state before cleanup`, {cause:error});
  }
}

export function clearRunState(projectDir: string): void {
  try {
    const statePath = getRunStatePath(projectDir);
    if (existsSync(statePath)) {
      unlinkSync(statePath);
    }
  } catch (error) {
    throw new Error(`Failed to clear Builder run state in ${projectDir}`, {cause:error});
  }
}

export function projectNamesForServiceStage(
  projectDir: string,
  stage: string
): string[] {
  const absDir = resolveProjectDir(projectDir);
  let rawName: string;
  try {
    const buildJson = getBuildJson(absDir);
    rawName = buildJson.name || path.basename(absDir);
  } catch {
    rawName = path.basename(absDir);
  }

  const s = stage.toLowerCase();
  if (s === "dev") {
    return [deriveProjectName(rawName, "dev")];
  }
  if (s === "prod") {
    return [deriveProjectName(rawName, "prod")];
  }
  if (s === "test-unit") {
    return [deriveProjectName(rawName, "test")];
  }
  if (s === "test-e2e") {
    return [deriveProjectName(rawName, "e2e")];
  }
  if (s === "test") {
    return [
      deriveProjectName(rawName, "test"),
      deriveProjectName(rawName, "e2e"),
    ];
  }
  return [deriveProjectName(rawName, s)];
}

export function projectNamesForMeshStage(meshDir: string, stage: string): string[] {
  const absDir = resolveProjectDir(meshDir);
  let rawMeshName = path.basename(absDir);
  try {
    rawMeshName = getMeshJson(absDir).name || rawMeshName;
  } catch {
    // Recovery can still use saved state and directory-derived identity.
  }
  const s = stage.toLowerCase();
  if (s === "test" || s === "test-e2e") {
    return [deriveProjectName(rawMeshName, "e2e")];
  }
  return [deriveProjectName(rawMeshName, s)];
}
