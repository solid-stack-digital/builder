import path from "node:path";
import type { BuildJson } from "../../types/index.js";

export interface DeclaredYamlFile {
  relativePath: string;
  absolutePath: string;
  source: string;
}

export function getDeclaredYamlFiles(
  buildJson: BuildJson,
  projectDir: string
): DeclaredYamlFile[] {
  const files: DeclaredYamlFile[] = [];
  const seen = new Set<string>();

  const addFile = (relPath: string, source: string) => {
    const normalized = path.normalize(relPath);
    if (seen.has(normalized)) return;
    seen.add(normalized);
    files.push({
      relativePath: relPath,
      absolutePath: path.resolve(projectDir, relPath),
      source,
    });
  };

  if (buildJson.dependencies && typeof buildJson.dependencies === "object") {
    for (const [depName, dep] of Object.entries(buildJson.dependencies)) {
      if (dep && typeof dep === "object" && typeof dep.path === "string") {
        addFile(dep.path, `dependency "${depName}"`);
      }
    }
  }

  if (buildJson.overrides && typeof buildJson.overrides === "object") {
    for (const [stage, ovr] of Object.entries(buildJson.overrides)) {
      if (ovr && typeof ovr === "object" && typeof ovr.path === "string") {
        addFile(ovr.path, `override "${stage}"`);
      }
    }
  }

  if (Array.isArray(buildJson.composeFiles)) {
    for (const item of buildJson.composeFiles) {
      if (typeof item === "string") {
        addFile(item, "composeFiles");
      }
    }
  }

  return files;
}
