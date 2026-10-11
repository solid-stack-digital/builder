import { ConfigError } from "../../errors/ConfigError.js";
export type LifecycleGraph = Map<string, Set<string>>;
export function assertAcyclicGraph(graph: LifecycleGraph, context: { sourceFile: string; stage: string; composition: "service" | "mesh" }): void {
 const visiting = new Set<string>(), visited = new Set<string>(), stack: string[] = [];
 const visit = (node: string): void => { if (visiting.has(node)) { const start = stack.indexOf(node); const cycle = [...stack.slice(start), node]; throw new ConfigError({ ...context, configPath: "dependsOn", referencedObject: cycle.join(" -> "), reason: `Lifecycle cycle detected: ${cycle.join(" -> ")}` }); } if (visited.has(node)) return; visiting.add(node); stack.push(node); for (const next of graph.get(node) ?? []) visit(next); stack.pop(); visiting.delete(node); visited.add(node); };
 for (const node of graph.keys()) visit(node);
}
