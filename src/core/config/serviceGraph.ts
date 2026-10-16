import { ConfigError } from "../../errors/ConfigError.js";
import type { RequisiteKind } from "../../types/index.js";
import type { DeclaredGraph, Edge, EffectiveComposition, EffectiveGraph, NodeId, Origin } from "./types.js";
import { displayNode, nodeId } from "./types.js";
export interface GraphProfile { infraMode: "isolated"|"integrated"; stage: string }
const fail = (origin: Origin, stage: string, reason: string, referencedObject?: string): never => { throw new ConfigError({ sourceFile: origin.sourceFile, configPath: origin.configPath, stage, composition: origin.scope === "mesh" ? "mesh" : "service", ...(referencedObject?{referencedObject}:{}), reason }); };
export function buildDeclaredGraph(input: EffectiveComposition): DeclaredGraph {
  const edges: Edge[] = [];
  for (const node of input.nodes.values()) for (const [key, kind] of Object.entries(node.declaration.requisites)) {
    const origin = node.requisiteOrigins.get(key) ?? node.origin;
    let target: NodeId;
    if (key.startsWith("@mesh:")) target = nodeId(key.slice(6), "main");
    else target = nodeId(node.meshRoot, key);
    const displayKey=key.replace(/^@mesh:/,"");
    if (key === "tester" || key === "@mesh:tester") fail(origin,input.stage,"tester cannot be a requisite target",displayKey);
    if (!input.nodes.has(target)) fail(origin,input.stage,"Unknown requisite target",displayKey);
    edges.push({ consumer: node.id, target, kind: kind as RequisiteKind, origin });
  }
  edges.sort((a,b) => `${a.consumer}:${a.target}:${a.kind}`.localeCompare(`${b.consumer}:${b.target}:${b.kind}`));
  return { nodes: input.nodes, roots: [...input.roots].sort(), edges };
}
export function computeClosure(start: NodeId, adjacency: ReadonlyMap<NodeId, readonly Edge[]>): Set<NodeId> {
  const visited = new Set<NodeId>(); const stack = [start];
  while (stack.length) { const id = stack.pop()!; if (visited.has(id)) continue; visited.add(id); for (const edge of adjacency.get(id) ?? []) stack.push(edge.target); }
  return visited;
}
export function selectReachableGraph(declared: DeclaredGraph, profile: GraphProfile): EffectiveGraph {
  const adjacency = new Map<NodeId,Edge[]>();
  for (const edge of declared.edges) { const list = adjacency.get(edge.consumer) ?? []; list.push(edge); adjacency.set(edge.consumer,list); }
  const active = new Set<NodeId>();
  if (profile.infraMode === "isolated") for (const root of declared.roots) active.add(root);
  else for (const root of declared.roots) for (const id of computeClosure(root,adjacency)) active.add(id);
  const nodes = new Map([...declared.nodes].filter(([id]) => active.has(id)));
  const edges = profile.infraMode === "isolated" ? [] : declared.edges.filter(edge => active.has(edge.consumer) && active.has(edge.target));
  const activeAdjacency = new Map<NodeId,Edge[]>();
  for (const edge of edges) { const list = activeAdjacency.get(edge.consumer) ?? []; list.push(edge); activeAdjacency.set(edge.consumer,list); }
  const closures = new Map<NodeId,Set<NodeId>>();
  for (const id of nodes.keys()) closures.set(id,computeClosure(id,activeAdjacency));
  const lifecycle = new Map<NodeId,"long-running"|"prerequisite">();
  for (const id of nodes.keys()) lifecycle.set(id,"long-running");
  const classification = new Map<NodeId,Map<RequisiteKind,Edge>>();
  for (const edge of edges) {
    const kinds = classification.get(edge.target) ?? new Map<RequisiteKind,Edge>();
    kinds.set(edge.kind,edge); classification.set(edge.target,kinds);
  }
  for (const [id,kinds] of classification) {
    if (kinds.has("dependency") && kinds.has("prerequisite")) {
      const dep = kinds.get("dependency")!, pre = kinds.get("prerequisite")!;
      fail(pre.origin,profile.stage,`Target ${displayNode(id)} is both dependency and prerequisite; dependency at ${dep.origin.sourceFile}:${dep.origin.configPath}, prerequisite at ${pre.origin.sourceFile}:${pre.origin.configPath}`,displayNode(id));
    }
    if (kinds.has("prerequisite")) {
      if (nodes.get(id)?.kind === "main") fail(kinds.get("prerequisite")!.origin,profile.stage,"main cannot be a prerequisite",displayNode(id));
      lifecycle.set(id,"prerequisite");
    }
  }
  const graph = { nodes, roots: declared.roots.filter(id => active.has(id)), edges, closures, lifecycle };
  validateGraphLifecycle(graph, profile.stage);
  return graph;
}
export function validateGraphLifecycle(graph: EffectiveGraph, stage = "dev"): void {
  const adjacency = new Map<NodeId,Edge[]>();
  for (const edge of graph.edges) if (edge.kind !== "requirement") { const list = adjacency.get(edge.consumer) ?? []; list.push(edge); adjacency.set(edge.consumer,list); }
  const gray = new Set<NodeId>(), black = new Set<NodeId>(), stack: Edge[] = [];
  const visit = (id: NodeId): void => {
    if (black.has(id)) return;
    gray.add(id);
    for (const edge of adjacency.get(id) ?? []) {
      if (gray.has(edge.target)) {
        const first = stack.findIndex(item => item.consumer === edge.target);
        const cycle = [...stack.slice(Math.max(0,first)),edge].map(item => `${displayNode(item.consumer)} -${item.kind}-> ${displayNode(item.target)}`).join("; ");
        fail(edge.origin,stage,`ordering cycle: ${cycle}`,displayNode(edge.target));
      }
      stack.push(edge); visit(edge.target); stack.pop();
    }
    gray.delete(id); black.add(id);
  };
  for (const id of graph.nodes.keys()) visit(id);
}
