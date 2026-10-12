import { assertAcyclicGraph, type LifecycleGraph } from "../config/lifecycleGraph.js";
import type { ComposeService } from "./types.js";

export function assertComposeLifecycleAcyclic(
  services: Record<string, ComposeService>,
  context: { sourceFile: string; stage: string; composition: "service" | "mesh" },
): void {
  const graph: LifecycleGraph = new Map(
    Object.keys(services).map(name => [name, new Set<string>()]),
  );

  for (const [name, service] of Object.entries(services)) {
    const value = service.depends_on;
    const targets = Array.isArray(value)
      ? value.filter((item): item is string => typeof item === "string")
      : value && typeof value === "object"
        ? Object.keys(value)
        : [];
    for (const target of targets) {
      // The existing bundle validators report unknown references separately.
      if (graph.has(target)) graph.get(name)!.add(target);
    }
  }

  assertAcyclicGraph(graph, context);
}
