import { ConfigError } from "../../errors/ConfigError.js";
import { ENDPOINT_PROPERTIES, PUBLIC_ENDPOINT_PROPERTIES } from "./constants.js";
import type { EndpointProperty } from "./types.js";
export type ReferenceScope = "build" | "mesh";
export interface ParsedBuilderReference { raw: string; scope: ReferenceScope; meshService?: string; target: "app" | "dependency"; dependency?: string; endpoint: string; property: EndpointProperty; }
const BUILD_APP = /^app\.endpoints\.([a-z][a-z0-9-]*)\.([a-z_]+)$/;
const BUILD_DEP = /^dependencies\.([a-z][a-z0-9-]*)\.endpoints\.([a-z][a-z0-9-]*)\.([a-z_]+)$/;
const MESH_APP = /^([a-z][a-z0-9-]*)\.app\.endpoints\.([a-z][a-z0-9-]*)\.([a-z_]+)$/;
const MESH_DEP = /^([a-z][a-z0-9-]*)\.dependencies\.([a-z][a-z0-9-]*)\.endpoints\.([a-z][a-z0-9-]*)\.([a-z_]+)$/;
function parse(raw: string, scope: ReferenceScope, sourcePath: string): ParsedBuilderReference {
 let m: RegExpExecArray | null;
 if (scope === "build" && (m = BUILD_APP.exec(raw))) return valid({ raw, scope, target: "app", endpoint: m[1]!, property: m[2]! }, sourcePath);
 if (scope === "build" && (m = BUILD_DEP.exec(raw))) return valid({ raw, scope, target: "dependency", dependency: m[1]!, endpoint: m[2]!, property: m[3]! }, sourcePath);
 if (scope === "mesh" && (m = MESH_APP.exec(raw))) return valid({ raw, scope, meshService: m[1]!, target: "app", endpoint: m[2]!, property: m[3]! }, sourcePath);
 if (scope === "mesh" && (m = MESH_DEP.exec(raw))) return valid({ raw, scope, meshService: m[1]!, target: "dependency", dependency: m[2]!, endpoint: m[3]!, property: m[4]! }, sourcePath);
 throw new ConfigError({ configPath: sourcePath, value: raw, reason: `Invalid ${scope} endpoint reference` });
}
function valid(ref: Omit<ParsedBuilderReference, "property"> & { property: string }, sourcePath: string): ParsedBuilderReference {
 if (!(ENDPOINT_PROPERTIES as readonly string[]).includes(ref.property)) throw new ConfigError({ configPath: sourcePath, value: ref.property, reason: "Unknown endpoint property" });
 return ref as ParsedBuilderReference;
}
export function collectBuilderReferences(value: string, scope: ReferenceScope, sourcePath: string): ParsedBuilderReference[] {
 const protectedValue = value.replace(/\$\$/g, "\u0000DOLLAR\u0000"), refs: ParsedBuilderReference[] = [];
 for (const match of protectedValue.matchAll(/\$\{([^}]*)\}/g)) refs.push(parse(match[1]!, scope, sourcePath));
 return refs;
}
export function interpolateBuilderReferences(value: string, scope: ReferenceScope, resolve: (ref: ParsedBuilderReference) => string): string {
 const sentinel = "\u0000DOLLAR\u0000";
 return value.replace(/\$\$/g, sentinel).replace(/\$\{([^}]*)\}/g, (whole, body: string) => resolve(parse(body, scope, "environment"))).replaceAll(sentinel, "$");
}
export function assertTesterReferencesArePublic(env: Record<string, string>, scope: ReferenceScope, sourcePrefix: string): void {
 for (const [key, value] of Object.entries(env)) for (const ref of collectBuilderReferences(value, scope, `${sourcePrefix}.${key}`)) if (!PUBLIC_ENDPOINT_PROPERTIES.has(ref.property)) throw new ConfigError({ configPath: `${sourcePrefix}.${key}`, value: ref.raw, reason: "Tester references may use only public endpoint properties" });
}
