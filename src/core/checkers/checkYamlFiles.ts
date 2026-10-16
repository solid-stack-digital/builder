import pc from "picocolors";
import type { BuildJson } from "../../types/index.js";
import { resolveProjectDir } from "../../utils/paths.js";
import { resolveInsideProject } from "../config/pathSafety.js";
import { loadComposeDocument } from "../composition/loadCompose.js";
import { getDeclaredYamlFiles } from "./getDeclaredYamlFiles.js";

export function checkYamlFiles(build: BuildJson, projectDir: string): void {
  const root = resolveProjectDir(projectDir);
  const files = getDeclaredYamlFiles(build, root);
  if (files.length) console.log(pc.cyan(`\nValidating ${files.length} declared V3 Compose file(s)...`));
  for (const file of files) {
    const absolutePath = resolveInsideProject(root, file.relativePath, {sourceFile: `${root}/build.json`, configPath: file.source, ...(file.stage ? {stage:file.stage} : {})});
    loadComposeDocument(absolutePath, {sourceFile:`${root}/build.json`, configPath:file.source, stage:file.stage ?? "base", composition:"service"});
  }
}
