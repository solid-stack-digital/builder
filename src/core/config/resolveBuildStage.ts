import { ConfigError } from "../../errors/ConfigError.js";
import type { BuildJson, DependencyConfig, Environment } from "../../types/index.js";
import type { EffectiveBuildConfig } from "./types.js";
import { assertPrimaryEndpointInvariant } from "./endpointProperties.js";
import { assertAcyclicGraph, type LifecycleGraph } from "./lifecycleGraph.js";
import { mergeStringMap, unionStable } from "./stageMerge.js";
import { DEPENDENCY_REFERENCE_PATTERN } from "./constants.js";

export function resolveBuildStage(build: BuildJson, stage: Environment, sourceFile: string): EffectiveBuildConfig {
 const overlay = build[stage] ?? {};
 const appEndpoints: Record<string, any> = structuredClone(build.app.endpoints ?? {});
 for (const [name, endpoint] of Object.entries(overlay.app?.endpoints ?? {})) appEndpoints[name] = { ...(appEndpoints[name] ?? {}), ...endpoint };
 const dependencies: Record<string, any> = {};
 for (const [name, dep] of Object.entries(build.dependencies ?? {})) dependencies[name] = { ...dep, env: { ...(dep.env ?? {}) }, endpoints: structuredClone(dep.endpoints ?? {}), dependsOn: [...(dep.dependsOn ?? [])] };
 for (const [name, patch] of Object.entries(overlay.dependencies ?? {})) {
  const prior = dependencies[name] ?? { compose: undefined, env: {}, endpoints: {}, dependsOn: [] };
  prior.compose = patch.compose ?? prior.compose; prior.env = mergeStringMap(prior.env, patch.env);
  for (const [ep, epPatch] of Object.entries(patch.endpoints ?? {})) prior.endpoints[ep] = { ...(prior.endpoints[ep] ?? {}), ...epPatch };
  prior.dependsOn = unionStable(prior.dependsOn, patch.dependsOn); dependencies[name] = prior;
 }
 const effective = { ...build, app: { env: mergeStringMap(build.app.env, overlay.app?.env), endpoints: appEndpoints }, dependencies, tester: build.tester ? { env: { ...(build.tester.env ?? {}) } } : undefined, overrideCompose: overlay["override-compose"] } as EffectiveBuildConfig;
 delete (effective as any).dev; delete (effective as any).prod; delete (effective as any).test; delete (effective as any).e2e;
 const context = (configPath: string, value: unknown, reason: string, referencedObject?: string): ConfigError => new ConfigError({ sourceFile, configPath, stage, composition: "service", value, ...(referencedObject ? { referencedObject } : {}), reason });
 for (const [name, ep] of Object.entries(appEndpoints)) if (!Number.isInteger(ep.port) || ep.port < 1 || ep.port > 65535) throw context(`app.endpoints.${name}.port`, ep.port, "Effective endpoint requires a port in 1..65535");
 assertPrimaryEndpointInvariant(appEndpoints, { sourceFile, configPath: "app.endpoints", stage });
 const graph: LifecycleGraph = new Map();
 for (const [name, dep] of Object.entries(dependencies)) {
  if (typeof dep.compose !== "string" || !dep.compose.trim()) throw context(`dependencies.${name}.compose`, dep.compose, "Effective dependency requires compose");
  const endpoints = Object.entries(dep.endpoints) as [string, any][];
  for (const [epName, ep] of endpoints) if (!ep.service || !Number.isInteger(ep.port) || ep.port < 1 || ep.port > 65535) throw context(`dependencies.${name}.endpoints.${epName}`, ep, "Effective dependency endpoint requires service and port");
  assertPrimaryEndpointInvariant(dep.endpoints, { sourceFile, configPath: `dependencies.${name}.endpoints`, stage });
  const node = `dependencies.${name}`; graph.set(node, new Set());
  for (const ref of dep.dependsOn as string[]) { const match = DEPENDENCY_REFERENCE_PATTERN.exec(ref); if (!match) throw context(`dependencies.${name}.dependsOn`, ref, "Expected dependencies.<name> lifecycle reference", ref); const targetName = match[1]!; if (targetName === name) throw context(`dependencies.${name}.dependsOn`, ref, "Dependency cannot depend on itself", ref); const target = dependencies[targetName]; if (!target) throw context(`dependencies.${name}.dependsOn`, ref, "Unknown dependency", ref); if (!Object.keys(target.endpoints).length) throw context(`dependencies.${name}.dependsOn`, ref, "Lifecycle target is inert and has no endpoints", ref); graph.get(node)!.add(`dependencies.${targetName}`); }
 }
 assertAcyclicGraph(graph, { sourceFile, stage, composition: "service" });
 return effective;
}
