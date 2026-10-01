import { existsSync, readFileSync } from "node:fs";
import type { BuildJson } from "../../types/index.js";
import { getDeclaredYamlFiles } from "./getDeclaredYamlFiles.js";

export function findServiceDefinersInDeclaredFiles(
  buildJson: BuildJson,
  projectDir: string,
  serviceName: string
): string[] {
  const declaredFiles = getDeclaredYamlFiles(buildJson, projectDir);
  const hits: string[] = [];

  for (const file of declaredFiles) {
    if (!existsSync(file.absolutePath)) continue;
    const content = readFileSync(file.absolutePath, "utf-8");
    const hasBlock = new RegExp(`^\\s{2}${serviceName}:\\s*$`, "m").test(content);
    if (!hasBlock) continue;
    const hasImageOrBuild = new RegExp(
      `^\\s{2}${serviceName}:[\\s\\S]*?^\\s{4,}(image|build):`,
      "m"
    ).test(content);
    hits.push(
      `    - ${file.relativePath} (${file.source})${hasImageOrBuild ? "  [defines image/build]" : "  [no image/build]"}`
    );
  }

  return hits;
}

export function explainComposeMergeFailure(
  buildJson: BuildJson,
  projectDir: string,
  envName: string,
  filesUsed: string[],
  rawOutput: string
): string {
  const lines: string[] = [];
  const serviceMatch = rawOutput.match(
    /service "([^"]+)" has neither an image nor a build context specified/
  );
  const envMissingMatch =
    /env file .* not found|no such file or directory.*\.env/i.test(rawOutput);

  lines.push(`Environment          : ${envName}`);
  lines.push(`Compose files merged :`);
  filesUsed
    .filter((f) => f !== "-f")
    .forEach((f) => lines.push(`    - ${f}`));
  lines.push("");

  if (serviceMatch && serviceMatch[1]) {
    const serviceName = serviceMatch[1];
    lines.push(
      `ROOT CAUSE: Service "${serviceName}" is referenced in the merged stack, but none of the files provide an "image:" or "build:".`
    );
    lines.push("");
    lines.push(
      `Files declared in build.json that define a "${serviceName}:" service block:`
    );
    const definers = findServiceDefinersInDeclaredFiles(
      buildJson,
      projectDir,
      serviceName
    );
    if (definers.length > 0) {
      definers.forEach((d) => lines.push(d));
    } else {
      lines.push(
        `    (none found — check spelling/indentation of "${serviceName}:" in files declared in build.json)`
      );
    }
    lines.push("");
    lines.push("HOW TO FIX:");
    lines.push(
      `  - Ensure the file declaring service "${serviceName}" with an "image:" or "build:" is referenced in build.json under dependencies or overrides.`
    );
  } else if (envMissingMatch) {
    lines.push(`ROOT CAUSE: A referenced .env file could not be found.`);
    lines.push("");
    lines.push("HOW TO FIX:");
    lines.push(
      `  - Create the missing env file at the project root (e.g. .env.dev, .env.prod, .env.test)`
    );
  } else {
    lines.push(
      "Docker Compose failed to resolve this merged stack. Common causes:"
    );
    lines.push(
      `  - A "\${VAR}" substitution with no default and no value set in the shell or an env_file.`
    );
    lines.push(`  - A YAML syntax error in one of the files listed in build.json.`);
    lines.push(`  - A duplicate or conflicting key across merged compose files.`);
  }

  lines.push("");
  lines.push("Raw Docker Compose output:");
  lines.push("-".repeat(60));
  lines.push(rawOutput.trim());
  lines.push("-".repeat(60));

  return lines.join("\n");
}
