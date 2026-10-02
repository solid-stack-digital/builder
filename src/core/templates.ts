import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ScriptError } from "../errors/ScriptError.js";

let cachedTemplatesDir: string | null = null;
let lastEnvTemplatesDir: string | undefined = undefined;

export function getTemplatesDir(): string {
  const envVal = process.env.BUILDER_TEMPLATES_DIR;

  if (envVal !== lastEnvTemplatesDir) {
    cachedTemplatesDir = null;
    lastEnvTemplatesDir = envVal;
  }

  if (envVal) {
    const envDir = path.resolve(envVal);
    if (!fs.existsSync(envDir) || !fs.existsSync(path.join(envDir, "docker"))) {
      throw new ScriptError(
        `BUILDER_TEMPLATES_DIR is set to "${envVal}" but directory does not exist or lacks a "docker/" subdirectory (resolved: "${envDir}").`
      );
    }
    return envDir;
  }

  if (cachedTemplatesDir && fs.existsSync(cachedTemplatesDir)) {
    return cachedTemplatesDir;
  }

  const currentDir =
    typeof __dirname !== "undefined"
      ? __dirname
      : path.dirname(fileURLToPath(import.meta.url));

  const candidates = [
    // When executing compiled output in dist/ (e.g. dist/templates)
    path.resolve(currentDir, "templates"),
    path.resolve(currentDir, "../templates"),
    // When executing from src/ (e.g. src/core/templates.ts -> ../../templates)
    path.resolve(currentDir, "../../templates"),
    // Fallback relative to cwd
    path.resolve(process.cwd(), "templates"),
  ];

  for (const cand of candidates) {
    if (fs.existsSync(cand) && fs.existsSync(path.join(cand, "docker"))) {
      cachedTemplatesDir = cand;
      return cand;
    }
  }

  throw new ScriptError(
    `Templates directory not found. Searched candidates:\n${candidates.join("\n")}`
  );
}

export function getDockerComposeTemplate(filename: string): string {
  const templatesDir = getTemplatesDir();
  const filePath = path.join(templatesDir, "docker", filename);
  if (!fs.existsSync(filePath)) {
    throw new ScriptError(`Docker compose template not found: ${filePath}`);
  }
  return filePath;
}
