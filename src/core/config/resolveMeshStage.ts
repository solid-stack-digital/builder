import { ConfigError } from "../../errors/ConfigError.js";
import { RESERVED_MESH_SERVICE_NAMES, BUILDER_IDENTIFIER_PATTERN } from "./constants.js";
import { assertAcyclicGraph, type LifecycleGraph } from "./lifecycleGraph.js";
import { mergeStringMap, unionStable } from "./stageMerge.js";
import type { EffectiveMeshConfig } from "./types.js";
import type { MeshConfig, MeshConfigStage } from "../mesh/types.js";
export function resolveMeshStage(mesh: MeshConfig, stage: MeshConfigStage, sourceFile: string): EffectiveMeshConfig {
 const overlays = mesh[stage]?.services ?? {}, names = new Set([...Object.keys(mesh.services), ...Object.keys(overlays)]), services: Record<string, any> = {};
 for (const name of names) { const base = mesh.services[name], patch = overlays[name]; const merged = { path: patch?.path ?? base?.path, env: mergeStringMap(base?.env, patch?.env), dependencies: { ...(base?.dependencies ?? {}), ...(patch?.dependencies ?? {}) }, dependsOn: unionStable(base?.dependsOn, patch?.dependsOn), publish: unionStable(base?.publish, patch?.publish) }; if (!merged.path) throw new ConfigError({ sourceFile, configPath: `services.${name}.path`, stage, composition: "mesh", reason: "Effective mesh service requires path" }); services[name] = merged; }
 if (!Object.keys(services).length) throw new ConfigError({ sourceFile, configPath: "services", stage, composition: "mesh", reason: "At least one effective mesh service is required" });
 const graph: LifecycleGraph = new Map();
 for (const [name, service] of Object.entries(services)) { if (!BUILDER_IDENTIFIER_PATTERN.test(name) || RESERVED_MESH_SERVICE_NAMES.has(name)) throw new ConfigError({ sourceFile, configPath: `services.${name}`, stage, composition: "mesh", value: name, reason: "Invalid or reserved mesh service name" }); graph.set(name, new Set()); for (const target of service.dependsOn as string[]) { if (target === name) throw new ConfigError({ sourceFile, configPath: `services.${name}.dependsOn`, stage, composition: "mesh", referencedObject: target, reason: "Mesh service cannot depend on itself" }); if (!services[target]) throw new ConfigError({ sourceFile, configPath: `services.${name}.dependsOn`, stage, composition: "mesh", referencedObject: target, reason: "Unknown mesh lifecycle target" }); graph.get(name)!.add(target); } }
 assertAcyclicGraph(graph, { sourceFile, stage, composition: "mesh" });
 const result = { ...mesh, services } as EffectiveMeshConfig; delete (result as any).dev; delete (result as any).prod; delete (result as any).test; delete (result as any).e2e; return result;
}
