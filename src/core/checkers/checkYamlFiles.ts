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
      console.error(
        pc.red(`\n❌ Missing declared YAML file: ${file.relativePath}`)
      );
      console.error(pc.yellow(`   Referenced by: ${file.source} in build.json`));
      console.error(pc.yellow(`   Expected path: ${file.absolutePath}\n`));
      errors.push(
        `File "${file.relativePath}" declared in build.json (${file.source}) does not exist.`
      );
      continue;
    }

    try {
      const content = readFileSync(file.absolutePath, "utf-8");
      const docs = parseAllDocuments(content);
      const docErrors = docs.flatMap((doc) => doc.errors);
      if (docErrors.length > 0) {
        const errorText = docErrors.map((e) => e.message).join("\n");
        console.error(pc.red(`\n❌ YAML Syntax Error in ${file.relativePath}`));
        console.error(pc.yellow(`   Referenced by: ${file.source} in build.json`));
        console.error(pc.red(`   Error: ${errorText}\n`));
        errors.push(
          `Invalid YAML in "${file.relativePath}" (${file.source}): ${errorText}`
        );
      }
    } catch (err: unknown) {
      const msg = errorMessage(err);
      console.error(pc.red(`\n❌ YAML Syntax Error in ${file.relativePath}`));
      console.error(pc.yellow(`   Referenced by: ${file.source} in build.json`));
      console.error(pc.red(`   Error: ${msg}\n`));
      errors.push(
        `Invalid YAML in "${file.relativePath}" (${file.source}): ${msg}`
      );
    }
  }

  if (errors.length > 0) {
    throw new ScriptError(errors.join("\n"));
  }
}
