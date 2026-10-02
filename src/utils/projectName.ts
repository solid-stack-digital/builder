/**
 * Normalizes a Docker Compose project name according to compose specifications:
 * - lowercase letters, digits, '-', '_'
 * - must start with a lowercase letter or digit
 * - falls back to 'project' if empty after normalization
 */
export function normalizeProjectName(name: string): string {
  let normalized = name
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "-")
    .replace(/^[-_]+/, "")
    .replace(/[-_]+$/, "");

  if (!normalized || !/^[a-z0-9]/.test(normalized)) {
    return "project";
  }

  return normalized;
}

/**
 * Derives a stage-specific project name to avoid volume & container collisions between stages.
 * 'dev' and 'prod' retain the base project name for addressability.
 * 'test'/'test-unit' receives a '-test' suffix.
 * 'e2e'/'test-e2e' receives an '-e2e' suffix.
 */
export function deriveProjectName(name: string, stage?: string): string {
  const base = normalizeProjectName(name);
  if (!stage) {
    return base;
  }

  const s = stage.toLowerCase();
  if (s === "test" || s === "test-unit") {
    return `${base}-test`;
  }
  if (s === "e2e" || s === "test-e2e") {
    return `${base}-e2e`;
  }
  return base;
}
