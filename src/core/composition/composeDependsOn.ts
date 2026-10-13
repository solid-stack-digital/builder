import type { ComposeDocument } from "./types.js";

/** Every dependency in generated Compose is gated by health. */
export function normalizeComposeDependsOn(value: unknown): Record<string, unknown> {
  const entries = Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
        .map((name) => [name, {}] as const)
    : value && typeof value === "object"
      ? Object.entries(value as Record<string, unknown>)
      : [];
  return Object.fromEntries(entries.map(([name, options]) => [
    name,
    {
      ...(options && typeof options === "object" && !Array.isArray(options)
        ? options as Record<string, unknown> : {}),
      condition: "service_healthy",
    },
  ]));
}

export function enforceHealthyDependsOn(document: ComposeDocument): void {
  for (const service of Object.values(document.services ?? {})) {
    if (service.depends_on === undefined) continue;
    service.depends_on = normalizeComposeDependsOn(service.depends_on);
  }
}
