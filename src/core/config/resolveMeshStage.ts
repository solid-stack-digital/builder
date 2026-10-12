import { ConfigError } from "../../errors/ConfigError.js";
import { RESERVED_MESH_SERVICE_NAMES, BUILDER_IDENTIFIER_PATTERN } from "./constants.js";
import { assertAcyclicGraph, type LifecycleGraph } from "./lifecycleGraph.js";
import { mergeStringMap, stageOverlayChain, unionStable } from "./stageMerge.js";
import type { EffectiveMeshConfig } from "./types.js";
import type { MeshConfig, MeshConfigStage } from "../mesh/types.js";
export function resolveMeshStage(mesh: MeshConfig, stage: MeshConfigStage, sourceFile: string): EffectiveMeshConfig {
 if (Object.keys(mesh.services).length === 0) throw new ConfigError({ sourceFile, configPath: "services", stage, composition: "mesh", reason: "mesh.json must declare at least one root service" });
 const services: Record<string, any> = {};
 for (const [name, service] of Object.entries(mesh.services)) services[name] = { path: service.path, env: { ...(service.env ?? {}) }, dependencies: { ...(service.dependencies ?? {}) }, dependsOn: [...(service.dependsOn ?? [])], publish: [...(service.publish ?? [])] };
 for (const overlayStage of stageOverlayChain(stage)) for (const [name, patch] of Object.entries(mesh[overlayStage]?.services ?? {})) {
  const prior = services[name] ?? { path: undefined, env: {}, dependencies: {}, dependsOn: [], publish: [] };
  services[name] = { path: patch.path ?? prior.path, env: mergeStringMap(prior.env, patch.env), dependencies: { ...prior.dependencies, ...(patch.dependencies ?? {}) }, dependsOn: unionStable(prior.dependsOn, patch.dependsOn), publish: unionStable(prior.publish, patch.publish) };
 }
 if (!Object.keys(services).length) throw new ConfigError({ sourceFile, configPath: "services", stage, composition: "mesh", reason: "At least one effective mesh service is required" });
 for (const [name, service] of Object.entries(services)) if (!service.path) throw new ConfigError({ sourceFile, configPath: `services.${name}.path`, stage, composition: "mesh", reason: "Effective mesh service requires path" });
 const graph: LifecycleGraph = new Map();
 for (const [name, service] of Object.entries(services)) { if (!BUILDER_IDENTIFIER_PATTERN.test(name) || RESERVED_MESH_SERVICE_NAMES.has(name)) throw new ConfigError({ sourceFile, configPath: `services.${name}`, stage, composition: "mesh", value: name, reason: "Invalid or reserved mesh service name" }); graph.set(name, new Set()); for (const target of service.dependsOn as string[]) { if (target === name) throw new ConfigError({ sourceFile, configPath: `services.${name}.dependsOn`, stage, composition: "mesh", referencedObject: target, reason: "Mesh service cannot depend on itself" }); if (!services[target]) throw new ConfigError({ sourceFile, configPath: `services.${name}.dependsOn`, stage, composition: "mesh", referencedObject: target, reason: "Unknown mesh lifecycle target" }); graph.get(name)!.add(target); } }
 assertAcyclicGraph(graph, { sourceFile, stage, composition: "mesh" });
 const result = { ...mesh, services } as EffectiveMeshConfig; delete (result as any).dev; delete (result as any).prod; delete (result as any).test; delete (result as any).e2e; return result;
}
