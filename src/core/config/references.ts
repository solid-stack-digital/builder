import { ConfigError } from "../../errors/ConfigError.js";
import { ENDPOINT_PROPERTIES, PUBLIC_ENDPOINT_PROPERTIES } from "./constants.js";
import type { EndpointProperty } from "./types.js";

export type ReferenceScope = "build" | "mesh";
export interface ReferenceDiagnosticContext {
  sourceFile: string;
  configPath: string;
  stage: string;
  composition: "service" | "mesh";
}
export interface ParsedBuilderReference {
  raw: string;
  scope: ReferenceScope;
  meshService?: string;
  target: "app" | "dependency";
  dependency?: string;
  endpoint: string;
  property: EndpointProperty;
}

const BUILD_APP = /^app\.endpoints\.([a-z][a-z0-9-]*)\.([a-z_]+)$/;
const BUILD_DEP = /^dependencies\.([a-z][a-z0-9-]*)\.endpoints\.([a-z][a-z0-9-]*)\.([a-z_]+)$/;
const MESH_APP = /^([a-z][a-z0-9-]*)\.app\.endpoints\.([a-z][a-z0-9-]*)\.([a-z_]+)$/;
const MESH_DEP = /^([a-z][a-z0-9-]*)\.dependencies\.([a-z][a-z0-9-]*)\.endpoints\.([a-z][a-z0-9-]*)\.([a-z_]+)$/;

function parse(raw: string, scope: ReferenceScope, context: ReferenceDiagnosticContext): ParsedBuilderReference {
  let match: RegExpExecArray | null;
  if (scope === "build" && (match = BUILD_APP.exec(raw))) return valid({ raw, scope, target: "app", endpoint: match[1]!, property: match[2]! }, context);
  if (scope === "build" && (match = BUILD_DEP.exec(raw))) return valid({ raw, scope, target: "dependency", dependency: match[1]!, endpoint: match[2]!, property: match[3]! }, context);
  if (scope === "mesh" && (match = MESH_APP.exec(raw))) return valid({ raw, scope, meshService: match[1]!, target: "app", endpoint: match[2]!, property: match[3]! }, context);
  if (scope === "mesh" && (match = MESH_DEP.exec(raw))) return valid({ raw, scope, meshService: match[1]!, target: "dependency", dependency: match[2]!, endpoint: match[3]!, property: match[4]! }, context);
  throw new ConfigError({ ...context, referencedObject: raw, value: raw, reason: `Invalid ${scope} endpoint reference` });
}

function valid(ref: Omit<ParsedBuilderReference, "property"> & { property: string }, context: ReferenceDiagnosticContext): ParsedBuilderReference {
  if (!(ENDPOINT_PROPERTIES as readonly string[]).includes(ref.property)) {
    throw new ConfigError({ ...context, referencedObject: ref.raw, value: ref.property, reason: "Unknown endpoint property" });
  }
  return ref as ParsedBuilderReference;
}

export function collectBuilderReferences(value: string, scope: ReferenceScope, context: ReferenceDiagnosticContext): ParsedBuilderReference[] {
  const protectedValue = value.replace(/\$\$/g, "\u0000DOLLAR\u0000");
  const refs: ParsedBuilderReference[] = [];
  for (const match of protectedValue.matchAll(/\$\{([^}]*)\}/g)) refs.push(parse(match[1]!, scope, context));
  return refs;
}

export function interpolateBuilderReferences(
  value: string,
  scope: ReferenceScope,
  resolve: (ref: ParsedBuilderReference, context: ReferenceDiagnosticContext) => string,
  context: ReferenceDiagnosticContext,
): string {
  const sentinel = "\u0000DOLLAR\u0000";
  return value.replace(/\$\$/g, sentinel)
    .replace(/\$\{([^}]*)\}/g, (_whole, body: string) => {
      const ref = parse(body, scope, context);
      return resolve(ref, context);
    })
    .replaceAll(sentinel, "$");
}

export function assertTesterReferencesArePublic(
  env: Record<string, string>,
  scope: ReferenceScope,
  baseContext: ReferenceDiagnosticContext,
): void {
  for (const [key, value] of Object.entries(env)) {
    const context = { ...baseContext, configPath: `${baseContext.configPath}.${key}` };
    for (const ref of collectBuilderReferences(value, scope, context)) {
      if (!PUBLIC_ENDPOINT_PROPERTIES.has(ref.property)) {
        throw new ConfigError({ ...context, referencedObject: ref.raw, value: ref.raw, reason: "Tester references may use only public endpoint properties" });
      }
    }
  }
}
