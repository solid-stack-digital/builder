import { existsSync, readFileSync } from "node:fs";
import pc from "picocolors";
import { parse } from "yaml";
import { ScriptError } from "../../errors/ScriptError.js";
import type { BuildJson } from "../../types/index.js";
import { getDeclaredYamlFiles } from "./getDeclaredYamlFiles.js";

export function checkYamlFiles(buildJson: BuildJson, projectDir: string): void {
  const declaredFiles = getDeclaredYamlFiles(buildJson, projectDir);

  if (declaredFiles.length === 0) {
    return;
  }

  console.log(
    pc.cyan(
      `\n🔍 3. Validating Declared YAML Files (${declaredFiles.length} file${declaredFiles.length === 1 ? "" : "s"})...`
    )
  );

  for (const file of declaredFiles) {
    if (!existsSync(file.absolutePath)) {
      console.error(
        pc.red(`\n❌ Missing declared YAML file: ${file.relativePath}`)
      );
      console.error(pc.yellow(`   Referenced by: ${file.source} in build.json`));
      console.error(pc.yellow(`   Expected path: ${file.absolutePath}\n`));
      throw new ScriptError(
        `File "${file.relativePath}" declared in build.json (${file.source}) does not exist.`
      );
    }

    try {
      const content = readFileSync(file.absolutePath, "utf-8");
      parse(content);
    } catch (err: any) {
      console.error(pc.red(`\n❌ YAML Syntax Error in ${file.relativePath}`));
      console.error(pc.yellow(`   Referenced by: ${file.source} in build.json`));
      console.error(pc.red(`   Error: ${err?.message || String(err)}\n`));
      throw new ScriptError(
        `Invalid YAML in "${file.relativePath}" (${file.source}): ${err?.message || String(err)}`
      );
    }
  }
}
