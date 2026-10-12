import type { Environment } from "../../types/index.js";

export function stageOverlayChain(stage: Environment): readonly Environment[] {
  switch (stage) {
    case "dev": return ["dev"];
    case "prod": return ["prod"];
    case "test": return ["test"];
    case "e2e": return ["prod", "e2e"];
  }
}

export function unionStable<T>(base: readonly T[] = [], overlay: readonly T[] = []): T[] {
  return [...new Set([...base, ...overlay])];
}

export function mergeStringMap(base: Record<string, string> | undefined, overlay: Record<string, string> | undefined): Record<string, string> {
  return { ...(base ?? {}), ...(overlay ?? {}) };
}

export function mergeRecordOfObjects<T extends Record<string, unknown>>(base: Record<string, T> | undefined, overlay: Record<string, Partial<T>> | undefined): Record<string, T | Partial<T>> {
  const result: Record<string, T | Partial<T>> = { ...(base ?? {}) };
  for (const [key, value] of Object.entries(overlay ?? {})) result[key] = { ...(result[key] ?? {}), ...value };
  return result;
}
