import type { Environment, RequisiteKind } from "../../types/index.js";
export function stageOverlayChain(stage: Environment): readonly Environment[] { return stage === "e2e" ? ["prod", "e2e"] : [stage]; }
const plain = (value: unknown): value is Record<string,unknown> => value !== null && typeof value === "object" && !Array.isArray(value);
export function mergeEffectiveObject<T>(base: T, patch: unknown): T {
  if (plain(base) && plain(patch)) {
    const result: Record<string,unknown> = structuredClone(base);
    for (const [key, value] of Object.entries(patch)) result[key] = key in result ? mergeEffectiveObject(result[key], value) : structuredClone(value);
    return result as T;
  }
  return structuredClone(patch) as T;
}
export function applyServiceOverlay<T extends Record<string,unknown>>(base: T, patch: Record<string,unknown>): T {
  const without = { ...patch }; delete without.requisites;
  const result = mergeEffectiveObject(base, without) as Record<string,unknown>;
  if (patch.requisites) {
    const edges = { ...((base.requisites as Record<string,RequisiteKind>) ?? {}) };
    for (const [target, kind] of Object.entries(patch.requisites as Record<string,RequisiteKind|false>)) {
      if (kind === false) delete edges[target]; else edges[target] = kind;
    }
    result.requisites = edges;
  }
  return result as T;
}
