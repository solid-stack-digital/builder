import type { AppEnvironmentLayer } from "./types.js";

export function selectAppEnvironmentEntries(
  layers: readonly AppEnvironmentLayer[],
  laterKeys: ReadonlySet<string> = new Set(),
): Map<string, AppEnvironmentLayer> {
  const winners = new Map<string, AppEnvironmentLayer>();
  for (const layer of layers) {
    for (const key of Object.keys(layer.values)) winners.set(key, layer);
  }
  for (const key of laterKeys) winners.delete(key);
  return winners;
}
