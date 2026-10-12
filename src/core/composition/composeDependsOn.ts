/** Preserve user short-syntax semantics; only Builder-owned edges require health. */
export function normalizeComposeDependsOn(value: unknown): Record<string, unknown> {
  if (Array.isArray(value)) {
    return Object.fromEntries(value.filter((item): item is string => typeof item === "string").map(name => [name, {}]));
  }
  return value && typeof value === "object" ? { ...value as Record<string, unknown> } : {};
}
