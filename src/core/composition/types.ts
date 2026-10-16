import type { EffectiveGraph, NodeId, ResolvedEndpoint } from "../config/types.js";
export type ComposeEnvironmentValue = string | null;
export type ComposeEnvironmentMap = Record<string,ComposeEnvironmentValue>;
export interface ComposeService { [key:string]:unknown; build?:unknown; image?:string; command?:unknown; entrypoint?:unknown; environment?:ComposeEnvironmentMap|string[]; env_file?:unknown; ports?:unknown[]; networks?:unknown; depends_on?:unknown; healthcheck?:unknown; volumes?:unknown[]; configs?:unknown; secrets?:unknown; links?:unknown[]; volumes_from?:unknown[]; network_mode?:string; privileged?:boolean; container_name?:string }
export interface ComposeDocument { name?:string; services:Record<string,ComposeService>; volumes?:Record<string,unknown>; networks?:Record<string,unknown>; configs?:Record<string,unknown>; secrets?:Record<string,unknown>; [key:string]:unknown }
export interface MaterializedModule { nodeId: NodeId; sourceFile: string; document: ComposeDocument; serviceNameMap: Map<string,string>; representative: string; serviceNames: string[]; endpointOwnerMap: Map<string,string> }
export interface DeferredHealthCheck { serviceName: string; image: string; sourceFile: string; configPath: string }
export interface CompiledComposition { compose: ComposeDocument; projectName: string; graph: EffectiveGraph; mainServiceNames: Map<NodeId,string>; modules: Map<NodeId,MaterializedModule>; endpoints: Map<NodeId,Record<string,ResolvedEndpoint>>; runtimeServiceNames: string[]; testerServiceNames: string[]; testerServiceName?: string; allocations: Map<string,number>; deferredHealthChecks: DeferredHealthCheck[] }
export type CompiledServiceComposition = CompiledComposition;
