import crypto from "node:crypto";
import path from "node:path";

/**
 * Normalizes a Docker Compose project name according to compose specifications:
 * - lowercase letters, digits, '-', '_'
 * - must start with a lowercase letter or digit
 * - falls back to 'project' if empty after normalization
 */
export function normalizeProjectName(name: string, projectDir?: string): string {
  let normalized = name
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "-")
    .replace(/^[-_]+/, "")
    .replace(/[-_]+$/, "");

  if (!normalized || !/^[a-z0-9]/.test(normalized)) {
    if (projectDir) {
      const hash = crypto
        .createHash("sha1")
        .update(path.resolve(projectDir))
        .digest("hex")
        .slice(0, 7);
      return `project-${hash}`;
    }
    return "project";
  }

  return normalized;
}

export interface DeriveProjectOptions {
  hash?: boolean;
}

/**
 * Derives a stage-specific project name to avoid volume & container collisions between stages.
 * - 'dev' retains the base project name so existing dev volumes survive.
 * - 'prod' receives a '-prod' suffix.
 * - 'test'/'test-unit' receives a '-test' suffix.
 * - 'e2e'/'test-e2e' receives an '-e2e' suffix.
 * If projectDir is provided with hash: true, a 7-character directory hash is included.
 */
export function deriveProjectName(
  name: string,
  stage?: string,
  projectDir?: string,
  options: DeriveProjectOptions = {}
): string {
  let base = normalizeProjectName(name, projectDir);

  if (options.hash && projectDir) {
    const hash = crypto
      .createHash("sha1")
      .update(path.resolve(projectDir))
      .digest("hex")
      .slice(0, 7);
    base = `${base}-${hash}`;
  }

  if (!stage) {
    return base;
  }

  const s = stage.toLowerCase();
  if (s === "dev") {
    return base;
  }
  if (s === "prod") {
    return `${base}-prod`;
  }
  if (s === "test" || s === "test-unit") {
    return `${base}-test`;
  }
  if (s === "e2e" || s === "test-e2e") {
    return `${base}-e2e`;
  }
  return `${base}-${s}`;
}
