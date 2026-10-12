import { ConfigError } from "../../errors/ConfigError.js";
import type { BuildJson, DependencyConfig, Environment } from "../../types/index.js";
import type { EffectiveBuildConfig, EffectiveBuildLayer } from "./types.js";
import { assertPrimaryEndpointInvariant } from "./endpointProperties.js";
import { assertAcyclicGraph, type LifecycleGraph } from "./lifecycleGraph.js";
import { mergeStringMap, stageOverlayChain, unionStable } from "./stageMerge.js";
import { DEPENDENCY_REFERENCE_PATTERN } from "./constants.js";

export function resolveBuildStage(build: BuildJson, stage: Environment, sourceFile: string): EffectiveBuildConfig {
 const context = (configPath: string, value: unknown, reason: string, referencedObject?: string): ConfigError => new ConfigError({ sourceFile, configPath, stage, composition: "service", value, ...(referencedObject ? { referencedObject } : {}), reason });
 const appEnv = { ...(build.app.env ?? {}) };
 const appEndpoints: Record<string, any> = structuredClone(build.app.endpoints ?? {});
 const dependencies: Record<string, any> = {};
 for (const [name, dep] of Object.entries(build.dependencies ?? {})) dependencies[name] = { ...dep, env: { ...(dep.env ?? {}) }, endpoints: structuredClone(dep.endpoints ?? {}), dependsOn: [...(dep.dependsOn ?? [])] };
 const layers: EffectiveBuildLayer[] = [{ stage: "base", appEnv: { ...(build.app.env ?? {}) } }];

 for (const overlayStage of stageOverlayChain(stage)) {
  const overlay = build[overlayStage];
  if (!overlay) continue;
  Object.assign(appEnv, overlay.app?.env ?? {});
  for (const [name, endpoint] of Object.entries(overlay.app?.endpoints ?? {})) appEndpoints[name] = { ...(appEndpoints[name] ?? {}), ...endpoint };
  for (const [name, patch] of Object.entries(overlay.dependencies ?? {})) {
   const inherited = dependencies[name];
   if (inherited && patch.compose !== undefined) throw context(`${overlayStage}.dependencies.${name}.compose`, patch.compose, "A stage cannot replace the Compose implementation of an inherited dependency", `dependencies.${name}`);
   const next = inherited ?? { compose: undefined, env: {}, endpoints: {}, dependsOn: [] };
   if (!inherited && patch.compose !== undefined) next.compose = patch.compose;
   next.env = mergeStringMap(next.env, patch.env);
   for (const [endpointName, endpointPatch] of Object.entries(patch.endpoints ?? {})) next.endpoints[endpointName] = { ...(next.endpoints[endpointName] ?? {}), ...endpointPatch };
   next.dependsOn = unionStable(next.dependsOn, patch.dependsOn);
   dependencies[name] = next;
  }
  layers.push({ stage: overlayStage, appEnv: { ...(overlay.app?.env ?? {}) }, ...(overlay["override-compose"] ? { overrideCompose: overlay["override-compose"] } : {}) });
 }
 const effective = { ...build, app: { env: appEnv, endpoints: appEndpoints }, dependencies, tester: build.tester ? { env: { ...(build.tester.env ?? {}) } } : undefined, layers } as EffectiveBuildConfig;
 delete (effective as any).dev; delete (effective as any).prod; delete (effective as any).test; delete (effective as any).e2e;
 for (const [name, ep] of Object.entries(appEndpoints)) if (!Number.isInteger(ep.port) || ep.port < 1 || ep.port > 65535) throw context(`app.endpoints.${name}.port`, ep.port, "Effective endpoint requires a port in 1..65535");
 assertPrimaryEndpointInvariant(appEndpoints, { sourceFile, configPath: "app.endpoints", stage });
 const graph: LifecycleGraph = new Map();
 for (const [name, dep] of Object.entries(dependencies)) {
  if (typeof dep.compose !== "string" || !dep.compose.trim()) throw context(`dependencies.${name}.compose`, dep.compose, "Effective dependency requires compose");
  for (const [epName, ep] of Object.entries(dep.endpoints) as [string, any][]) if (!ep.service || !Number.isInteger(ep.port) || ep.port < 1 || ep.port > 65535) throw context(`dependencies.${name}.endpoints.${epName}`, ep, "Effective dependency endpoint requires service and port");
  assertPrimaryEndpointInvariant(dep.endpoints, { sourceFile, configPath: `dependencies.${name}.endpoints`, stage });
  const node = `dependencies.${name}`; graph.set(node, new Set());
  for (const ref of dep.dependsOn as string[]) { const match = DEPENDENCY_REFERENCE_PATTERN.exec(ref); if (!match) throw context(`dependencies.${name}.dependsOn`, ref, "Expected dependencies.<name> lifecycle reference", ref); const targetName = match[1]!; if (targetName === name) throw context(`dependencies.${name}.dependsOn`, ref, "Dependency cannot depend on itself", ref); const target = dependencies[targetName]; if (!target) throw context(`dependencies.${name}.dependsOn`, ref, "Unknown dependency", ref); if (!Object.keys(target.endpoints).length) throw context(`dependencies.${name}.dependsOn`, ref, "Lifecycle target is inert and has no endpoints", ref); graph.get(node)!.add(`dependencies.${targetName}`); }
 }
 assertAcyclicGraph(graph, { sourceFile, stage, composition: "service" });
 return effective;
}
