import { ConfigError } from "../../errors/ConfigError.js";
import type { AppEndpoint } from "../../types/index.js";
import type { EndpointProperty, ResolvedEndpoint } from "./types.js";
export function resolveEndpointProperty(endpoint: ResolvedEndpoint, property: EndpointProperty, context: { sourceFile: string; configPath: string; stage: string }): string {
 const published = (): void => { if (!endpoint.effectivelyPublished || endpoint.publicHost === undefined || endpoint.publicPort === undefined) throw new ConfigError({ ...context, configPath: context.configPath, referencedObject: endpoint.logicalPath, reason: `Endpoint property ${property} requires effective publication` }); };
 const scheme = (): string => { if (!endpoint.scheme) throw new ConfigError({ ...context, referencedObject: endpoint.logicalPath, reason: `Endpoint property ${property} requires an endpoint scheme` }); return endpoint.scheme; };
 switch (property) { case "network_host": return endpoint.networkHost; case "network_port": return String(endpoint.networkPort); case "network_address": return `${endpoint.networkHost}:${endpoint.networkPort}`; case "network_url": return `${scheme()}://${endpoint.networkHost}:${endpoint.networkPort}`; case "public_host": published(); return endpoint.publicHost!; case "public_port": published(); return String(endpoint.publicPort!); case "public_address": published(); return `${endpoint.publicHost}:${endpoint.publicPort}`; case "public_url": published(); return `${scheme()}://${endpoint.publicHost}:${endpoint.publicPort}`; }
}
export function assertPrimaryEndpointInvariant(endpoints: Record<string, { primary?: boolean }>, context: { sourceFile: string; configPath: string; stage: string }): void {
 const primaries = Object.entries(endpoints).filter(([, e]) => e.primary === true); if (Object.keys(endpoints).length && primaries.length !== 1) throw new ConfigError({ ...context, value: primaries.map(([n]) => n), reason: `Expected exactly one primary endpoint; found ${primaries.length}` });
}
export function getPrimaryEndpoint<T extends AppEndpoint>(endpoints: Record<string, T>): [name: string, endpoint: T] | undefined { return Object.entries(endpoints).find(([, endpoint]) => endpoint.primary === true); }
