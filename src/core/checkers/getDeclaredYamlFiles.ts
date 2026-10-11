import path from "node:path";
import type { BuildJson } from "../../types/index.js";

export interface DeclaredYamlFile {
  relativePath: string;
  absolutePath: string;
  source: string;
  stage?: "dev" | "prod" | "test" | "e2e";
  kind: "dependency-compose" | "override-compose";
}

export function getDeclaredYamlFiles(build: BuildJson, projectDir: string): DeclaredYamlFile[] {
  const files: DeclaredYamlFile[] = [];
  const seen = new Set<string>();
  const add = (relativePath: string, source: string, kind: DeclaredYamlFile["kind"], stage?: DeclaredYamlFile["stage"]) => {
    const absolutePath = path.resolve(projectDir, relativePath);
    if (seen.has(absolutePath)) return;
    seen.add(absolutePath);
    files.push({ relativePath, absolutePath, source, kind, ...(stage ? {stage} : {}) });
  };
  for (const [name, dep] of Object.entries(build.dependencies ?? {})) add(dep.compose, `dependencies.${name}.compose`, "dependency-compose");
  for (const stage of ["dev", "prod", "test", "e2e"] as const) {
    const overlay = build[stage];
    if (overlay?.["override-compose"]) add(overlay["override-compose"], `${stage}.override-compose`, "override-compose", stage);
    for (const [name, dep] of Object.entries(overlay?.dependencies ?? {})) if (dep.compose) add(dep.compose, `${stage}.dependencies.${name}.compose`, "dependency-compose", stage);
  }
  return files;
}
