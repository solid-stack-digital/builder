import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { getMeshJson } from "../core/mesh/getMeshJson.js";
import { getBuildJson } from "./getBuildJson.js";
import { resolveProjectDir } from "./paths.js";
import { deriveProjectName } from "./projectName.js";

export interface RunState {
  projectName: string;
  stage: string;
  projectDir: string;
  timestamp: string;
}

export function getRunStatePath(projectDir: string): string {
  return path.resolve(resolveProjectDir(projectDir), ".builder", "run.state");
}

export function writeRunState(
  projectDir: string,
  state: Omit<RunState, "timestamp">
): void {
  try {
    const absDir = resolveProjectDir(projectDir);
    const builderDir = path.resolve(absDir, ".builder");
    if (!existsSync(builderDir)) {
      mkdirSync(builderDir, { recursive: true });
    }
    const fullState: RunState = {
      ...state,
      timestamp: new Date().toISOString(),
    };
    writeFileSync(
      path.resolve(builderDir, "run.state"),
      JSON.stringify(fullState, null, 2),
      "utf-8"
    );
  } catch {
    // Non-critical if writing state file fails
  }
}

export function readRunState(projectDir: string): RunState | null {
  try {
    const statePath = getRunStatePath(projectDir);
    if (!existsSync(statePath)) return null;
    const content = readFileSync(statePath, "utf-8");
    return JSON.parse(content) as RunState;
  } catch {
    return null;
  }
}

export function clearRunState(projectDir: string): void {
  try {
    const statePath = getRunStatePath(projectDir);
    if (existsSync(statePath)) {
      unlinkSync(statePath);
    }
  } catch {
    // Non-critical if removing state file fails
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

export function projectNamesForMeshStage(
  meshDir: string,
  stage: string
): string[] {
  const absDir = resolveProjectDir(meshDir);
  let rawMeshName: string;
  let services: Record<string, { path: string }> = {};

  try {
    const mesh = getMeshJson(absDir);
    rawMeshName = mesh.name || path.basename(absDir);
    services = mesh.services || {};
  } catch {
    rawMeshName = path.basename(absDir);
  }

  const s = stage.toLowerCase();
  if (s === "dev") {
    return [deriveProjectName(rawMeshName, "dev")];
  }
  if (s === "prod") {
    return [deriveProjectName(rawMeshName, "prod")];
  }
  if (s === "test-e2e") {
    return [deriveProjectName(rawMeshName, "e2e")];
  }
  if (s === "test-unit") {
    return Object.values(services).map((svc) => {
      const svcDir = path.resolve(absDir, svc.path);
      return projectNamesForServiceStage(svcDir, "test-unit")[0]!;
    });
  }
  if (s === "test") {
    const list: string[] = [];
    for (const svc of Object.values(services)) {
      const svcDir = path.resolve(absDir, svc.path);
      list.push(...projectNamesForServiceStage(svcDir, "test"));
    }
    list.push(deriveProjectName(rawMeshName, "e2e"));
    return Array.from(new Set(list));
  }
  return [deriveProjectName(rawMeshName, s)];
}
