import { ScriptError } from "../../../errors/ScriptError.js";
import { meshSchema } from "../meshSchema.js";
import type { MeshConfig } from "../types.js";

export function checkMeshJson(mesh: MeshConfig): void {
  const result = meshSchema.safeParse(mesh);
  if (!result.success) {
    const errorDetails = result.error.issues
      .map((issue) =>
        issue.path.length > 0
          ? `${issue.path.join(".")}: ${issue.message}`
          : issue.message
      )
      .join("; ");
    throw new ScriptError(`Invalid mesh.json: ${errorDetails}`);
  }

  const services = result.data.services;
  const serviceKeys = new Set(Object.keys(services));

  // NOTE: Static Port collision check removed from here. 
  // It is now strictly enforced across services AND dependencies in compileMeshEnvironment.ts

  // Build dependency graph for cycle detection and validate providers exist
  const graph = new Map<string, Set<string>>();
  for (const sName of serviceKeys) {
    graph.set(sName, new Set());
  }

  for (const [serviceName, serviceConfig] of Object.entries(services)) {
    const provideMap = {
      ...(serviceConfig.replaceMocks || {}),
      ...(serviceConfig.provideDependency || {}),
    };

    for (const [depKey, targetSvc] of Object.entries(provideMap)) {
      if (!serviceKeys.has(targetSvc)) {
        throw new ScriptError(
          `Invalid mesh.json: Service "${serviceName}" maps dependency "${depKey}" to nonexistent service "${targetSvc}".`
        );
      }
      graph.get(serviceName)!.add(targetSvc);
    }
  }

  // Detect dependency cycles using DFS
  const visited = new Map<string, "visiting" | "visited">();

  function dfs(node: string, pathStack: string[]) {
    visited.set(node, "visiting");
    pathStack.push(node);

    const neighbors = graph.get(node) || new Set();
    for (const neighbor of neighbors) {
      const state = visited.get(neighbor);
      if (state === "visiting") {
        const cycleStart = pathStack.indexOf(neighbor);
        const cycle = [...pathStack.slice(cycleStart), neighbor];
        throw new ScriptError(
          `Dependency cycle detected in mesh.json: ${cycle.join(" -> ")}`
        );
      }
      if (!state) {
        dfs(neighbor, pathStack);
      }
    }

    pathStack.pop();
    visited.set(node, "visited");
  }

  for (const sName of serviceKeys) {
    if (!visited.has(sName)) {
      dfs(sName, []);
    }
  }
}
