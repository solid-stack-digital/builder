import path from "node:path";
import { ConfigError } from "../../errors/ConfigError.js";
import type { BuildJson, Environment, MainService, OrdinaryService, TesterService } from "../../types/index.js";
import { assertPrimaryEndpointInvariant } from "./endpointProperties.js";
import { applyServiceOverlay, stageOverlayChain } from "./stageMerge.js";
import type { EffectiveBuildConfig, EffectiveService, Origin } from "./types.js";

const originFor = (sourceFile: string, configPath: string, layer: "base" | Environment): Origin => ({ sourceFile, configPath, projectDir: path.dirname(sourceFile), scope: "build", layer });
const fail = (sourceFile: string, stage: Environment, configPath: string, reason: string, value?: unknown): never => { throw new ConfigError({ sourceFile, stage, composition: "service", configPath, reason, value }); };
export function resolveBuildStage(build: BuildJson, stage: Environment, sourceFile: string): EffectiveBuildConfig {
  const services = structuredClone(build.services) as unknown as Record<string, Record<string,unknown>>;
  const origins = new Map<string,Origin>();
  const envOrigins = new Map<string,Map<string,Origin>>();
  const requisiteOrigins = new Map<string,Map<string,Origin>>();
  const layers: EffectiveBuildConfig["layers"] = [];
  const deletedRequisiteTargets: {target:string;path:string}[] = [];
  const record = (name: string, entry: Record<string,unknown>, layer: "base"|Environment) => {
    const where = layer === "base" ? `services.${name}` : `${layer}.services.${name}`;
    const origin = originFor(sourceFile, where, layer);
    origins.set(name, origin);
    const env = envOrigins.get(name) ?? new Map<string,Origin>();
    for (const key of Object.keys((entry.env as Record<string,string>) ?? {})) env.set(key, originFor(sourceFile, `${where}.env.${key}`, layer));
    envOrigins.set(name, env);
    const edges = requisiteOrigins.get(name) ?? new Map<string,Origin>();
    for (const [key, value] of Object.entries((entry.requisites as Record<string,unknown>) ?? {})) {
      if (value === false) edges.delete(key); else edges.set(key, originFor(sourceFile, `${where}.requisites.${key}`, layer));
    }
    requisiteOrigins.set(name, edges);
  };
  for (const [name, value] of Object.entries(services).sort(([a],[b]) => a.localeCompare(b))) record(name, value, "base");
  layers.push({ stage: "base", services: structuredClone(services), origin: originFor(sourceFile, "services", "base") });
  for (const overlayStage of stageOverlayChain(stage)) {
    const patches = (build[overlayStage]?.services ?? {}) as Record<string,Record<string,unknown>>;
    for (const [name, patch] of Object.entries(patches).sort(([a],[b]) => a.localeCompare(b))) {
      const current = services[name];
      const where = `${overlayStage}.services.${name}`;
      if (!current && (name === "main" || name === "tester")) fail(sourceFile, stage, where, "Required special service is missing from base");
      if (current && patch.compose !== undefined && patch.compose !== current.compose) fail(sourceFile, stage, `${where}.compose`, `compose is immutable; previous declaration ${origins.get(name)?.configPath}.compose, attempted ${where}.compose`, patch.compose);
      if (!current && name !== "main" && name !== "tester" && (typeof patch.compose !== "string" || !patch.compose.trim())) fail(sourceFile, stage, `${where}.compose`, "Stage-introduced service requires a complete compose declaration");
      services[name] = current ? applyServiceOverlay(current, patch) : structuredClone(patch);
      for (const [target,kind] of Object.entries((patch.requisites as Record<string,unknown>)??{})) if(kind===false)deletedRequisiteTargets.push({target,path:`${where}.requisites.${target}`});
      record(name, patch, overlayStage);
    }
    layers.push({ stage: overlayStage, services: structuredClone(patches), origin: originFor(sourceFile, `${overlayStage}.services`, overlayStage) });
  }
  for(const deleted of deletedRequisiteTargets)if(!(deleted.target in services))fail(sourceFile,stage,deleted.path,"Unknown requisite target",deleted.target);
  for (const [name, value] of Object.entries(services)) {
    const originPath = origins.get(name)?.configPath ?? `services.${name}`;
    if (name === "tester") {
      if (typeof value.compose !== "string" || typeof value.service !== "string") fail(sourceFile, stage, originPath, "Effective tester requires compose and service");
      continue;
    }
    const endpoints = (value.endpoints ?? {}) as Record<string, { port?: number; service?: string; primary?: boolean }>;
    for (const [endpointName, endpoint] of Object.entries(endpoints)) {
      if (!Number.isInteger(endpoint.port) || endpoint.port! < 1 || endpoint.port! > 65535) fail(sourceFile, stage, `${originPath}.endpoints.${endpointName}.port`, "Effective endpoint requires port in 1..65535", endpoint.port);
      if (name !== "main" && (typeof endpoint.service !== "string" || !endpoint.service.trim())) fail(sourceFile, stage, `${originPath}.endpoints.${endpointName}.service`, "Effective ordinary endpoint requires service");
    }
    assertPrimaryEndpointInvariant(endpoints, { sourceFile, stage, configPath: `${originPath}.endpoints` });
    if (name !== "main" && (typeof value.compose !== "string" || !value.compose.trim())) fail(sourceFile, stage, `${originPath}.compose`, "Effective ordinary service requires compose");
    if (name !== "main" && Object.keys(endpoints).length === 0 && (typeof value.service !== "string" || !value.service.trim())) fail(sourceFile, stage, `${originPath}.service`, "endpoint-less service requires service");
    if (name !== "main" && Object.keys(endpoints).length > 0 && typeof value.service === "string") {
      const primary = Object.values(endpoints).find(endpoint => endpoint.primary);
      if (primary?.service && value.service !== primary.service) fail(sourceFile, stage, `${originPath}.service`, "top-level service must equal primary endpoint owner", value.service);
    }
    value.env ??= {}; value.endpoints ??= {}; value.requisites ??= {};
    value.kind = name === "main" ? "main" : "ordinary";
  }
  return { name: build.name, services: services as unknown as Record<string,EffectiveService|TesterService>, layers, origins, envOrigins, requisiteOrigins, sourceFile, projectDir: path.dirname(sourceFile) };
}
