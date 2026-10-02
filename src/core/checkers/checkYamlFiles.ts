import { existsSync, readFileSync } from "node:fs";
import pc from "picocolors";
import { parseAllDocuments } from "yaml";
import { ScriptError } from "../../errors/ScriptError.js";
import type { BuildJson } from "../../types/index.js";
import { resolveProjectDir } from "../../utils/paths.js";
import { errorMessage } from "../../utils/errorMessage.js";
import { getDeclaredYamlFiles } from "./getDeclaredYamlFiles.js";

export function checkYamlFiles(buildJson: BuildJson, projectDir: string): void {
  const absProjectDir = resolveProjectDir(projectDir);
  const declaredFiles = getDeclaredYamlFiles(buildJson, absProjectDir);

  if (declaredFiles.length === 0) {
    return;
  }

  console.log(
    pc.cyan(
      `\n🔍 Validating Declared YAML Files (${declaredFiles.length} file${declaredFiles.length === 1 ? "" : "s"})...`
    )
  );

  const errors: string[] = [];

  for (const file of declaredFiles) {
    if (!existsSync(file.absolutePath)) {
      errors.push(
        `File "${file.relativePath}" declared in build.json (${file.source}) does not exist (expected at ${file.absolutePath}).`
      );
      continue;
    }

    try {
      const content = readFileSync(file.absolutePath, "utf-8");
      const docs = parseAllDocuments(content);
      const docErrors = docs.flatMap((doc) => doc.errors);
      if (docErrors.length > 0) {
        const errorText = docErrors.map((e) => e.message).join("\n");
        errors.push(
          `YAML Syntax Error in "${file.relativePath}" (${file.source}): ${errorText}`
        );
      }
    } catch (err: unknown) {
      const msg = errorMessage(err);
      errors.push(
        `YAML Syntax Error in "${file.relativePath}" (${file.source}): ${msg}`
      );
    }
  }

  if (errors.length > 0) {
    throw new ScriptError(errors.join("\n"));
  }
}
