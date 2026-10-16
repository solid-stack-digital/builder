import { ConfigError } from "../../errors/ConfigError.js";
import type { MainEndpoint } from "../../types/index.js";
import type { EndpointProperty, ResolvedEndpoint } from "./types.js";
export interface EndpointPropertyContext { sourceFile: string; configPath: string; stage: string; composition: "service" | "mesh"; referencedObject?: string; }
export function resolveEndpointProperty(endpoint: ResolvedEndpoint, property: EndpointProperty, context: EndpointPropertyContext): string {
 const reference = context.referencedObject ?? endpoint.logicalPath;
 const published = (): void => { if (!endpoint.effectivelyPublished || endpoint.publicHost === undefined || endpoint.publicPort === undefined) throw new ConfigError({ ...context, referencedObject: reference, reason: `endpoint is not published; ${property} requires publicPort capability and, in a mesh, a publish selector` }); };
 const scheme = (): string => { if (!endpoint.scheme) throw new ConfigError({ ...context, referencedObject: reference, reason: `Endpoint property ${property} requires scheme` }); return endpoint.scheme; };
 switch (property) { case "network_host": return endpoint.networkHost; case "network_port": return String(endpoint.networkPort); case "network_address": return `${endpoint.networkHost}:${endpoint.networkPort}`; case "network_url": return `${scheme()}://${endpoint.networkHost}:${endpoint.networkPort}`; case "public_host": published(); return endpoint.publicHost!; case "public_port": published(); return String(endpoint.publicPort!); case "public_address": published(); return `${endpoint.publicHost}:${endpoint.publicPort}`; case "public_url": published(); return `${scheme()}://${endpoint.publicHost}:${endpoint.publicPort}`; }
}
export function assertPrimaryEndpointInvariant(endpoints: Record<string, { primary?: boolean }>, context: { sourceFile: string; configPath: string; stage: string }): void {
 const primaries = Object.entries(endpoints).filter(([, e]) => e.primary === true); if (Object.keys(endpoints).length && primaries.length !== 1) throw new ConfigError({ ...context, value: primaries.map(([n]) => n), reason: `Expected exactly one primary endpoint; found ${primaries.length}` });
}
export function getPrimaryEndpoint<T extends MainEndpoint>(endpoints: Record<string, T>): [name: string, endpoint: T] | undefined { return Object.entries(endpoints).find(([, endpoint]) => endpoint.primary === true); }
