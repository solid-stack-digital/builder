import type { BuildJson, Environment, MainEndpoint, MainService, OrdinaryService, RequisiteKind, Requisites, ServiceEndpoint, TesterService } from "../../types/index.js";
import type { MeshConfig } from "../mesh/types.js";
export type ConfigStage = Environment;
export type NodeId = string;
export type Origin = { sourceFile: string; configPath: string; projectDir: string; scope: "build" | "mesh"; meshRoot?: string; layer: "base" | ConfigStage };
export type Located<T> = { value: T; origin: Origin };
export type Edge = { consumer: NodeId; target: NodeId; kind: RequisiteKind; origin: Origin };
export type EffectiveMain = MainService & { kind: "main"; env: Record<string,string>; buildArgs: Record<string,string>; endpoints: Record<string,MainEndpoint>; requisites: Requisites };
export type EffectiveOrdinary = OrdinaryService & { kind: "ordinary"; env: Record<string,string>; endpoints: Record<string,ServiceEndpoint>; requisites: Requisites };
export type EffectiveService = EffectiveMain | EffectiveOrdinary;
export interface EffectiveBuildLayer { stage: "base" | Environment; services: Record<string, Record<string,unknown>>; origin: Origin }
export interface EffectiveBuildConfig { name: string; services: Record<string, EffectiveService | TesterService>; layers: EffectiveBuildLayer[]; origins: Map<string, Origin>; envOrigins: Map<string, Map<string, Origin>>; buildArgsOrigins: Map<string, Map<string, Origin>>; requisiteOrigins: Map<string, Map<string, Origin>>; sourceFile: string; projectDir: string }
export interface EffectiveMeshSource { source: string; publish: string[]; publishOrigin?: Origin; extendsLayers: Array<{ layer: "base" | ConfigStage; patches: Record<string, Record<string,unknown>>; origin: Origin }>; origin: Origin }
export interface EffectiveMeshConfig { name: string; services: Record<string, EffectiveMeshSource>; tester: TesterService; testerLayers: EffectiveBuildLayer[]; sourceFile: string; projectDir: string; baseSources: string[]; raw: MeshConfig }
export interface GraphNode { id: NodeId; kind: "main" | "ordinary"; projectDir: string; sourceService: string; meshRoot?: string; declaration: EffectiveService; envLayers: EnvironmentLayer[]; origin: Origin; envOrigins: Map<string,Origin>; buildArgsOrigins: Map<string,Origin>; requisiteOrigins: Map<string,Origin> }
export interface EnvironmentLayer { kind: "dotenv" | "compose-default" | "build" | "override-compose" | "mesh" | "internal"; values: Record<string, Located<string | null>> }
export interface EffectiveGraph { nodes: Map<NodeId,GraphNode>; roots: NodeId[]; edges: Edge[]; closures: Map<NodeId,Set<NodeId>>; lifecycle: Map<NodeId,"long-running"|"prerequisite"> }
export interface DeclaredGraph { nodes: Map<NodeId,GraphNode>; roots: NodeId[]; edges: Edge[] }
export interface EffectiveComposition { nodes: Map<NodeId,GraphNode>; roots: NodeId[]; tester: TesterService; testerOrigin: Origin; stage: ConfigStage; composition: "service" | "mesh" }
export interface ResolvedEndpoint { logicalPath: string; networkHost: string; networkPort: number; scheme?: string; publicHost?: string; publicPort?: number; effectivelyPublished: boolean }
export type EndpointProperty = "network_host" | "network_port" | "network_address" | "network_url" | "public_host" | "public_port" | "public_address" | "public_url";
export interface EndpointUsage { expression: string; endpoint: string; property: EndpointProperty; sourcePath: string }
export const nodeId = (meshRoot: string | undefined, sourceService: string): NodeId => JSON.stringify([meshRoot ?? null, sourceService]);
export const displayNode = (id: NodeId): string => { const [root, service] = JSON.parse(id) as [string|null,string]; return root ? `${root}.source.${service}` : service; };
