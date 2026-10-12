import { ConfigError } from "../../../errors/ConfigError.js";
import {
  assertTesterReferencesArePublic,
  collectBuilderReferences,
  interpolateBuilderReferences,
  type ParsedBuilderReference,
  type ReferenceDiagnosticContext,
} from "../../config/references.js";
import { resolveEndpointProperty } from "../../config/endpointProperties.js";
import type { MeshEndpointRegistry } from "./types.js";
import type { LoadedMeshService } from "./types.js";
import { bindingKey } from "./substitution.js";

export interface MeshReferenceContext {
  services: Record<string, LoadedMeshService>;
  bindings: Map<string, string>;
  endpoints: MeshEndpointRegistry;
  stage: string;
  meshJsonPath: string;
}

function resolveMesh(ref: ParsedBuilderReference, ctx: MeshReferenceContext, context: ReferenceDiagnosticContext): string {
  const name = ref.meshService!;
  if (!ctx.services[name]) throw new ConfigError({ ...context, referencedObject: ref.raw, reason: `Unknown mesh service reference "${name}"` });
  const provider = ref.target === "dependency" ? ctx.bindings.get(bindingKey(name, ref.dependency!)) : undefined;
  const endpoint = ref.target === "app"
    ? ctx.endpoints.app[name]?.[ref.endpoint]
    : provider
      ? ctx.endpoints.app[provider]?.[ref.endpoint]
      : ctx.endpoints.dependencies[name]?.[ref.dependency!]?.[ref.endpoint];
  if (!endpoint) throw new ConfigError({ ...context, referencedObject: ref.raw, reason: "Referenced endpoint does not exist" });
  return resolveEndpointProperty(endpoint, ref.property, { ...context, referencedObject: ref.raw });
}

function resolveBuild(ref: ParsedBuilderReference, consumer: string, ctx: MeshReferenceContext, context: ReferenceDiagnosticContext): string {
  const provider = ref.target === "dependency" ? ctx.bindings.get(bindingKey(consumer, ref.dependency!)) : undefined;
  const endpoint = ref.target === "app"
    ? ctx.endpoints.app[consumer]?.[ref.endpoint]
    : provider
      ? ctx.endpoints.app[provider]?.[ref.endpoint]
      : ctx.endpoints.dependencies[consumer]?.[ref.dependency!]?.[ref.endpoint];
  if (!endpoint) {
    const reason = provider
      ? `Provider "${provider}" does not expose endpoint "${ref.endpoint}"`
      : "Referenced endpoint does not exist";
    throw new ConfigError({ ...context, referencedObject: ref.raw, reason });
  }
  try {
    return resolveEndpointProperty(endpoint, ref.property, { ...context, referencedObject: ref.raw });
  } catch (error) {
    if (provider && error instanceof ConfigError) {
      throw new ConfigError({
        ...context,
        referencedObject: `${consumer}.dependencies.${ref.dependency}.endpoints.${ref.endpoint}.${ref.property} -> ${provider}.app.endpoints.${ref.endpoint}.${ref.property}`,
        reason: error.message,
      });
    }
    throw error;
  }
}

export function collectMeshReferenceUsages(
  envs: Record<string, Record<string, string>>,
  scope: "mesh" | "build",
  sourcePrefix: string,
  context: Omit<ReferenceDiagnosticContext, "configPath"> & { configPath?: string },
): ParsedBuilderReference[] {
  return Object.entries(envs).flatMap(([owner, env]) => Object.entries(env).flatMap(([key, value]) => collectBuilderReferences(value, scope, {
    ...context,
    configPath: `${context.configPath ?? sourcePrefix}.${owner}.${key}`,
  })));
}

function interpolate(value: string, scope: "build" | "mesh", ctx: MeshReferenceContext, configPath: string, consumer?: string): string {
  const context: ReferenceDiagnosticContext = {
    sourceFile: scope === "mesh" ? ctx.meshJsonPath : ctx.services[consumer!]?.buildJsonPath ?? ctx.meshJsonPath,
    configPath,
    stage: ctx.stage,
    composition: scope === "mesh" ? "mesh" : "service",
  };
  return interpolateBuilderReferences(value, scope, (ref, refContext) => scope === "mesh"
    ? resolveMesh(ref, ctx, refContext)
    : resolveBuild(ref, consumer!, ctx, refContext), context).replace(/\$/g, "$$$$");
}

export function resolveMeshEnvMap(env: Record<string, string>, ctx: MeshReferenceContext, sourcePrefix: string): Record<string, string> {
  return Object.fromEntries(Object.entries(env).map(([key, value]) => [key, interpolate(value, "mesh", ctx, `${sourcePrefix}.${key}`)]));
}

export function resolveServiceBuildEnvThroughMesh(consumer: string, env: Record<string, string>, ctx: MeshReferenceContext, sourcePrefix: string): Record<string, string> {
  return Object.fromEntries(Object.entries(env).map(([key, value]) => [key, interpolate(value, "build", ctx, `${sourcePrefix}.${key}`, consumer)]));
}

export function assertMeshTesterEnvPublic(env: Record<string, string>, ctx: MeshReferenceContext, configPath = "tester.env"): void {
  assertTesterReferencesArePublic(env, "mesh", {
    sourceFile: ctx.meshJsonPath,
    configPath,
    stage: ctx.stage,
    composition: "mesh",
  });
}
