import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

let cachedTemplatesDir: string | null = null;

export function getTemplatesDir(): string {
  if (process.env.BUILDER_TEMPLATES_DIR && fs.existsSync(process.env.BUILDER_TEMPLATES_DIR)) {
    return process.env.BUILDER_TEMPLATES_DIR;
  }

  if (cachedTemplatesDir && fs.existsSync(cachedTemplatesDir)) {
    return cachedTemplatesDir;
  }

  const currentDir = typeof __dirname !== "undefined"
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

  throw new Error(
    `Templates directory not found. Searched candidates:\n${candidates.join("\n")}`
  );
}

export function getDockerComposeTemplate(filename: string): string {
  const templatesDir = getTemplatesDir();
  const filePath = path.join(templatesDir, "docker", filename);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Docker compose template not found: ${filePath}`);
  }
  return filePath;
}
