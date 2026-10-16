import path from "node:path";
import { ConfigError } from "../../errors/ConfigError.js";
import type { MeshConfig, MeshConfigStage, MeshSourceService, MeshSourceOverlay } from "../mesh/types.js";
import type { TesterService, TesterOverlay } from "../../types/index.js";
import { assertMeshConfigStage, meshStageOverlayChain } from "./meshStageContract.js";
import { mergeEffectiveObject } from "./stageMerge.js";
import type { EffectiveMeshConfig, EffectiveMeshSource, Origin } from "./types.js";
const originFor = (sourceFile: string, configPath: string, layer: "base"|MeshConfigStage): Origin => ({ sourceFile, configPath, projectDir: path.dirname(sourceFile), scope: "mesh", layer });
export function resolveMeshStage(mesh: MeshConfig, stage: MeshConfigStage, sourceFile: string): EffectiveMeshConfig {
  assertMeshConfigStage(stage, sourceFile);
  const sources: Record<string,EffectiveMeshSource> = {};
  const baseSources = Object.keys(mesh.services).filter(name => name !== "tester").sort();
  const testerLayers: EffectiveMeshConfig["testerLayers"] = [];
  let tester = structuredClone(mesh.services.tester) as TesterService;
  testerLayers.push({ stage: "base", services: { tester: structuredClone(tester) as unknown as Record<string,unknown> }, origin: originFor(sourceFile, "services.tester", "base") });
  for (const name of baseSources) {
    const entry = mesh.services[name] as MeshSourceService;
    sources[name] = { source: entry.source, publish: [...(entry.publish ?? [])], extendsLayers: entry.extends ? [{ layer: "base", patches: structuredClone(entry.extends) as Record<string,Record<string,unknown>>, origin: originFor(sourceFile, `services.${name}.extends`, "base") }] : [], origin: originFor(sourceFile, `services.${name}`, "base") };
  }
  for (const layer of meshStageOverlayChain(stage)) for (const [name, patch] of Object.entries(mesh[layer]?.services ?? {}).sort(([a],[b]) => a.localeCompare(b))) {
    if (name === "tester") {
      const next = patch as TesterOverlay;
      if (next.compose !== undefined && next.compose !== tester.compose) throw new ConfigError({ sourceFile, configPath: `${layer}.services.tester.compose`, stage, composition: "mesh", reason: "compose is immutable; previous services.tester.compose", value: next.compose });
      tester = mergeEffectiveObject(tester, next);
      testerLayers.push({ stage: layer, services: { tester: structuredClone(next) as unknown as Record<string,unknown> }, origin: originFor(sourceFile, `${layer}.services.tester`, layer) });
      continue;
    }
    const next = patch as MeshSourceOverlay;
    const old = sources[name];
    if (old && next.source !== undefined && next.source !== old.source) throw new ConfigError({ sourceFile, configPath: `${layer}.services.${name}.source`, stage, composition: "mesh", reason: `source is immutable; previous ${old.origin.configPath}.source`, value: next.source });
    if (!old && (!next.source || !next.source.trim())) throw new ConfigError({ sourceFile, configPath: `${layer}.services.${name}.source`, stage, composition: "mesh", reason: "Stage-introduced source requires source" });
    const entry: EffectiveMeshSource = old ?? { source: next.source!, publish: [], extendsLayers: [], origin: originFor(sourceFile, `${layer}.services.${name}`, layer) };
    if (next.publish !== undefined) entry.publish = structuredClone(next.publish);
    if (next.extends) entry.extendsLayers.push({ layer, patches: structuredClone(next.extends) as Record<string,Record<string,unknown>>, origin: originFor(sourceFile, `${layer}.services.${name}.extends`, layer) });
    sources[name] = entry;
  }
  return { name: mesh.name, services: sources, tester, testerLayers, sourceFile, projectDir: path.dirname(sourceFile), baseSources, raw: mesh };
}
